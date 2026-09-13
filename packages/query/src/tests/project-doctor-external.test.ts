import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

// Include source/state contents and symlink destinations, but not mutable access times.
async function snapshot(root: string): Promise<unknown> {
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) return { link: await fs.readlink(root) };
  if (stat.isDirectory()) return Object.fromEntries(await Promise.all((await fs.readdir(root)).sort().map(async (name) => [name, await snapshot(path.join(root, name))])));
  return { data: (await fs.readFile(root)).toString("base64"), mode: stat.mode };
}

describe.sequential("external Project Skills through public Doctor", () => {
  const sandbox = useSkillFlowSandbox();
  async function setup(applied = true) {
    const project = await fs.realpath(await fs.mkdtemp(path.join(sandbox.sandboxRoot, "external-project-")));
    const app = new SkillFlowApp();
    if (applied) {
      const source = await createRepo(sandbox.sandboxRoot, { "skills/review/SKILL.md": skillDoc("review", "Review.") });
      expect((await app.addSource(source, { sourceIdOverride: "alpha", project: false })).ok).toBe(true);
      const store = new StateStore(sandbox.stateRoot);
      const state = await store.readState();
      await store.writeState({ ...state, preferences: { ...state.preferences, agentDisplayOrder: ["codex"],
        recentProjects: [{ projectId: "p", projectPath: project, title: "Project", lastActivityAt: "now" }],
      } });
      expect((await app.applyDraft("alpha", { selectedLeafIds: ["alpha:skills/review"], enabledTargets: ["codex"] }, { kind: "project", projectId: "p" })).ok).toBe(true);
    }
    return { app, project };
  }
  async function addSkill(project: string, relative = ".agents/skills/external", content = skillDoc("external", "External skill.")) {
    const directory = path.join(project, relative);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "SKILL.md"), content);
    return directory;
  }
  async function diagnose(app: SkillFlowApp, project: string, deny?: { operation: "readFile" | "stat"; location: string }) {
    const before = await snapshot(sandbox.sandboxRoot);
    const original = deny ? fs[deny.operation].bind(fs) : undefined;
    const spy = deny ? vi.spyOn(fs, deny.operation).mockImplementation((async (location: unknown, ...args: unknown[]) => {
      if (location === deny.location) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      return Reflect.apply(original!, fs, [location, ...args]);
    }) as typeof fs.readFile & typeof fs.stat) : undefined;
    let result;
    try { result = await app.doctor({ projectPath: project }); } finally { spy?.mockRestore(); }
    expect(await snapshot(sandbox.sandboxRoot)).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.data;
  }

  test("counts valid directory and linked Skills once without adopting or executing them", async () => {
    const { app, project } = await setup();
    const external = await addSkill(project);
    const outside = await addSkill(sandbox.sandboxRoot, "outside");
    await fs.symlink(outside, path.join(project, ".agents/skills/linked"), "dir");
    await fs.mkdir(path.join(external, "scripts"));
    await fs.writeFile(path.join(external, "scripts/run.sh"), `#!/bin/sh\ntouch '${path.join(project, "executed")}'\n`, { mode: 0o755 });
    const report = await diagnose(app, project);
    expect(report.status).toBe("HEALTHY");
    expect(report.externalSkillCount).toBe(2);
    expect(report.managedSkillCount).toBe(1);
    expect(report.coverage?.complete).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.coverage?.roots.filter((root) => root.path === path.join(project, ".agents/skills"))).toHaveLength(1);
  });

  test("scans hidden and disabled Agents and preserves shared-root associations", async () => {
    const { app, project } = await setup();
    // Same name as a managed Skill in another root does not transfer ownership.
    await addSkill(project, ".claude/skills/review");
    const missing = path.join(project, ".agents/skills/missing-document");
    await fs.mkdir(missing);
    const report = await diagnose(app, project);
    expect(report.externalSkillCount).toBe(1);
    const issue = report.issues.find((entry) => entry.path?.startsWith(missing));
    expect(issue?.severity).toBe("error");
    expect(issue?.targets).toContain("codex");
    expect(issue!.targets!.length).toBeGreaterThan(1);
    expect(report.issues.filter((entry) => entry.path?.startsWith(missing))).toHaveLength(1);
  });

  test.each(["missing", "invalid", "broken", "loop"])("blocks confirmed %s external Skill while retaining valid counts", async (kind) => {
    const { app, project } = await setup(false);
    await addSkill(project);
    const bad = path.join(project, ".agents/skills/bad");
    if (kind === "broken") await fs.symlink(path.join(project, "absent"), bad);
    else if (kind === "loop") await fs.symlink(bad, bad);
    else {
      await fs.mkdir(bad);
      if (kind === "invalid") await fs.writeFile(path.join(bad, "SKILL.md"), "# Missing frontmatter");
    }
    const report = await diagnose(app, project);
    expect(report.status).toBe("BLOCKED");
    expect(report.externalSkillCount).toBe(1);
    expect(report.baseline).toBe("unavailable");
    expect(report.coverage?.complete).toBe(true);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_BASELINE_UNAVAILABLE" }));
    expect(report.issues).toContainEqual(expect.objectContaining({ severity: "error", path: expect.stringContaining(bad) }));
    if (["broken", "loop"].includes(kind)) expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_EXTERNAL_BROKEN_SYMLINK", path: bad }));
  });

  test("unregistered project continues disk inspection without scanning arbitrary or global directories", async () => {
    const { app, project } = await setup(false);
    await addSkill(project);
    await addSkill(project, "elsewhere/ignored");
    await addSkill(sandbox.targetsRoot, "codex/global");
    const report = await diagnose(app, project);
    expect(report.status).toBe("PARTIAL");
    expect(report.externalSkillCount).toBe(1);
    expect(report.managedSkillCount).toBe(0);
    expect(report.coverage?.complete).toBe(true);
    expect(report.issues.map((issue) => issue.code)).toEqual(["PROJECT_BASELINE_UNAVAILABLE"]);
    await expect(fs.stat(sandbox.stateRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test.each(["readFile", "stat"] as const)("unreadable %s is incomplete coverage, never confirmed invalidity", async (operation) => {
    const { app, project } = await setup();
    await addSkill(project);
    const outside = await addSkill(sandbox.sandboxRoot, "unreadable-source");
    const denied = path.join(project, ".agents/skills/denied");
    await fs.symlink(outside, denied);
    const location = operation === "stat" ? denied : path.join(denied, "SKILL.md");
    const report = await diagnose(app, project, { operation, location });
    expect(report.status).toBe("PARTIAL");
    expect(report.externalSkillCount).toBe(1);
    expect(report.coverage?.complete).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_CHECK_INCOMPLETE", path: denied, message: expect.stringContaining("permission denied") }));
    expect(report.issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  test("missing managed deployment outranks external read uncertainty and valid external counts remain", async () => {
    const { app, project } = await setup();
    await fs.rm(path.join(project, ".agents/skills/review"));
    await addSkill(project);
    const denied = await addSkill(project, ".claude/skills/denied");
    const report = await diagnose(app, project, { operation: "readFile", location: path.join(denied, "SKILL.md") });
    expect(report.status).toBe("BLOCKED");
    expect(report.externalSkillCount).toBe(1);
    expect(report.managedSkillCount).toBe(0);
    expect(report.coverage?.complete).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["PROJECT_DEPLOYMENT_MISSING", "PROJECT_CHECK_INCOMPLETE"]));
  });
});

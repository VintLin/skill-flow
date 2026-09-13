import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

// Content and link snapshots intentionally exclude access times, which reads can change.
export async function snapshotTree(root: string): Promise<unknown> {
  try {
    const stat = await fs.lstat(root);
    if (stat.isSymbolicLink()) return { link: await fs.readlink(root) };
    if (stat.isDirectory()) return Object.fromEntries(await Promise.all((await fs.readdir(root)).sort().map(async (name) => [name, await snapshotTree(path.join(root, name))])));
    return { data: (await fs.readFile(root)).toString("base64"), mode: stat.mode };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

describe.sequential("read-only Project Health Check", () => {
  const sandbox = useSkillFlowSandbox();
  async function setup(applied = true, targets = ["codex"]) {
    const source = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
      "skills/other/SKILL.md": skillDoc("other", "Other skill."),
    });
    const project = await fs.realpath(await fs.mkdtemp(path.join(sandbox.sandboxRoot, "project-")));
    const app = new SkillFlowApp();
    const added = await app.addSource(source, { sourceIdOverride: "alpha", project: false });
    expect(added.ok).toBe(true);
    const store = new StateStore(sandbox.stateRoot);
    const state = await store.readState();
    await store.writeState({ ...state, preferences: { ...state.preferences,
      recentProjects: [{ projectId: "p", projectPath: project, title: "Project", lastActivityAt: "2026-09-13T00:00:00Z" }],
    } });
    if (applied) expect((await app.applyDraft("alpha", { selectedLeafIds: ["alpha:skills/review"], enabledTargets: targets }, { kind: "project", projectId: "p" })).ok).toBe(true);
    return { app, store, source, project, target: path.join(project, ".agents/skills/review") };
  }
  async function diagnose(app: SkillFlowApp, project: string) {
    const before = await snapshotTree(sandbox.sandboxRoot);
    const result = await app.doctor({ projectPath: project });
    expect(await snapshotTree(sandbox.sandboxRoot)).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.data.scope).toBe("project");
    expect(result.data.projectPath).toBe(await fs.realpath(project).catch(() => path.resolve(project)));
    return result.data;
  }

  test("unregistered project with absent authority stays unregistered and creates no directories", async () => {
    const project = await fs.mkdtemp(path.join(sandbox.sandboxRoot, "unregistered-"));
    const report = await diagnose(new SkillFlowApp(), project);
    expect(report.status).toBe("PARTIAL");
    expect(report.baseline).toBe("unavailable");
    expect(report.issues.map((issue) => issue.code)).toContain("PROJECT_BASELINE_UNAVAILABLE");
    expect(await snapshotTree(sandbox.stateRoot)).toBeNull();
  });
  test("applied selection drives missing deployment, never global fallback or an unapplied draft", async () => {
    const { app, project, target } = await setup();
    expect((await app.applyDraft("alpha", { selectedLeafIds: ["alpha:skills/other"], enabledTargets: ["claude-code"] }, { kind: "global" })).ok).toBe(true);
    await fs.rm(target);
    const report = await diagnose(app, project);
    expect(report.status).toBe("BLOCKED");
    expect(report.issues.filter((issue) => issue.code === "PROJECT_DEPLOYMENT_MISSING")).toEqual([
      expect.objectContaining({ path: target, leafId: "alpha:skills/review", target: "codex" }),
    ]);
  });
  test("never-applied group produces no expected deployments; saved empty selection has a baseline", async () => {
    const { app, project } = await setup(false);
    const first = await diagnose(app, project);
    expect(first.baseline).toBe("unavailable");
    expect(first.issues.some((issue) => issue.code === "PROJECT_DEPLOYMENT_MISSING")).toBe(false);
    expect((await app.applyDraft("alpha", { selectedLeafIds: [], enabledTargets: [] }, { kind: "project", projectId: "p" })).ok).toBe(true);
    const empty = await diagnose(app, project);
    expect(empty.baseline).toBe("available");
    expect(empty.issues.some((issue) => issue.code === "PROJECT_BASELINE_UNAVAILABLE")).toBe(false);
    expect(empty.coverage?.roots.every((root) => root.status === "absent")).toBe(true);
  });
  test("all documented roots are included and shared roots retain Agent associations", async () => {
    const { app, project } = await setup();
    const report = await diagnose(app, project);
    const shared = report.coverage?.roots.find((root) => root.path === path.join(project, ".agents/skills"));
    expect(shared?.targets).toContain("codex");
    expect(shared!.targets.length).toBeGreaterThan(1);
    expect(report.coverage?.roots.some((root) => root.targets.includes("claude-code"))).toBe(true);
    expect(new Set(report.coverage?.roots.map((root) => root.path)).size).toBe(report.coverage?.roots.length);
    expect(report.coverage?.roots.every((root) => root.path.startsWith(project))).toBe(true);
  });
  test("unreadable root preserves coverage semantics and continues other roots", async () => {
    const { app, project, target } = await setup();
    const readdir = fs.readdir.bind(fs);
    const before = await snapshotTree(sandbox.sandboxRoot);
    const spy = vi.spyOn(fs, "readdir").mockImplementation((async (location: unknown, ...args: unknown[]) => {
      if (location === path.dirname(target)) throw Object.assign(new Error("denied"), { code: "EACCES" });
      return Reflect.apply(readdir, fs, [location, ...args]);
    }) as typeof fs.readdir);
    const result = await app.doctor({ projectPath: project });
    spy.mockRestore();
    expect(await snapshotTree(sandbox.sandboxRoot)).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("failed");
    expect(result.data.status).toBe("PARTIAL");
    expect(result.data.coverage?.complete).toBe(false);
    expect(result.data.coverage?.roots.find((root) => root.path === path.dirname(target))?.status).toBe("unreadable");
    expect(result.data.issues.some((issue) => issue.code === "PROJECT_DEPLOYMENT_MISSING")).toBe(false);
  });
  test("unavailable project preserves saved configuration and returns BLOCKED", async () => {
    const { app, project } = await setup();
    await fs.rm(project, { recursive: true });
    const result = await diagnose(app, project);
    expect(result.status).toBe("BLOCKED");
    expect(result.issues[0]?.code).toBe("PROJECT_PATH_UNAVAILABLE");
  });
  test("invalid shared authority yields partial coverage without migration and continues disk checks", async () => {
    const { app, project } = await setup(false);
    await fs.writeFile(path.join(sandbox.stateRoot, "manifest.json"), "{invalid");
    const report = await diagnose(app, project);
    expect(report.status).toBe("PARTIAL");
    expect(report.coverage?.complete).toBe(false);
    expect(report.coverage!.roots.length).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.code === "PROJECT_CHECK_INCOMPLETE")).toBe(true);
  });
  test("a file occupying a known root is incomplete coverage, not confirmed absence", async () => {
    const { app, project } = await setup(false);
    await fs.mkdir(path.join(project, ".claude"));
    await fs.writeFile(path.join(project, ".claude/skills"), "occupied");
    const report = await diagnose(app, project);
    expect(report.coverage?.roots.find((root) => root.path.endsWith(".claude/skills"))?.status).toBe("unreadable");
    expect(report.issues.some((issue) => issue.code === "PROJECT_DEPLOYMENT_MISSING")).toBe(false);
  });
  test("never-applied groups do not add expected deployments to an existing baseline", async () => {
    const { app, project } = await setup();
    const another = await createRepo(sandbox.sandboxRoot, { "skills/extra/SKILL.md": skillDoc("extra", "Extra.") });
    expect((await app.addSource(another, { sourceIdOverride: "beta", project: false })).ok).toBe(true);
    const report = await diagnose(app, project);
    expect(report.baseline).toBe("available");
    expect(report.issues.some((issue) => issue.sourceId === "beta")).toBe(false);
  });
  test("unsupported applied Agent produces coverage warning without a global fallback", async () => {
    const { app, project, store } = await setup(false);
    const state = await store.readState();
    await store.writeState({ ...state, preferences: { ...state.preferences, projectSourceDrafts: { p: { alpha: {
      sourceId: "alpha", selectedLeafIds: ["alpha:skills/review"], enabledTargets: ["unsupported-agent"], updatedAt: "now",
    } } } } });
    const report = await diagnose(app, project);
    expect(report.status).toBe("PARTIAL");
    expect(report.issues).toContainEqual(expect.objectContaining({ target: "unsupported-agent", code: "PROJECT_CHECK_INCOMPLETE" }));
  });
  test("custom project roots are inspected without using the configured global root", async () => {
    const { app, project, store } = await setup(false);
    const state = await store.readState();
    await store.writeState({ ...state, preferences: { ...state.preferences, customTargets: [{
      id: "custom-test", name: "Custom", globalPath: path.join(sandbox.sandboxRoot, "custom-global"), projectPathTemplate: ".custom/skills", strategy: "symlink", createdAt: "now", updatedAt: "now",
    }] } });
    const report = await diagnose(app, project);
    expect(report.coverage?.roots).toContainEqual({ path: path.join(project, ".custom/skills"), targets: ["custom-test"], status: "absent" });
  });
});

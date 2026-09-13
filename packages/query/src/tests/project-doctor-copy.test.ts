import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

async function snapshot(root: string): Promise<unknown> {
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) return { link: await fs.readlink(root) };
  if (stat.isDirectory()) return Object.fromEntries(await Promise.all((await fs.readdir(root)).sort()
    .map(async (name) => [name, await snapshot(path.join(root, name))])));
  return { data: (await fs.readFile(root)).toString("base64"), mode: stat.mode };
}

describe.sequential("project Doctor copy comparisons through the public runtime", () => {
  const sandbox = useSkillFlowSandbox();
  async function setup(custom = false, mixed = false) {
    const marker = path.join(sandbox.sandboxRoot, "SCRIPT_WAS_EXECUTED");
    const repo = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
      "skills/review/content.txt": "original content",
      "skills/review/run.sh": `#!/bin/sh\ntouch '${marker}'\n`,
      "skills/other/SKILL.md": skillDoc("other", "Other skill."),
    });
    const app = new SkillFlowApp();
    expect((await app.addSource(repo, { sourceIdOverride: "alpha", project: false })).ok).toBe(true);
    if (custom) expect((await app.saveSettings({
      customTargets: [{ id: "team-copy", name: "Team Copy", globalPath: path.join(sandbox.targetsRoot, "team-copy"),
        projectPathTemplate: ".team/skills", strategy: "copy", createdAt: "now", updatedAt: "now" }],
      agentDisplayOrder: [],
    })).ok).toBe(true);
    const project = await fs.realpath(await fs.mkdtemp(path.join(sandbox.sandboxRoot, "project-")));
    const store = new StateStore(sandbox.stateRoot);
    const state = await store.readState();
    const source = state.lockFile.leafInventory.find((leaf) => leaf.id === "alpha:skills/review")!.absolutePath;
    await store.writeState({ ...state, preferences: { ...state.preferences,
      recentProjects: [{ projectId: "copy-project", projectPath: project, title: "Copy project", lastActivityAt: "now" }],
    } });
    const target = custom ? "team-copy" : "openclaw";
    expect((await app.applyDraft("alpha", {
      selectedLeafIds: mixed ? ["alpha:skills/review", "alpha:skills/other"] : ["alpha:skills/review"],
      enabledTargets: [target],
    }, { kind: "project", projectId: "copy-project" })).ok).toBe(true);
    const copy = path.join(project, custom ? ".team/skills/review" : "skills/review");
    expect((await fs.lstat(copy)).isSymbolicLink()).toBe(false);
    return { app, project, source, copy, marker, target };
  }
  async function diagnose(fixture: Awaited<ReturnType<typeof setup>>, inject?: () => () => void) {
    const before = await snapshot(sandbox.sandboxRoot);
    const restore = inject?.();
    let result;
    try { result = await fixture.app.doctor({ projectPath: fixture.project }); }
    finally { restore?.(); }
    expect(await snapshot(sandbox.sandboxRoot)).toEqual(before);
    expect(await fs.lstat(fixture.marker).catch(() => undefined)).toBeUndefined();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.data).toMatchObject({ scope: "project", projectPath: fixture.project, baseline: "available" });
    return result.data;
  }
  test("identical current source and copy pass with complete coverage", async () => {
    const report = await diagnose(await setup());
    expect(report.status).toBe("HEALTHY");
    expect(report.coverage?.complete).toBe(true);
    expect(report.issues).toEqual([]);
  });
  test.each(["source", "copy"] as const)("a change to the %s produces a neutral warning without modifying disk or state", async (side) => {
    const fixture = await setup();
    await fs.writeFile(path.join(fixture[side], "content.txt"), "changed content");
    const report = await diagnose(fixture);
    expect(report.status).toBe("PARTIAL");
    expect(report.coverage?.complete).toBe(true);
    const issue = report.issues.find((item) => item.code === "PROJECT_COPY_DIFFERENT");
    expect(issue).toMatchObject({ severity: "warning", path: fixture.copy, target: "openclaw", leafId: "alpha:skills/review" });
    expect(issue?.message).toContain("does not identify which side changed");
    expect(issue?.advice).not.toContain("symlink");
  });
  test("equal edits on both sides compare current content instead of cached inventory hashes", async () => {
    const fixture = await setup();
    await fs.writeFile(path.join(fixture.source, "content.txt"), "same new content");
    await fs.writeFile(path.join(fixture.copy, "content.txt"), "same new content");
    const report = await diagnose(fixture);
    expect(report.status).toBe("HEALTHY");
    expect(report.issues).toEqual([]);
  });
  test("configurable custom copy targets receive accurate symlink advice", async () => {
    const fixture = await setup(true);
    await fs.writeFile(path.join(fixture.copy, "content.txt"), "local edit");
    const report = await diagnose(fixture);
    const issue = report.issues.find((item) => item.code === "PROJECT_COPY_DIFFERENT");
    expect(issue).toMatchObject({ path: fixture.copy, target: fixture.target });
    expect(issue?.advice).toContain("deployment strategy to symlink");
    expect(issue?.advice).toContain("subsequent changes to the linked local source");
    expect(issue?.advice).toContain("does not update a remote repository");
  });
  test.each(["source", "copy"] as const)("unreadable %s content marks incomplete coverage without inventing a difference", async (side) => {
    const fixture = await setup();
    const unreadable = path.join(fixture[side], "content.txt");
    const report = await diagnose(fixture, () => {
      const original = fs.readFile.bind(fs);
      const spy = vi.spyOn(fs, "readFile").mockImplementation((async (location: unknown, ...args: unknown[]) => {
        if (location === unreadable) throw Object.assign(new Error("denied"), { code: "EACCES" });
        return Reflect.apply(original, fs, [location, ...args]);
      }) as typeof fs.readFile);
      return () => spy.mockRestore();
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.coverage?.complete).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_CHECK_INCOMPLETE", path: fixture[side] }));
    expect(report.issues.some((item) => item.code === "PROJECT_COPY_DIFFERENT")).toBe(false);
  });
  test("missing source is blocking instead of an ordinary content difference", async () => {
    const fixture = await setup();
    await fs.rm(fixture.source, { recursive: true });
    const report = await diagnose(fixture);
    expect(report.status).toBe("BLOCKED");
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_SOURCE_MISSING", path: fixture.source }));
    expect(report.issues.some((item) => item.code === "PROJECT_COPY_DIFFERENT")).toBe(false);
  });
  test("an invalid current source is blocking even when the deployed copy remains valid", async () => {
    const fixture = await setup();
    await fs.writeFile(path.join(fixture.source, "SKILL.md"), "---\nname: [broken\n---\n");
    const report = await diagnose(fixture);
    expect(report.status).toBe("BLOCKED");
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_SOURCE_INVALID", path: fixture.source }));
    expect(report.issues.some((item) => item.code === "PROJECT_COPY_DIFFERENT")).toBe(false);
  });
  test("a nested file disappearing during comparison is incomplete, not a missing source", async () => {
    const fixture = await setup();
    const report = await diagnose(fixture, () => {
      const original = fs.readFile.bind(fs);
      const spy = vi.spyOn(fs, "readFile").mockImplementation((async (location: unknown, ...args: unknown[]) => {
        if (location === path.join(fixture.source, "content.txt")) throw Object.assign(new Error("disappeared"), { code: "ENOENT" });
        return Reflect.apply(original, fs, [location, ...args]);
      }) as typeof fs.readFile);
      return () => spy.mockRestore();
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.coverage?.complete).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_CHECK_INCOMPLETE", path: fixture.source }));
    expect(report.issues.some((item) => ["PROJECT_COPY_DIFFERENT", "PROJECT_SOURCE_MISSING"].includes(item.code))).toBe(false);
  });
  test("a missing deployment outranks but retains another copy warning", async () => {
    const fixture = await setup(false, true);
    await fs.rm(path.join(path.dirname(fixture.copy), "other"), { recursive: true });
    await fs.writeFile(path.join(fixture.copy, "content.txt"), "local edit");
    const report = await diagnose(fixture);
    expect(report.status).toBe("BLOCKED");
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_DEPLOYMENT_MISSING", leafId: "alpha:skills/other" }));
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PROJECT_COPY_DIFFERENT", leafId: "alpha:skills/review", severity: "warning" }));
  });
  test("safe relative symlinks use the existing content comparison semantics", async () => {
    const fixture = await setup();
    await fs.symlink("content.txt", path.join(fixture.source, "reference"));
    await fs.symlink("content.txt", path.join(fixture.copy, "reference"));
    expect((await diagnose(fixture)).status).toBe("HEALTHY");
    await fs.rm(path.join(fixture.copy, "reference"));
    await fs.symlink("SKILL.md", path.join(fixture.copy, "reference"));
    expect((await diagnose(fixture)).issues).toContainEqual(expect.objectContaining({ code: "PROJECT_COPY_DIFFERENT" }));
  });
});

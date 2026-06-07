import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, pathExists, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("state schema v2 target repair", () => {
  const sandbox = useSkillFlowSandbox();

  test("repair does not trust stale projection target path or content hash", async () => {
    const previousRoot = process.env.SKILL_FLOW_TARGET_CODEX!;
    const currentRoot = path.join(sandbox.targetsRoot, "codex-current");
    const app = await seedProjectedSource();
    const store = new StateStore(app.store.rootPath);
    const state = await store.readState();
    state.lockFile.projections = state.lockFile.projections.map((projection) =>
      projection.sourceId === "repair-source" && projection.leafId === "repair-source:skills/review"
        ? {
            ...projection,
            targetPath: path.join(previousRoot, "review"),
            targetRootPath: previousRoot,
            contentHash: "hash-stale",
          }
        : projection,
    );
    await store.writeState(state);
    process.env.SKILL_FLOW_TARGET_CODEX = currentRoot;
    await fs.mkdir(currentRoot, { recursive: true });

    const repair = await app.repairTargets(["repair-source"]);

    expect(repair.ok).toBe(true);
    if (!repair.ok) {
      return;
    }
    expect(repair.data.actions).toContainEqual(expect.objectContaining({
      kind: "update",
      sourceId: "repair-source",
      leafId: "repair-source:skills/review",
      target: "codex",
      targetPath: path.join(currentRoot, "review"),
      previousTargetPath: path.join(previousRoot, "review"),
      contentHash: expect.not.stringMatching("hash-stale"),
    }));
    const repairedState = await store.readState();
    expect(repairedState.lockFile.projections).toContainEqual(expect.objectContaining({
      sourceId: "repair-source",
      leafId: "repair-source:skills/review",
      targetPath: path.join(currentRoot, "review"),
      contentHash: expect.not.stringMatching("hash-stale"),
      status: "active",
    }));
  });

  test("repair blocks unknown target without writing stale path", async () => {
    const app = await seedProjectedSource();
    const store = new StateStore(app.store.rootPath);
    const state = await store.readState();
    const staleRoot = path.join(sandbox.targetsRoot, "old-agent");
    const stalePath = path.join(staleRoot, "review");
    state.manifest.bindings["repair-source"] = {
      sourceId: "repair-source",
      selectionMode: "selected",
      selectedLeafIds: ["repair-source:skills/review"],
      enabledTargets: ["old-agent"],
    };
    state.lockFile.projections = [{
      target: "old-agent",
      sourceId: "repair-source",
      leafId: "repair-source:skills/review",
      targetPath: stalePath,
      targetRootPath: staleRoot,
      strategy: "symlink",
      contentHash: "hash-stale",
      status: "active",
      updatedAt: "2026-06-06T00:00:00.000Z",
    }];
    await store.writeState(state);

    const repair = await app.repairTargets(["repair-source"]);

    expect(repair.ok).toBe(true);
    if (!repair.ok) {
      return;
    }
    expect(repair.data.actions).toContainEqual(expect.objectContaining({
      kind: "blocked",
      sourceId: "repair-source",
      leafId: "repair-source:skills/review",
      target: "old-agent",
      diagnostics: [expect.objectContaining({ code: "TARGET_UNKNOWN", retryable: false })],
    }));
    expect(await pathExists(stalePath)).toBe(false);
    const repairedState = await store.readState();
    expect(repairedState.lockFile.projections).toContainEqual(expect.objectContaining({
      target: "old-agent",
      status: "blocked",
    }));
  });

  test("repair removes disabled leaf projection", async () => {
    const app = await seedProjectedSource({
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
      "skills/write/SKILL.md": skillDoc("write", "Write docs."),
    }, ["repair-source:skills/review", "repair-source:skills/write"]);
    const store = new StateStore(app.store.rootPath);
    const state = await store.readState();
    state.manifest.bindings["repair-source"] = {
      sourceId: "repair-source",
      selectionMode: "selected",
      selectedLeafIds: ["repair-source:skills/review"],
      enabledTargets: ["codex"],
    };
    await store.writeState(state);

    const repair = await app.repairTargets(["repair-source"]);

    expect(repair.ok).toBe(true);
    if (!repair.ok) {
      return;
    }
    expect(repair.data.actions).toContainEqual(expect.objectContaining({
      kind: "remove",
      sourceId: "repair-source",
      leafId: "repair-source:skills/write",
      target: "codex",
    }));
    const repairedState = await store.readState();
    expect(repairedState.lockFile.projections).toContainEqual(expect.objectContaining({
      sourceId: "repair-source",
      leafId: "repair-source:skills/write",
      target: "codex",
      status: "removed",
    }));
  });

  test("status inspection reports target drift and apply repairs it", async () => {
    const app = await seedProjectedSource();
    await fs.rm(path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "review"), {
      recursive: true,
      force: true,
    });

    const before = await app.inspectTargetStatus(["repair-source"]);
    expect(before.ok).toBe(true);
    if (!before.ok) {
      return;
    }
    expect(before.data.diagnostics).toContainEqual(expect.objectContaining({
      code: "TARGET_PROJECTION_DRIFT",
      details: expect.objectContaining({
        sourceId: "repair-source",
        leafId: "repair-source:skills/review",
        target: "codex",
      }),
    }));

    const applied = await app.applyTargets(["repair-source"]);
    expect(applied.ok).toBe(true);

    const after = await app.inspectTargetStatus(["repair-source"]);
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }
    expect(after.data.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "TARGET_PROJECTION_DRIFT",
    }));
  });

  async function seedProjectedSource(
    files: Record<string, string> = {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    },
    selectedLeafIds = ["repair-source:skills/review"],
  ): Promise<SkillFlowApp> {
    const repoPath = await createRepo(sandbox.sandboxRoot, files);
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "repair-source",
      draft: {
        selectedLeafIds,
        enabledTargets: ["codex"],
      },
    });
    expect(added.ok).toBe(true);
    return app;
  }
});

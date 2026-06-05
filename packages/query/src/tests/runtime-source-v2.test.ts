import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { SkillFlowApp } from "../runtime.js";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("runtime source v2 write chain", () => {
  const sandbox = useSkillFlowSandbox();

  test("addSource writes v2 authority and applies draft without legacy state reads or writes", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const app = new SkillFlowApp();
    const legacyReadState = vi
      .spyOn(app.store, "readState")
      .mockRejectedValue(new Error("legacy readState"));
    const legacyReadPreferences = vi
      .spyOn(app.store, "readPreferences")
      .mockRejectedValue(new Error("legacy readPreferences"));
    const legacyWriteState = vi
      .spyOn(app.store, "writeState")
      .mockRejectedValue(new Error("legacy writeState"));
    const legacyWritePreferences = vi
      .spyOn(app.store, "writePreferences")
      .mockRejectedValue(new Error("legacy writePreferences"));

    const added = await app.addSource(repoPath, {
      sourceIdOverride: "design-source",
      draft: {
        selectedLeafIds: ["design-source:skills/frontend-design"],
        enabledTargets: ["codex"],
      },
    });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
    expect(legacyWriteState).not.toHaveBeenCalled();
    expect(legacyWritePreferences).not.toHaveBeenCalled();

    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual([
      expect.objectContaining({
        id: "design-source",
        kind: "local",
        locator: repoPath,
      }),
    ]);
    expect(state.manifest.bindings["design-source"]).toEqual({
      sourceId: "design-source",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    expect(state.lockFile.leafInventory).toEqual([
      expect.objectContaining({
        id: "design-source:skills/frontend-design",
        sourceId: "design-source",
        relativePath: "skills/frontend-design",
      }),
    ]);
    expect(state.lockFile.projections).toEqual([
      expect.objectContaining({
        sourceId: "design-source",
        leafId: "design-source:skills/frontend-design",
        target: "codex",
        status: "active",
      }),
    ]);
    await expect(
      pathExists(path.join(sandbox.targetsRoot, "codex", "frontend-design")),
    ).resolves.toBe(true);

    const rawLock = JSON.parse(
      await fs.readFile(path.join(sandbox.stateRoot, "lock.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(rawLock.deployments).toBeUndefined();
  });

  test("rollbackPreparedSource removes a v2 source without active projections", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, {
      sourceIdOverride: "design-source",
      project: false,
    });
    expect(added.ok).toBe(true);

    const rolledBack = await app.rollbackPreparedSource("design-source");

    expect(rolledBack.ok).toBe(true);
    if (!rolledBack.ok) {
      return;
    }
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual([]);
    expect(state.manifest.bindings["design-source"]).toBeUndefined();
    expect(state.lockFile.sources["design-source"]).toBeUndefined();
    expect(state.lockFile.leafInventory).toEqual([]);
    expect(state.lockFile.projections).toEqual([]);
    await expect(
      pathExists(path.join(sandbox.stateRoot, "source", "local", "design-source")),
    ).resolves.toBe(false);
  });

  test("addSource preserves invalid leaf warnings on the v2 authority path", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
      "bad/SKILL.md": "Broken file",
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, {
      sourceIdOverride: "mixed-source",
      project: false,
    });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(added.data.leafCount).toBe(1);
    expect(added.warnings).toEqual([
      expect.objectContaining({
        code: "INVALID_LEAF",
      }),
    ]);
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.lockFile.leafInventory).toEqual([
      expect.objectContaining({
        id: "mixed-source:good",
        valid: true,
      }),
    ]);
  });

  test("commitPreparedImportSource writes and projects through v2 authority", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
      "skills/write/SKILL.md": skillDoc("write", "Write docs."),
    });
    const app = new SkillFlowApp();
    const legacyReadState = vi
      .spyOn(app.store, "readState")
      .mockRejectedValue(new Error("legacy readState"));
    const legacyWriteState = vi
      .spyOn(app.store, "writeState")
      .mockRejectedValue(new Error("legacy writeState"));
    const legacyReadPreferences = vi
      .spyOn(app.store, "readPreferences")
      .mockRejectedValue(new Error("legacy readPreferences"));
    const legacyWritePreferences = vi
      .spyOn(app.store, "writePreferences")
      .mockRejectedValue(new Error("legacy writePreferences"));

    const prepared = await app.prepareImportSource(repoPath);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }

    const committed = await app.commitPreparedImportSource(prepared.data.preparationId, {
      selectedSkillIds: ["skills/review"],
      enabledTargets: ["codex"],
    });

    expect(committed.ok).toBe(true);
    if (!committed.ok || committed.data.status !== "ready") {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyWriteState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
    expect(legacyWritePreferences).not.toHaveBeenCalled();

    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.bindings[committed.data.sourceId]).toEqual({
      sourceId: committed.data.sourceId,
      selectionMode: "selected",
      selectedLeafIds: [`${committed.data.sourceId}:skills/review`],
      enabledTargets: ["codex"],
    });
    expect(state.lockFile.projections).toEqual([
      expect.objectContaining({
        sourceId: committed.data.sourceId,
        leafId: `${committed.data.sourceId}:skills/review`,
        target: "codex",
        status: "active",
      }),
    ]);
  });

  test("importSource rolls back the v2 source when requested targets are invalid", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const imported = await app.importSource(repoPath, {
      selectedSkillIds: ["skills/review"],
      enabledTargets: ["not-a-target" as never],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.data).toEqual({
      status: "failed",
      reasonCode: "ADD_AGENT_NOT_AVAILABLE",
      retryable: true,
    });
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual([]);
    expect(state.manifest.bindings).toEqual({});
    expect(state.lockFile.sources).toEqual({});
    expect(state.lockFile.leafInventory).toEqual([]);
    expect(state.lockFile.projections).toEqual([]);
  });
});

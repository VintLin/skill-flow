import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { SkillFlowApp } from "../runtime.js";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

describe.sequential("runtime source v2 write chain", () => {
  const sandbox = useSkillFlowSandbox();

  function expectNoLegacyAuthorityApi(app: SkillFlowApp) {
    const store = app.store as unknown as Record<string, unknown>;
    expect(store.readManifest).toBeUndefined();
    expect(store.writeManifest).toBeUndefined();
    expect(store.readLock).toBeUndefined();
    expect(store.writeLock).toBeUndefined();
    expect(store.readState).toBeUndefined();
    expect(store.writeState).toBeUndefined();
    expect(store.readPreferences).toBeUndefined();
    expect(store.writePreferences).toBeUndefined();
  }

  test("addSource writes v2 authority and applies draft without legacy state reads or writes", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const app = new SkillFlowApp();
    expectNoLegacyAuthorityApi(app);

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
    expectNoLegacyAuthorityApi(app);

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
    expectNoLegacyAuthorityApi(app);

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
    expectNoLegacyAuthorityApi(app);

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

  test("renameSource updates v2 manifest without legacy state reads or writes", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "rename-source",
      project: false,
    });
    expect(added.ok).toBe(true);
    expectNoLegacyAuthorityApi(app);

    const renamed = await app.renameSource("rename-source", "Renamed Source");

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    expectNoLegacyAuthorityApi(app);
    expect(renamed.data.displayName).toBe("Renamed Source");
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources.find((source) => source.id === "rename-source")?.displayName)
      .toBe("Renamed Source");
  });

  test("uninstall removes v2 source and managed projections without legacy source service", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "remove-source",
      draft: {
        selectedLeafIds: ["remove-source:skills/review"],
        enabledTargets: ["codex"],
      },
    });
    expect(added.ok).toBe(true);
    await expect(
      pathExists(path.join(sandbox.targetsRoot, "codex", "review")),
    ).resolves.toBe(true);
    expectNoLegacyAuthorityApi(app);

    const removed = await app.uninstall(["remove-source"]);

    expect(removed.ok).toBe(true);
    if (!removed.ok) {
      return;
    }
    expectNoLegacyAuthorityApi(app);
    expect(removed.data.removed).toEqual(["remove-source"]);
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual([]);
    expect(state.lockFile.sources).toEqual({});
    expect(state.lockFile.projections).toEqual([]);
    await expect(
      pathExists(path.join(sandbox.targetsRoot, "codex", "review")),
    ).resolves.toBe(false);
  });

  test("updateSources refreshes v2 leaf inventory without legacy source service", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "update-source",
      draft: {
        selectedLeafIds: ["update-source:skills/one"],
        enabledTargets: ["codex"],
      },
    });
    expect(added.ok).toBe(true);
    await writeRepoFiles(repoPath, {
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });
    expectNoLegacyAuthorityApi(app);

    const updated = await app.updateSources(["update-source"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expectNoLegacyAuthorityApi(app);
    expect(updated.data.updated[0]).toEqual(expect.objectContaining({
      sourceId: "update-source",
      changed: true,
      addedLeafIds: ["update-source:skills/two"],
    }));
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.lockFile.sources["update-source"]?.leafIds).toEqual([
      "update-source:skills/one",
      "update-source:skills/two",
    ]);
    expect(state.lockFile.leafInventory.map((leaf) => leaf.id).sort()).toEqual([
      "update-source:skills/one",
      "update-source:skills/two",
    ]);
    expect(state.lockFile.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "update-source",
        leafId: "update-source:skills/one",
        target: "codex",
        status: "active",
      }),
      expect.objectContaining({
        sourceId: "update-source",
        leafId: "update-source:skills/two",
        target: "codex",
        status: "active",
      }),
    ]));
  });

  test("repairTargets recreates managed target paths from v2 projections", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "repair-targets-source",
      draft: {
        selectedLeafIds: ["repair-targets-source:skills/review"],
        enabledTargets: ["codex"],
      },
    });
    expect(added.ok).toBe(true);
    await fs.rm(path.join(sandbox.targetsRoot, "codex", "review"), {
      recursive: true,
      force: true,
    });
    expectNoLegacyAuthorityApi(app);

    const repaired = await app.repairTargets(["repair-targets-source"]);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }
    expectNoLegacyAuthorityApi(app);
    await expect(
      pathExists(path.join(sandbox.targetsRoot, "codex", "review")),
    ).resolves.toBe(true);
    const rawLock = JSON.parse(
      await fs.readFile(path.join(sandbox.stateRoot, "lock.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(rawLock.deployments).toBeUndefined();
  });

  test("repairSource refreshes v2 inventory without replanning targets", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "repair-source",
      project: false,
    });
    expect(added.ok).toBe(true);
    await writeRepoFiles(repoPath, {
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });

    const repaired = await app.repairSource(["repair-source"]);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.lockFile.sources["repair-source"]?.leafIds).toEqual([
      "repair-source:skills/one",
      "repair-source:skills/two",
    ]);
    expect(state.lockFile.projections).toEqual([]);
  });

  test("doctor reconciles inventory through v2 authority", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "doctor-source",
      project: false,
    });
    expect(added.ok).toBe(true);
    expectNoLegacyAuthorityApi(app);

    const report = await app.doctor();

    expect(report.ok).toBe(true);
    expectNoLegacyAuthorityApi(app);
  });

  test("repairState reconciles local checkout and replans through v2 authority", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "repair-state-source",
      draft: {
        selectedLeafIds: ["repair-state-source:skills/one"],
        enabledTargets: ["codex"],
      },
    });
    expect(added.ok).toBe(true);
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    await writeRepoFiles(state.lockFile.sources["repair-state-source"]!.localPath, {
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });
    expectNoLegacyAuthorityApi(app);

    const repaired = await app.repairState(["repair-state-source"]);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }
    expectNoLegacyAuthorityApi(app);
    expect(repaired.data.repairedSourceIds).toEqual(["repair-state-source"]);
    const repairedState = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(repairedState.lockFile.sources["repair-state-source"]?.leafIds).toEqual([
      "repair-state-source:skills/one",
      "repair-state-source:skills/two",
    ]);
    expect(repairedState.lockFile.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "repair-state-source",
        leafId: "repair-state-source:skills/one",
        target: "codex",
        status: "active",
      }),
      expect.objectContaining({
        sourceId: "repair-state-source",
        leafId: "repair-state-source:skills/two",
        target: "codex",
        status: "active",
      }),
    ]));
  });

  test("bootstrapWorkspaceState prunes missing v2 checkouts without legacy state", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "missing-checkout",
      project: false,
    });
    expect(added.ok).toBe(true);
    await fs.rm(path.join(sandbox.stateRoot, "source", "local", "missing-checkout"), {
      recursive: true,
      force: true,
    });
    expectNoLegacyAuthorityApi(app);

    const bootstrapped = await app.bootstrapWorkspaceState();

    expect(bootstrapped.ok).toBe(true);
    if (!bootstrapped.ok) {
      return;
    }
    expectNoLegacyAuthorityApi(app);
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual([]);
    expect(state.manifest.bindings).toEqual({});
    expect(state.lockFile.sources).toEqual({});
    expect(state.lockFile.leafInventory).toEqual([]);
    expect(state.lockFile.projections).toEqual([]);
  });

  test("togglePinnedSource writes v2 preferences without legacy manifest or preferences", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "pin-source",
      project: false,
    });
    expect(added.ok).toBe(true);
    expectNoLegacyAuthorityApi(app);

    const pinned = await app.togglePinnedSource("pin-source");

    expect(pinned.ok).toBe(true);
    if (!pinned.ok) {
      return;
    }
    expect(pinned.data.pinnedSourceIds).toEqual(["pin-source"]);
    expectNoLegacyAuthorityApi(app);
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.preferences.pinnedSourceIds).toEqual(["pin-source"]);
  });
});

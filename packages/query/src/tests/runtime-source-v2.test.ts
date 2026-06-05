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
    const legacyWriteState = vi
      .spyOn(app.store, "writeState")
      .mockRejectedValue(new Error("legacy writeState"));

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
    expect(legacyWriteState).not.toHaveBeenCalled();

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
});

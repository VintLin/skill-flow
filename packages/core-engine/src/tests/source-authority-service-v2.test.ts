import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { InventoryService } from "../services/inventory-service.js";
import { SourceAuthorityServiceV2 } from "../services/source-authority-service-v2.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

describe.sequential("SourceAuthorityServiceV2", () => {
  const sandbox = useSkillFlowSandbox();

  test("adds a prepared source by writing only v2 authority files", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const stateStore = new StateStoreV2(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityServiceV2({
      stateStore,
      checkoutService,
    });

    const added = await service.addSource(repoPath, {
      sourceIdOverride: "design-source",
      checkoutPath: path.join(sandbox.stateRoot, "source", "local", ".prepared-design-source"),
    });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const state = await stateStore.readState();
    expect(state.manifest.sources).toEqual([
      expect.objectContaining({
        id: "design-source",
        kind: "local",
        locator: repoPath,
        canonicalLocator: repoPath,
        displayName: path.basename(repoPath),
        enabled: true,
      }),
    ]);
    expect(state.manifest.bindings["design-source"]).toEqual({
      sourceId: "design-source",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    });
    expect(state.lockFile.sources["design-source"]).toEqual(expect.objectContaining({
      sourceId: "design-source",
      canonicalLocator: repoPath,
      localPath: path.join(sandbox.stateRoot, "source", "local", "design-source"),
      leafIds: ["design-source:skills/frontend-design"],
    }));
    expect(state.lockFile.leafInventory).toEqual([
      expect.objectContaining({
        id: "design-source:skills/frontend-design",
        sourceId: "design-source",
        relativePath: "skills/frontend-design",
        linkName: "frontend-design",
        valid: true,
      }),
    ]);
    const rawLock = JSON.parse(await fs.readFile(path.join(sandbox.stateRoot, "lock.json"), "utf8")) as Record<string, unknown>;
    expect(rawLock.deployments).toBeUndefined();
    await expect(fs.access(path.join(sandbox.stateRoot, "virtual-groups.json"))).rejects.toThrow();
    await expect(fs.stat(path.join(
      sandbox.stateRoot,
      "source",
      "local",
      "design-source",
      "skills",
      "frontend-design",
      "SKILL.md",
    ))).resolves.toBeTruthy();
  });

  test("refuses to remove a source whose checkout path does not match its v2 identity", async () => {
    const alphaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/alpha/SKILL.md": skillDoc("alpha", "Alpha skill."),
    });
    const betaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/beta/SKILL.md": skillDoc("beta", "Beta skill."),
    });
    const stateStore = new StateStoreV2(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityServiceV2({
      stateStore,
      checkoutService,
    });
    const alpha = await service.addSource(alphaRepo, { sourceIdOverride: "alpha-source" });
    const beta = await service.addSource(betaRepo, { sourceIdOverride: "beta-source" });
    expect(alpha.ok).toBe(true);
    expect(beta.ok).toBe(true);

    const state = await stateStore.readState();
    state.lockFile.sources["alpha-source"] = {
      ...state.lockFile.sources["alpha-source"]!,
      localPath: state.lockFile.sources["beta-source"]!.localPath,
    };
    await stateStore.writeState(state);

    const removed = await service.removeSource(["alpha-source"]);

    expect(removed.ok).toBe(false);
    if (removed.ok) {
      return;
    }
    expect(removed.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
    const after = await stateStore.readState();
    expect(after.manifest.sources.map((source) => source.id).sort()).toEqual([
      "alpha-source",
      "beta-source",
    ]);
    await expect(fs.stat(path.join(
      sandbox.stateRoot,
      "source",
      "local",
      "beta-source",
      "skills",
      "beta",
      "SKILL.md",
    ))).resolves.toBeTruthy();
  });

  test("updates v2 leaf inventory from source origin", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const stateStore = new StateStoreV2(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityServiceV2({
      stateStore,
      checkoutService,
    });
    const added = await service.addSource(repoPath, {
      sourceIdOverride: "update-source",
    });
    expect(added.ok).toBe(true);
    await writeRepoFiles(repoPath, {
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });

    const updated = await service.updateSources(["update-source"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]).toEqual(expect.objectContaining({
      sourceId: "update-source",
      changed: true,
      addedLeafIds: ["update-source:skills/two"],
    }));
    const state = await stateStore.readState();
    expect(state.lockFile.sources["update-source"]?.leafIds).toEqual([
      "update-source:skills/one",
      "update-source:skills/two",
    ]);
  });

  test("reconciles v2 leaf inventory from managed checkout", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });
    const stateStore = new StateStoreV2(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityServiceV2({
      stateStore,
      checkoutService,
    });
    const added = await service.addSource(repoPath, {
      sourceIdOverride: "reconcile-source",
    });
    expect(added.ok).toBe(true);

    const state = await stateStore.readState();
    state.manifest.bindings["reconcile-source"] = {
      sourceId: "reconcile-source",
      selectionMode: "selected",
      selectedLeafIds: [
        "reconcile-source:skills/one",
        "reconcile-source:skills/two",
      ],
      enabledTargets: ["codex"],
    };
    await stateStore.writeState(state);
    const checkoutPath = state.lockFile.sources["reconcile-source"]!.localPath;
    await fs.rm(path.join(checkoutPath, "skills", "two"), {
      recursive: true,
      force: true,
    });
    await writeRepoFiles(checkoutPath, {
      "skills/three/SKILL.md": skillDoc("three", "Three."),
    });

    const reconciled = await service.reconcileInventory(["reconcile-source"], {
      force: true,
    });

    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) {
      return;
    }
    expect(reconciled.data.updatedSourceIds).toEqual(["reconcile-source"]);
    const nextState = await stateStore.readState();
    expect(nextState.lockFile.sources["reconcile-source"]?.leafIds).toEqual([
      "reconcile-source:skills/one",
      "reconcile-source:skills/three",
    ]);
    expect(nextState.manifest.bindings["reconcile-source"]?.selectedLeafIds).toEqual([
      "reconcile-source:skills/one",
    ]);
  });
});

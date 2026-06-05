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
});

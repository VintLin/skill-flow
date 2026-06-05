import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import { ImportPreparationServiceV2 } from "../services/import-preparation-service-v2.js";
import { InventoryService } from "../services/inventory-service.js";
import { SourceAuthorityServiceV2 } from "../services/source-authority-service-v2.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

function createService(stateRoot: string) {
  const stateStore = new StateStoreV2(stateRoot);
  const cacheStore = new ImportPreparationCacheStore(stateRoot);
  const checkoutService = new SourceCheckoutService({
    sourceRoot: path.join(stateRoot, "source"),
    inventoryService: new InventoryService(),
  });
  const sourceAuthority = new SourceAuthorityServiceV2({
    stateStore,
    checkoutService,
  });

  return {
    stateStore,
    cacheStore,
    service: new ImportPreparationServiceV2({
      cacheStore,
      sourceAuthority,
      checkoutService,
    }),
  };
}

describe.sequential("ImportPreparationServiceV2", () => {
  const sandbox = useSkillFlowSandbox();

  test("commits a prepared checkout through v2 source authority", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();

    const prepared = await service.prepareImportSource(repoPath, {
      sourceIdOverride: "design-source",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }

    const committed = await service.commitPreparedImportSource(prepared.data.preparationId);

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.data).toMatchObject({
      status: "ready",
      sourceId: "design-source",
      usedPreparation: true,
    });
    const state = await stateStore.readState();
    expect(state.manifest.sources.map((source) => source.id)).toEqual(["design-source"]);
    expect(state.lockFile.sources["design-source"]?.leafIds).toEqual([
      "design-source:skills/frontend-design",
    ]);
    expect((await cacheStore.readImportPreparationCache()).records[prepared.data.preparationId])
      .toBeUndefined();
  });

  test("reuses a non-expired ready preparation", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const { stateStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();

    const first = await service.prepareImportSource(repoPath);
    const second = await service.prepareImportSource(repoPath);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok && first.data.status === "ready" && second.data.status === "ready") {
      expect(second.data.preparationId).toBe(first.data.preparationId);
    }
  });

  test("returns stale when prepared checkout is missing", async () => {
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();
    await cacheStore.writeImportPreparationRecord({
      id: "prep-missing",
      cacheKey: "local:/missing",
      locator: "/missing",
      canonicalRepo: "local:/missing",
      sourceKind: "local",
      checkoutPath: path.join(
        sandbox.stateRoot,
        "catalog",
        "import-preparations",
        "prep-missing",
        "checkout",
      ),
      sourceId: "missing-source",
      displayName: "missing-source",
      status: "ready",
      preparedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillIds: [],
      availableTargets: [],
    });

    const committed = await service.commitPreparedImportSource("prep-missing");

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.data).toEqual({
      status: "failed",
      reasonCode: "IMPORT_PREPARATION_MISSING",
      retryable: true,
    });
  });

  test("marks preparation failed when source cannot be prepared", async () => {
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();

    const prepared = await service.prepareImportSource(path.join(sandbox.sandboxRoot, "missing"));

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data.status).toBe("failed");
    const cache = await cacheStore.readImportPreparationCache();
    expect(Object.values(cache.records).some((record) => record.status === "failed")).toBe(true);
  });

  test("does not require prepared leafs in cache records", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();
    const prepared = await service.prepareImportSource(repoPath, {
      sourceIdOverride: "design-source",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }
    const cache = await cacheStore.readImportPreparationCache();
    expect(cache.records[prepared.data.preparationId]).not.toHaveProperty("preparedLeafs");

    const committed = await service.commitPreparedImportSource(prepared.data.preparationId);

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.data.status).toBe("ready");
  });

  test("fails commit when prepared checkout has no valid skills", async () => {
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();
    const checkoutPath = path.join(
      sandbox.stateRoot,
      "catalog",
      "import-preparations",
      "prep-empty",
      "checkout",
    );
    await fs.mkdir(checkoutPath, { recursive: true });
    await cacheStore.writeImportPreparationRecord({
      id: "prep-empty",
      cacheKey: "local:/empty",
      locator: checkoutPath,
      canonicalRepo: "local:/empty",
      sourceKind: "local",
      checkoutPath,
      sourceId: "empty-source",
      displayName: "empty-source",
      status: "ready",
      preparedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillIds: [],
      availableTargets: [],
    });

    const committed = await service.commitPreparedImportSource("prep-empty");

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.data).toEqual({
      status: "failed",
      reasonCode: "IMPORT_PREPARATION_EMPTY",
      retryable: true,
    });
  });
});

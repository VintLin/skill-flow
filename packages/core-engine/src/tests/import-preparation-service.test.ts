import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import { ImportPreparationService } from "../services/import-preparation-service.js";
import { InventoryService } from "../services/inventory-service.js";
import { SourceAuthorityService } from "../services/source-authority-service.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

function createService(stateRoot: string) {
  const stateStore = new StateStore(stateRoot);
  const cacheStore = new ImportPreparationCacheStore(stateRoot);
  const checkoutService = new SourceCheckoutService({
    sourceRoot: path.join(stateRoot, "source"),
    inventoryService: new InventoryService(),
  });
  const sourceAuthority = new SourceAuthorityService({
    stateStore,
    checkoutService,
  });

  return {
    stateStore,
    cacheStore,
    service: new ImportPreparationService({
      cacheStore,
      sourceAuthority,
      checkoutService,
    }),
  };
}

describe.sequential("ImportPreparationService", () => {
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

  test("reuses an available preparation when newer terminal records share the cache key", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();
    const checkoutPath = cacheStore.getImportPreparationCheckoutPath("prep-ready");
    await fs.mkdir(checkoutPath, { recursive: true });

    await cacheStore.writeImportPreparationRecord({
      id: "prep-ready",
      cacheKey: repoPath,
      locator: repoPath,
      canonicalRepo: repoPath,
      sourceKind: "local",
      checkoutPath,
      sourceId: "ready-source",
      displayName: "ready-source",
      status: "ready",
      preparedAt: "2026-06-07T00:00:00.000Z",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillIds: [],
      availableTargets: [],
    });
    await cacheStore.writeImportPreparationRecord({
      id: "prep-failed",
      cacheKey: repoPath,
      locator: repoPath,
      canonicalRepo: repoPath,
      sourceKind: "local",
      checkoutPath: cacheStore.getImportPreparationCheckoutPath("prep-failed"),
      sourceId: "failed-source",
      displayName: "failed-source",
      status: "failed",
      preparedAt: "2026-06-07T00:01:00.000Z",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillIds: [],
      availableTargets: [],
    });

    const prepared = await service.prepareImportSource(repoPath);

    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.data).toMatchObject({
        status: "ready",
        preparationId: "prep-ready",
      });
    }
    const cache = await cacheStore.readImportPreparationCache();
    expect(cache.records["prep-failed"]).toBeUndefined();
    expect(cache.records["prep-ready"]).toBeDefined();
  });

  test("reports committing preparation without deleting the active record", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();
    const checkoutPath = cacheStore.getImportPreparationCheckoutPath("prep-committing");
    await fs.mkdir(checkoutPath, { recursive: true });
    await cacheStore.writeImportPreparationRecord({
      id: "prep-committing",
      cacheKey: repoPath,
      locator: repoPath,
      canonicalRepo: repoPath,
      sourceKind: "local",
      checkoutPath,
      sourceId: "committing-source",
      displayName: "committing-source",
      status: "committing",
      preparedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillIds: [],
      availableTargets: [],
    });

    const prepared = await service.prepareImportSource(repoPath);

    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.data).toEqual({
        status: "failed",
        preparationId: "prep-committing",
        reasonCode: "IMPORT_PREPARATION_COMMITTING",
        retryable: true,
      });
    }
    const cache = await cacheStore.readImportPreparationCache();
    expect(cache.records["prep-committing"]?.status).toBe("committing");
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

  test("does not map collection preparations to git checkout", async () => {
    const { stateStore, cacheStore, service } = createService(sandbox.stateRoot);
    await stateStore.init();
    const checkoutPath = path.join(
      sandbox.stateRoot,
      "catalog",
      "import-preparations",
      "prep-collection",
      "checkout",
    );
    await fs.mkdir(path.join(checkoutPath, "skills", "saved"), { recursive: true });
    await fs.writeFile(
      path.join(checkoutPath, "skills", "saved", "SKILL.md"),
      skillDoc("saved", "Saved skill."),
      "utf8",
    );
    await cacheStore.writeImportPreparationRecord({
      id: "prep-collection",
      cacheKey: "collection:saved",
      locator: "collection:saved",
      canonicalRepo: "collection:saved",
      sourceKind: "collection",
      checkoutPath,
      sourceId: "saved-collection",
      displayName: "Saved Collection",
      status: "ready",
      preparedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillIds: ["saved"],
      availableTargets: [],
    });

    const committed = await service.commitPreparedImportSource("prep-collection");

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.data).toEqual({
      status: "failed",
      reasonCode: "COLLECTION_CHECKOUT_UNSUPPORTED",
      retryable: false,
    });
  });
});

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStore } from "@skill-flow/storage/store";
import { InventoryService } from "../services/inventory-service.js";
import { ImportPreparationService } from "../services/import-preparation-service.js";
import { SourceService } from "../services/source-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

function createService() {
  const store = new StateStore();
  const sourceService = new SourceService(store, new InventoryService());
  return {
    store,
    service: new ImportPreparationService(store, sourceService),
  };
}

describe.sequential("ImportPreparationService", () => {
  const sandbox = useSkillFlowSandbox();

  test("prepares a local source and returns a reusable ready record", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const { store, service } = createService();

    const prepared = await service.prepareImportSource(repoPath);

    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }
    expect(prepared.data.preparationId).toMatch(/^prep-/);
    await expect(fs.stat(store.getImportPreparationCheckoutPath(prepared.data.preparationId))).resolves.toBeTruthy();
    const cache = await store.readImportPreparationCache();
    expect(cache.locatorIndex[repoPath]).toBe(prepared.data.preparationId);
  });

  test("reuses a non-expired ready preparation for the same locator", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const { service } = createService();

    const first = await service.prepareImportSource(repoPath);
    const second = await service.prepareImportSource(repoPath);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok && first.data.status === "ready" && second.data.status === "ready") {
      expect(second.data.preparationId).toBe(first.data.preparationId);
    }
  });

  test("commits a prepared source and removes its cache record", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const { store, service } = createService();
    const prepared = await service.prepareImportSource(repoPath);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }

    const committed = await service.commitPreparedImportSource(prepared.data.preparationId);

    expect(committed.ok).toBe(true);
    if (!committed.ok || committed.data.status !== "ready") {
      return;
    }
    expect(committed.data.usedPreparation).toBe(true);
    expect(committed.data.preparationId).toBe(prepared.data.preparationId);
    expect((await store.readImportPreparationCache()).records[prepared.data.preparationId]).toBeUndefined();
    await expect(fs.stat(path.join(store.getSourceCheckoutPath("local", committed.data.sourceId), "skills", "review", "SKILL.md"))).resolves.toBeTruthy();
  });

  test("marks preparation failed when source cannot be prepared", async () => {
    const { store, service } = createService();

    const prepared = await service.prepareImportSource(path.join(sandbox.sandboxRoot, "missing"));

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data.status).toBe("failed");
    if (prepared.data.status === "failed") {
      expect(prepared.data.retryable).toBe(true);
      expect(prepared.data.reasonCode).toBe("GIT_CLONE_FAILED");
      const cache = await store.readImportPreparationCache();
      expect(Object.values(cache.records).some((record) => record.status === "failed")).toBe(true);
    }
  });
});

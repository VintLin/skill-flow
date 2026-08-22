import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import { OperationRecoveryService } from "../services/operation-recovery-service.js";

describe.sequential("OperationRecoveryService", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  test("recovers authority and checkout from a journal written before mutation", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-"));
    roots.push(stateRoot);
    const stateStore = new StateStore(stateRoot);
    await stateStore.init();
    const checkoutPath = path.join(stateRoot, "source", "git", "repo");
    await fs.mkdir(checkoutPath, { recursive: true });
    await fs.writeFile(path.join(checkoutPath, "version.txt"), "old\n", "utf8");

    const original = await stateStore.readState();
    original.manifest.sources.push({
      id: "repo",
      kind: "git",
      locator: "https://example.test/repo.git",
      canonicalLocator: "https://example.test/repo.git",
      displayName: "repo",
      enabled: true,
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    });
    original.manifest.bindings.repo = {
      sourceId: "repo",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    original.lockFile.sources.repo = {
      sourceId: "repo",
      canonicalLocator: "https://example.test/repo.git",
      revision: { provider: "git", commit: "old", capturedAt: "2026-08-22T00:00:00.000Z" },
      localPath: checkoutPath,
      leafIds: [],
    };
    await stateStore.writeState(original);

    const recovery = new OperationRecoveryService({ stateStore });
    const transaction = await recovery.begin({ kind: "update", sourceId: "repo" });
    expect(transaction.checkoutBackupPath).toBeDefined();
    await fs.mkdir(path.dirname(transaction.checkoutBackupPath!), { recursive: true });
    await fs.rename(checkoutPath, transaction.checkoutBackupPath!);
    await fs.mkdir(checkoutPath, { recursive: true });
    await fs.writeFile(path.join(checkoutPath, "version.txt"), "new\n", "utf8");
    const changed = await stateStore.readState();
    changed.lockFile.sources.repo!.revision = {
      provider: "git",
      commit: "new",
      capturedAt: "2026-08-22T01:00:00.000Z",
    };
    await stateStore.writeState(changed);

    const recovered = await new OperationRecoveryService({ stateStore }).recover();

    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.data).toEqual({ recovered: true, sourceId: "repo", kind: "update" });
    expect(await fs.readFile(path.join(checkoutPath, "version.txt"), "utf8")).toBe("old\n");
    expect((await stateStore.readState()).lockFile.sources.repo?.revision).toEqual(
      expect.objectContaining({ commit: "old" }),
    );
    await expect(fs.access(path.join(stateRoot, "recovery", "active.json"))).rejects.toThrow();
  });

  test("does not overwrite a managed target changed after the mutation checkpoint", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-"));
    roots.push(stateRoot);
    const stateStore = new StateStore(stateRoot);
    await stateStore.init();
    const targetPath = path.join(stateRoot, "targets", "review");
    const sourcePath = path.join(stateRoot, "source-next", "review");
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(targetPath, "before\n", "utf8");
    await fs.writeFile(sourcePath, "by-operation\n", "utf8");
    const state = await stateStore.readState();
    state.lockFile.projections.push({
      sourceId: "repo",
      leafId: "repo:review",
      target: "codex",
      targetPath,
      targetRootPath: path.dirname(targetPath),
      strategy: "copy",
      status: "active",
      contentHash: "before",
      updatedAt: "2026-08-22T00:00:00.000Z",
    });
    await stateStore.writeState(state);
    const recovery = new OperationRecoveryService({ stateStore });
    await recovery.begin({ kind: "update", sourceId: "repo" });
    await recovery.prepareTargetMutations([{
      kind: "update",
      sourceId: "repo",
      leafId: "repo:review",
      target: "codex",
      strategy: "copy",
      sourcePath,
      targetPath,
      targetRootPath: path.dirname(targetPath),
      contentHash: "by-operation",
    }]);
    await fs.writeFile(targetPath, "by-operation\n", "utf8");
    await recovery.checkpoint();
    await fs.writeFile(targetPath, "external-edit\n", "utf8");

    const recovered = await recovery.recover();

    expect(recovered.ok).toBe(false);
    if (recovered.ok) return;
    expect(recovered.errors[0]?.code).toBe("RECOVERY_TARGET_CONFLICT");
    expect(await fs.readFile(targetPath, "utf8")).toBe("external-edit\n");
  });

  test("recovers its own target write when interrupted before the post-mutation checkpoint", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-"));
    roots.push(stateRoot);
    const stateStore = new StateStore(stateRoot);
    await stateStore.init();
    const targetPath = path.join(stateRoot, "targets", "review");
    const sourcePath = path.join(stateRoot, "source", "git", "repo", "review");
    await fs.mkdir(targetPath, { recursive: true });
    await fs.writeFile(path.join(targetPath, "SKILL.md"), "before\n", "utf8");
    await fs.mkdir(sourcePath, { recursive: true });
    await fs.writeFile(path.join(sourcePath, "SKILL.md"), "after\n", "utf8");
    const recovery = new OperationRecoveryService({ stateStore });
    await recovery.begin({ kind: "update", sourceId: "repo" });
    await recovery.prepareTargetMutations([{
      kind: "update",
      sourceId: "repo",
      leafId: "repo:review",
      target: "codex",
      strategy: "symlink",
      sourcePath,
      targetPath,
      targetRootPath: path.dirname(targetPath),
      contentHash: "after",
    }]);
    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.symlink(sourcePath, targetPath);

    const recovered = await recovery.recover();

    expect(recovered.ok).toBe(true);
    expect((await fs.lstat(targetPath)).isDirectory()).toBe(true);
    expect((await fs.lstat(targetPath)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(targetPath, "SKILL.md"), "utf8")).toBe("before\n");
  });

  test("cleans interrupted preparing content while preserving ready import cache", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-"));
    roots.push(stateRoot);
    const stateStore = new StateStore(stateRoot);
    await stateStore.init();
    const cacheStore = new ImportPreparationCacheStore(stateRoot);
    const preparingPath = cacheStore.getImportPreparationCheckoutPath("preparing");
    const readyPath = cacheStore.getImportPreparationCheckoutPath("ready");
    await Promise.all([
      fs.mkdir(preparingPath, { recursive: true }),
      fs.mkdir(readyPath, { recursive: true }),
    ]);
    const base = {
      cacheKey: "owner/repo",
      locator: "owner/repo",
      canonicalRepo: "owner/repo",
      sourceKind: "git" as const,
      sourceId: "repo",
      displayName: "repo",
      preparedAt: "2026-08-22T00:00:00.000Z",
      expiresAt: "2099-08-22T00:00:00.000Z",
      skillIds: [],
      availableTargets: [],
    };
    await cacheStore.writeImportPreparationRecord({
      ...base,
      id: "preparing",
      checkoutPath: preparingPath,
      status: "preparing",
    });
    await cacheStore.writeImportPreparationRecord({
      ...base,
      id: "ready",
      checkoutPath: readyPath,
      status: "ready",
    });

    const recovered = await new OperationRecoveryService({ stateStore, cacheStore }).recover();

    expect(recovered.ok).toBe(true);
    await expect(fs.access(preparingPath)).rejects.toThrow();
    await expect(fs.access(readyPath)).resolves.toBeUndefined();
    const cache = await cacheStore.readImportPreparationCache();
    expect(cache.records.preparing).toBeUndefined();
    expect(cache.records.ready?.status).toBe("ready");
  });

  test("restores a ready preparation when final import commit is interrupted", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-"));
    roots.push(stateRoot);
    const stateStore = new StateStore(stateRoot);
    await stateStore.init();
    const cacheStore = new ImportPreparationCacheStore(stateRoot);
    const preparedPath = cacheStore.getImportPreparationCheckoutPath("ready");
    const canonicalPath = path.join(stateRoot, "source", "git", "repo");
    await fs.mkdir(preparedPath, { recursive: true });
    await fs.writeFile(path.join(preparedPath, "SKILL.md"), "prepared\n", "utf8");
    await cacheStore.writeImportPreparationRecord({
      id: "ready",
      cacheKey: "owner/repo",
      locator: "owner/repo",
      canonicalRepo: "owner/repo",
      sourceKind: "git",
      checkoutPath: preparedPath,
      sourceId: "repo",
      displayName: "repo",
      status: "ready",
      preparedAt: "2026-08-22T00:00:00.000Z",
      expiresAt: "2099-08-22T00:00:00.000Z",
      skillIds: [],
      availableTargets: [],
    });
    const recovery = new OperationRecoveryService({ stateStore, cacheStore });
    await recovery.begin({
      kind: "import",
      sourceId: "repo",
      checkoutPath: canonicalPath,
      preparationId: "ready",
    });
    await fs.mkdir(path.dirname(canonicalPath), { recursive: true });
    await fs.rename(preparedPath, canonicalPath);
    await cacheStore.deleteImportPreparationRecord("ready");

    const recovered = await recovery.recover();

    expect(recovered.ok).toBe(true);
    await expect(fs.access(canonicalPath)).rejects.toThrow();
    expect(await fs.readFile(path.join(preparedPath, "SKILL.md"), "utf8")).toBe("prepared\n");
    expect((await cacheStore.readImportPreparationCache()).records.ready?.status).toBe("ready");
  });

  test("reports an invalid recovery journal without attempting recovery", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-"));
    roots.push(stateRoot);
    const stateStore = new StateStore(stateRoot);
    await stateStore.init();
    const journalPath = path.join(stateRoot, "recovery", "active.json");
    await fs.mkdir(path.dirname(journalPath), { recursive: true });
    await fs.writeFile(journalPath, JSON.stringify({
      schemaVersion: 1,
      transactionId: "../..",
      kind: "update",
      sourceId: "repo",
      phase: "prepared",
      startedAt: "2026-08-22T00:00:00.000Z",
      authorityBefore: {},
      targets: [],
    }), "utf8");

    const recovered = await new OperationRecoveryService({ stateStore }).recover();

    expect(recovered.ok).toBe(false);
    if (recovered.ok) return;
    expect(recovered.errors[0]?.code).toBe("RECOVERY_JOURNAL_INVALID");
  });
});

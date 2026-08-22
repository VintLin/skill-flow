import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentAction,
  DeploymentTargetId,
  Result,
  SourceKind,
} from "@skill-flow/domain/types";
import {
  copyDirectory,
  isPathInside,
  pathExists,
  removePath,
} from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";
import {
  RecoveryJournalStore,
  type RecoveryJournal,
  type RecoveryOperationKind,
  type RecoveryTargetSnapshot,
  type RecoveryPathSnapshot,
} from "@skill-flow/storage/recovery-journal-store";
import type { StateStore } from "@skill-flow/storage/state-store";
import type { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import { resolveManagedCheckoutOwnership } from "../internal/managed-checkout-policy.js";

export type OperationRecoveryServiceOptions = {
  stateStore: StateStore;
  cacheStore?: ImportPreparationCacheStore;
  resolveTargetRoots?: () => Promise<Map<DeploymentTargetId, string>>;
};

export type RecoveryResult = {
  recovered: boolean;
  sourceId?: string;
  kind?: RecoveryOperationKind;
};

type RecoveryTargetSnapshotDraft = Omit<
  RecoveryTargetSnapshot,
  "mutationFingerprint" | "allowedMutationFingerprints"
>;

/**
 * Owns the durable recovery transaction for one managed source operation.
 * Callers only begin, checkpoint after filesystem mutation, and commit.
 */
export class OperationRecoveryService {
  private readonly journalStore: RecoveryJournalStore;

  constructor(private readonly options: OperationRecoveryServiceOptions) {
    this.journalStore = new RecoveryJournalStore(options.stateStore.rootPath);
  }

  async begin(input: {
    kind: RecoveryOperationKind;
    sourceId: string;
    sourceKind: SourceKind;
    checkoutPath?: string;
    preparationId?: string;
  }): Promise<{ checkoutBackupPath?: string }> {
    const existing = await this.journalStore.read();
    if (existing) {
      throw new Error(
        `Recovery transaction '${existing.transactionId}' must be recovered before starting another operation.`,
      );
    }
    const authorityBefore = await this.options.stateStore.readState();
    const importPreparationBefore = input.preparationId && this.options.cacheStore
      ? (await this.options.cacheStore.readImportPreparationCache()).records[input.preparationId]
      : undefined;
    const sourceLock = authorityBefore.lockFile.sources[input.sourceId];
    const sourceManifest = authorityBefore.manifest.sources.find((source) => source.id === input.sourceId);
    if (
      input.sourceKind === "collection"
      || (sourceManifest && sourceManifest.kind !== input.sourceKind)
    ) {
      throw new Error(`Refusing to create a recovery transaction with invalid source ownership for '${input.sourceId}'.`);
    }
    if (
      authorityBefore.manifest.sources.find((source) => source.id === input.sourceId)?.ownership === "external"
      || sourceLock?.ownership === "external"
    ) {
      throw new Error(`Refusing to create a recovery transaction for externally managed source '${input.sourceId}'.`);
    }

    const transactionId = `recovery-${process.pid}-${crypto.randomUUID()}`;
    const checkoutPath = input.checkoutPath ?? sourceLock?.localPath;
    const checkoutBackupPath = checkoutPath
      ? this.journalStore.backupPath(transactionId, "checkout")
      : undefined;
    if (checkoutBackupPath) {
      await fs.mkdir(path.dirname(checkoutBackupPath), { recursive: true });
    }
    const checkout = checkoutPath
      ? {
          role: "checkout" as const,
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          path: checkoutPath,
          existed: await pathExists(checkoutPath),
          backupName: "checkout",
          beforeFingerprint: await fingerprintPath(checkoutPath),
        }
      : undefined;
    await this.journalStore.write({
      schemaVersion: 1,
      transactionId,
      kind: input.kind,
      sourceId: input.sourceId,
      sourceKind: input.sourceKind,
      startedAt: new Date().toISOString(),
      phase: "prepared",
      authorityBefore,
      ...(importPreparationBefore ? { importPreparationBefore } : {}),
      ...(checkout ? { checkout } : {}),
      targets: [],
    });
    return checkout && checkoutBackupPath
      ? { checkoutBackupPath }
      : {};
  }

  async prepareTargetMutations(actions: DeploymentAction[]): Promise<void> {
    const journal = await this.requireJournal();
    const knownTargets = new Map(journal.targets.map((target) => [path.resolve(target.path), target]));
    for (const action of actions.filter((candidate) =>
      candidate.kind !== "noop"
      && candidate.kind !== "blocked"
    )) {
      const transitions: Array<{ targetPath: string; expected: string }> = [];
      if (action.kind === "remove") {
        transitions.push({ targetPath: action.targetPath, expected: "missing" });
      } else {
        transitions.push({
          targetPath: action.targetPath,
          expected: action.strategy === "symlink"
            ? fingerprintSymlink(action.sourcePath)
            : await fingerprintPath(action.sourcePath),
        });
      }
      if (action.previousTargetPath && action.previousTargetPath !== action.targetPath) {
        transitions.push({ targetPath: action.previousTargetPath, expected: "missing" });
      }
      if (action.relocateExternalToTargetPath) {
        transitions.push({
          targetPath: action.relocateExternalToTargetPath,
          expected: await fingerprintPath(action.targetPath),
        });
      }
      for (const transition of transitions) {
        const resolved = path.resolve(transition.targetPath);
        let snapshot = knownTargets.get(resolved);
        if (!snapshot) {
          const draft = await this.snapshotTargetPath(
            journal.transactionId,
            `target-${knownTargets.size}`,
            transition.targetPath,
            {
              role: "target",
              sourceId: action.sourceId,
              target: action.target,
            },
          );
          snapshot = {
            ...draft,
            mutationFingerprint: transition.expected,
          };
        }
        if (
          snapshot.role !== "target"
          || snapshot.sourceId !== action.sourceId
          || snapshot.target !== action.target
        ) {
          throw new Error(`Conflicting recovery ownership for managed target '${transition.targetPath}'.`);
        }
        knownTargets.set(resolved, {
          ...snapshot,
          mutationFingerprint: transition.expected,
          allowedMutationFingerprints: [
            ...new Set([
              ...(snapshot.allowedMutationFingerprints ?? []),
              transition.expected,
            ]),
          ],
        });
      }
    }
    await this.journalStore.write({
      ...journal,
      phase: "mutated",
      targets: [...knownTargets.values()],
    });
  }

  async prepareManagedSymlinkMutation(
    targetPath: string,
    sourcePath: string,
    ownership: { sourceId: string; target: DeploymentTargetId },
  ): Promise<void> {
    const journal = await this.requireJournal();
    if (journal.targets.some((target) => path.resolve(target.path) === path.resolve(targetPath))) {
      return;
    }
    const snapshot = await this.snapshotTargetPath(
      journal.transactionId,
      `target-${journal.targets.length}`,
      targetPath,
      { role: "target", sourceId: ownership.sourceId, target: ownership.target },
    );
    await this.journalStore.write({
      ...journal,
      phase: "mutated",
      targets: [
        ...journal.targets,
        {
          ...snapshot,
          mutationFingerprint: fingerprintSymlink(sourcePath),
          allowedMutationFingerprints: [fingerprintSymlink(sourcePath)],
        },
      ],
    });
  }

  async checkpoint(): Promise<void> {
    const journal = await this.requireJournal();
    const conflict = await this.findTargetConflict(journal);
    if (conflict) {
      throw new Error(`Managed target '${conflict}' changed outside the active operation.`);
    }
  }

  async commit(): Promise<void> {
    const journal = await this.requireJournal();
    await this.journalStore.clear(journal);
  }

  async recover(): Promise<Result<RecoveryResult>> {
    let journal: RecoveryJournal | undefined;
    try {
      journal = await this.journalStore.read();
    } catch (error) {
      return fail({
        code: "RECOVERY_JOURNAL_INVALID",
        message: `Unable to read the interrupted-operation recovery journal safely: ${String(error)}`,
      });
    }
    if (journal) {
      try {
        this.options.stateStore.validateState(journal.authorityBefore);
      } catch (error) {
        return fail({
          code: "RECOVERY_JOURNAL_INVALID",
          message: `Recovery stopped because the authority snapshot is invalid: ${String(error)}`,
        });
      }
      try {
        await this.validateRecoveryPathOwnership(journal);
      } catch (error) {
        return fail({
          code: "RECOVERY_PATH_OWNERSHIP_INVALID",
          message: `Recovery stopped because journal path ownership could not be verified: ${String(error)}`,
        });
      }
    }

    try {
      await this.cleanupInterruptedPreparations();
    } catch (error) {
      return fail({
        code: "IMPORT_PREPARATION_RECOVERY_FAILED",
        message: `Unable to clean interrupted import preparation: ${String(error)}`,
      });
    }
    if (!journal) return ok({ recovered: false });

    const conflict = await this.findTargetConflict(journal);
    if (conflict) {
      return fail({
        code: "RECOVERY_TARGET_CONFLICT",
        message: `Recovery stopped because managed target '${conflict}' changed outside the interrupted operation.`,
      });
    }

    try {
      if (journal.checkout) await this.restoreCheckout(journal, journal.checkout);
      await this.options.stateStore.writeState(journal.authorityBefore);
      for (const target of journal.targets) await this.restorePath(journal, target);
      if (journal.importPreparationBefore && this.options.cacheStore) {
        await this.options.cacheStore.writeImportPreparationRecord({
          ...journal.importPreparationBefore,
          status: "ready",
        });
      }
      await this.journalStore.clear(journal);
      return ok({ recovered: true, sourceId: journal.sourceId, kind: journal.kind });
    } catch (error) {
      return fail({
        code: "OPERATION_RECOVERY_FAILED",
        message: `Unable to recover interrupted ${journal.kind} for '${journal.sourceId}': ${String(error)}`,
      });
    }
  }

  private async validateRecoveryPathOwnership(journal: RecoveryJournal): Promise<void> {
    const source = journal.authorityBefore.manifest.sources.find(
      (candidate) => candidate.id === journal.sourceId,
    );
    const lock = journal.authorityBefore.lockFile.sources[journal.sourceId];
    if (journal.kind === "update" && (!source || !lock)) {
      throw new Error(`update source '${journal.sourceId}' is missing from authority`);
    }
    if (journal.kind === "import" && !journal.importPreparationBefore) {
      throw new Error(`import source '${journal.sourceId}' is missing preparation evidence`);
    }
    if (source && (
      source.kind === "collection"
      || source.ownership === "external"
      || source.kind !== journal.sourceKind
    )) {
      throw new Error(`source '${journal.sourceId}' is not a matching managed source`);
    }
    if (lock?.ownership === "external") {
      throw new Error(`source '${journal.sourceId}' is not a matching managed source`);
    }

    if (journal.checkout) {
      const checkout = await resolveManagedCheckoutOwnership({
        stateRoot: this.options.stateStore.rootPath,
        sourceKind: journal.sourceKind,
        sourceId: journal.sourceId,
        localPath: journal.checkout.path,
      });
      if (!checkout.ok) {
        throw new Error(`checkout '${journal.checkout.path}' is not canonically managed`);
      }
      if (lock && path.resolve(lock.localPath) !== checkout.data.checkoutPath) {
        throw new Error(`checkout '${journal.checkout.path}' does not match authority`);
      }
      await this.validateSnapshotBackup(journal, journal.checkout);
    }

    if (journal.importPreparationBefore) {
      if (!this.options.cacheStore) {
        throw new Error("import preparation cache is unavailable");
      }
      const preparation = journal.importPreparationBefore;
      const expectedPath = this.options.cacheStore.getImportPreparationCheckoutPath(preparation.id);
      if (
        journal.kind !== "import"
        || preparation.sourceId !== journal.sourceId
        || preparation.sourceKind !== journal.sourceKind
        || path.resolve(preparation.checkoutPath) !== path.resolve(expectedPath)
      ) {
        throw new Error(`import preparation '${preparation.id}' has invalid ownership metadata`);
      }
    }

    if (journal.targets.length === 0) return;
    const targetRoots = await this.options.resolveTargetRoots?.();
    if (!targetRoots) throw new Error("current target roots are unavailable");
    for (const target of journal.targets) {
      const currentRoot = target.target ? targetRoots.get(target.target) : undefined;
      if (!currentRoot || !isPathInside(currentRoot, target.path)) {
        throw new Error(`target '${target.path}' is outside the current root for '${target.target ?? "unknown"}'`);
      }
      await this.validateSnapshotBackup(journal, target);
    }
  }

  private async validateSnapshotBackup(
    journal: RecoveryJournal,
    snapshot: RecoveryPathSnapshot,
  ): Promise<void> {
    if (!snapshot.existed) return;
    if (!snapshot.backupName) {
      throw new Error(`recovery backup is missing for '${snapshot.path}'`);
    }
    const backupPath = this.journalStore.backupPath(journal.transactionId, snapshot.backupName);
    if (!(await pathExists(backupPath))) {
      if (await fingerprintPath(snapshot.path) === snapshot.beforeFingerprint) {
        return;
      }
      throw new Error(`recovery backup does not exist for '${snapshot.path}'`);
    }
    const backupFingerprint = await fingerprintPath(backupPath);
    if (backupFingerprint !== snapshot.beforeFingerprint) {
      throw new Error(`recovery backup fingerprint does not match '${snapshot.path}'`);
    }
  }

  private async cleanupInterruptedPreparations(): Promise<void> {
    if (!this.options.cacheStore) return;
    const cache = await this.options.cacheStore.readImportPreparationCache();
    const interrupted = Object.values(cache.records).filter((record) => record.status === "preparing");
    for (const record of interrupted) {
      const expectedPath = this.options.cacheStore.getImportPreparationCheckoutPath(record.id);
      if (path.resolve(record.checkoutPath) !== path.resolve(expectedPath)) {
        throw new Error(`Preparation '${record.id}' has an invalid checkout path.`);
      }
      await removePath(record.checkoutPath);
      delete cache.records[record.id];
    }
    if (interrupted.length > 0) {
      await this.options.cacheStore.writeImportPreparationCache(cache);
    }
  }

  private async findTargetConflict(journal: RecoveryJournal): Promise<string | undefined> {
    for (const target of journal.targets) {
      const current = await fingerprintPath(target.path);
      if (
        current !== target.beforeFingerprint
        && current !== target.mutationFingerprint
        && !(target.allowedMutationFingerprints ?? []).includes(current)
      ) {
        return target.path;
      }
    }
    return undefined;
  }

  private async snapshotTargetPath(
    transactionId: string,
    backupName: string,
    targetPath: string,
    ownership: Pick<RecoveryTargetSnapshot, "role" | "sourceId" | "target">,
  ): Promise<RecoveryTargetSnapshotDraft> {
    const existed = await pathExists(targetPath);
    const beforeFingerprint = await fingerprintPath(targetPath);
    if (existed) {
      const backupPath = this.journalStore.backupPath(transactionId, backupName);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await copyPath(targetPath, backupPath);
    }
    return {
      ...ownership,
      path: targetPath,
      existed,
      ...(existed ? { backupName } : {}),
      beforeFingerprint,
    };
  }

  private async restorePath(journal: RecoveryJournal, snapshot: RecoveryPathSnapshot): Promise<void> {
    const backupPath = snapshot.backupName
      ? this.journalStore.backupPath(journal.transactionId, snapshot.backupName)
      : undefined;
    if (snapshot.existed && backupPath && !(await pathExists(backupPath))) {
      return;
    }
    await removePath(snapshot.path);
    if (!snapshot.existed || !snapshot.backupName) return;
    await copyPath(
      this.journalStore.backupPath(journal.transactionId, snapshot.backupName),
      snapshot.path,
    );
  }

  private async restoreCheckout(
    journal: RecoveryJournal,
    snapshot: RecoveryPathSnapshot,
  ): Promise<void> {
    if (journal.kind === "import" && journal.importPreparationBefore) {
      const preparedPath = journal.importPreparationBefore.checkoutPath;
      if (await pathExists(snapshot.path)) {
        await removePath(preparedPath);
        await fs.mkdir(path.dirname(preparedPath), { recursive: true });
        await fs.rename(snapshot.path, preparedPath);
      } else if (!(await pathExists(preparedPath))) {
        throw new Error(`Prepared import checkout '${preparedPath}' is unavailable for recovery.`);
      }
      return;
    }
    const backupPath = snapshot.backupName
      ? this.journalStore.backupPath(journal.transactionId, snapshot.backupName)
      : undefined;
    if (backupPath && await pathExists(backupPath)) {
      await removePath(snapshot.path);
      await fs.mkdir(path.dirname(snapshot.path), { recursive: true });
      await fs.rename(backupPath, snapshot.path);
      return;
    }
    if (backupPath && await fingerprintPath(snapshot.path) === snapshot.beforeFingerprint) {
      return;
    }
    if (!snapshot.existed) {
      await removePath(snapshot.path);
    }
  }

  private async requireJournal(): Promise<RecoveryJournal> {
    const journal = await this.journalStore.read();
    if (!journal) throw new Error("No active recovery transaction.");
    return journal;
  }
}

async function copyPath(sourcePath: string, targetPath: string): Promise<void> {
  const stats = await fs.lstat(sourcePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (stats.isSymbolicLink()) {
    await fs.symlink(await fs.readlink(sourcePath), targetPath);
  } else if (stats.isDirectory()) {
    await copyDirectory(sourcePath, targetPath);
  } else {
    await fs.copyFile(sourcePath, targetPath);
  }
}

async function fingerprintPath(targetPath: string): Promise<string> {
  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
  const hash = crypto.createHash("sha256");
  if (stats.isSymbolicLink()) {
    hash.update("symlink\0");
    hash.update(await fs.readlink(targetPath));
  } else if (stats.isDirectory()) {
    hash.update("directory\0");
    hash.update(await hashDirectoryIncludingSymlinks(targetPath));
  } else {
    hash.update("file\0");
    hash.update(await fs.readFile(targetPath));
  }
  return hash.digest("hex");
}

function fingerprintSymlink(sourcePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update("symlink\0");
  hash.update(sourcePath);
  return hash.digest("hex");
}

async function hashDirectoryIncludingSymlinks(root: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      hash.update(path.relative(root, entryPath));
      if (entry.isDirectory()) {
        hash.update("directory");
        await walk(entryPath);
      } else if (entry.isSymbolicLink()) {
        hash.update("symlink");
        hash.update(await fs.readlink(entryPath));
      } else {
        hash.update("file");
        hash.update(await fs.readFile(entryPath));
      }
    }
  }
  await walk(root);
  return hash.digest("hex");
}

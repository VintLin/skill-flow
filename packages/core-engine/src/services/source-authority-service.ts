import fs from "node:fs/promises";
import path from "node:path";
import type {
  Failure,
  LeafRecord,
  LockFile,
  Result,
  SourceRevision,
  SourceKind,
  SourceManifestRecord,
  SourceRepairReason,
  SourceUpdateDiff,
  SourceUpdateFailureItem,
  SourceUpdateResult,
  SourceUpdateResultItem,
  Warning,
} from "@skill-flow/domain/types";
import type { StateStore, StateStoreState } from "@skill-flow/storage/state-store";
import {
  ensureDir,
  hashDirectory,
  pathExists,
  removePath,
} from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";
import type {
  PreparedSourceCheckout,
  SourceCheckoutKind,
  SourceCheckoutService,
} from "./source-checkout-service.js";
import type { AddSourceOptions } from "./source-types.js";
import { resolveManagedCheckoutOwnership } from "../internal/managed-checkout-policy.js";

export type SourceAuthorityServiceOptions = {
  stateStore: StateStore;
  checkoutService: SourceCheckoutService;
};

export type AddSourceOptionsWithCheckout = AddSourceOptions & {
  checkoutPath?: string;
};

export type SourceSnapshot = {
  manifest: SourceManifestRecord;
  lock: LockFile["sources"][string];
  leafs: LeafRecord[];
  leafCount: number;
  invalidLeafCount: number;
};

type SourceUpdateTarget =
  | { kind: "collection"; sourceId: string }
  | {
      kind: "managed";
      source: SourceManifestRecord;
      lock: LockFile["sources"][string];
    };

export class SourceAuthorityService {
  constructor(private readonly options: SourceAuthorityServiceOptions) {}

  private withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    return this.options.stateStore.withMutationLock(task);
  }

  async addSource(
    locator: string,
    options: AddSourceOptionsWithCheckout = {},
  ): Promise<Result<SourceSnapshot>> {
    const state = await this.options.stateStore.readState();
    const prepared = await this.options.checkoutService.prepareSourceCheckout(locator, {
      options,
      existingSources: state.manifest.sources.map((source) => ({
        id: source.id,
        locator: source.locator,
        displayName: source.displayName,
        ...(source.kind === "local" ? { kind: "local" as const } : {}),
      })),
      suffix: "add",
      ...(options.checkoutPath ? { checkoutPath: options.checkoutPath } : {}),
    });
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }

    const committed = await this.commitPreparedSource({
      preparedCheckout: prepared.data,
      removePreparedOnFailure: true,
    });
    return committed.ok
      ? ok(committed.data, [...prepared.warnings, ...committed.warnings])
      : fail(committed.errors, [...prepared.warnings, ...committed.warnings]);
  }

  async commitPreparedSource(input: {
    preparedCheckout: PreparedSourceCheckout;
    removePreparedOnFailure?: boolean;
  }): Promise<Result<SourceSnapshot>> {
    return this.withMutationLock(() => this.commitPreparedSourceUnlocked(input));
  }

  private async commitPreparedSourceUnlocked(input: {
    preparedCheckout: PreparedSourceCheckout;
    removePreparedOnFailure?: boolean;
  }): Promise<Result<SourceSnapshot>> {
    const state = await this.options.stateStore.readState();
    const prepared = input.preparedCheckout;
    const sourceId = prepared.sourceId;
    if (state.manifest.sources.some((source) => source.id === sourceId)) {
      if (input.removePreparedOnFailure) {
        await removePath(prepared.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_EXISTS",
        message: `Skills group id '${sourceId}' is already registered.`,
      });
    }

    const sourceKind = this.mapSourceKind(prepared.kind);
    const ownership = await resolveManagedCheckoutOwnership({
      stateRoot: this.options.stateStore.rootPath,
      sourceKind,
      sourceId,
    });
    if (!ownership.ok) {
      if (input.removePreparedOnFailure) {
        await removePath(prepared.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_CHECKOUT_PATH_INVALID",
        message: `Refusing to register source '${prepared.locator}' through an invalid managed path.`,
      });
    }
    const checkoutPath = ownership.data.checkoutPath;
    if (await pathExists(checkoutPath)) {
      if (input.removePreparedOnFailure) {
        await removePath(prepared.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_CHECKOUT_PATH_EXISTS",
        message: `Unable to register source '${prepared.locator}' because checkout path already exists at ${checkoutPath}.`,
      });
    }

    try {
      await ensureDir(path.dirname(checkoutPath));
      await fs.rename(prepared.checkoutPath, checkoutPath);
    } catch (error) {
      if (input.removePreparedOnFailure) {
        await removePath(prepared.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_CHECKOUT_MOVE_FAILED",
        message: `Unable to finalize source '${prepared.locator}' at ${checkoutPath}: ${String(error)}`,
      });
    }

    const leafs = await Promise.all(
      prepared.leafs.map((leaf) => this.toLeafRecord(leaf, sourceId, checkoutPath)),
    );
    const now = new Date().toISOString();
    const source: SourceManifestRecord = {
      id: sourceId,
      kind: sourceKind,
      locator: prepared.locator,
      canonicalLocator: input.preparedCheckout.originLocator ?? prepared.locator,
      displayName: prepared.displayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      ...(prepared.requestedPath ? { requestedPath: prepared.requestedPath } : {}),
    };
    const lock: LockFile["sources"][string] = {
      sourceId,
      canonicalLocator: source.canonicalLocator,
      revision: createSourceRevision(sourceKind, prepared.commitSha, now),
      localPath: checkoutPath,
      leafIds: leafs.map((leaf) => leaf.id),
      ...(prepared.packageSlug ? { packageSlug: prepared.packageSlug } : {}),
      ...(prepared.resolvedVersion ? { resolvedVersion: prepared.resolvedVersion } : {}),
      ...(prepared.contentHash ? { contentHash: prepared.contentHash } : {}),
      ...(prepared.versionMode ? { versionMode: prepared.versionMode } : {}),
      ...(prepared.originBranch ? { originBranch: prepared.originBranch } : {}),
      ...(prepared.importedFromTargets ? { importedFromTargets: prepared.importedFromTargets } : {}),
      ...(prepared.observedTargets ? { observedTargets: prepared.observedTargets } : {}),
      ...(prepared.importMode ? { importMode: prepared.importMode } : {}),
    };

    await this.options.stateStore.writeState({
      ...state,
      manifest: {
        ...state.manifest,
        sources: [...state.manifest.sources, source],
        bindings: {
          ...state.manifest.bindings,
          [sourceId]: {
            sourceId,
            selectionMode: "selected",
            selectedLeafIds: [],
            enabledTargets: [],
          },
        },
      },
      lockFile: {
        ...state.lockFile,
        sources: {
          ...state.lockFile.sources,
          [sourceId]: lock,
        },
        leafInventory: [...state.lockFile.leafInventory, ...leafs],
      },
    });

    return ok({
      manifest: source,
      lock,
      leafs,
      leafCount: leafs.length,
      invalidLeafCount: (prepared.invalidLeafs ?? []).length,
    });
  }

  async removeSource(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
    return this.withMutationLock(() => this.removeSourceUnlocked(sourceIds));
  }

  private async removeSourceUnlocked(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
    const state = await this.options.stateStore.readState();
    const removed: string[] = [];
    const checkoutsToRemove: string[] = [];
    const nextManifestSources = [...state.manifest.sources];
    const nextBindings = { ...state.manifest.bindings };
    const nextLockSources = { ...state.lockFile.sources };
    let nextLeafInventory = [...state.lockFile.leafInventory];
    let nextProjections = [...state.lockFile.projections];

    for (const sourceId of sourceIds) {
      const source = nextManifestSources.find((item) => item.id === sourceId);
      const lock = nextLockSources[sourceId];
      if (!source || !lock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }
      if (source.ownership === "external" || lock.ownership === "external") {
        delete nextLockSources[sourceId];
        delete nextBindings[sourceId];
        nextLeafInventory = nextLeafInventory.filter((leaf) => leaf.sourceId !== sourceId);
        nextProjections = nextProjections.filter((projection) => projection.sourceId !== sourceId);
        removed.push(sourceId);
        continue;
      }
      const ownership = await resolveManagedCheckoutOwnership({
        stateRoot: this.options.stateStore.rootPath,
        sourceKind: source.kind,
        sourceId,
        localPath: lock.localPath,
      });
      if (!ownership.ok) {
        return fail({
          code: "SOURCE_CHECKOUT_PATH_INVALID",
          message: `Refusing to delete checkout with invalid managed path: ${lock.localPath}`,
        });
      }
      checkoutsToRemove.push(ownership.data.checkoutPath);

      delete nextLockSources[sourceId];
      delete nextBindings[sourceId];
      nextLeafInventory = nextLeafInventory.filter((leaf) => leaf.sourceId !== sourceId);
      nextProjections = nextProjections.filter((projection) => projection.sourceId !== sourceId);
      removed.push(sourceId);
    }

    await this.options.stateStore.writeState({
      ...state,
      manifest: {
        ...state.manifest,
        sources: nextManifestSources.filter((source) => !removed.includes(source.id)),
        bindings: nextBindings,
      },
      lockFile: {
        ...state.lockFile,
        sources: nextLockSources,
        leafInventory: nextLeafInventory,
        projections: nextProjections,
      },
    });

    const warnings: Warning[] = [];
    for (const checkoutPath of checkoutsToRemove) {
      try {
        await removePath(checkoutPath);
      } catch (error) {
        warnings.push({
          code: "SOURCE_CHECKOUT_REMOVE_FAILED",
          message: `Source authority was removed, but checkout cleanup failed at ${checkoutPath}: ${String(error)}`,
        });
      }
    }

    return ok({ removed }, warnings);
  }

  async updateSources(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    return this.withMutationLock(() => this.updateSourcesUnlocked(sourceIds));
  }

  private async updateSourcesUnlocked(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    const state = await this.options.stateStore.readState();
    const requestedIds = sourceIds?.length
      ? [...new Set(sourceIds)]
      : state.manifest.sources.map((source) => source.id);
    const preflight = await this.preflightSourceUpdates(
      state,
      requestedIds,
      Boolean(sourceIds?.length),
    );
    if (!preflight.ok) {
      return fail(preflight.errors, preflight.warnings);
    }

    let nextLockFile: LockFile = {
      ...state.lockFile,
      sources: { ...state.lockFile.sources },
      leafInventory: [...state.lockFile.leafInventory],
      projections: [...state.lockFile.projections],
    };
    const updated: SourceUpdateResultItem[] = [];
    const failed: SourceUpdateFailureItem[] = [];
    const warnings: Warning[] = [];
    const precheckFallbackSourceIds: string[] = [];
    const hardFailures: Failure[] = [];
    let appliedCheckoutCount = 0;

    for (const target of preflight.data) {
      if (target.kind === "collection") {
        updated.push(this.emptyUpdateResult(target.sourceId));
        continue;
      }
      const { source, lock } = target;
      const sourceId = source.id;

      const lockedCommit = this.readLockedCommitSha(lock.revision);
      let repairReason: SourceRepairReason | undefined;
      if (source.kind === "git" && lockedCommit) {
        try {
          const remoteCommit = await this.options.checkoutService.readGitRemoteHeadCommit(
            source.locator,
            lock.originBranch ? { branch: lock.originBranch } : {},
          );
          if (!remoteCommit) {
            precheckFallbackSourceIds.push(sourceId);
            warnings.push({
              code: "SOURCE_REMOTE_PRECHECK_FALLBACK",
              message: `Remote HEAD could not be verified for '${sourceId}'; running a full update.`,
            });
          }
          if (
            remoteCommit
            && remoteCommit === lockedCommit
          ) {
            const integrity = await this.inspectCheckoutIntegrity(
              lock,
              nextLockFile.leafInventory,
            );
            if (!integrity.repairReason) {
              updated.push(this.emptyUpdateResult(sourceId));
              continue;
            }
            repairReason = integrity.repairReason;
          }
        } catch (error) {
          precheckFallbackSourceIds.push(sourceId);
          warnings.push({
            code: "SOURCE_REMOTE_PRECHECK_FALLBACK",
            message: `Remote HEAD could not be verified for '${sourceId}'; running a full update: ${String(error)}`,
          });
        }
      }

      const tempCheckoutPath = path.join(
        this.options.stateStore.rootPath,
        "source",
        source.kind,
        `.update-${sourceId}-${process.pid}-${Date.now()}`,
      );
      const prepared = await this.options.checkoutService.prepareSourceCheckout(source.locator, {
        options: {
          sourceIdOverride: sourceId,
          displayNameOverride: source.displayName,
          ...(lock.originBranch ? { originBranch: lock.originBranch } : {}),
        },
        checkoutPath: tempCheckoutPath,
        existingCheckoutPath: lock.localPath,
        ...(lock.originBranch ? { updateBranch: lock.originBranch } : {}),
        allowEmptyLeafs: true,
      });
      if (!prepared.ok) {
        const code = prepared.errors[0]?.code ?? "SOURCE_UPDATE_FAILED";
        const message = prepared.errors[0]?.message
          ?? `Unable to update skills group '${sourceId}'.`;
        hardFailures.push(...prepared.errors);
        failed.push({ sourceId, code, message });
        warnings.push(...prepared.warnings);
        warnings.push({ code: "SOURCE_UPDATE_FAILED", message });
        continue;
      }
      warnings.push(...prepared.warnings);

      const previousLeafs = nextLockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);

      const nextLeafs = await Promise.all(
        prepared.data.leafs.map((leaf) => this.toLeafRecord(
          leaf,
          sourceId,
          lock.localPath,
          prepared.data.checkoutPath,
        )),
      );
      const diff = this.buildSourceUpdateDiff(
        sourceId,
        previousLeafs,
        nextLeafs,
        prepared.data.invalidLeafs ?? [],
      );
      if (repairReason) {
        diff.repaired = true;
        diff.repairReason = repairReason;
      }

      const candidateLockFile: LockFile = {
        ...nextLockFile,
        sources: {
          ...nextLockFile.sources,
          [sourceId]: {
            ...lock,
            revision: {
              ...lock.revision,
              ...(prepared.data.commitSha ? { commit: prepared.data.commitSha } : {}),
              capturedAt: new Date().toISOString(),
            },
            leafIds: nextLeafs.map((leaf) => leaf.id),
          },
        },
        leafInventory: [
          ...nextLockFile.leafInventory.filter((leaf) => leaf.sourceId !== sourceId),
          ...nextLeafs,
        ],
      };
      const committed = await this.commitPreparedSourceUpdate({
        sourceId,
        checkoutPath: lock.localPath,
        preparedCheckoutPath: prepared.data.checkoutPath,
        nextLockFile: candidateLockFile,
      });
      if (!committed.ok) {
        hardFailures.push(...committed.errors);
        const failure = committed.errors[0]!;
        failed.push({ sourceId, code: failure.code, message: failure.message });
        warnings.push(...committed.warnings);
        warnings.push({ code: "SOURCE_UPDATE_FAILED", message: failure.message });
        continue;
      }

      appliedCheckoutCount += 1;
      nextLockFile = candidateLockFile;
      warnings.push(...committed.warnings);
      updated.push(diff);
    }

    if (appliedCheckoutCount === 0 && hardFailures.length > 0) {
      return fail(hardFailures, warnings);
    }

    const status: SourceUpdateResult["status"] = failed.length === 0
      ? "updated"
      : updated.length === 0
        ? "failed"
        : "partial";

    return ok({
      status,
      updated,
      ...(failed.length > 0 ? { failed } : {}),
      ...(precheckFallbackSourceIds.length > 0 ? { precheckFallbackSourceIds } : {}),
    }, warnings);
  }

  private async preflightSourceUpdates(
    state: StateStoreState,
    requestedIds: string[],
    explicitSelection: boolean,
  ): Promise<Result<SourceUpdateTarget[]>> {
    const targets: SourceUpdateTarget[] = [];
    for (const sourceId of requestedIds) {
      const source = state.manifest.sources.find((item) => item.id === sourceId);
      const lock = state.lockFile.sources[sourceId];
      if (!source || !lock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }

      if (source.ownership === "external" || lock.ownership === "external") {
        if (explicitSelection) {
          return fail({
            code: "SOURCE_EXTERNAL",
            message: `Skills group '${sourceId}' is externally managed; use external status or external update.`,
          });
        }
        continue;
      }

      if (source.kind === "collection") {
        targets.push({ kind: "collection", sourceId });
        continue;
      }

      const ownership = await resolveManagedCheckoutOwnership({
        stateRoot: this.options.stateStore.rootPath,
        sourceKind: source.kind,
        sourceId,
        localPath: lock.localPath,
      });
      if (!ownership.ok) {
        return fail({
          code: "SOURCE_CHECKOUT_PATH_INVALID",
          message: `Refusing to update checkout with invalid managed path: ${lock.localPath}`,
        });
      }
      targets.push({ kind: "managed", source, lock });
    }

    return ok(targets);
  }

  private async commitPreparedSourceUpdate(input: {
    sourceId: string;
    checkoutPath: string;
    preparedCheckoutPath: string;
    nextLockFile: LockFile;
  }): Promise<Result<void>> {
    const backupPath = `${input.checkoutPath}.${process.pid}.${Date.now()}.backup`;
    let previousCheckoutMoved = false;
    let preparedCheckoutMoved = false;

    try {
      if (await pathExists(input.checkoutPath)) {
        await fs.rename(input.checkoutPath, backupPath);
        previousCheckoutMoved = true;
      }
      await ensureDir(path.dirname(input.checkoutPath));
      await fs.rename(input.preparedCheckoutPath, input.checkoutPath);
      preparedCheckoutMoved = true;
    } catch (error) {
      const rollbackError = await this.rollbackPreparedSourceUpdate({
        checkoutPath: input.checkoutPath,
        preparedCheckoutPath: input.preparedCheckoutPath,
        backupPath,
        previousCheckoutMoved,
        preparedCheckoutMoved,
      });
      const message = rollbackError
        ? `Unable to replace checkout for '${input.sourceId}': ${String(error)}; rollback failed: ${String(rollbackError)}`
        : `Unable to replace checkout for '${input.sourceId}': ${String(error)}`;
      return fail({
        code: rollbackError ? "SOURCE_UPDATE_ROLLBACK_FAILED" : "SOURCE_CHECKOUT_REPLACE_FAILED",
        message,
      });
    }

    try {
      await this.options.stateStore.writeLock(input.nextLockFile);
    } catch (error) {
      const rollbackError = await this.rollbackPreparedSourceUpdate({
        checkoutPath: input.checkoutPath,
        preparedCheckoutPath: input.preparedCheckoutPath,
        backupPath,
        previousCheckoutMoved,
        preparedCheckoutMoved,
      });
      const message = rollbackError
        ? `Unable to persist lock state for '${input.sourceId}': ${String(error)}; rollback failed: ${String(rollbackError)}`
        : `Unable to persist lock state for '${input.sourceId}': ${String(error)}`;
      return fail({
        code: rollbackError ? "SOURCE_UPDATE_ROLLBACK_FAILED" : "SOURCE_UPDATE_STATE_WRITE_FAILED",
        message,
      });
    }

    const warnings: Warning[] = [];
    try {
      await removePath(backupPath);
    } catch (error) {
      warnings.push({
        code: "SOURCE_CHECKOUT_BACKUP_CLEANUP_FAILED",
        message: `Updated '${input.sourceId}', but failed to remove checkout backup at ${backupPath}: ${String(error)}`,
      });
    }
    return ok(undefined, warnings);
  }

  private async rollbackPreparedSourceUpdate(input: {
    checkoutPath: string;
    preparedCheckoutPath: string;
    backupPath: string;
    previousCheckoutMoved: boolean;
    preparedCheckoutMoved: boolean;
  }): Promise<unknown | undefined> {
    try {
      if (input.preparedCheckoutMoved) {
        await removePath(input.checkoutPath);
      } else {
        await removePath(input.preparedCheckoutPath).catch(() => {});
      }
      if (input.previousCheckoutMoved && await pathExists(input.backupPath)) {
        await fs.rename(input.backupPath, input.checkoutPath);
      }
      return undefined;
    } catch (error) {
      return error;
    }
  }

  async reconcileInventory(
    sourceIds?: string[],
    options: { force?: boolean } = {},
  ): Promise<Result<{ updatedSourceIds: string[] }>> {
    return this.withMutationLock(() => this.reconcileInventoryUnlocked(sourceIds, options));
  }

  private async reconcileInventoryUnlocked(
    sourceIds?: string[],
    options: { force?: boolean } = {},
  ): Promise<Result<{ updatedSourceIds: string[] }>> {
    const state = await this.options.stateStore.readState();
    const selectedIds = sourceIds?.length
      ? [...new Set(sourceIds)]
      : state.manifest.sources.map((source) => source.id);
    const nextManifest = {
      ...state.manifest,
      sources: [...state.manifest.sources],
      bindings: { ...state.manifest.bindings },
    };
    const nextLockFile: LockFile = {
      ...state.lockFile,
      sources: { ...state.lockFile.sources },
      leafInventory: [...state.lockFile.leafInventory],
      projections: [...state.lockFile.projections],
    };
    const updatedSourceIds: string[] = [];
    const warnings: Warning[] = [];

    for (const sourceId of selectedIds) {
      const source = nextManifest.sources.find((item) => item.id === sourceId);
      const currentLock = nextLockFile.sources[sourceId];
      if (!source || !currentLock) {
        continue;
      }

      if (source.ownership === "external" || currentLock.ownership === "external") {
        continue;
      }

      const checkoutKind = this.toCheckoutKind(source.kind);
      if (!checkoutKind) {
        continue;
      }

      const previousLeafs = nextLockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
      const snapshot = await this.options.checkoutService.buildUpdateSnapshot({
        kind: checkoutKind,
        sourceId,
        locator: source.locator,
        displayName: source.displayName,
        checkoutPath: currentLock.localPath,
      });
      if (!snapshot.ok) {
        return fail(snapshot.errors, [...warnings, ...snapshot.warnings]);
      }
      warnings.push(...snapshot.warnings);

      const nextLeafs = await Promise.all(
        snapshot.data.leafs.map((leaf) => this.toLeafRecord(leaf, sourceId, currentLock.localPath)),
      );
      const leafIdsChanged =
        JSON.stringify(currentLock.leafIds) !== JSON.stringify(nextLeafs.map((leaf) => leaf.id));
      const leafInventoryChanged = JSON.stringify(previousLeafs) !== JSON.stringify(nextLeafs);
      const currentCommit = "commit" in currentLock.revision
        ? currentLock.revision.commit
        : undefined;
      const revisionChanged =
        currentCommit !== snapshot.data.commitSha ||
        currentLock.revision.capturedAt.length === 0;

      if (!options.force && !leafIdsChanged && !leafInventoryChanged && !revisionChanged) {
        continue;
      }

      nextLockFile.sources[sourceId] = {
        ...currentLock,
        revision: {
          ...currentLock.revision,
          ...(snapshot.data.commitSha ? { commit: snapshot.data.commitSha } : {}),
          capturedAt: new Date().toISOString(),
        },
        leafIds: nextLeafs.map((leaf) => leaf.id),
      };
      nextLockFile.leafInventory = [
        ...nextLockFile.leafInventory.filter((leaf) => leaf.sourceId !== sourceId),
        ...nextLeafs,
      ];

      const nextLeafIdSet = new Set(nextLeafs.map((leaf) => leaf.id));
      const binding = nextManifest.bindings[sourceId];
      if (binding?.selectionMode === "selected") {
        nextManifest.bindings[sourceId] = {
          ...binding,
          selectedLeafIds: binding.selectedLeafIds.filter((leafId) => nextLeafIdSet.has(leafId)),
        };
      }

      updatedSourceIds.push(sourceId);
    }

    if (updatedSourceIds.length > 0) {
      await this.options.stateStore.writeState({
        ...state,
        manifest: nextManifest,
        lockFile: nextLockFile,
      });
    }

    return ok({ updatedSourceIds }, warnings);
  }

  private toCheckoutKind(kind: SourceKind): SourceCheckoutKind | undefined {
    switch (kind) {
      case "clawhub":
        return "git";
      case "git":
      case "local":
        return kind;
      case "collection":
        return undefined;
    }
  }

  private mapSourceKind(kind: PreparedSourceCheckout["kind"]): SourceKind {
    return kind;
  }

  private readLockedCommitSha(revision: SourceRevision): string | undefined {
    return "commit" in revision ? revision.commit : undefined;
  }

  private async inspectCheckoutIntegrity(
    lock: LockFile["sources"][string],
    leafInventory: LeafRecord[],
  ): Promise<{ repairReason?: SourceRepairReason }> {
    if (!(await pathExists(lock.localPath))) {
      return { repairReason: "missing-checkout" };
    }

    const sourceLeafs = leafInventory.filter((leaf) => leaf.sourceId === lock.sourceId);
    for (const leaf of sourceLeafs) {
      const leafPath = path.resolve(lock.localPath, leaf.relativePath);
      const relativeLeafPath = path.relative(lock.localPath, leafPath);
      if (relativeLeafPath.startsWith("..") || path.isAbsolute(relativeLeafPath)) {
        return { repairReason: "content-drift" };
      }
      if (!(await pathExists(path.join(leafPath, "SKILL.md")))) {
        return { repairReason: "missing-skill-file" };
      }
      try {
        if (await hashDirectory(leafPath, { symlinkPolicy: "preserve-safe" }) !== leaf.contentHash) {
          return { repairReason: "content-drift" };
        }
      } catch {
        return { repairReason: "content-drift" };
      }
    }

    return {};
  }

  private emptyUpdateResult(sourceId: string): SourceUpdateResultItem {
    return {
      sourceId,
      changed: false,
      addedLeafIds: [],
      removedLeafIds: [],
      invalidatedLeafIds: [],
      diffs: [],
    };
  }

  private buildSourceUpdateDiff(
    sourceId: string,
    previousLeafs: LeafRecord[],
    nextLeafs: LeafRecord[],
    invalidLeafs: Array<{ path: string; reason: string }>,
  ): SourceUpdateResultItem {
    const previousById = new Map(previousLeafs.map((leaf) => [leaf.id, leaf]));
    const nextById = new Map(nextLeafs.map((leaf) => [leaf.id, leaf]));
    const invalidPaths = new Set(invalidLeafs.map((leaf) => leaf.path));
    const diffs: SourceUpdateDiff[] = [];

    for (const previous of previousLeafs) {
      const next = nextById.get(previous.id);
      if (!next) {
        diffs.push({
          kind: invalidPaths.has(previous.relativePath) ? "invalidated" : "removed",
          sourceId,
          leafId: previous.id,
          relativePath: previous.relativePath,
          contentHash: previous.contentHash,
        });
        continue;
      }

      if (next.contentHash !== previous.contentHash) {
        diffs.push({
          kind: "changed",
          sourceId,
          leafId: next.id,
          relativePath: next.relativePath,
          contentHash: next.contentHash,
          previousLeafId: previous.id,
          previousRelativePath: previous.relativePath,
          previousContentHash: previous.contentHash,
        });
      }
    }

    for (const next of nextLeafs) {
      if (previousById.has(next.id)) {
        continue;
      }
      diffs.push({
        kind: "added",
        sourceId,
        leafId: next.id,
        relativePath: next.relativePath,
        contentHash: next.contentHash,
      });
    }

    return {
      sourceId,
      changed: diffs.length > 0,
      addedLeafIds: diffs.filter((diff) => diff.kind === "added").map((diff) => diff.leafId),
      removedLeafIds: diffs.filter((diff) => diff.kind === "removed").map((diff) => diff.leafId),
      invalidatedLeafIds: diffs.filter((diff) => diff.kind === "invalidated").map((diff) => diff.leafId),
      diffs,
    };
  }

  private async toLeafRecord(
    leaf: LeafRecord,
    sourceId: string,
    checkoutPath: string,
    contentCheckoutPath = checkoutPath,
  ): Promise<LeafRecord> {
    const absolutePath = path.join(checkoutPath, leaf.relativePath);
    const contentPath = path.join(contentCheckoutPath, leaf.relativePath);
    return {
      id: `${sourceId}:${leaf.relativePath}`,
      sourceId,
      relativePath: leaf.relativePath,
      linkName: leaf.linkName,
      title: leaf.title ?? leaf.name ?? leaf.linkName,
      description: leaf.description ?? "",
      absolutePath,
      skillFilePath: path.join(absolutePath, "SKILL.md"),
      contentHash: await hashDirectory(contentPath, { symlinkPolicy: "preserve-safe" }),
      selectors: {
        aliases: [leaf.id, leaf.relativePath].filter((value, index, values) =>
          value && values.indexOf(value) === index
        ),
      },
      valid: leaf.valid,
      diagnostics: (leaf.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic })),
    };
  }
}

function createSourceRevision(
  provider: SourceKind,
  commit: string | undefined,
  capturedAt: string,
): SourceRevision {
  switch (provider) {
    case "git":
    case "clawhub":
      return {
        provider,
        ...(commit ? { commit } : {}),
        capturedAt,
      };
    case "local":
      return { provider, capturedAt };
    case "collection":
      return { provider, capturedAt };
  }
}

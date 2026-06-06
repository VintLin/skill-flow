import fs from "node:fs/promises";
import path from "node:path";
import type {
  LeafRecord,
  LeafRecordV2,
  LockFileV2,
  Result,
  SourceKindV2,
  SourceManifestRecordV2,
  SourceUpdateDiff,
  SourceUpdateResult,
  SourceUpdateResultItem,
  Warning,
} from "@skill-flow/domain/types";
import type { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import {
  ensureDir,
  hashDirectory,
  isPathInside,
  pathExists,
  removePath,
} from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";
import type {
  PreparedSourceCheckoutV2,
  SourceCheckoutKind,
  SourceCheckoutService,
} from "./source-checkout-service.js";
import type { AddSourceOptions } from "./source-types.js";

export type SourceAuthorityServiceV2Options = {
  stateStore: StateStoreV2;
  checkoutService: SourceCheckoutService;
};

export type AddSourceV2Options = AddSourceOptions & {
  checkoutPath?: string;
};

export type SourceSnapshotV2 = {
  manifest: SourceManifestRecordV2;
  lock: LockFileV2["sources"][string];
  leafs: LeafRecordV2[];
  leafCount: number;
  invalidLeafCount: number;
};

export class SourceAuthorityServiceV2 {
  constructor(private readonly options: SourceAuthorityServiceV2Options) {}

  private withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    return this.options.stateStore.withMutationLock(task);
  }

  async addSource(
    locator: string,
    options: AddSourceV2Options = {},
  ): Promise<Result<SourceSnapshotV2>> {
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
    preparedCheckout: PreparedSourceCheckoutV2;
    removePreparedOnFailure?: boolean;
  }): Promise<Result<SourceSnapshotV2>> {
    return this.withMutationLock(() => this.commitPreparedSourceUnlocked(input));
  }

  private async commitPreparedSourceUnlocked(input: {
    preparedCheckout: PreparedSourceCheckoutV2;
    removePreparedOnFailure?: boolean;
  }): Promise<Result<SourceSnapshotV2>> {
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
    const checkoutPath = path.join(this.options.stateStore.rootPath, "source", sourceKind, sourceId);
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
      prepared.leafs.map((leaf) => this.toLeafRecordV2(leaf, sourceId, checkoutPath)),
    );
    const now = new Date().toISOString();
    const source: SourceManifestRecordV2 = {
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
    const lock: LockFileV2["sources"][string] = {
      sourceId,
      canonicalLocator: source.canonicalLocator,
      revision: {
        provider: sourceKind,
        ...(prepared.commitSha ? { commit: prepared.commitSha } : {}),
        capturedAt: now,
      },
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
      invalidLeafCount: prepared.invalidLeafs.length,
    });
  }

  async removeSource(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
    return this.withMutationLock(() => this.removeSourceUnlocked(sourceIds));
  }

  private async removeSourceUnlocked(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
    const state = await this.options.stateStore.readState();
    const removed: string[] = [];
    const sourceRoot = path.join(this.options.stateStore.rootPath, "source");
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
      const expectedCheckoutPath = path.join(sourceRoot, source.kind, sourceId);
      const normalizedLocalPath = path.resolve(lock.localPath);
      if (
        normalizedLocalPath !== path.resolve(expectedCheckoutPath) ||
        !isPathInside(sourceRoot, normalizedLocalPath)
      ) {
        return fail({
          code: "SOURCE_CHECKOUT_PATH_INVALID",
          message: `Refusing to delete checkout with mismatched managed path: ${lock.localPath}`,
        });
      }
      checkoutsToRemove.push(normalizedLocalPath);

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
    const nextLockFile: LockFileV2 = {
      ...state.lockFile,
      sources: { ...state.lockFile.sources },
      leafInventory: [...state.lockFile.leafInventory],
      projections: [...state.lockFile.projections],
    };
    const updated: SourceUpdateResultItem[] = [];
    const warnings: Warning[] = [];

    for (const sourceId of requestedIds) {
      const source = state.manifest.sources.find((item) => item.id === sourceId);
      const lock = nextLockFile.sources[sourceId];
      if (!source || !lock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }

      if (source.kind === "collection") {
        updated.push(this.emptyUpdateResult(sourceId));
        continue;
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
        },
        checkoutPath: tempCheckoutPath,
        allowEmptyLeafs: true,
      });
      if (!prepared.ok) {
        return fail(prepared.errors, [...warnings, ...prepared.warnings]);
      }
      warnings.push(...prepared.warnings);

      const previousLeafs = nextLockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);

      const backupPath = `${lock.localPath}.${process.pid}.${Date.now()}.backup`;
      try {
        if (await pathExists(lock.localPath)) {
          await fs.rename(lock.localPath, backupPath);
        }
        await ensureDir(path.dirname(lock.localPath));
        await fs.rename(prepared.data.checkoutPath, lock.localPath);
        await removePath(backupPath).catch(() => {});
      } catch (error) {
        await removePath(prepared.data.checkoutPath).catch(() => {});
        if (await pathExists(backupPath)) {
          await fs.rename(backupPath, lock.localPath).catch(() => {});
        }
        return fail({
          code: "SOURCE_CHECKOUT_REPLACE_FAILED",
          message: `Unable to replace checkout for '${sourceId}': ${String(error)}`,
        }, warnings);
      }

      const nextLeafs = await Promise.all(
        prepared.data.leafs.map((leaf) => this.toLeafRecordV2(leaf, sourceId, lock.localPath)),
      );
      const diff = this.buildV2SourceUpdateDiff(
        sourceId,
        previousLeafs,
        nextLeafs,
        prepared.data.invalidLeafs,
      );

      nextLockFile.sources[sourceId] = {
        ...lock,
        revision: {
          ...lock.revision,
          ...(prepared.data.commitSha ? { commit: prepared.data.commitSha } : {}),
          capturedAt: new Date().toISOString(),
        },
        leafIds: nextLeafs.map((leaf) => leaf.id),
      };
      nextLockFile.leafInventory = [
        ...nextLockFile.leafInventory.filter((leaf) => leaf.sourceId !== sourceId),
        ...nextLeafs,
      ];
      updated.push(diff);
    }

    await this.options.stateStore.writeState({
      ...state,
      lockFile: nextLockFile,
    });

    return ok({ updated }, warnings);
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
    const nextLockFile: LockFileV2 = {
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
        snapshot.data.leafs.map((leaf) => this.toLeafRecordV2(leaf, sourceId, currentLock.localPath)),
      );
      const leafIdsChanged =
        JSON.stringify(currentLock.leafIds) !== JSON.stringify(nextLeafs.map((leaf) => leaf.id));
      const leafInventoryChanged = JSON.stringify(previousLeafs) !== JSON.stringify(nextLeafs);
      const revisionChanged =
        currentLock.revision.commit !== snapshot.data.commitSha ||
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

  private toCheckoutKind(kind: SourceKindV2): SourceCheckoutKind | undefined {
    switch (kind) {
      case "github":
      case "clawhub":
        return "git";
      case "git":
      case "local":
        return kind;
      case "collection":
        return undefined;
    }
  }

  private mapSourceKind(kind: PreparedSourceCheckoutV2["kind"]): SourceKindV2 {
    return kind;
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

  private buildV2SourceUpdateDiff(
    sourceId: string,
    previousLeafs: LeafRecordV2[],
    nextLeafs: LeafRecordV2[],
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

  private async toLeafRecordV2(
    leaf: LeafRecord,
    sourceId: string,
    checkoutPath: string,
  ): Promise<LeafRecordV2> {
    const absolutePath = path.join(checkoutPath, leaf.relativePath);
    return {
      id: `${sourceId}:${leaf.relativePath}`,
      sourceId,
      relativePath: leaf.relativePath,
      linkName: leaf.linkName,
      title: leaf.title ?? leaf.name ?? leaf.linkName,
      description: leaf.description ?? "",
      absolutePath,
      skillFilePath: path.join(absolutePath, "SKILL.md"),
      displayName: leaf.title ?? leaf.name ?? leaf.linkName,
      contentHash: await hashDirectory(absolutePath),
      selectors: {
        legacyAliases: [leaf.id, leaf.relativePath].filter((value, index, values) =>
          value && values.indexOf(value) === index
        ),
      },
      valid: leaf.valid,
      diagnostics: leaf.metadataWarnings.map((message) => ({
        code: "LEAF_METADATA_WARNING",
        message,
        retryable: false,
      })),
    };
  }
}

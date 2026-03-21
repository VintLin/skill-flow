import path from "node:path";
import type {
  LockFile,
  Manifest,
  Result,
  SourceLockRecord,
  SourceManifestRecord,
} from "../domain/types.js";
import { StateStore } from "../state/store.js";
import { ensureDir, pathExists, removePath } from "../utils/fs.js";
import { git } from "../utils/git.js";
import { fail, ok } from "../utils/result.js";
import { deriveDisplayName, deriveSourceId } from "../utils/source-id.js";
import { InventoryService } from "./inventory-service.js";

export type SourceSnapshot = {
  manifest: SourceManifestRecord;
  lock: SourceLockRecord;
  leafCount: number;
  invalidLeafCount: number;
};

export class SourceService {
  constructor(
    private readonly store: StateStore,
    private readonly inventoryService: InventoryService,
  ) {}

  async addSource(locator: string): Promise<Result<SourceSnapshot>> {
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();

    const normalizedLocator = await this.normalizeLocator(locator);
    const displayName = deriveDisplayName(locator);
    const sourceId = deriveSourceId(locator);

    if (manifest.sources.some((source) => source.id === sourceId)) {
      return fail({
        code: "SOURCE_EXISTS",
        message: `Workflow group '${sourceId}' is already registered.`,
      });
    }

    const checkoutPath = path.join(this.store.sourceRoot, sourceId);
    await ensureDir(this.store.sourceRoot);

    try {
      await git(["clone", "--depth", "1", normalizedLocator, checkoutPath]);
    } catch (error) {
      await removePath(checkoutPath);
      return fail({
        code: "GIT_CLONE_FAILED",
        message: `Unable to fetch source '${locator}': ${String(error)}`,
      });
    }

    const snapshot = await this.buildSnapshot(
      sourceId,
      locator,
      displayName,
      checkoutPath,
    );

    if (!snapshot.ok) {
      await removePath(checkoutPath);
      return fail(snapshot.errors, snapshot.warnings);
    }

    manifest.sources.push(snapshot.data.manifest);
    manifest.bindings[sourceId] = { targets: {} };
    lockFile.sources.push(snapshot.data.lock);
    lockFile.leafInventory.push(...snapshot.data.leafs);

    await this.store.writeManifest(manifest);
    await this.store.writeLock(lockFile);

    return ok({
      manifest: snapshot.data.manifest,
      lock: snapshot.data.lock,
      leafCount: snapshot.data.leafs.length,
      invalidLeafCount: snapshot.data.lock.invalidLeafs.length,
    }, snapshot.warnings);
  }

  async updateSources(sourceIds?: string[]): Promise<
    Result<
      {
        updated: Array<{
          sourceId: string;
          changed: boolean;
          addedLeafIds: string[];
          removedLeafIds: string[];
          invalidatedLeafIds: string[];
        }>;
      }
    >
  > {
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    const selectedIds = sourceIds?.length
      ? sourceIds
      : manifest.sources.map((source) => source.id);

    const updated: Array<{
      sourceId: string;
      changed: boolean;
      addedLeafIds: string[];
      removedLeafIds: string[];
      invalidatedLeafIds: string[];
    }> = [];

    for (const sourceId of selectedIds) {
      const source = manifest.sources.find((item) => item.id === sourceId);
      const currentLock = lockFile.sources.find((item) => item.id === sourceId);

      if (!source || !currentLock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Workflow group '${sourceId}' is not registered.`,
        });
      }

      try {
        await git(["pull", "--ff-only"], { cwd: currentLock.checkoutPath });
      } catch (error) {
        return fail({
          code: "GIT_UPDATE_FAILED",
          message: `Unable to update '${sourceId}': ${String(error)}`,
        });
      }

      const latestCommitSha = await git(["rev-parse", "HEAD"], {
        cwd: currentLock.checkoutPath,
      });

      if (latestCommitSha === currentLock.commitSha) {
        updated.push({
          sourceId,
          changed: false,
          addedLeafIds: [],
          removedLeafIds: [],
          invalidatedLeafIds: [],
        });
        continue;
      }

      const snapshot = await this.buildSnapshot(
        source.id,
        source.locator,
        source.displayName,
        currentLock.checkoutPath,
        { allowEmptyLeafs: true },
      );

      if (!snapshot.ok) {
        return fail(snapshot.errors, snapshot.warnings);
      }

      const previousLeafs = lockFile.leafInventory.filter(
        (leaf) => leaf.sourceId === sourceId,
      );
      const previousLeafIds = new Set(previousLeafs.map((leaf) => leaf.id));
      const nextLeafIds = new Set(snapshot.data.leafs.map((leaf) => leaf.id));
      const previousInvalidPaths = new Set(
        currentLock.invalidLeafs.map((leaf) => leaf.path),
      );
      const nextInvalidPaths = new Set(
        snapshot.data.lock.invalidLeafs.map((leaf) => leaf.path),
      );

      lockFile.sources = lockFile.sources.map((item) =>
        item.id === sourceId ? snapshot.data.lock : item,
      );
      lockFile.leafInventory = [
        ...lockFile.leafInventory.filter((leaf) => leaf.sourceId !== sourceId),
        ...snapshot.data.leafs,
      ];

      updated.push({
        sourceId,
        changed: true,
        addedLeafIds: [...nextLeafIds].filter((id) => !previousLeafIds.has(id)),
        removedLeafIds: [...previousLeafIds].filter((id) => !nextLeafIds.has(id)),
        invalidatedLeafIds: [...nextInvalidPaths].filter(
          (value) => !previousInvalidPaths.has(value),
        ),
      });
    }

    await this.store.writeLock(lockFile);
    return ok({ updated });
  }

  async removeSource(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    const removed: string[] = [];

    for (const sourceId of sourceIds) {
      const currentSource = manifest.sources.find((source) => source.id === sourceId);
      const currentLock = lockFile.sources.find((source) => source.id === sourceId);
      if (!currentSource || !currentLock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Workflow group '${sourceId}' is not registered.`,
        });
      }

      manifest.sources = manifest.sources.filter((source) => source.id !== sourceId);
      delete manifest.bindings[sourceId];
      lockFile.sources = lockFile.sources.filter((source) => source.id !== sourceId);
      lockFile.leafInventory = lockFile.leafInventory.filter(
        (leaf) => leaf.sourceId !== sourceId,
      );
      lockFile.deployments = lockFile.deployments.filter(
        (deployment) => deployment.sourceId !== sourceId,
      );
      if (currentLock && (await pathExists(currentLock.checkoutPath))) {
        await removePath(currentLock.checkoutPath);
      }
      removed.push(sourceId);
    }

    await this.store.writeManifest(manifest);
    await this.store.writeLock(lockFile);
    return ok({ removed });
  }

  async reconcileInventory(
    sourceIds?: string[],
    options: { force?: boolean } = {},
  ): Promise<Result<{ updatedSourceIds: string[] }>> {
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    const selectedIds = sourceIds?.length
      ? sourceIds
      : manifest.sources.map((source) => source.id);
    const updatedSourceIds: string[] = [];

    for (const sourceId of selectedIds) {
      const source = manifest.sources.find((item) => item.id === sourceId);
      const currentLock = lockFile.sources.find((item) => item.id === sourceId);
      if (!source || !currentLock) {
        continue;
      }

      const sourceLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
      const sourceDeployments = lockFile.deployments.filter(
        (deployment) => deployment.sourceId === sourceId,
      );
      if (
        !options.force &&
        !this.needsInventoryReconcile(sourceId, sourceLeafs, sourceDeployments)
      ) {
        continue;
      }

      const snapshot = await this.buildSnapshot(
        source.id,
        source.locator,
        source.displayName,
        currentLock.checkoutPath,
        { allowEmptyLeafs: true },
      );

      if (!snapshot.ok) {
        return fail(snapshot.errors, snapshot.warnings);
      }

      const leafIdsChanged =
        JSON.stringify(currentLock.leafIds) !==
        JSON.stringify(snapshot.data.lock.leafIds);
      const invalidLeafsChanged =
        JSON.stringify(currentLock.invalidLeafs) !==
        JSON.stringify(snapshot.data.lock.invalidLeafs);
      const leafInventoryChanged =
        JSON.stringify(sourceLeafs) !== JSON.stringify(snapshot.data.leafs);

      if (
        !options.force &&
        !leafIdsChanged &&
        !invalidLeafsChanged &&
        !leafInventoryChanged
      ) {
        continue;
      }

      lockFile.sources = lockFile.sources.map((item) =>
        item.id === sourceId ? snapshot.data.lock : item,
      );
      lockFile.leafInventory = [
        ...lockFile.leafInventory.filter((leaf) => leaf.sourceId !== sourceId),
        ...snapshot.data.leafs,
      ];

      const nextLeafIds = new Set(snapshot.data.leafs.map((leaf) => leaf.id));
      const binding = manifest.bindings[sourceId];
      if (binding) {
        for (const targetBinding of Object.values(binding.targets)) {
          if (!targetBinding) {
            continue;
          }
          targetBinding.leafIds = targetBinding.leafIds.filter((leafId) =>
            nextLeafIds.has(leafId),
          );
        }
      }

      updatedSourceIds.push(sourceId);
    }

    if (updatedSourceIds.length > 0) {
      await this.store.writeManifest(manifest);
      await this.store.writeLock(lockFile);
    }

    return ok({ updatedSourceIds });
  }

  private needsInventoryReconcile(
    sourceId: string,
    sourceLeafs: LockFile["leafInventory"],
    sourceDeployments: LockFile["deployments"],
  ): boolean {
    const hasGeneratedLeafs = sourceLeafs.some((leaf) =>
      /^(?:\.agents|\.claude|\.codex|\.opencode|\.openclaw)(?:\/|$)/.test(
        leaf.relativePath,
      ),
    );

    const hasLegacyTargetNames = sourceDeployments.some((deployment) =>
      path.basename(deployment.targetPath).startsWith(`${sourceId}--`),
    );

    return hasGeneratedLeafs || hasLegacyTargetNames;
  }

  private async buildSnapshot(
    sourceId: string,
    locator: string,
    displayName: string,
    checkoutPath: string,
    options: { allowEmptyLeafs?: boolean } = {},
  ): Promise<
    Result<{
      manifest: SourceManifestRecord;
      lock: SourceLockRecord;
      leafs: LockFile["leafInventory"];
    }>
  > {
    const commitSha = await git(["rev-parse", "HEAD"], { cwd: checkoutPath });
    const scanned = await this.inventoryService.scanSource(sourceId, checkoutPath);
    const metadataWarnings = scanned.leafs.flatMap((leaf) =>
      leaf.metadataWarnings.map((message) => ({
        code: "SKILL_METADATA_WARNING",
        message: `${leaf.relativePath}: ${message}`,
      })),
    );

    if (scanned.leafs.length === 0 && !options.allowEmptyLeafs) {
      return fail(
        {
          code: "NO_VALID_LEAFS",
          message: `Source '${displayName}' has no valid skills.`,
        },
        scanned.invalidLeafs.map((leaf) => ({
          code: "INVALID_LEAF",
          message: `${leaf.path}: ${leaf.reason}`,
        })),
      );
    }

    return ok(
      {
        manifest: {
          id: sourceId,
          locator,
          kind: "git",
          displayName,
          addedAt: new Date().toISOString(),
        },
        lock: {
          id: sourceId,
          locator,
          kind: "git",
          displayName,
          checkoutPath,
          commitSha,
          updatedAt: new Date().toISOString(),
          leafIds: scanned.leafs.map((leaf) => leaf.id),
          invalidLeafs: scanned.invalidLeafs,
        },
        leafs: scanned.leafs,
      },
      [
        ...metadataWarnings,
        ...scanned.invalidLeafs.map((leaf) => ({
          code: "INVALID_LEAF",
          message: `${leaf.path}: ${leaf.reason}`,
        })),
      ],
    );
  }

  private async normalizeLocator(locator: string): Promise<string> {
    const trimmed = locator.trim();

    if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
      return `https://github.com/${trimmed}.git`;
    }

    if (trimmed.startsWith("git@") || trimmed.startsWith("http")) {
      return trimmed;
    }

    const resolvedPath = path.resolve(trimmed);
    if (await pathExists(resolvedPath)) {
      return resolvedPath;
    }

    return trimmed;
  }
}

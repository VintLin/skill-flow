import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentTargetName,
  LockFile,
  Result,
  SourceUpdateDiff,
  SourceUpdateResult,
  SourceKind,
  SourceLockRecord,
  SourceManifestRecord,
} from "../domain/types.js";
import { StateStore } from "../state/store.js";
import { copyDirectory, ensureDir, hashDirectory, pathExists, readJsonFile, removePath } from "../utils/fs.js";
import {
  installClawHubSkill,
} from "../utils/clawhub.js";
import { git } from "../utils/git.js";
import { fail, ok } from "../utils/result.js";
import { deriveDisplayName, deriveSourceId } from "../utils/source-id.js";
import { formatGroupLabel } from "../utils/naming.js";
import { InventoryService } from "./inventory-service.js";

export type SourceSnapshot = {
  manifest: SourceManifestRecord;
  lock: SourceLockRecord;
  leafCount: number;
  invalidLeafCount: number;
};

export type AddSourceOptions = {
  path?: string;
  enabledTargets?: DeploymentTargetName[];
  selectionMode?: "all" | "partial";
  project?: boolean;
  sourceIdOverride?: string;
  displayNameOverride?: string;
  originLocator?: string;
  originRequestedPath?: string;
  originBranch?: string;
  importedFromTargets?: DeploymentTargetName[];
  importMode?: "explicit-add" | "bootstrap-detected";
};

type SourceResolution = {
  kind: SourceKind;
  locator: string;
  displayName: string;
  sourceId: string;
  requestedPath?: string;
  gitLocator?: string;
  localPath?: string;
  clawhubSlug?: string;
  requestedVersion?: string;
  versionMode?: "pinned" | "floating";
};

export class SourceService {
  constructor(
    private readonly store: StateStore,
    private readonly inventoryService: InventoryService,
  ) {}

  async addSource(
    locator: string,
    options: AddSourceOptions = {},
  ): Promise<Result<SourceSnapshot>> {
    const { manifest, lockFile } = await this.store.readState();

    const resolved = this.resolveUniqueLocalSource(
      await this.resolveSource(locator, options),
      manifest.sources,
    );

    if (
      manifest.sources.some(
        (source) => source.id === resolved.sourceId && source.locator === resolved.locator,
      )
    ) {
      return fail({
        code: "SOURCE_EXISTS",
        message: `Skills group '${formatGroupLabel({ id: resolved.sourceId, locator: resolved.locator, displayName: resolved.displayName })}' is already registered with id '${resolved.sourceId}'.`,
      });
    }

    if (manifest.sources.some((source) => source.id === resolved.sourceId)) {
      return fail({
        code: "SOURCE_EXISTS",
        message: `Skills group '${formatGroupLabel({ id: resolved.sourceId, locator: resolved.locator, displayName: resolved.displayName })}' is already registered with id '${resolved.sourceId}'.`,
      });
    }

    const checkoutPath = this.store.getSourceCheckoutPath(
      resolved.kind,
      resolved.sourceId,
    );
    await ensureDir(this.store.getSourceRoot(resolved.kind));

    try {
      await this.fetchSource(resolved, checkoutPath);
    } catch (error) {
      await removePath(checkoutPath);
      return fail({
        code:
          resolved.kind === "git"
            ? "GIT_CLONE_FAILED"
            : resolved.kind === "local"
              ? "LOCAL_IMPORT_FAILED"
              : "CLAWHUB_FETCH_FAILED",
        message: `Unable to fetch source '${resolved.locator}': ${String(error)}`,
      });
    }

    const snapshot = await this.buildSnapshot(
      resolved.kind,
      resolved.sourceId,
      resolved.locator,
      resolved.displayName,
      checkoutPath,
      resolved.requestedPath,
      options,
    );

    if (!snapshot.ok) {
      await removePath(checkoutPath);
      return fail(snapshot.errors, snapshot.warnings);
    }

    manifest.sources.push(snapshot.data.manifest);
    manifest.bindings[resolved.sourceId] = { targets: {} };
    lockFile.sources.push(snapshot.data.lock);
    lockFile.leafInventory.push(...snapshot.data.leafs);

    await this.store.writeState(manifest, lockFile);

    return ok({
      manifest: snapshot.data.manifest,
      lock: snapshot.data.lock,
      leafCount: snapshot.data.leafs.length,
      invalidLeafCount: snapshot.data.lock.invalidLeafs.length,
    }, snapshot.warnings);
  }

  async updateSources(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    const { manifest, lockFile } = await this.store.readState();
    const selectedIds = sourceIds?.length
      ? sourceIds
      : manifest.sources.map((source) => source.id);

    const updated: SourceUpdateResult["updated"] = [];

    for (const sourceId of selectedIds) {
      const source = manifest.sources.find((item) => item.id === sourceId);
      const currentLock = lockFile.sources.find((item) => item.id === sourceId);

      if (!source || !currentLock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }

      try {
        const sourceChanged = await this.updateSource(source, currentLock);
        const sourceMeta = {
          ...(source.requestedPath ? { requestedPath: source.requestedPath } : {}),
          ...(source.selectionMode ? { selectionMode: source.selectionMode } : {}),
        };
        if (!sourceChanged) {
          updated.push({
            sourceId,
            changed: false,
            addedLeafIds: [],
            removedLeafIds: [],
            invalidatedLeafIds: [],
            diffs: [],
            ...sourceMeta,
          });
          continue;
        }

        const snapshot = await this.buildSnapshot(
          source.kind,
          source.id,
          source.locator,
          source.displayName,
          currentLock.checkoutPath,
          source.requestedPath,
          {},
          { allowEmptyLeafs: true },
        );

        if (!snapshot.ok) {
          return fail(snapshot.errors, snapshot.warnings);
        }

        const diff = this.buildSourceUpdateDiff(
          source,
          lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId),
          snapshot.data.leafs,
          snapshot.data.lock.invalidLeafs,
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
          changed: sourceChanged,
          addedLeafIds: diff.addedLeafIds,
          removedLeafIds: diff.removedLeafIds,
          invalidatedLeafIds: diff.invalidatedLeafIds,
          diffs: diff.diffs,
          ...sourceMeta,
        });
      } catch (error) {
        return fail({
          code:
            source.kind === "git"
              ? "GIT_UPDATE_FAILED"
              : source.kind === "local"
                ? "LOCAL_UPDATE_FAILED"
                : "CLAWHUB_UPDATE_FAILED",
          message: `Unable to update skills group id '${sourceId}': ${String(error)}`,
        });
      }
    }

    await this.store.writeState(manifest, lockFile);
    return ok({ updated });
  }

  async removeSource(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
    const { manifest, lockFile } = await this.store.readState();
    const removed: string[] = [];

    for (const sourceId of sourceIds) {
      const currentSource = manifest.sources.find((source) => source.id === sourceId);
      const currentLock = lockFile.sources.find((source) => source.id === sourceId);
      if (!currentSource || !currentLock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
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

    await this.store.writeState(manifest, lockFile);
    return ok({ removed });
  }

  async reconcileInventory(
    sourceIds?: string[],
    options: { force?: boolean } = {},
  ): Promise<Result<{ updatedSourceIds: string[] }>> {
    const { manifest, lockFile } = await this.store.readState();
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
        source.kind,
        source.id,
        source.locator,
        source.displayName,
        currentLock.checkoutPath,
        source.requestedPath,
        {},
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
      await this.store.writeState(manifest, lockFile);
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

  private buildSourceUpdateDiff(
    source: SourceManifestRecord,
    previousLeafs: LockFile["leafInventory"],
    nextLeafs: LockFile["leafInventory"],
    nextInvalidLeafs: SourceLockRecord["invalidLeafs"],
  ): {
    diffs: SourceUpdateDiff[];
    addedLeafIds: string[];
    removedLeafIds: string[];
    invalidatedLeafIds: string[];
  } {
    const requestedPath = this.normalizeRequestedPath(source.requestedPath);
    const requestedPathOption = requestedPath ? { requestedPath } : {};
    const diffs: SourceUpdateDiff[] = [];
    const addedLeafIds: string[] = [];
    const removedLeafIds: string[] = [];
    const invalidatedLeafIds: string[] = [];
    const matchedPreviousIds = new Set<string>();
    const matchedNextIds = new Set<string>();

    const nextById = new Map(nextLeafs.map((leaf) => [leaf.id, leaf] as const));
    const nextInvalidPaths = new Set(nextInvalidLeafs.map((leaf) => leaf.path));

    for (const previousLeaf of previousLeafs) {
      const nextLeaf = nextById.get(previousLeaf.id);
      if (!nextLeaf || previousLeaf.contentHash === nextLeaf.contentHash) {
        continue;
      }

      diffs.push(
        this.createDiffItem("changed", source.id, nextLeaf, {
          ...requestedPathOption,
          previousLeafId: previousLeaf.id,
          previousRelativePath: previousLeaf.relativePath,
          previousContentHash: previousLeaf.contentHash,
        }),
      );
      matchedPreviousIds.add(previousLeaf.id);
      matchedNextIds.add(nextLeaf.id);
    }

    const previousByHash = new Map<string, LockFile["leafInventory"]>();
    const nextByHash = new Map<string, LockFile["leafInventory"]>();
    for (const previousLeaf of previousLeafs) {
      if (matchedPreviousIds.has(previousLeaf.id)) {
        continue;
      }
      const list = previousByHash.get(previousLeaf.contentHash) ?? [];
      list.push(previousLeaf);
      previousByHash.set(previousLeaf.contentHash, list);
    }
    for (const nextLeaf of nextLeafs) {
      if (matchedNextIds.has(nextLeaf.id)) {
        continue;
      }
      const list = nextByHash.get(nextLeaf.contentHash) ?? [];
      list.push(nextLeaf);
      nextByHash.set(nextLeaf.contentHash, list);
    }

    for (const contentHash of [...previousByHash.keys()].sort()) {
      const previousGroup = previousByHash.get(contentHash) ?? [];
      const nextGroup = nextByHash.get(contentHash) ?? [];
      if (previousGroup.length !== 1 || nextGroup.length !== 1) {
        continue;
      }

      const previousLeaf = previousGroup[0]!;
      const nextLeaf = nextGroup[0]!;
      if (
        previousLeaf.id === nextLeaf.id ||
        !this.canClassifyAsMoved(requestedPath, previousLeaf.relativePath, nextLeaf.relativePath)
      ) {
        continue;
      }

      diffs.push(
        this.createDiffItem("moved", source.id, nextLeaf, {
          ...requestedPathOption,
          previousLeafId: previousLeaf.id,
          previousRelativePath: previousLeaf.relativePath,
          previousContentHash: previousLeaf.contentHash,
        }),
      );
      matchedPreviousIds.add(previousLeaf.id);
      matchedNextIds.add(nextLeaf.id);
    }

    for (const previousLeaf of previousLeafs) {
      if (matchedPreviousIds.has(previousLeaf.id)) {
        continue;
      }

      if (nextInvalidPaths.has(previousLeaf.relativePath)) {
        diffs.push(
          this.createDiffItem("invalidated", source.id, previousLeaf, {
            ...requestedPathOption,
            previousLeafId: previousLeaf.id,
            previousRelativePath: previousLeaf.relativePath,
            previousContentHash: previousLeaf.contentHash,
          }),
        );
        invalidatedLeafIds.push(previousLeaf.id);
        matchedPreviousIds.add(previousLeaf.id);
      }
    }

    for (const previousLeaf of previousLeafs) {
      if (matchedPreviousIds.has(previousLeaf.id)) {
        continue;
      }

      diffs.push(
        this.createDiffItem("removed", source.id, previousLeaf, {
          ...requestedPathOption,
          previousLeafId: previousLeaf.id,
          previousRelativePath: previousLeaf.relativePath,
          previousContentHash: previousLeaf.contentHash,
        }),
      );
      removedLeafIds.push(previousLeaf.id);
      matchedPreviousIds.add(previousLeaf.id);
    }

    for (const nextLeaf of nextLeafs) {
      if (matchedNextIds.has(nextLeaf.id)) {
        continue;
      }

      diffs.push(this.createDiffItem("added", source.id, nextLeaf, requestedPathOption));
      addedLeafIds.push(nextLeaf.id);
      matchedNextIds.add(nextLeaf.id);
    }

    return {
      diffs,
      addedLeafIds,
      removedLeafIds,
      invalidatedLeafIds,
    };
  }

  private createDiffItem(
    kind: SourceUpdateDiff["kind"],
    sourceId: string,
    leaf: LockFile["leafInventory"][number],
    extras: {
      requestedPath?: string;
      previousLeafId?: string;
      previousRelativePath?: string;
      previousContentHash?: string;
    } = {},
  ): SourceUpdateDiff {
    return {
      kind,
      sourceId,
      leafId: leaf.id,
      relativePath: leaf.relativePath,
      contentHash: leaf.contentHash,
      ...(extras.requestedPath ? { requestedPath: extras.requestedPath } : {}),
      ...(extras.previousLeafId ? { previousLeafId: extras.previousLeafId } : {}),
      ...(extras.previousRelativePath ? { previousRelativePath: extras.previousRelativePath } : {}),
      ...(extras.previousContentHash ? { previousContentHash: extras.previousContentHash } : {}),
    };
  }

  private canClassifyAsMoved(
    requestedPath: string | undefined,
    previousRelativePath: string,
    nextRelativePath: string,
  ): boolean {
    if (!requestedPath) {
      return true;
    }

    return (
      this.isWithinRequestedPath(previousRelativePath, requestedPath) &&
      this.isWithinRequestedPath(nextRelativePath, requestedPath)
    );
  }

  private normalizeRequestedPath(requestedPath?: string): string | undefined {
    if (!requestedPath) {
      return undefined;
    }

    const normalized = requestedPath.replace(/^\.\/+/, "").replace(/\/+$/, "");
    return normalized.length > 0 ? normalized : undefined;
  }

  private isWithinRequestedPath(relativePath: string, requestedPath?: string): boolean {
    const normalizedPath = this.normalizeRequestedPath(requestedPath);
    if (!normalizedPath) {
      return true;
    }

    return (
      relativePath === normalizedPath || relativePath.startsWith(`${normalizedPath}/`)
    );
  }

  private async buildSnapshot(
    kind: SourceKind,
    sourceId: string,
    locator: string,
    displayName: string,
    checkoutPath: string,
    requestedPathOrOptions: string | { allowEmptyLeafs?: boolean } | undefined = undefined,
    addOptions: AddSourceOptions = {},
    maybeOptions: { allowEmptyLeafs?: boolean } = {},
  ): Promise<
    Result<{
      manifest: SourceManifestRecord;
      lock: SourceLockRecord;
      leafs: LockFile["leafInventory"];
    }>
  > {
    const requestedPath =
      typeof requestedPathOrOptions === "string" ? requestedPathOrOptions : undefined;
    const options =
      typeof requestedPathOrOptions === "string"
        ? maybeOptions
        : (maybeOptions.allowEmptyLeafs !== undefined
            ? maybeOptions
            : (requestedPathOrOptions ?? {}));
    const sourceMetadata = await this.readSourceSnapshot(kind, checkoutPath);
    const scanned = await this.inventoryService.scanSource(
      sourceId,
      checkoutPath,
      displayName,
    );
    const requestedMatches = this.findRequestedLeafs(scanned.leafs, requestedPath);
    const metadataWarnings = scanned.leafs.flatMap((leaf) =>
      leaf.metadataWarnings.map((message) => ({
        code: "SKILL_METADATA_WARNING",
        message: `${leaf.relativePath}: ${message}`,
      })),
    );

    if (
      ((requestedPath && requestedMatches.length === 0) || scanned.leafs.length === 0) &&
      !options.allowEmptyLeafs
    ) {
      const emptyReason =
        scanned.skillFileCount === 0
          ? " No SKILL.md files were found."
          : "";
      return fail(
        {
          code: requestedPath ? "SOURCE_PATH_NOT_FOUND" : "NO_VALID_LEAFS",
          message: requestedPath
            ? `Source '${displayName}' does not contain a valid skill at '${requestedPath}'.`
            : `Source '${displayName}' has no valid skills.${emptyReason}`,
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
          kind,
          displayName,
          addedAt: new Date().toISOString(),
          ...(requestedPath ? { requestedPath } : {}),
          ...(addOptions.selectionMode ? { selectionMode: addOptions.selectionMode } : {}),
          ...(addOptions.originLocator ? { originLocator: addOptions.originLocator } : {}),
          ...(addOptions.originRequestedPath
            ? { originRequestedPath: addOptions.originRequestedPath }
            : {}),
        },
        lock: {
          id: sourceId,
          locator,
          kind,
          displayName,
          checkoutPath,
          updatedAt: new Date().toISOString(),
          leafIds: scanned.leafs.map((leaf) => leaf.id),
          invalidLeafs: scanned.invalidLeafs,
          ...sourceMetadata,
          ...(addOptions.originBranch ? { originBranch: addOptions.originBranch } : {}),
          ...(addOptions.importedFromTargets
            ? { importedFromTargets: addOptions.importedFromTargets }
            : {}),
          ...(addOptions.importMode ? { importMode: addOptions.importMode } : {}),
          ...(kind === "clawhub"
            ? {
                versionMode: locator.includes("@") ? ("pinned" as const) : ("floating" as const),
              }
            : {}),
        },
        leafs: scanned.leafs,
      },
      [
        ...metadataWarnings,
        ...scanned.duplicateLeafs.map((leaf) => ({
          code: "DUPLICATE_LEAF",
          message: `${leaf.path}: Duplicate skill content skipped because ${leaf.keptPath} was discovered first`,
        })),
        ...scanned.invalidLeafs.map((leaf) => ({
          code: "INVALID_LEAF",
          message: `${leaf.path}: ${leaf.reason}`,
        })),
      ],
    );
  }

  private async normalizeLocator(locator: string): Promise<string> {
    const trimmed = locator.trim();

    if (trimmed.startsWith("git@") || trimmed.startsWith("http")) {
      return trimmed;
    }

    if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
      return `https://github.com/${trimmed}.git`;
    }

    const resolvedPath = path.resolve(trimmed);
    if (await pathExists(resolvedPath)) {
      return resolvedPath;
    }

    return trimmed;
  }

  private async resolveSource(
    locator: string,
    options: AddSourceOptions,
  ): Promise<SourceResolution> {
    const trimmed = locator.trim();
    const fileLocatorPath = this.parseFileLocator(trimmed);
    const resolvedPath = path.resolve(fileLocatorPath ?? trimmed);
    if (
      await pathExists(resolvedPath) &&
      (!fileLocatorPath || !(await this.isGitRepositoryPath(resolvedPath)))
    ) {
      return {
        kind: "local",
        locator: resolvedPath,
        localPath: resolvedPath,
        displayName: options.displayNameOverride ?? deriveDisplayName(resolvedPath),
        sourceId: options.sourceIdOverride ?? deriveSourceId(resolvedPath),
        ...(options.path ? { requestedPath: options.path } : {}),
      };
    }

    const treeLocator = this.parseTreeLocator(trimmed);
    if (treeLocator) {
      const requestedPath = this.joinRequestedPaths(
        treeLocator.requestedPath,
        options.path,
      );
      return {
        kind: "git",
        locator: treeLocator.repoLocator,
        gitLocator: await this.normalizeLocator(treeLocator.repoLocator),
        displayName: options.displayNameOverride ?? deriveDisplayName(treeLocator.repoLocator),
        sourceId: options.sourceIdOverride ?? deriveSourceId(treeLocator.repoLocator),
        ...(requestedPath ? { requestedPath } : {}),
      };
    }

    const shorthandLocator = this.parseGitHubShorthandSubpath(trimmed);
    if (shorthandLocator) {
      const requestedPath = this.joinRequestedPaths(
        shorthandLocator.requestedPath,
        options.path,
      );
      return {
        kind: "git",
        locator: shorthandLocator.repoLocator,
        gitLocator: await this.normalizeLocator(shorthandLocator.repoLocator),
        displayName: options.displayNameOverride ?? deriveDisplayName(shorthandLocator.repoLocator),
        sourceId: options.sourceIdOverride ?? deriveSourceId(shorthandLocator.repoLocator),
        ...(requestedPath ? { requestedPath } : {}),
      };
    }

    const clawhubMatch = trimmed.match(/^clawhub:([^@\s]+)(?:@(.+))?$/);
    if (clawhubMatch) {
      const slug = clawhubMatch[1];
      const version = clawhubMatch[2];
      if (!slug) {
        throw new Error(`Invalid ClawHub locator '${locator}'.`);
      }

      return version
        ? {
            kind: "clawhub",
            locator: trimmed,
            displayName: options.displayNameOverride ?? deriveDisplayName(trimmed),
            sourceId: options.sourceIdOverride ?? deriveSourceId(trimmed),
            ...(options.path ? { requestedPath: options.path } : {}),
            clawhubSlug: slug,
            requestedVersion: version,
            versionMode: "pinned",
          }
        : {
          kind: "clawhub",
          locator: trimmed,
          displayName: options.displayNameOverride ?? deriveDisplayName(trimmed),
          sourceId: options.sourceIdOverride ?? deriveSourceId(trimmed),
          ...(options.path ? { requestedPath: options.path } : {}),
          clawhubSlug: slug,
          versionMode: "floating",
        };
    }

    return {
      kind: "git",
      locator,
      gitLocator: await this.normalizeLocator(locator),
      displayName: options.displayNameOverride ?? deriveDisplayName(locator),
      sourceId: options.sourceIdOverride ?? deriveSourceId(locator),
      ...(options.path ? { requestedPath: options.path } : {}),
    };
  }

  private resolveUniqueLocalSource(
    resolved: SourceResolution,
    existingSources: SourceManifestRecord[],
  ): SourceResolution {
    if (resolved.kind !== "local" || !resolved.localPath) {
      return resolved;
    }

    if (
      existingSources.some(
        (source) => source.kind === "local" && path.resolve(source.locator) === resolved.localPath,
      )
    ) {
      return resolved;
    }

    const folderName = path.basename(resolved.localPath);
    const parentFolderName = path.basename(path.dirname(resolved.localPath));
    const displayCandidates = [
      folderName,
      `${parentFolderName}_${folderName}`,
    ];
    const takenIds = new Set(existingSources.map((source) => source.id));
    const takenLabels = new Set(
      existingSources
        .filter((source) => source.kind === "local")
        .map((source) => source.displayName),
    );

    for (const candidate of displayCandidates) {
      const sourceId = deriveSourceId(candidate);
      if (!takenIds.has(sourceId) && !takenLabels.has(candidate)) {
        return {
          ...resolved,
          displayName: candidate,
          sourceId,
        };
      }
    }

    const baseDisplayName = `${parentFolderName}_${folderName}`;
    let index = 2;
    while (true) {
      const displayName = `${baseDisplayName}_${index}`;
      const sourceId = deriveSourceId(displayName);
      if (!takenIds.has(sourceId) && !takenLabels.has(displayName)) {
        return {
          ...resolved,
          displayName,
          sourceId,
        };
      }
      index += 1;
    }
  }

  private parseTreeLocator(
    locator: string,
  ): { repoLocator: string; requestedPath?: string } | null {
    try {
      const url = new URL(locator);

      const parts = url.pathname.split("/").filter(Boolean);
      if (url.hostname === "github.com") {
        if (parts.length < 5 || parts[2] !== "tree") {
          return null;
        }

        const owner = parts[0];
        const repo = parts[1];
        const requestedPath = parts.slice(4).join("/");
        if (!owner || !repo || !requestedPath) {
          return null;
        }

        return {
          repoLocator: `https://github.com/${owner}/${repo}.git`,
          requestedPath,
        };
      }

      if (url.hostname === "gitlab.com") {
        const markerIndex = parts.findIndex(
          (segment, index) => segment === "-" && parts[index + 1] === "tree",
        );
        if (markerIndex < 2) {
          return null;
        }

        const requestedPath = parts.slice(markerIndex + 3).join("/");

        return {
          repoLocator: `https://gitlab.com/${parts.slice(0, markerIndex).join("/")}.git`,
          ...(requestedPath ? { requestedPath } : {}),
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  private parseGitHubShorthandSubpath(
    locator: string,
  ): { repoLocator: string; requestedPath: string } | null {
    const trimmed = locator.replace(/\/+$/, "");
    const parts = trimmed.split("/");
    if (parts.length < 3) {
      return null;
    }

    const owner = parts[0];
    const rawRepo = parts[1];
    const requestedPath = parts.slice(2).join("/");
    if (!owner || !rawRepo || !requestedPath) {
      return null;
    }

    const repo = rawRepo.replace(/\.git$/i, "");
    return {
      repoLocator: `https://github.com/${owner}/${repo}.git`,
      requestedPath,
    };
  }

  private parseFileLocator(locator: string): string | null {
    if (!locator.startsWith("file://")) {
      return null;
    }

    try {
      const fileUrl = new URL(locator);
      if (fileUrl.protocol !== "file:") {
        return null;
      }
      return path.resolve(decodeURIComponent(fileUrl.pathname));
    } catch {
      return null;
    }
  }

  private async isGitRepositoryPath(candidatePath: string): Promise<boolean> {
    if (await pathExists(path.join(candidatePath, ".git"))) {
      return true;
    }

    return (
      await pathExists(path.join(candidatePath, "HEAD")) &&
      await pathExists(path.join(candidatePath, "objects")) &&
      await pathExists(path.join(candidatePath, "refs"))
    );
  }

  private joinRequestedPaths(basePath?: string, childPath?: string): string | undefined {
    const normalizedBase = this.normalizeRequestedPath(basePath);
    const normalizedChild = this.normalizeRequestedPath(childPath);

    if (!normalizedBase) {
      return normalizedChild;
    }

    if (!normalizedChild) {
      return normalizedBase;
    }

    if (
      normalizedChild === normalizedBase ||
      normalizedChild.startsWith(`${normalizedBase}/`)
    ) {
      return normalizedChild;
    }

    return `${normalizedBase}/${normalizedChild}`;
  }

  private findRequestedLeafs(
    leafs: LockFile["leafInventory"],
    requestedPath?: string,
  ): LockFile["leafInventory"] {
    const normalizedPath = this.normalizeRequestedPath(requestedPath);
    if (!normalizedPath) {
      return leafs;
    }

    return leafs.filter(
      (leaf) =>
        leaf.relativePath === normalizedPath ||
        leaf.relativePath.startsWith(`${normalizedPath}/`),
    );
  }

  private async fetchSource(
    source: SourceResolution,
    checkoutPath: string,
  ): Promise<void> {
    if (source.kind === "local") {
      await copyDirectory(source.localPath!, checkoutPath);
      return;
    }

    if (source.kind === "git") {
      await git(["clone", "--depth", "1", source.gitLocator!, checkoutPath]);
      return;
    }

    if (source.kind === "clawhub") {
      const installed = await installClawHubSkill(
        source.clawhubSlug!,
        source.requestedVersion,
      );
      try {
        await copyDirectory(installed.installedPath, checkoutPath);
      } finally {
        await removePath(installed.workdir);
      }
      return;
    }
  }

  private async updateSource(
    source: SourceManifestRecord,
    currentLock: SourceLockRecord,
  ): Promise<boolean> {
    if (source.kind === "local") {
      return this.refreshLocalSourceCheckout(source, currentLock);
    }

    if (source.kind === "git") {
      await git(["pull", "--ff-only"], { cwd: currentLock.checkoutPath });
      const latestCommitSha = await git(["rev-parse", "HEAD"], {
        cwd: currentLock.checkoutPath,
      });
      return latestCommitSha !== currentLock.commitSha;
    }

    if (source.kind === "clawhub") {
      if (currentLock.versionMode === "pinned") {
        return false;
      }

      const installed = await installClawHubSkill(currentLock.packageSlug ?? currentLock.id);
      try {
        if (installed.resolvedVersion === currentLock.resolvedVersion) {
          return false;
        }

        await copyDirectory(installed.installedPath, currentLock.checkoutPath);
        return true;
      } finally {
        await removePath(installed.workdir);
      }
    }

    return false;
  }

  private async refreshLocalSourceCheckout(
    source: SourceManifestRecord,
    currentLock: SourceLockRecord,
  ): Promise<boolean> {
    const tempCheckoutPath = `${currentLock.checkoutPath}.${process.pid}.${crypto.randomUUID()}.refresh`;
    const backupPath = `${currentLock.checkoutPath}.${process.pid}.${crypto.randomUUID()}.backup`;

    try {
      if (!(await pathExists(source.locator))) {
        throw new Error(`Local source origin is missing at ${source.locator}.`);
      }

      await copyDirectory(source.locator, tempCheckoutPath);
      const nextHash = await hashDirectory(tempCheckoutPath);
      const checkoutExists = await pathExists(currentLock.checkoutPath);
      const currentHash =
        checkoutExists ? await hashDirectory(currentLock.checkoutPath) : undefined;
      if (checkoutExists && nextHash === currentLock.contentHash && currentHash === nextHash) {
        await removePath(tempCheckoutPath);
        return false;
      }

      if (checkoutExists) {
        await fs.rename(currentLock.checkoutPath, backupPath);
        try {
          await fs.rename(tempCheckoutPath, currentLock.checkoutPath);
        } catch (error) {
          await fs.rename(backupPath, currentLock.checkoutPath).catch(() => {});
          throw error;
        } finally {
          await removePath(backupPath).catch(() => {});
        }
      } else {
        await fs.rename(tempCheckoutPath, currentLock.checkoutPath);
      }

      return true;
    } catch (error) {
      await removePath(tempCheckoutPath).catch(() => {});
      await removePath(backupPath).catch(() => {});
      throw error;
    }
  }

  private async readSourceSnapshot(
    kind: SourceKind,
    checkoutPath: string,
  ): Promise<Partial<SourceLockRecord>> {
    if (kind === "local") {
      return {
        contentHash: await hashDirectory(checkoutPath),
      };
    }

    if (kind === "git") {
      return {
        commitSha: await git(["rev-parse", "HEAD"], { cwd: checkoutPath }),
      };
    }

    if (kind === "clawhub") {
      const origin = await readJsonFile<{
        slug?: string;
        installedVersion?: string;
      }>(path.join(checkoutPath, ".clawhub", "origin.json"), {});
      const contentHash = await hashDirectory(checkoutPath);
      return {
        ...(origin.slug ? { packageSlug: origin.slug } : {}),
        ...(origin.installedVersion ? { resolvedVersion: origin.installedVersion } : {}),
        contentHash,
      };
    }

    return {};
  }
}

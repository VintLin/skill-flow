import path from "node:path";
import type {
  LockFile,
  Result,
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
};

type SourceResolution = {
  kind: SourceKind;
  locator: string;
  displayName: string;
  sourceId: string;
  requestedPath?: string;
  gitLocator?: string;
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
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();

    const resolved = await this.resolveSource(locator, options);

    if (manifest.sources.some((source) => source.id === resolved.sourceId)) {
      return fail({
        code: "SOURCE_EXISTS",
        message: `Workflow group '${formatGroupLabel({ id: resolved.sourceId, locator: resolved.locator, displayName: resolved.displayName })}' is already registered with id '${resolved.sourceId}'.`,
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
        code: resolved.kind === "git" ? "GIT_CLONE_FAILED" : "CLAWHUB_FETCH_FAILED",
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
    );

    if (!snapshot.ok) {
      await removePath(checkoutPath);
      return fail(snapshot.errors, snapshot.warnings);
    }

    manifest.sources.push(snapshot.data.manifest);
    manifest.bindings[resolved.sourceId] = { targets: {} };
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
          message: `Workflow group id '${sourceId}' is not registered.`,
        });
      }

      let changed: boolean;
      try {
        changed = await this.updateSource(source, currentLock);
      } catch (error) {
        return fail({
          code: source.kind === "git" ? "GIT_UPDATE_FAILED" : "CLAWHUB_UPDATE_FAILED",
          message: `Unable to update workflow group id '${sourceId}': ${String(error)}`,
        });
      }

      if (!changed) {
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
        source.kind,
        source.id,
        source.locator,
        source.displayName,
        currentLock.checkoutPath,
        source.requestedPath,
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
          message: `Workflow group id '${sourceId}' is not registered.`,
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
        source.kind,
        source.id,
        source.locator,
        source.displayName,
        currentLock.checkoutPath,
        source.requestedPath,
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
    kind: SourceKind,
    sourceId: string,
    locator: string,
    displayName: string,
    checkoutPath: string,
    requestedPathOrOptions: string | { allowEmptyLeafs?: boolean } | undefined = undefined,
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
      return fail(
        {
          code: requestedPath ? "SOURCE_PATH_NOT_FOUND" : "NO_VALID_LEAFS",
          message: requestedPath
            ? `Source '${displayName}' does not contain a valid skill at '${requestedPath}'.`
            : `Source '${displayName}' has no valid skills.`,
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

  private async resolveSource(
    locator: string,
    options: AddSourceOptions,
  ): Promise<SourceResolution> {
    const trimmed = locator.trim();
    const treeLocator = this.parseGitHubTreeLocator(trimmed);
    if (treeLocator) {
      return {
        kind: "git",
        locator: treeLocator.repoLocator,
        gitLocator: await this.normalizeLocator(treeLocator.repoLocator),
        displayName: deriveDisplayName(treeLocator.repoLocator),
        sourceId: deriveSourceId(treeLocator.repoLocator),
        ...(options.path ?? treeLocator.requestedPath
          ? { requestedPath: options.path ?? treeLocator.requestedPath }
          : {}),
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
            displayName: deriveDisplayName(trimmed),
            sourceId: deriveSourceId(trimmed),
            ...(options.path ? { requestedPath: options.path } : {}),
            clawhubSlug: slug,
            requestedVersion: version,
            versionMode: "pinned",
          }
        : {
          kind: "clawhub",
          locator: trimmed,
          displayName: deriveDisplayName(trimmed),
          sourceId: deriveSourceId(trimmed),
          ...(options.path ? { requestedPath: options.path } : {}),
          clawhubSlug: slug,
          versionMode: "floating",
        };
    }

    return {
      kind: "git",
      locator,
      gitLocator: await this.normalizeLocator(locator),
      displayName: deriveDisplayName(locator),
      sourceId: deriveSourceId(locator),
      ...(options.path ? { requestedPath: options.path } : {}),
    };
  }

  private parseGitHubTreeLocator(
    locator: string,
  ): { repoLocator: string; requestedPath: string } | null {
    try {
      const url = new URL(locator);
      if (url.hostname !== "github.com") {
        return null;
      }

      const parts = url.pathname.split("/").filter(Boolean);
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
    } catch {
      return null;
    }
  }

  private findRequestedLeafs(
    leafs: LockFile["leafInventory"],
    requestedPath?: string,
  ): LockFile["leafInventory"] {
    if (!requestedPath) {
      return leafs;
    }

    const normalizedPath = requestedPath.replace(/^\.\/+/, "").replace(/\/+$/, "");
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

  private async readSourceSnapshot(
    kind: SourceKind,
    checkoutPath: string,
  ): Promise<Partial<SourceLockRecord>> {
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

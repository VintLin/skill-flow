import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  LockFile,
  Result,
  SourceKind,
  SourceLockRecord,
} from "@skill-flow/domain/types";
import {
  copyDirectory,
  ensureDir,
  hashDirectory,
  pathExists,
  readJsonFile,
  removePath,
} from "@skill-flow/integration/utils/fs";
import { installClawHubSkill } from "@skill-flow/integration/utils/clawhub";
import { fetchWithTimeout } from "@skill-flow/integration/utils/fetch-timeout";
import { git, isGitAvailable } from "@skill-flow/integration/utils/git";
import { parseGitHubRepo, parseHostedGitRepo } from "@skill-flow/integration/utils/naming";
import { fail, ok } from "@skill-flow/integration/utils/result";
import { deriveDisplayName, deriveSourceId } from "@skill-flow/integration/utils/source-id";
import type { AddSourceOptions } from "./source-types.js";
import { InventoryService } from "./inventory-service.js";

const execFileAsync = promisify(execFile);

export type SourceCheckoutKind = Exclude<SourceKind, "virtual">;

export type PreparedSourceCheckoutV2 = {
  locator: string;
  originLocator?: string;
  displayName: string;
  requestedPath?: string;
  kind: SourceCheckoutKind;
  sourceId: string;
  checkoutPath: string;
  leafs: LockFile["leafInventory"];
  invalidLeafs: SourceLockRecord["invalidLeafs"];
  commitSha?: string;
  contentHash?: string;
  resolvedVersion?: string;
  packageSlug?: string;
};

export type SourcePreviewCheckoutV2 = {
  locator: string;
  displayName: string;
  requestedPath?: string;
  leafs: LockFile["leafInventory"];
};

export type SourceCheckoutServiceOptions = {
  sourceRoot: string;
  inventoryService?: InventoryService;
};

type SourceResolution = {
  kind: SourceCheckoutKind;
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

export class SourceCheckoutService {
  private readonly inventoryService: InventoryService;

  constructor(private readonly options: SourceCheckoutServiceOptions) {
    this.inventoryService = options.inventoryService ?? new InventoryService();
  }

  async previewSource(
    locator: string,
    options: AddSourceOptions = {},
  ): Promise<Result<SourcePreviewCheckoutV2>> {
    const resolved = await this.resolveSource(locator, options);
    const tempCheckoutPath = path.join(
      this.getSourceRoot(resolved.kind),
      `.preview-${process.pid}-${crypto.randomUUID()}`,
    );
    await ensureDir(this.getSourceRoot(resolved.kind));

    try {
      await this.fetchSource(resolved, tempCheckoutPath);
      const snapshot = await this.buildSnapshot(
        resolved.kind,
        resolved.sourceId,
        resolved.locator,
        resolved.displayName,
        tempCheckoutPath,
        resolved.requestedPath,
        options,
      );
      if (!snapshot.ok) {
        return fail(snapshot.errors, snapshot.warnings);
      }

      return ok({
        locator: resolved.locator,
        displayName: resolved.displayName,
        ...(resolved.requestedPath ? { requestedPath: resolved.requestedPath } : {}),
        leafs: snapshot.data.leafs,
      }, snapshot.warnings);
    } catch (error) {
      return fail({
        code: this.previewFailureCode(resolved.kind),
        message: `Unable to preview source '${resolved.locator}': ${String(error)}`,
      });
    } finally {
      await removePath(tempCheckoutPath).catch(() => {});
    }
  }

  async prepareSourceCheckout(
    locator: string,
    input: {
      options?: AddSourceOptions;
      existingSources?: Array<{ id: string; kind?: SourceKind; locator: string; displayName: string }>;
      checkoutPath?: string;
      suffix?: string;
    } = {},
  ): Promise<Result<PreparedSourceCheckoutV2>> {
    const options = input.options ?? {};
    const resolved = this.resolveUniqueLocalSource(
      await this.resolveSource(locator, options),
      input.existingSources ?? [],
      Boolean(options.sourceIdOverride),
    );
    const checkoutPath = input.checkoutPath ?? path.join(
      this.getSourceRoot(resolved.kind),
      `.${input.suffix ?? "prepare"}-${process.pid}-${crypto.randomUUID()}`,
    );
    await ensureDir(path.dirname(checkoutPath));

    try {
      await this.fetchSource(resolved, checkoutPath);
    } catch (error) {
      await removePath(checkoutPath);
      return fail({
        code: this.fetchFailureCode(resolved.kind),
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

    return ok({
      locator: resolved.locator,
      ...(options.originLocator ? { originLocator: options.originLocator } : {}),
      displayName: resolved.displayName,
      ...(resolved.requestedPath ? { requestedPath: resolved.requestedPath } : {}),
      kind: resolved.kind,
      sourceId: resolved.sourceId,
      checkoutPath,
      leafs: snapshot.data.leafs,
      invalidLeafs: snapshot.data.lock.invalidLeafs,
      ...(snapshot.data.lock.commitSha ? { commitSha: snapshot.data.lock.commitSha } : {}),
      ...(snapshot.data.lock.contentHash ? { contentHash: snapshot.data.lock.contentHash } : {}),
      ...(snapshot.data.lock.resolvedVersion ? { resolvedVersion: snapshot.data.lock.resolvedVersion } : {}),
      ...(snapshot.data.lock.packageSlug ? { packageSlug: snapshot.data.lock.packageSlug } : {}),
    }, snapshot.warnings);
  }

  async buildUpdateSnapshot(input: {
    kind: SourceCheckoutKind;
    sourceId: string;
    locator: string;
    displayName: string;
    checkoutPath: string;
    requestedPath?: string;
  }): Promise<Result<{
    leafs: LockFile["leafInventory"];
    invalidLeafs: SourceLockRecord["invalidLeafs"];
    commitSha?: string;
    contentHash?: string;
    resolvedVersion?: string;
    packageSlug?: string;
  }>> {
    const snapshot = await this.buildSnapshot(
      input.kind,
      input.sourceId,
      input.locator,
      input.displayName,
      input.checkoutPath,
      input.requestedPath,
      {},
      { allowEmptyLeafs: true },
    );
    if (!snapshot.ok) {
      return fail(snapshot.errors, snapshot.warnings);
    }

    return ok({
      leafs: snapshot.data.leafs,
      invalidLeafs: snapshot.data.lock.invalidLeafs,
      ...(snapshot.data.lock.commitSha ? { commitSha: snapshot.data.lock.commitSha } : {}),
      ...(snapshot.data.lock.contentHash ? { contentHash: snapshot.data.lock.contentHash } : {}),
      ...(snapshot.data.lock.resolvedVersion ? { resolvedVersion: snapshot.data.lock.resolvedVersion } : {}),
      ...(snapshot.data.lock.packageSlug ? { packageSlug: snapshot.data.lock.packageSlug } : {}),
    }, snapshot.warnings);
  }

  async normalizeLocator(locator: string): Promise<string> {
    const trimmed = locator.trim();

    if (trimmed.startsWith("git@") || trimmed.startsWith("http")) {
      return trimmed;
    }

    if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
      return `https://github.com/${trimmed}.git`;
    }

    const resolvedPath = path.resolve(this.expandHomePath(trimmed));
    if (await pathExists(resolvedPath)) {
      return resolvedPath;
    }

    return trimmed;
  }

  async resolveSource(
    locator: string,
    options: AddSourceOptions,
  ): Promise<SourceResolution> {
    const trimmed = this.stripLocatorQuotes(locator.trim());
    const fileLocatorPath = this.parseFileLocator(trimmed);
    const resolvedPath = path.resolve(this.expandHomePath(fileLocatorPath ?? trimmed));
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

      return {
        kind: "clawhub",
        locator: trimmed,
        displayName: options.displayNameOverride ?? deriveDisplayName(trimmed),
        sourceId: options.sourceIdOverride ?? deriveSourceId(trimmed),
        ...(options.path ? { requestedPath: options.path } : {}),
        clawhubSlug: slug,
        ...(version ? { requestedVersion: version, versionMode: "pinned" as const } : { versionMode: "floating" as const }),
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

  resolveUniqueLocalSource(
    resolved: SourceResolution,
    existingSources: Array<{ id: string; kind?: SourceKind; locator: string; displayName: string }>,
    preserveSourceId = false,
  ): SourceResolution {
    if (resolved.kind !== "local" || !resolved.localPath) {
      return resolved;
    }

    if (preserveSourceId) {
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

  private getSourceRoot(kind: SourceCheckoutKind): string {
    return path.join(this.options.sourceRoot, kind);
  }

  private previewFailureCode(kind: SourceCheckoutKind): string {
    return kind === "git"
      ? "GIT_PREVIEW_FAILED"
      : kind === "local"
        ? "LOCAL_PREVIEW_FAILED"
        : "CLAWHUB_PREVIEW_FAILED";
  }

  private fetchFailureCode(kind: SourceCheckoutKind): string {
    return kind === "git"
      ? "GIT_CLONE_FAILED"
      : kind === "local"
        ? "LOCAL_IMPORT_FAILED"
        : "CLAWHUB_FETCH_FAILED";
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
      if (!(await isGitAvailable())) {
        await this.fetchGitArchive(source.gitLocator!, checkoutPath);
        return;
      }
      try {
        await git(["clone", "--depth", "1", source.gitLocator!, checkoutPath]);
      } catch {
        const fallbackLocator = this.resolveGitCloneFallbackLocator(source.gitLocator!);
        if (fallbackLocator) {
          try {
            await git(["clone", "--depth", "1", fallbackLocator, checkoutPath]);
            return;
          } catch {
            await removePath(checkoutPath);
            await this.fetchGitArchive(fallbackLocator, checkoutPath);
            return;
          }
        }

        await removePath(checkoutPath);
        await this.fetchGitArchive(source.gitLocator!, checkoutPath);
      }
      return;
    }

    const installed = await installClawHubSkill(
      source.clawhubSlug!,
      source.requestedVersion,
    );
    try {
      await copyDirectory(installed.installedPath, checkoutPath);
    } finally {
      await removePath(installed.workdir);
    }
  }

  private async buildSnapshot(
    kind: SourceCheckoutKind,
    sourceId: string,
    locator: string,
    displayName: string,
    checkoutPath: string,
    requestedPathOrOptions: string | { allowEmptyLeafs?: boolean } | undefined = undefined,
    addOptions: AddSourceOptions = {},
    maybeOptions: { allowEmptyLeafs?: boolean } = {},
  ): Promise<
    Result<{
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
        lock: {
          id: sourceId,
          locator,
          kind,
          displayName,
          originalDisplayName: displayName,
          checkoutPath,
          updatedAt: new Date().toISOString(),
          leafIds: scanned.leafs.map((leaf) => leaf.id),
          invalidLeafs: scanned.invalidLeafs,
          ...sourceMetadata,
          ...(addOptions.originBranch ? { originBranch: addOptions.originBranch } : {}),
          ...(addOptions.importedFromTargets
            ? { importedFromTargets: addOptions.importedFromTargets }
            : {}),
          ...(addOptions.observedTargets
            ? { observedTargets: addOptions.observedTargets }
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

  private async readSourceSnapshot(
    kind: SourceCheckoutKind,
    checkoutPath: string,
  ): Promise<Partial<SourceLockRecord>> {
    if (kind === "local") {
      return {
        contentHash: await hashDirectory(checkoutPath),
      };
    }

    if (kind === "git") {
      if (!(await pathExists(path.join(checkoutPath, ".git")))) {
        return {
          contentHash: await hashDirectory(checkoutPath),
        };
      }
      return {
        commitSha: await git(["rev-parse", "HEAD"], { cwd: checkoutPath }),
      };
    }

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

  private normalizeRequestedPath(requestedPath?: string): string | undefined {
    if (!requestedPath) {
      return undefined;
    }

    const normalized = requestedPath.replace(/^\.\/+/, "").replace(/\/+$/, "");
    return normalized.length > 0 ? normalized : undefined;
  }

  private stripLocatorQuotes(locator: string): string {
    if (locator.length < 2) {
      return locator;
    }

    const first = locator[0];
    const last = locator[locator.length - 1];
    if ((first === "'" && last === "'") || (first === "\"" && last === "\"")) {
      return locator.slice(1, -1).trim();
    }

    return locator;
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

  private expandHomePath(locator: string): string {
    if (locator === "~") {
      return process.env.HOME ?? os.homedir();
    }
    if (locator.startsWith("~/")) {
      return path.join(process.env.HOME ?? os.homedir(), locator.slice(2));
    }
    return locator;
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

  private async fetchGitArchive(
    locator: string,
    checkoutPath: string,
    preferredBranch?: string,
  ): Promise<void> {
    const archiveRepo = this.parseArchiveRepo(locator);
    if (!archiveRepo) {
      throw new Error(`Git is unavailable and '${locator}' is not a supported archive source.`);
    }

    const tempRoot = `${checkoutPath}.${process.pid}.${crypto.randomUUID()}.archive`;
    const archivePath = path.join(tempRoot, "repo.zip");
    const extractPath = path.join(tempRoot, "extract");

    try {
      await ensureDir(tempRoot);

      const branchCandidates = [
        preferredBranch,
        "main",
        "master",
      ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

      let lastError: Error | undefined;
      for (const branch of branchCandidates) {
        try {
          if (archiveRepo.provider === "github") {
            await this.downloadGitHubArchive(
              archiveRepo.owner,
              archiveRepo.repo,
              branch,
              archivePath,
            );
          } else {
            await this.downloadGitLabArchive(
              archiveRepo.host,
              archiveRepo.projectPath,
              branch,
              archivePath,
            );
          }
          await this.extractZipArchive(archivePath, extractPath);
          await this.copyExtractedArchive(
            extractPath,
            checkoutPath,
            `${archiveRepo.repo}-${branch}`,
          );
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          await removePath(archivePath).catch(() => {});
          await removePath(extractPath).catch(() => {});
        }
      }

      throw lastError ?? new Error(`Unable to download archive for '${locator}'.`);
    } finally {
      await removePath(tempRoot).catch(() => {});
    }
  }

  private parseArchiveRepo(
    locator: string,
  ): { provider: "github"; owner: string; repo: string }
    | { provider: "gitlab"; host: string; projectPath: string; repo: string }
    | null {
    const githubRepo = parseGitHubRepo(locator);
    if (githubRepo) {
      return { provider: "github", owner: githubRepo.owner, repo: githubRepo.repo };
    }

    const hostedRepo = parseHostedGitRepo(locator);
    if (!hostedRepo || !this.isGitLabHost(hostedRepo.host)) {
      return null;
    }

    const projectPath = this.extractGitLabProjectPath(locator);
    if (!projectPath) {
      return null;
    }

    return {
      provider: "gitlab",
      host: hostedRepo.host,
      projectPath,
      repo: hostedRepo.repo,
    };
  }

  private isGitLabHost(host: string): boolean {
    const normalizedHost = host.toLowerCase();
    const configuredHost = process.env.GITLAB_HOST?.trim().toLowerCase();
    return (
      normalizedHost === "gitlab.com" ||
      normalizedHost.includes("gitlab") ||
      (configuredHost ? normalizedHost === configuredHost : false)
    );
  }

  private extractGitLabProjectPath(locator: string): string | undefined {
    const trimmed = locator.trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        const parts = url.pathname
          .split("/")
          .filter(Boolean)
          .map((part, index, values) =>
            index === values.length - 1 ? part.replace(/\.git$/i, "") : part
          );
        return parts.length >= 2 ? parts.join("/") : undefined;
      } catch {
        return undefined;
      }
    }

    const sshMatch = trimmed.match(/^git@([^:\s]+):(.+?)(?:\.git)?$/i);
    if (!sshMatch) {
      return undefined;
    }

    const projectPath = sshMatch[2]
      ?.split("/")
      .filter(Boolean)
      .join("/");
    return projectPath || undefined;
  }

  private resolveGitCloneFallbackLocator(locator: string): string | undefined {
    const trimmed = locator.trim();
    if (!trimmed.startsWith("git@")) {
      return undefined;
    }

    const hostedRepo = parseHostedGitRepo(trimmed);
    if (!hostedRepo || !this.isGitLabHost(hostedRepo.host)) {
      return undefined;
    }

    const projectPath = this.extractGitLabProjectPath(trimmed);
    if (!projectPath) {
      return undefined;
    }

    return `https://${hostedRepo.host}/${projectPath}.git`;
  }

  private async downloadGitHubArchive(
    owner: string,
    repo: string,
    branch: string,
    archivePath: string,
  ): Promise<void> {
    const response = await fetchWithTimeout(
      `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`,
      {},
      {
        timeoutMessage: `GitHub archive download timed out for '${owner}/${repo}' branch '${branch}'.`,
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub archive download failed with status ${response.status} for branch '${branch}'.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(archivePath, buffer);
  }

  private async downloadGitLabArchive(
    host: string,
    projectPath: string,
    branch: string,
    archivePath: string,
  ): Promise<void> {
    const response = await fetchWithTimeout(
      `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}/repository/archive.zip?sha=${encodeURIComponent(branch)}`,
      {
        headers: {
          ...(process.env.GITLAB_TOKEN
            ? { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN }
            : {}),
        },
      },
      {
        timeoutMessage: `GitLab archive download timed out for '${host}/${projectPath}' branch '${branch}'.`,
      },
    );
    if (!response.ok) {
      throw new Error(`GitLab archive download failed with status ${response.status} for branch '${branch}'.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(archivePath, buffer);
  }

  private async extractZipArchive(archivePath: string, extractPath: string): Promise<void> {
    await ensureDir(extractPath);
    const command =
      process.platform === "darwin"
        ? { file: "ditto", args: ["-x", "-k", archivePath, extractPath] }
        : { file: "unzip", args: ["-q", archivePath, "-d", extractPath] };
    await execFileAsync(command.file, command.args, {
      encoding: "utf8",
      env: process.env,
    });
  }

  private async copyExtractedArchive(
    extractPath: string,
    checkoutPath: string,
    expectedArchiveRootName?: string,
  ): Promise<void> {
    const entries = await fs.readdir(extractPath, { withFileTypes: true });
    const visibleEntries = entries.filter((entry) => entry.name !== "__MACOSX");
    const visibleDirectories = visibleEntries.filter((entry) => entry.isDirectory());
    const visibleFiles = visibleEntries.filter((entry) => !entry.isDirectory());
    const sourcePath =
      visibleDirectories.length === 1 &&
      visibleFiles.length === 0 &&
      expectedArchiveRootName &&
      visibleDirectories[0]?.name === expectedArchiveRootName
        ? path.join(extractPath, visibleDirectories[0]!.name)
        : extractPath;
    await copyDirectory(sourcePath, checkoutPath);
  }
}

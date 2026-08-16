import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ExternalCommandStep,
  ExternalObservedPath,
  ExternalUpstream,
  ExternalVersionProbe,
  LeafRecord,
  LockFile,
  Result,
  SourceLockRecord,
  SourceManifestRecord,
  Warning,
} from "@skill-flow/domain/types";
import { hashDirectory, isPathInside } from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";
import { deriveSourceId } from "@skill-flow/integration/utils/source-id";
import type { StateStore } from "@skill-flow/storage/state-store";
import { InventoryService } from "./inventory-service.js";

const execFileAsync = promisify(execFile);

export type ExternalSourceSnapshot = {
  manifest: SourceManifestRecord;
  lock: SourceLockRecord;
  leafs: LeafRecord[];
  drifted: boolean;
};

export type AdoptExternalSourceOptions = {
  displayName?: string;
};

export type ConfigureExternalSourceOptions = {
  updateSteps?: ExternalCommandStep[];
  versionProbe?: ExternalVersionProbe;
  upstream?: ExternalUpstream;
};

/**
 * The only module allowed to register or refresh files owned by another
 * installer. It deliberately never invokes checkout, deployment, or removal
 * of observed paths.
 */
export class ExternalSourceLifecycle {
  constructor(
    private readonly options: { stateStore: StateStore; inventoryService?: InventoryService },
  ) {}

  private get inventoryService() {
    return this.options.inventoryService ?? new InventoryService();
  }

  async adopt(
    observedPaths: string[],
    options: AdoptExternalSourceOptions = {},
  ): Promise<Result<ExternalSourceSnapshot>> {
    return this.options.stateStore.withMutationLock(async () => {
      const state = await this.options.stateStore.readState();
      const prepared = await this.prepareObservedPaths(observedPaths, state.lockFile);
      if (!prepared.ok) return fail(prepared.errors, prepared.warnings);

      const displayName = options.displayName?.trim() || path.basename(prepared.data[0]!.path);
      const sourceId = deriveSourceId(`external:${displayName}`);
      if (state.manifest.sources.some((source) => source.id === sourceId)) {
        return fail({ code: "SOURCE_EXISTS", message: `Skills group id '${sourceId}' is already registered.` });
      }

      const snapshot = await this.scan(sourceId, displayName, prepared.data);
      if (!snapshot.ok) return fail(snapshot.errors, snapshot.warnings);
      const now = new Date().toISOString();
      const manifest: SourceManifestRecord = {
        id: sourceId,
        kind: "local",
        ownership: "external",
        locator: prepared.data[0]!.path,
        canonicalLocator: prepared.data[0]!.realPath,
        displayName,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        observedPaths: snapshot.data.observedPaths,
      };
      const lock: SourceLockRecord = {
        sourceId,
        canonicalLocator: manifest.canonicalLocator,
        revision: { provider: "local", contentHash: snapshot.data.contentHash, capturedAt: now },
        // Compatibility field only. External flows must use observedPaths.
        localPath: prepared.data[0]!.realPath,
        ownership: "external",
        leafIds: snapshot.data.leafs.map((leaf) => leaf.id),
        contentHash: snapshot.data.contentHash,
        observedPaths: snapshot.data.observedPaths,
        externalStatus: snapshot.data.drifted ? "drifted" : "current",
      };
      await this.options.stateStore.writeState({
        ...state,
        manifest: {
          ...state.manifest,
          sources: [...state.manifest.sources, manifest],
          bindings: {
            ...state.manifest.bindings,
            [sourceId]: { sourceId, selectionMode: "selected", selectedLeafIds: [], enabledTargets: [] },
          },
        },
        lockFile: {
          ...state.lockFile,
          sources: { ...state.lockFile.sources, [sourceId]: lock },
          leafInventory: [...state.lockFile.leafInventory, ...snapshot.data.leafs],
        },
      });
      return ok({ manifest, lock, leafs: snapshot.data.leafs, drifted: snapshot.data.drifted }, snapshot.warnings);
    });
  }

  async refresh(
    sourceId: string,
    options: { forceVersionCheck?: boolean } = {},
  ): Promise<Result<ExternalSourceSnapshot>> {
    return this.options.stateStore.withMutationLock(async () => {
      const state = await this.options.stateStore.readState();
      const manifest = state.manifest.sources.find((source) => source.id === sourceId);
      const lock = state.lockFile.sources[sourceId];
      if (!manifest || !lock) return fail({ code: "SOURCE_NOT_FOUND", message: `Skills group id '${sourceId}' is not registered.` });
      if (manifest.ownership !== "external" || lock.ownership !== "external") {
        return fail({ code: "SOURCE_NOT_EXTERNAL", message: `Skills group '${sourceId}' is managed by Skill Flow.` });
      }
      const prepared = await this.prepareObservedPaths(
        (manifest.observedPaths ?? lock.observedPaths ?? []).map((item) => item.path),
        state.lockFile,
        sourceId,
      );
      if (!prepared.ok) return fail(prepared.errors, prepared.warnings);
      const snapshot = await this.scan(sourceId, manifest.displayName, prepared.data);
      if (!snapshot.ok) return fail(snapshot.errors, snapshot.warnings);
      const now = new Date().toISOString();
      const version = await this.readVersionStatus(manifest, lock, options.forceVersionCheck === true);
      const nextManifest = { ...manifest, updatedAt: now, observedPaths: snapshot.data.observedPaths };
      const nextLock: SourceLockRecord = {
        ...lock,
        canonicalLocator: prepared.data[0]!.realPath,
        localPath: prepared.data[0]!.realPath,
        revision: { provider: "local", contentHash: snapshot.data.contentHash, capturedAt: now },
        leafIds: snapshot.data.leafs.map((leaf) => leaf.id),
        contentHash: snapshot.data.contentHash,
        observedPaths: snapshot.data.observedPaths,
        externalStatus: snapshot.data.drifted ? "drifted" : "current",
        ...(version.installedVersion ? { installedVersion: version.installedVersion } : {}),
        ...(version.upstreamVersion ? { upstreamVersion: version.upstreamVersion } : {}),
        externalVersionStatus: version.status,
        externalVersionCheckedAt: now,
      };
      await this.options.stateStore.writeState({
        ...state,
        manifest: { ...state.manifest, sources: state.manifest.sources.map((source) => source.id === sourceId ? nextManifest : source) },
        lockFile: {
          ...state.lockFile,
          sources: { ...state.lockFile.sources, [sourceId]: nextLock },
          leafInventory: [...state.lockFile.leafInventory.filter((leaf) => leaf.sourceId !== sourceId), ...snapshot.data.leafs],
        },
      });
      return ok({ manifest: nextManifest, lock: nextLock, leafs: snapshot.data.leafs, drifted: snapshot.data.drifted }, [...snapshot.warnings, ...version.warnings]);
    });
  }

  async configure(
    sourceId: string,
    options: ConfigureExternalSourceOptions,
  ): Promise<Result<SourceManifestRecord>> {
    return this.options.stateStore.withMutationLock(async () => {
      const state = await this.options.stateStore.readState();
      const source = state.manifest.sources.find((item) => item.id === sourceId);
      if (!source) return fail({ code: "SOURCE_NOT_FOUND", message: `Skills group id '${sourceId}' is not registered.` });
      if (source.ownership !== "external") return fail({ code: "SOURCE_NOT_EXTERNAL", message: `Skills group '${sourceId}' is managed by Skill Flow.` });
      if (options.updateSteps && !this.validSteps(options.updateSteps)) {
        return fail({ code: "EXTERNAL_UPDATE_CONFIG_INVALID", message: "External update steps require a non-empty executable and string args." });
      }
      if (options.versionProbe && !this.validSteps([options.versionProbe])) {
        return fail({ code: "EXTERNAL_VERSION_PROBE_INVALID", message: "External version probe requires a non-empty executable and string args." });
      }
      if (options.upstream && !/^[^/\s]+\/[^/\s]+$/.test(options.upstream.repository)) {
        return fail({ code: "EXTERNAL_UPSTREAM_INVALID", message: "GitHub upstream must be an owner/repository pair." });
      }
      const next = {
        ...source,
        updatedAt: new Date().toISOString(),
        ...(options.updateSteps !== undefined ? { updateSteps: options.updateSteps.map((step) => ({ ...step, args: [...step.args] })) } : {}),
        ...(options.versionProbe !== undefined ? { versionProbe: { ...options.versionProbe, args: [...options.versionProbe.args] } } : {}),
        ...(options.upstream !== undefined ? { upstream: { ...options.upstream } } : {}),
      };
      await this.options.stateStore.writeState({
        ...state,
        manifest: { ...state.manifest, sources: state.manifest.sources.map((item) => item.id === sourceId ? next : item) },
      });
      return ok(next);
    });
  }

  async update(sourceId: string): Promise<Result<ExternalSourceSnapshot>> {
    const state = await this.options.stateStore.readState();
    const source = state.manifest.sources.find((item) => item.id === sourceId);
    if (!source) return fail({ code: "SOURCE_NOT_FOUND", message: `Skills group id '${sourceId}' is not registered.` });
    if (source.ownership !== "external") return fail({ code: "SOURCE_NOT_EXTERNAL", message: `Skills group '${sourceId}' is managed by Skill Flow.` });
    if (!source.updateSteps?.length) {
      return fail({ code: "EXTERNAL_UPDATE_NOT_CONFIGURED", message: `External source '${sourceId}' has no locally configured update delegate.` });
    }
    for (const [index, step] of source.updateSteps.entries()) {
      try {
        await execFileAsync(step.executable, step.args, {
          ...(step.workingDirectory ? { cwd: step.workingDirectory } : {}),
          env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
          shell: false,
          timeout: 5 * 60 * 1000,
          maxBuffer: 64 * 1024,
        });
      } catch (error) {
        await this.recordUpdateFailure(sourceId, index, error);
        return fail({
          code: "EXTERNAL_UPDATE_FAILED",
          message: `External update step ${index + 1} failed for '${sourceId}'.`,
        });
      }
    }
    const refreshed = await this.refresh(sourceId, { forceVersionCheck: true });
    if (!refreshed.ok) {
      await this.recordUpdateFailure(sourceId, source.updateSteps.length, new Error("Post-update inventory refresh failed."));
    }
    return refreshed;
  }

  private async prepareObservedPaths(
    input: string[],
    lockFile: LockFile,
    refreshingSourceId?: string,
  ): Promise<Result<ExternalObservedPath[]>> {
    if (input.length === 0) return fail({ code: "EXTERNAL_PATH_REQUIRED", message: "At least one external source path is required." });
    const seen = new Set<string>();
    const prepared: ExternalObservedPath[] = [];
    for (const selectedPath of input) {
      if (!path.isAbsolute(selectedPath)) return fail({ code: "EXTERNAL_PATH_NOT_ABSOLUTE", message: `External source path must be absolute: ${selectedPath}` });
      let realPath: string;
      try {
        const stat = await fs.stat(selectedPath);
        if (!stat.isDirectory()) return fail({ code: "EXTERNAL_PATH_NOT_DIRECTORY", message: `External source path is not a directory: ${selectedPath}` });
        realPath = await fs.realpath(selectedPath);
      } catch {
        return fail({ code: "EXTERNAL_PATH_MISSING", message: `External source path does not exist: ${selectedPath}` });
      }
      if (isPathInside(this.options.stateStore.rootPath, realPath)) {
        return fail({ code: "EXTERNAL_PATH_MANAGED", message: `External source path resolves inside Skill Flow state: ${selectedPath}` });
      }
      if (seen.has(realPath) || prepared.some((item) => this.pathsOverlap(item.realPath, realPath))) {
        return fail({ code: "EXTERNAL_PATH_DUPLICATE", message: `External source paths overlap: ${selectedPath}` });
      }
      for (const [sourceId, lock] of Object.entries(lockFile.sources)) {
        if (sourceId === refreshingSourceId || lock.ownership !== "external") continue;
        if ((lock.observedPaths ?? []).some((item) => this.pathsOverlap(item.realPath, realPath))) {
          return fail({ code: "EXTERNAL_PATH_ALREADY_OBSERVED", message: `External source path is already observed by '${sourceId}'.` });
        }
      }
      seen.add(realPath);
      prepared.push({ path: selectedPath, realPath, observedAt: new Date().toISOString() });
    }
    return ok(prepared);
  }

  private async scan(
    sourceId: string,
    displayName: string,
    observedPaths: ExternalObservedPath[],
  ): Promise<Result<{ leafs: LeafRecord[]; observedPaths: ExternalObservedPath[]; contentHash: string; drifted: boolean }>> {
    const warnings: Warning[] = [];
    const leafs: LeafRecord[] = [];
    const names = new Map<string, string>();
    const nextPaths: ExternalObservedPath[] = [];
    for (const [index, observed] of observedPaths.entries()) {
      const scan = await this.inventoryService.scanSource(sourceId, observed.realPath, displayName);
      const contentHash = await hashDirectory(observed.realPath, { symlinkPolicy: "preserve-safe" });
      nextPaths.push({ ...observed, contentHash, observedAt: new Date().toISOString() });
      for (const invalid of scan.invalidLeafs) warnings.push({ code: "INVALID_LEAF", message: `${observed.path}/${invalid.path}: ${invalid.reason}` });
      for (const leaf of scan.leafs) {
        const name = leaf.name ?? leaf.linkName;
        if (names.has(name)) {
          warnings.push({ code: "EXTERNAL_SKILL_COPY_DIVERGED", message: `External skill '${name}' appears at ${names.get(name)} and ${observed.path}.` });
          continue;
        }
        const relativePath = `${index}/${leaf.relativePath}`;
        names.set(name, observed.path);
        leafs.push({ ...leaf, id: `${sourceId}:${relativePath}`, relativePath });
      }
    }
    if (leafs.length === 0) return fail({ code: "NO_VALID_LEAFS", message: "External source has no valid skills." }, warnings);
    const contentHash = nextPaths.map((item) => item.contentHash).join(":");
    return ok({ leafs, observedPaths: nextPaths, contentHash, drifted: warnings.some((warning) => warning.code === "EXTERNAL_SKILL_COPY_DIVERGED") }, warnings);
  }

  private pathsOverlap(left: string, right: string) {
    return left === right || isPathInside(left, right) || isPathInside(right, left);
  }

  private validSteps(steps: ExternalCommandStep[]) {
    return steps.length > 0 && steps.every((step) =>
      step.executable.trim().length > 0 &&
      step.args.every((arg) => typeof arg === "string") &&
      (step.workingDirectory === undefined || path.isAbsolute(step.workingDirectory)),
    );
  }

  private async recordUpdateFailure(sourceId: string, step: number, error: unknown) {
    await this.options.stateStore.withMutationLock(async () => {
      const state = await this.options.stateStore.readState();
      const lock = state.lockFile.sources[sourceId];
      if (!lock || lock.ownership !== "external") return;
      await this.options.stateStore.writeState({
        ...state,
        lockFile: {
          ...state.lockFile,
          sources: {
            ...state.lockFile.sources,
            [sourceId]: {
              ...lock,
              externalStatus: "unknown",
              lastExternalUpdateError: {
                step,
                code: "EXTERNAL_UPDATE_FAILED",
                message: "The configured external command did not complete successfully.",
                at: new Date().toISOString(),
              },
            },
          },
        },
      });
    });
  }

  private async readVersionStatus(
    source: SourceManifestRecord,
    lock: SourceLockRecord,
    forceVersionCheck: boolean,
  ): Promise<{
    status: "up-to-date" | "update-available" | "unavailable";
    installedVersion?: string;
    upstreamVersion?: string;
    warnings: Warning[];
  }> {
    if (!source.versionProbe || !source.upstream) {
      return { status: "unavailable", warnings: [] };
    }
    if (!forceVersionCheck && this.hasFreshVersionStatus(lock)) {
      return {
        status: lock.externalVersionStatus ?? "unavailable",
        ...(lock.installedVersion ? { installedVersion: lock.installedVersion } : {}),
        ...(lock.upstreamVersion ? { upstreamVersion: lock.upstreamVersion } : {}),
        warnings: [],
      };
    }
    try {
      const probe = await execFileAsync(source.versionProbe.executable, source.versionProbe.args, {
        ...(source.versionProbe.workingDirectory ? { cwd: source.versionProbe.workingDirectory } : {}),
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
        shell: false,
        timeout: 30_000,
        maxBuffer: 8 * 1024,
      });
      const installedVersion = this.normalizedSemver(String(probe.stdout));
      const response = await fetch(`https://api.github.com/repos/${source.upstream.repository}/releases?per_page=30`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`GitHub release lookup returned ${response.status}.`);
      const payload = await response.json() as Array<{ tag_name?: unknown; draft?: unknown }>;
      const upstreamVersion = payload
        .filter((release) => release.draft !== true)
        .map((release) => typeof release.tag_name === "string" ? this.normalizedSemver(release.tag_name) : undefined)
        .find((version) => version && (source.upstream?.includePrerelease || !version.includes("-")));
      if (!installedVersion || !upstreamVersion) throw new Error("Installed or upstream version is not valid SemVer.");
      return {
        status: this.compareSemver(installedVersion, upstreamVersion) < 0 ? "update-available" : "up-to-date",
        installedVersion,
        upstreamVersion,
        warnings: [],
      };
    } catch (error) {
      return {
        status: "unavailable",
        warnings: [{ code: "EXTERNAL_VERSION_UNAVAILABLE", message: `Unable to compare external source '${source.id}' versions.` }],
      };
    }
  }

  private hasFreshVersionStatus(lock: SourceLockRecord) {
    if (!lock.externalVersionCheckedAt || !lock.externalVersionStatus) return false;
    const checkedAt = Date.parse(lock.externalVersionCheckedAt);
    return Number.isFinite(checkedAt) && Date.now() - checkedAt < 60 * 60 * 1000;
  }

  private normalizedSemver(value: string): string | undefined {
    const match = value.match(/\bv?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?\b/);
    return match ? `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}` : undefined;
  }

  private compareSemver(left: string, right: string) {
    const parse = (value: string) => {
      const [core, prerelease] = value.split("-", 2);
      return { core: core!.split(".").map(Number), prerelease };
    };
    const leftVersion = parse(left);
    const rightVersion = parse(right);
    for (let index = 0; index < 3; index += 1) {
      const delta = leftVersion.core[index]! - rightVersion.core[index]!;
      if (delta) return Math.sign(delta);
    }
    if (leftVersion.prerelease === rightVersion.prerelease) return 0;
    if (!leftVersion.prerelease) return 1;
    if (!rightVersion.prerelease) return -1;
    const leftIdentifiers = leftVersion.prerelease.split(".");
    const rightIdentifiers = rightVersion.prerelease.split(".");
    for (let index = 0; index < Math.max(leftIdentifiers.length, rightIdentifiers.length); index += 1) {
      const leftIdentifier = leftIdentifiers[index];
      const rightIdentifier = rightIdentifiers[index];
      if (leftIdentifier === rightIdentifier) continue;
      if (leftIdentifier === undefined) return -1;
      if (rightIdentifier === undefined) return 1;
      const leftNumeric = /^\d+$/.test(leftIdentifier);
      const rightNumeric = /^\d+$/.test(rightIdentifier);
      if (leftNumeric && rightNumeric) return Math.sign(Number(leftIdentifier) - Number(rightIdentifier));
      if (leftNumeric) return -1;
      if (rightNumeric) return 1;
      return leftIdentifier < rightIdentifier ? -1 : 1;
    }
    return 0;
  }
}

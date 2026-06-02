import path from "node:path";
import fs from "node:fs/promises";
import type {
  DeploymentTargetId,
  ImportDataCache,
  ImportRecommendationFeed,
  LockFile,
  Manifest,
  RepoMetadataCacheEntry,
  SharedPreferences,
  SourceMetadataCache,
  SourceMetadataCacheEntry,
  SourceKind,
  UnifiedSourceSnapshotCacheEntry,
  VirtualGroupRecord,
  VirtualGroupSkillRef,
  VirtualGroupsState,
} from "@skill-flow/domain/types";
import { normalizeProjectionRecords } from "@skill-flow/domain/projection-compat";
import {
  createEmptyImportDataCache,
  normalizeImportDataCache,
} from "./import-data-cache.js";
import {
  createEmptySharedPreferences,
  normalizeSharedPreferences,
} from "./preferences-store.js";
import { createEmptySourceMetadataCache, normalizeSourceMetadataCache } from "./source-metadata-cache.js";
import { SCHEMA_VERSION, getStateRoot } from "@skill-flow/integration/utils/constants";
import { deriveDisplayName } from "@skill-flow/integration/utils/source-id";
import {
  ensureDir,
  pathExists,
  readJsonFile,
  withFileLock,
  writeJsonFile,
} from "@skill-flow/integration/utils/fs";

export class StateStore {
  private initPromise: Promise<void> | undefined;
  private ioQueue: Promise<void> = Promise.resolve();

  constructor(private readonly stateRoot = getStateRoot()) {}

  get rootPath(): string {
    return this.stateRoot;
  }

  get sourceRoot(): string {
    return this.getSourceRoot("git");
  }

  getSourceRoot(kind: SourceKind): string {
    return path.join(this.stateRoot, "source", kind);
  }

  getSourceCheckoutPath(kind: SourceKind, sourceId: string): string {
    return path.join(this.getSourceRoot(kind), sourceId);
  }

  get catalogRoot(): string {
    return path.join(this.catalogStateRoot, "git");
  }

  get catalogStateRoot(): string {
    return path.join(this.stateRoot, "catalog");
  }

  getCatalogCheckoutPath(sourceId: string): string {
    return path.join(this.catalogRoot, sourceId);
  }

  getCatalogIndexPath(sourceId: string): string {
    return path.join(this.catalogRoot, `${sourceId}.json`);
  }

  get manifestPath(): string {
    return path.join(this.stateRoot, "manifest.json");
  }

  get lockPath(): string {
    return path.join(this.stateRoot, "lock.json");
  }

  get preferencesPath(): string {
    return path.join(this.stateRoot, "preferences.json");
  }

  get virtualGroupsPath(): string {
    return path.join(this.stateRoot, "virtual-groups.json");
  }

  get auditLogPath(): string {
    return path.join(this.stateRoot, "audit.log.jsonl");
  }

  get sourceMetadataPath(): string {
    return path.join(this.catalogStateRoot, "source-metadata.json");
  }

  get importDataPath(): string {
    return path.join(this.catalogStateRoot, "import-data.json");
  }

  get mutationLockPath(): string {
    return path.join(this.stateRoot, ".mutation.lock");
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeState();
    }
    await this.initPromise;
  }

  async readManifest(): Promise<Manifest> {
    return this.withIoLock(async () => {
      await this.init();
      return this.normalizeManifest(await this.readManifestRaw());
    });
  }

  async writeManifest(manifest: Manifest): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.manifestPath, this.normalizeManifest(manifest));
    });
  }

  async readLock(): Promise<LockFile> {
    return this.withIoLock(async () => {
      await this.init();
      return this.normalizeLockFile(await this.readLockRaw());
    });
  }

  async readState(): Promise<{ manifest: Manifest; lockFile: LockFile }> {
    return this.withIoLock(async () => {
      await this.init();
      const manifest = await this.readManifestRaw();
      const lockFile = await this.readLockRaw();
      return this.normalizeState(manifest, lockFile);
    });
  }

  async writeLock(lockFile: LockFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.lockPath, this.serializeLockFile(lockFile));
    });
  }

  async writeState(manifest: Manifest, lockFile: LockFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.manifestPath, this.normalizeManifest(manifest));
      await writeJsonFile(this.lockPath, this.serializeLockFile(lockFile));
    });
  }

  async readPreferences(): Promise<SharedPreferences> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readPreferencesRaw();
    });
  }

  async writePreferences(preferences: SharedPreferences): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(
        this.preferencesPath,
        normalizeSharedPreferences(preferences),
      );
    });
  }

  async readVirtualGroups(): Promise<VirtualGroupsState> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readVirtualGroupsRaw();
    });
  }

  async writeVirtualGroups(virtualGroups: VirtualGroupsState): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.virtualGroupsPath, normalizeVirtualGroupsState(virtualGroups));
    });
  }

  async appendAuditEvent(event: unknown): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await fs.appendFile(this.auditLogPath, `${JSON.stringify(event)}\n`, "utf8");
    });
  }

  async togglePinnedSource(sourceId: string): Promise<SharedPreferences> {
    return this.withIoLock(async () => {
      await this.init();
      const preferences = await this.readPreferencesRaw();
      const pinnedSourceIds = preferences.pinnedSourceIds.includes(sourceId)
        ? preferences.pinnedSourceIds.filter((pinnedSourceId) => pinnedSourceId !== sourceId)
        : [...preferences.pinnedSourceIds, sourceId];
      const nextPreferences = normalizeSharedPreferences({
        ...preferences,
        pinnedSourceIds,
      });
      await writeJsonFile(this.preferencesPath, nextPreferences);
      return nextPreferences;
    });
  }

  async pruneMissingSourceIds(): Promise<SharedPreferences> {
    return this.withIoLock(async () => {
      await this.init();
      const manifest = await this.readManifestRaw();
      const preferences = await this.readPreferencesRaw();
      const existingSourceIds = new Set(manifest.sources.map((source) => source.id));
      const nextPreferences = normalizeSharedPreferences({
        ...preferences,
        pinnedSourceIds: preferences.pinnedSourceIds.filter((sourceId) =>
          existingSourceIds.has(sourceId),
        ),
      });

      if (!hasSameEntries(preferences.pinnedSourceIds, nextPreferences.pinnedSourceIds)) {
        await writeJsonFile(this.preferencesPath, nextPreferences);
      }

      return nextPreferences;
    });
  }

  async readSourceMetadataCache(): Promise<SourceMetadataCache> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readSourceMetadataCacheRaw();
    });
  }

  async readImportDataCache(): Promise<ImportDataCache> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readImportDataCacheRaw();
    });
  }

  async writeImportDataCache(cache: ImportDataCache): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.importDataPath, normalizeImportDataCache(cache));
    });
  }

  async writeImportSourceSnapshotEntry(entry: UnifiedSourceSnapshotCacheEntry): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readImportDataCacheRaw();
      cache.repos[entry.canonicalRepo] = {
        canonicalRepo: entry.canonicalRepo,
        checkedAt: entry.checkedAt,
        expiresAt: entry.expiresAt,
        identity: {
          canonicalRepo: entry.canonicalRepo,
          aliases: entry.data.aliases,
          origins: ["skills"],
        },
        providers: {
          skills: {
            provider: "skills",
            status: "ready",
            checkedAt: entry.checkedAt,
            expiresAt: entry.expiresAt,
            snapshot: entry.data,
          },
        },
        resolved: {
          ...(entry.data.title ? { title: entry.data.title } : {}),
          ...(entry.data.owner.slug ? { author: entry.data.owner.slug } : {}),
          ...(entry.data.description ? { summary: entry.data.description } : {}),
          ...(entry.data.repoUrl ? { githubUrl: entry.data.repoUrl } : {}),
          ...(entry.data.sourceUrl ? { sourceUrl: entry.data.sourceUrl } : {}),
          ...(entry.data.skillCount !== undefined ? { skillCount: entry.data.skillCount } : {}),
          ...(entry.data.totalInstalls !== undefined ? { downloadCount: entry.data.totalInstalls } : {}),
          ...(entry.data.repoStars !== undefined ? { starCount: entry.data.repoStars } : {}),
          fieldSources: {
            ...(entry.data.title ? { title: "skills" } : {}),
            ...(entry.data.owner.slug ? { author: "skills" } : {}),
            ...(entry.data.description ? { summary: "skills" } : {}),
            ...(entry.data.repoUrl ? { githubUrl: "skills" } : {}),
            ...(entry.data.sourceUrl ? { sourceUrl: "skills" } : {}),
            ...(entry.data.skillCount !== undefined ? { skillCount: "skills" } : {}),
            ...(entry.data.totalInstalls !== undefined ? { downloadCount: "skills" } : {}),
            ...(entry.data.repoStars !== undefined ? { starCount: "skills" } : {}),
          },
        },
      } as RepoMetadataCacheEntry;
      await writeJsonFile(this.importDataPath, cache);
    });
  }

  async writeImportSearchSnapshotEntry(
    query: string,
    entry: ImportDataCache["searches"][string],
  ): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readImportDataCacheRaw();
      cache.searches[query] = entry;
      await writeJsonFile(this.importDataPath, cache);
    });
  }

  async writeImportRecommendationFeedEntry(entry: ImportRecommendationFeed): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readImportDataCacheRaw();
      cache.recommendations[entry.id] = entry;
      await writeJsonFile(this.importDataPath, cache);
    });
  }

  async writeSourceMetadataCache(cache: SourceMetadataCache): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(
        this.sourceMetadataPath,
        normalizeSourceMetadataCache(cache),
      );
    });
  }

  async writeSourceMetadataEntry(entry: SourceMetadataCacheEntry): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readSourceMetadataCacheRaw();
      cache[entry.sourceId] = entry;
      await writeJsonFile(this.sourceMetadataPath, cache);
    });
  }

  async pruneSourceMetadataCache(sourceIds: string[]): Promise<SourceMetadataCache> {
    return this.withIoLock(async () => {
      await this.init();
      const cache = await this.readSourceMetadataCacheRaw();
      const allowedSourceIds = new Set(sourceIds);
      const nextCache = Object.fromEntries(
        Object.entries(cache).filter(([sourceId]) => allowedSourceIds.has(sourceId)),
      ) satisfies SourceMetadataCache;

      if (Object.keys(nextCache).length !== Object.keys(cache).length) {
        await writeJsonFile(this.sourceMetadataPath, nextCache);
      }

      return nextCache;
    });
  }

  async withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    await this.init();
    return withFileLock(this.mutationLockPath, task);
  }

  private async initializeState(): Promise<void> {
    await ensureDir(this.getSourceRoot("local"));
    await ensureDir(this.getSourceRoot("git"));
    await ensureDir(this.getSourceRoot("clawhub"));
    await ensureDir(this.catalogStateRoot);
    await ensureDir(this.catalogRoot);

    if (!(await pathExists(this.manifestPath))) {
      await writeJsonFile(this.manifestPath, this.createEmptyManifest());
    }
    if (!(await pathExists(this.lockPath))) {
      await writeJsonFile(this.lockPath, this.serializeLockFile(this.createEmptyLockFile()));
    }
  }

  private readManifestRaw(): Promise<Manifest> {
    return readJsonFile<Manifest>(this.manifestPath, this.createEmptyManifest());
  }

  private readLockRaw(): Promise<LockFile> {
    return readJsonFile<LockFile>(this.lockPath, this.createEmptyLockFile());
  }

  private async readPreferencesRaw(): Promise<SharedPreferences> {
    return normalizeSharedPreferences(
      await readJsonFile<unknown>(
        this.preferencesPath,
        createEmptySharedPreferences(),
      ),
    );
  }

  private async readVirtualGroupsRaw(): Promise<VirtualGroupsState> {
    if (!(await pathExists(this.virtualGroupsPath))) {
      return createEmptyVirtualGroupsState();
    }

    return normalizeVirtualGroupsState(
      await readJsonFile<unknown>(this.virtualGroupsPath, createEmptyVirtualGroupsState()),
    );
  }

  private async readSourceMetadataCacheRaw(): Promise<SourceMetadataCache> {
    return normalizeSourceMetadataCache(
      await readJsonFile<unknown>(
        this.sourceMetadataPath,
        createEmptySourceMetadataCache(),
      ),
    );
  }

  private async readImportDataCacheRaw(): Promise<ImportDataCache> {
    return normalizeImportDataCache(
      await readJsonFile<unknown>(
        this.importDataPath,
        createEmptyImportDataCache(),
      ),
    );
  }

  private normalizeManifest(manifest: Manifest): Manifest {
    return {
      ...manifest,
      sources: manifest.sources.map((source) => ({
        ...source,
        originalDisplayName: source.originalDisplayName ?? source.displayName,
      })),
    };
  }

  private normalizeState(manifest: Manifest, lockFile: LockFile): { manifest: Manifest; lockFile: LockFile } {
    const normalizedManifest = this.normalizeManifest(manifest);
    const normalizedLockFile = this.normalizeLockFile(lockFile);

    const migratedNamesBySourceId = new Map<string, string>();
    for (const source of normalizedManifest.sources) {
      const derivedDisplayName = deriveDisplayName(source.locator).trim();
      const originalMatchesDisplayName = source.originalDisplayName === source.displayName;

      if (
        originalMatchesDisplayName
        && derivedDisplayName.length > 0
        && derivedDisplayName !== source.displayName
        && /[^\x00-\x7F]/.test(source.displayName)
      ) {
        migratedNamesBySourceId.set(source.id, derivedDisplayName);
      }
    }

    if (migratedNamesBySourceId.size === 0) {
      return { manifest: normalizedManifest, lockFile: normalizedLockFile };
    }

    return {
      manifest: {
        ...normalizedManifest,
        sources: normalizedManifest.sources.map((source) => {
          const migratedDisplayName = migratedNamesBySourceId.get(source.id);
          return migratedDisplayName
            ? { ...source, displayName: migratedDisplayName, originalDisplayName: migratedDisplayName }
            : source;
        }),
      },
      lockFile: {
        ...normalizedLockFile,
        sources: normalizedLockFile.sources.map((source) => {
          const migratedDisplayName = migratedNamesBySourceId.get(source.id);
          return migratedDisplayName
            ? { ...source, displayName: migratedDisplayName, originalDisplayName: migratedDisplayName }
            : source;
        }),
      },
    };
  }

  private normalizeLockFile(lockFile: LockFile): LockFile {
    const projections = normalizeProjectionRecords(lockFile);
    const deployments = projections
      .filter((projection) => projection.mode === "managed")
      .map(({ mode: _mode, ...deployment }) => deployment);

    return {
      ...lockFile,
      projections,
      deployments,
      sources: lockFile.sources.map((source) => ({
        ...source,
        originalDisplayName: source.originalDisplayName ?? source.displayName,
      })),
      leafInventory: lockFile.leafInventory.map((leaf) => ({
        ...leaf,
        linkName:
          leaf.linkName ??
          (leaf.relativePath === "."
            ? leaf.name
            : path.basename(leaf.relativePath) || leaf.name),
        metadataWarnings: leaf.metadataWarnings ?? [],
      })),
    };
  }

  private serializeLockFile(lockFile: LockFile): unknown {
    const normalized = this.normalizeLockFile(lockFile);
    return {
      ...normalized,
      sources: normalized.sources.map((source) => {
        const hasBootstrapProjection = (normalized.projections ?? []).some(
          (projection) =>
            projection.mode === "bootstrap-imported" &&
            projection.sourceId === source.id,
        );
        if (source.importedFromTargets?.length && !hasBootstrapProjection) {
          return source;
        }
        const { importedFromTargets: _importedFromTargets, ...compactSource } = source;
        return compactSource;
      }),
      deployments: undefined,
    };
  }

  private createEmptyManifest(): Manifest {
    return {
      schemaVersion: SCHEMA_VERSION,
      sources: [],
      bindings: {},
    };
  }

  private createEmptyLockFile(): LockFile {
    return {
      schemaVersion: SCHEMA_VERSION,
      sources: [],
      leafInventory: [],
      projections: [],
      deployments: [],
    };
  }

  private async withIoLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.ioQueue;
    let release: (() => void) | undefined;
    this.ioQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await task();
    } finally {
      release?.();
    }
  }
}

function hasSameEntries(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function createEmptyVirtualGroupsState(): VirtualGroupsState {
  return {
    schemaVersion: 1,
    groups: {},
  };
}

function normalizeVirtualGroupsState(input: unknown): VirtualGroupsState {
  const groups: Record<string, VirtualGroupRecord> = {};
  const rawGroups = isObjectRecord(input) && isObjectRecord(input.groups) ? input.groups : {};

  for (const [id, group] of Object.entries(rawGroups)) {
    if (!group || typeof group !== "object") {
      continue;
    }

    const record = group as Partial<VirtualGroupRecord>;
    const normalizedId = typeof record.id === "string" && record.id.trim() ? record.id : id;
    groups[normalizedId] = {
      id: normalizedId,
      displayName: typeof record.displayName === "string" ? record.displayName : normalizedId,
      includedSkills: Array.isArray(record.includedSkills)
        ? record.includedSkills
            .filter((skill): skill is VirtualGroupSkillRef =>
              Boolean(skill) &&
              typeof skill.sourceId === "string" &&
              typeof skill.leafId === "string",
            )
            .map((skill) => ({ sourceId: skill.sourceId, leafId: skill.leafId }))
        : [],
      hiddenSourceIds: Array.isArray(record.hiddenSourceIds)
        ? [...new Set(record.hiddenSourceIds.filter((value): value is string => typeof value === "string"))]
        : [],
      restoreSnapshots: normalizeRestoreSnapshots(record.restoreSnapshots),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    };
  }

  return {
    schemaVersion: 1,
    groups,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRestoreSnapshots(
  input: VirtualGroupRecord["restoreSnapshots"] | undefined,
): VirtualGroupRecord["restoreSnapshots"] {
  const snapshots: VirtualGroupRecord["restoreSnapshots"] = {};

  for (const [sourceId, snapshot] of Object.entries(input ?? {})) {
    snapshots[sourceId] = {
      selectedLeafIds: Array.isArray(snapshot?.selectedLeafIds)
        ? snapshot.selectedLeafIds.filter((value): value is string => typeof value === "string")
        : [],
      enabledTargets: Array.isArray(snapshot?.enabledTargets)
        ? snapshot.enabledTargets.filter((value): value is DeploymentTargetId => typeof value === "string")
        : [],
    };
  }

  return snapshots;
}

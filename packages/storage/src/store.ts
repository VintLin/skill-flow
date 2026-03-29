import path from "node:path";
import type {
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
} from "@skill-flow/domain/types";
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
      return this.readManifestRaw();
    });
  }

  async writeManifest(manifest: Manifest): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.manifestPath, manifest);
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
      const lockFile = this.normalizeLockFile(await this.readLockRaw());
      return { manifest, lockFile };
    });
  }

  async writeLock(lockFile: LockFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.lockPath, lockFile);
    });
  }

  async writeState(manifest: Manifest, lockFile: LockFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.manifestPath, manifest);
      await writeJsonFile(this.lockPath, lockFile);
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
      await writeJsonFile(this.lockPath, this.createEmptyLockFile());
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

  private normalizeLockFile(lockFile: LockFile): LockFile {
    return {
      ...lockFile,
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

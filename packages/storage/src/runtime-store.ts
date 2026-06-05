import fs from "node:fs/promises";
import path from "node:path";
import type {
  ImportDataCache,
  ImportRecommendationFeed,
  RepoMetadataCacheEntry,
  SourceKind,
  SourceMetadataCache,
  SourceMetadataCacheEntry,
  UnifiedSourceSnapshotCacheEntry,
} from "@skill-flow/domain/types";
import { getStateRoot } from "@skill-flow/integration/utils/constants";
import {
  ensureDir,
  readJsonFile,
  withFileLock,
  writeJsonFile,
} from "@skill-flow/integration/utils/fs";
import {
  createEmptyImportDataCache,
  normalizeImportDataCache,
} from "./import-data-cache.js";
import {
  createEmptySourceMetadataCache,
  normalizeSourceMetadataCache,
} from "./source-metadata-cache.js";

export class RuntimeStore {
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
      this.initPromise = this.initializeRuntimePaths();
    }
    await this.initPromise;
  }

  async readSourceMetadataCache(): Promise<SourceMetadataCache> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readSourceMetadataCacheRaw();
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

  async appendAuditEvent(event: unknown): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await fs.appendFile(this.auditLogPath, `${JSON.stringify(event)}\n`, "utf8");
    });
  }

  async withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    await this.init();
    return withFileLock(this.mutationLockPath, task);
  }

  private async initializeRuntimePaths(): Promise<void> {
    await Promise.all([
      ensureDir(this.getSourceRoot("local")),
      ensureDir(this.getSourceRoot("git")),
      ensureDir(this.getSourceRoot("clawhub")),
      ensureDir(this.catalogRoot),
    ]);
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

  private async withIoLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.ioQueue;
    let release!: () => void;
    this.ioQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }
}

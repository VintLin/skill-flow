import path from "node:path";
import type {
  ImportPreparationCache,
  ImportPreparationRecord,
} from "@skill-flow/domain/types";
import { getStateRoot } from "@skill-flow/integration/utils/constants";
import {
  ensureDir,
  readJsonFile,
  writeJsonFile,
} from "@skill-flow/integration/utils/fs";
import {
  createEmptyImportPreparationCache,
  normalizeImportPreparationCache,
  pruneImportPreparationCache,
} from "./import-preparation-cache.js";

export class ImportPreparationCacheStore {
  private initPromise: Promise<void> | undefined;
  private ioQueue: Promise<void> = Promise.resolve();

  constructor(private readonly stateRoot = getStateRoot()) {}

  get importPreparationPath(): string {
    return path.join(this.stateRoot, "catalog", "import-preparations.json");
  }

  get importPreparationCheckoutRoot(): string {
    return path.join(this.stateRoot, "catalog", "import-preparations");
  }

  getImportPreparationCheckoutPath(preparationId: string): string {
    return path.join(this.importPreparationCheckoutRoot, preparationId);
  }

  async readImportPreparationCache(): Promise<ImportPreparationCache> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readImportPreparationCacheRaw();
    });
  }

  async writeImportPreparationCache(cache: ImportPreparationCache): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(
        this.importPreparationPath,
        normalizeImportPreparationCache(cache),
      );
    });
  }

  async writeImportPreparationRecord(record: ImportPreparationRecord): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readImportPreparationCacheRaw();
      cache.records[record.id] = record;
      await writeJsonFile(
        this.importPreparationPath,
        normalizeImportPreparationCache(cache),
      );
    });
  }

  async deleteImportPreparationRecord(preparationId: string): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readImportPreparationCacheRaw();
      delete cache.records[preparationId];
      await writeJsonFile(
        this.importPreparationPath,
        normalizeImportPreparationCache(cache),
      );
    });
  }

  async pruneImportPreparationRecords(
    options: { now?: Date; maxRecords?: number } = {},
  ): Promise<ImportPreparationCache> {
    return this.withIoLock(async () => {
      await this.init();
      const pruned = pruneImportPreparationCache(
        await this.readImportPreparationCacheRaw(),
        options,
      );
      await writeJsonFile(this.importPreparationPath, pruned);
      return pruned;
    });
  }

  private async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeCache();
    }
    await this.initPromise;
  }

  private async initializeCache(): Promise<void> {
    await ensureDir(this.importPreparationCheckoutRoot);
    const cache = normalizeImportPreparationCache(
      await readJsonFile(this.importPreparationPath, createEmptyImportPreparationCache()),
    );
    await writeJsonFile(this.importPreparationPath, cache);
  }

  private async readImportPreparationCacheRaw(): Promise<ImportPreparationCache> {
    return normalizeImportPreparationCache(
      await readJsonFile(this.importPreparationPath, createEmptyImportPreparationCache()),
    );
  }

  private withIoLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.ioQueue.then(operation, operation);
    this.ioQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

import path from "node:path";
import type { LockFile, Manifest, SourceKind } from "../domain/types.js";
import { SCHEMA_VERSION, getStateRoot } from "../utils/constants.js";
import {
  ensureDir,
  pathExists,
  readJsonFile,
  withFileLock,
  writeJsonFile,
} from "../utils/fs.js";

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
    return path.join(this.stateRoot, "catalog", "git");
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

  async withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    await this.init();
    return withFileLock(this.mutationLockPath, task);
  }

  private async initializeState(): Promise<void> {
    await ensureDir(this.getSourceRoot("local"));
    await ensureDir(this.getSourceRoot("git"));
    await ensureDir(this.getSourceRoot("clawhub"));
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

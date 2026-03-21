import path from "node:path";
import type { LockFile, Manifest, SourceKind } from "../domain/types.js";
import { SCHEMA_VERSION, getStateRoot } from "../utils/constants.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../utils/fs.js";

export class StateStore {
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

  get manifestPath(): string {
    return path.join(this.stateRoot, "manifest.json");
  }

  get lockPath(): string {
    return path.join(this.stateRoot, "lock.json");
  }

  async init(): Promise<void> {
    await ensureDir(this.getSourceRoot("git"));
    await ensureDir(this.getSourceRoot("clawhub"));
    await ensureDir(this.catalogRoot);
    await this.writeManifest(await this.readManifest());
    await this.writeLock(await this.readLock());
  }

  async readManifest(): Promise<Manifest> {
    return readJsonFile<Manifest>(this.manifestPath, {
      schemaVersion: SCHEMA_VERSION,
      sources: [],
      bindings: {},
    });
  }

  async writeManifest(manifest: Manifest): Promise<void> {
    await writeJsonFile(this.manifestPath, manifest);
  }

  async readLock(): Promise<LockFile> {
    const lockFile = await readJsonFile<LockFile>(this.lockPath, {
      schemaVersion: SCHEMA_VERSION,
      sources: [],
      leafInventory: [],
      deployments: [],
    });

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

  async writeLock(lockFile: LockFile): Promise<void> {
    await writeJsonFile(this.lockPath, lockFile);
  }
}

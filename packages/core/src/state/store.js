import path from "node:path";
import { SCHEMA_VERSION, getStateRoot } from "../utils/constants.js";
import { ensureDir, pathExists, readJsonFile, withFileLock, writeJsonFile, } from "../utils/fs.js";
export class StateStore {
    stateRoot;
    initPromise;
    ioQueue = Promise.resolve();
    constructor(stateRoot = getStateRoot()) {
        this.stateRoot = stateRoot;
    }
    get rootPath() {
        return this.stateRoot;
    }
    get sourceRoot() {
        return this.getSourceRoot("git");
    }
    getSourceRoot(kind) {
        return path.join(this.stateRoot, "source", kind);
    }
    getSourceCheckoutPath(kind, sourceId) {
        return path.join(this.getSourceRoot(kind), sourceId);
    }
    get catalogRoot() {
        return path.join(this.stateRoot, "catalog", "git");
    }
    getCatalogCheckoutPath(sourceId) {
        return path.join(this.catalogRoot, sourceId);
    }
    getCatalogIndexPath(sourceId) {
        return path.join(this.catalogRoot, `${sourceId}.json`);
    }
    get manifestPath() {
        return path.join(this.stateRoot, "manifest.json");
    }
    get lockPath() {
        return path.join(this.stateRoot, "lock.json");
    }
    get mutationLockPath() {
        return path.join(this.stateRoot, ".mutation.lock");
    }
    async init() {
        if (!this.initPromise) {
            this.initPromise = this.initializeState();
        }
        await this.initPromise;
    }
    async readManifest() {
        return this.withIoLock(async () => {
            await this.init();
            return this.readManifestRaw();
        });
    }
    async writeManifest(manifest) {
        await this.withIoLock(async () => {
            await this.init();
            await writeJsonFile(this.manifestPath, manifest);
        });
    }
    async readLock() {
        return this.withIoLock(async () => {
            await this.init();
            return this.normalizeLockFile(await this.readLockRaw());
        });
    }
    async readState() {
        return this.withIoLock(async () => {
            await this.init();
            const manifest = await this.readManifestRaw();
            const lockFile = this.normalizeLockFile(await this.readLockRaw());
            return { manifest, lockFile };
        });
    }
    async writeLock(lockFile) {
        await this.withIoLock(async () => {
            await this.init();
            await writeJsonFile(this.lockPath, lockFile);
        });
    }
    async writeState(manifest, lockFile) {
        await this.withIoLock(async () => {
            await this.init();
            await writeJsonFile(this.manifestPath, manifest);
            await writeJsonFile(this.lockPath, lockFile);
        });
    }
    async withMutationLock(task) {
        await this.init();
        return withFileLock(this.mutationLockPath, task);
    }
    async initializeState() {
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
    readManifestRaw() {
        return readJsonFile(this.manifestPath, this.createEmptyManifest());
    }
    readLockRaw() {
        return readJsonFile(this.lockPath, this.createEmptyLockFile());
    }
    normalizeLockFile(lockFile) {
        return {
            ...lockFile,
            leafInventory: lockFile.leafInventory.map((leaf) => ({
                ...leaf,
                linkName: leaf.linkName ??
                    (leaf.relativePath === "."
                        ? leaf.name
                        : path.basename(leaf.relativePath) || leaf.name),
                metadataWarnings: leaf.metadataWarnings ?? [],
            })),
        };
    }
    createEmptyManifest() {
        return {
            schemaVersion: SCHEMA_VERSION,
            sources: [],
            bindings: {},
        };
    }
    createEmptyLockFile() {
        return {
            schemaVersion: SCHEMA_VERSION,
            sources: [],
            leafInventory: [],
            deployments: [],
        };
    }
    async withIoLock(task) {
        const previous = this.ioQueue;
        let release;
        this.ioQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await task();
        }
        finally {
            release?.();
        }
    }
}
//# sourceMappingURL=store.js.map
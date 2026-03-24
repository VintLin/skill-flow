import type { LockFile, Manifest, SourceKind } from "../domain/types.js";
export declare class StateStore {
    private readonly stateRoot;
    private initPromise;
    private ioQueue;
    constructor(stateRoot?: string);
    get rootPath(): string;
    get sourceRoot(): string;
    getSourceRoot(kind: SourceKind): string;
    getSourceCheckoutPath(kind: SourceKind, sourceId: string): string;
    get catalogRoot(): string;
    getCatalogCheckoutPath(sourceId: string): string;
    getCatalogIndexPath(sourceId: string): string;
    get manifestPath(): string;
    get lockPath(): string;
    get mutationLockPath(): string;
    init(): Promise<void>;
    readManifest(): Promise<Manifest>;
    writeManifest(manifest: Manifest): Promise<void>;
    readLock(): Promise<LockFile>;
    readState(): Promise<{
        manifest: Manifest;
        lockFile: LockFile;
    }>;
    writeLock(lockFile: LockFile): Promise<void>;
    writeState(manifest: Manifest, lockFile: LockFile): Promise<void>;
    withMutationLock<T>(task: () => Promise<T>): Promise<T>;
    private initializeState;
    private readManifestRaw;
    private readLockRaw;
    private normalizeLockFile;
    private createEmptyManifest;
    private createEmptyLockFile;
    private withIoLock;
}

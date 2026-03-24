export declare function pathExists(targetPath: string): Promise<boolean>;
export declare function ensureDir(targetPath: string): Promise<void>;
export declare function readJsonFile<T>(filePath: string, fallback: T): Promise<T>;
export declare function writeJsonFile(filePath: string, value: unknown): Promise<void>;
export declare function withFileLock<T>(lockPath: string, task: () => Promise<T>, options?: {
    pollMs?: number;
    staleMs?: number;
    timeoutMs?: number;
}): Promise<T>;
export declare function removePath(targetPath: string): Promise<void>;
export declare function copyDirectory(sourcePath: string, targetPath: string): Promise<void>;
export declare function createSymlink(sourcePath: string, targetPath: string): Promise<void>;
export declare function isBrokenSymlink(targetPath: string): Promise<boolean>;
export declare function hashDirectory(rootPath: string): Promise<string>;
export declare function slugify(value: string): string;

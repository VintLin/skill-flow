import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
export async function pathExists(targetPath) {
    try {
        await fs.lstat(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
export async function ensureDir(targetPath) {
    await fs.mkdir(targetPath, { recursive: true });
}
export async function readJsonFile(filePath, fallback) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export async function writeJsonFile(filePath, value) {
    await ensureDir(path.dirname(filePath));
    const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
}
export async function withFileLock(lockPath, task, options = {}) {
    const pollMs = options.pollMs ?? 25;
    const staleMs = options.staleMs ?? 5 * 60_000;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const start = Date.now();
    while (true) {
        try {
            await fs.mkdir(lockPath);
            break;
        }
        catch (error) {
            if (!isAlreadyExistsError(error)) {
                throw error;
            }
            const stale = await isLockStale(lockPath, staleMs);
            if (stale) {
                await fs.rm(lockPath, { recursive: true, force: true });
                continue;
            }
            if (Date.now() - start >= timeoutMs) {
                throw new Error(`Timed out waiting for state lock at ${lockPath}`);
            }
            await sleep(pollMs);
        }
    }
    try {
        await fs.writeFile(path.join(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
        return await task();
    }
    finally {
        await fs.rm(lockPath, { recursive: true, force: true });
    }
}
export async function removePath(targetPath) {
    await fs.rm(targetPath, { recursive: true, force: true });
}
export async function copyDirectory(sourcePath, targetPath) {
    await removePath(targetPath);
    await fs.cp(sourcePath, targetPath, { recursive: true, dereference: false });
}
export async function createSymlink(sourcePath, targetPath) {
    await removePath(targetPath);
    await ensureDir(path.dirname(targetPath));
    await fs.symlink(sourcePath, targetPath, "junction");
}
export async function isBrokenSymlink(targetPath) {
    try {
        const stats = await fs.lstat(targetPath);
        if (!stats.isSymbolicLink()) {
            return false;
        }
        const resolved = await fs.readlink(targetPath);
        const absolute = path.resolve(path.dirname(targetPath), resolved);
        return !(await pathExists(absolute));
    }
    catch {
        return false;
    }
}
export async function hashDirectory(rootPath) {
    const hash = crypto.createHash("sha256");
    async function walk(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            if (entry.name === ".git" || entry.name === "node_modules") {
                continue;
            }
            const entryPath = path.join(currentPath, entry.name);
            const relativePath = path.relative(rootPath, entryPath);
            hash.update(relativePath);
            if (entry.isDirectory()) {
                hash.update("dir");
                await walk(entryPath);
            }
            else if (entry.isFile()) {
                hash.update("file");
                hash.update(await fs.readFile(entryPath));
            }
        }
    }
    await walk(rootPath);
    return hash.digest("hex");
}
export function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}
async function isLockStale(lockPath, staleMs) {
    try {
        const stats = await fs.stat(lockPath);
        return Date.now() - stats.mtimeMs > staleMs;
    }
    catch {
        return false;
    }
}
function isAlreadyExistsError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=fs.js.map
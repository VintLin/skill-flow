import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(stripUtf8Bom(raw)) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export type FileLockMetadata = {
  command?: string;
  pid?: number;
  startedAt?: string;
};

type FileLockOptions = {
  pollMs?: number;
  staleMs?: number;
  timeoutMs?: number;
  metadata?: FileLockMetadata;
};

export async function withFileLock<T>(
  lockPath: string,
  task: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const pollMs = options.pollMs ?? 25;
  const staleMs = options.staleMs ?? 5 * 60_000;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const start = Date.now();

  while (true) {
    try {
      await fs.mkdir(lockPath);
      break;
    } catch (error) {
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
    await fs.writeFile(
      path.join(lockPath, "owner.json"),
      `${JSON.stringify({
        ...options.metadata,
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      }, null, 2)}\n`,
      "utf8",
    );
    return await task();
  } finally {
    await fs.rm(lockPath, { recursive: true, force: true });
  }
}

export async function removePath(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

export function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
  await removePath(targetPath);
  await fs.cp(sourcePath, targetPath, { recursive: true, dereference: false });
}

export async function createSymlink(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await removePath(targetPath);
  await ensureDir(path.dirname(targetPath));
  await fs.symlink(sourcePath, targetPath, "junction");
}

export async function isBrokenSymlink(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    if (!stats.isSymbolicLink()) {
      return false;
    }
    const resolved = await fs.readlink(targetPath);
    const absolute = path.resolve(path.dirname(targetPath), resolved);
    return !(await pathExists(absolute));
  } catch {
    return false;
  }
}

export async function hashDirectory(rootPath: string): Promise<string> {
  const hash = crypto.createHash("sha256");

  async function walk(currentPath: string): Promise<void> {
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
      } else if (entry.isFile()) {
        hash.update("file");
        hash.update(await fs.readFile(entryPath));
      }
    }
  }

  await walk(rootPath);
  return hash.digest("hex");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function isLockStale(lockPath: string, staleMs: number) {
  try {
    const stats = await fs.stat(lockPath);
    return Date.now() - stats.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function isAlreadyExistsError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

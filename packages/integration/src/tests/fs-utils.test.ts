import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hashDirectory, withFileLock } from "../utils/fs.js";

describe("hashDirectory", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  test("hashes safe relative symlinks without dereferencing them", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-fs-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "target.md"), "one", "utf8");
    await fs.symlink("target.md", path.join(root, "alias.md"));

    const firstHash = await hashDirectory(root, { symlinkPolicy: "preserve-safe" });
    await fs.writeFile(path.join(root, "target.md"), "two", "utf8");

    await expect(hashDirectory(root, { symlinkPolicy: "preserve-safe" })).resolves.not.toBe(firstHash);
  });

  test("rejects absolute and escaping symlinks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-fs-"));
    roots.push(root);
    await fs.symlink("../outside", path.join(root, "escape"));

    await expect(hashDirectory(root, { symlinkPolicy: "preserve-safe" })).rejects.toThrow("Unsafe symbolic link");
  });

  test("reclaims a recent lock owned by a dead process", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-fs-"));
    roots.push(root);
    const lockPath = path.join(root, ".mutation.lock");
    await fs.mkdir(lockPath);
    await fs.writeFile(
      path.join(lockPath, "owner.json"),
      `${JSON.stringify({ pid: 2_147_483_647, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );

    await expect(withFileLock(
      lockPath,
      async () => "acquired",
      { pollMs: 5, staleMs: 60_000, timeoutMs: 30 },
    )).resolves.toBe("acquired");
  });

  test("does not reclaim a recent lock owned by a live process", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-fs-"));
    roots.push(root);
    const lockPath = path.join(root, ".mutation.lock");
    await fs.mkdir(lockPath);
    await fs.writeFile(
      path.join(lockPath, "owner.json"),
      `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );

    await expect(withFileLock(
      lockPath,
      async () => "unexpected",
      { pollMs: 5, staleMs: 60_000, timeoutMs: 20 },
    )).rejects.toThrow("Timed out waiting for state lock");
  });

  test("does not reclaim a stale lock owned by a live process", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-fs-"));
    roots.push(root);
    const lockPath = path.join(root, ".mutation.lock");
    await fs.mkdir(lockPath);
    await fs.writeFile(
      path.join(lockPath, "owner.json"),
      `${JSON.stringify({ pid: process.pid, acquiredAt: new Date(0).toISOString() })}\n`,
      "utf8",
    );
    await fs.utimes(lockPath, new Date(0), new Date(0));

    await expect(withFileLock(
      lockPath,
      async () => "unexpected",
      { pollMs: 5, staleMs: 1, timeoutMs: 20 },
    )).rejects.toThrow("Timed out waiting for state lock");
  });

  test("treats a permission-denied owner probe as a live process", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-fs-"));
    roots.push(root);
    const lockPath = path.join(root, ".mutation.lock");
    await fs.mkdir(lockPath);
    await fs.writeFile(
      path.join(lockPath, "owner.json"),
      `${JSON.stringify({ pid: 42, acquiredAt: new Date(0).toISOString() })}\n`,
      "utf8",
    );
    await fs.utimes(lockPath, new Date(0), new Date(0));
    const kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("Operation not permitted"), { code: "EPERM" });
    });

    try {
      await expect(withFileLock(
        lockPath,
        async () => "unexpected",
        { pollMs: 5, staleMs: 1, timeoutMs: 20 },
      )).rejects.toThrow("Timed out waiting for state lock");
    } finally {
      kill.mockRestore();
    }
  });
});

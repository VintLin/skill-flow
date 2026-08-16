import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { hashDirectory } from "../utils/fs.js";

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
});

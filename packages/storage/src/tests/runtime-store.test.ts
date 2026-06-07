import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RuntimeStore } from "../runtime-store.js";

let sandboxRoot: string | undefined;

afterEach(async () => {
  if (sandboxRoot) {
    await rm(sandboxRoot, { recursive: true, force: true });
    sandboxRoot = undefined;
  }
});

async function createStore(): Promise<RuntimeStore> {
  sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "skill-flow-runtime-store-"));
  return new RuntimeStore(sandboxRoot);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

describe("RuntimeStore source paths", () => {
  test("uses independent physical directories for each current source kind", async () => {
    const store = await createStore();

    expect(store.sourceRoot).toBe(path.join(store.rootPath, "source"));
    expect(store.getSourceRoot("git")).toBe(path.join(store.rootPath, "source", "git"));
    expect(store.getSourceRoot("local")).toBe(path.join(store.rootPath, "source", "local"));
    expect(store.getSourceRoot("clawhub")).toBe(path.join(store.rootPath, "source", "clawhub"));
    expect(store.getSourceRoot("collection")).toBe(path.join(store.rootPath, "source", "collection"));
    expect(store.getSourceCheckoutPath("git", "repo")).toBe(
      path.join(store.rootPath, "source", "git", "repo"),
    );
  });

  test("initializes current source directories", async () => {
    const store = await createStore();

    await store.init();

    await expect(pathExists(store.getSourceRoot("git"))).resolves.toBe(true);
    await expect(pathExists(store.getSourceRoot("local"))).resolves.toBe(true);
    await expect(pathExists(store.getSourceRoot("clawhub"))).resolves.toBe(true);
    await expect(pathExists(store.getSourceRoot("collection"))).resolves.toBe(true);
  });
});

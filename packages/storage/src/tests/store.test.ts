import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { StateStore } from "../store.js";

describe("StateStore", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-storage-"));
  });

  afterEach(async () => {
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("initializes manifest, lock, and managed directories on first read", async () => {
    const store = new StateStore(stateRoot);

    expect(await store.readManifest()).toEqual({
      schemaVersion: 1,
      sources: [],
      bindings: {},
    });
    expect(await store.readLock()).toEqual({
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      deployments: [],
    });

    await expect(fs.stat(store.getSourceRoot("local"))).resolves.toBeTruthy();
    await expect(fs.stat(store.getSourceRoot("git"))).resolves.toBeTruthy();
    await expect(fs.stat(store.getSourceRoot("clawhub"))).resolves.toBeTruthy();
    await expect(fs.stat(store.catalogRoot)).resolves.toBeTruthy();
  });

  test("backfills legacy lock leaf fields when reading", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    await fs.writeFile(
      store.lockPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sources: [],
          leafInventory: [
            {
              id: "alpha:browse",
              sourceId: "alpha",
              name: "browse",
              title: "Browse",
              description: "Browse things.",
              relativePath: "skills/browse",
              absolutePath: "/tmp/alpha/skills/browse",
              skillFilePath: "/tmp/alpha/skills/browse/SKILL.md",
              contentHash: "hash",
              valid: true,
            },
          ],
          deployments: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const lock = await store.readLock();

    expect(lock.leafInventory[0]?.linkName).toBe("browse");
    expect(lock.leafInventory[0]?.metadataWarnings).toEqual([]);
  });

  test("toggles pinned sources and prunes missing ids against the manifest", async () => {
    const store = new StateStore(stateRoot);
    await store.writeManifest({
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "/tmp/alpha",
          kind: "local",
          displayName: "alpha",
          addedAt: "2026-03-28T00:00:00.000Z",
        },
      ],
      bindings: {},
    });

    expect(await store.togglePinnedSource("alpha")).toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha"],
    });
    expect(await store.togglePinnedSource("beta")).toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "beta"],
    });
    expect(await store.pruneMissingSourceIds()).toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha"],
    });
  });

  test("writes and prunes source metadata and import cache entries", async () => {
    const store = new StateStore(stateRoot);

    await store.writeSourceMetadataEntry({
      sourceId: "alpha",
      status: "unsupported",
      checkedAt: "2026-03-28T00:00:00.000Z",
      expiresAt: "2026-03-29T00:00:00.000Z",
      reasonCode: "provider_not_supported",
    });
    await store.writeSourceMetadataEntry({
      sourceId: "beta",
      status: "unsupported",
      checkedAt: "2026-03-28T00:00:00.000Z",
      expiresAt: "2026-03-29T00:00:00.000Z",
      reasonCode: "provider_not_supported",
    });
    await store.writeImportSearchSnapshotEntry("browse", {
      query: "browse",
      checkedAt: "2026-03-28T00:00:00.000Z",
      expiresAt: "2026-03-29T00:00:00.000Z",
      hits: [],
      groups: [],
    });

    expect(Object.keys(await store.readSourceMetadataCache())).toEqual(["alpha", "beta"]);
    expect(Object.keys((await store.readImportDataCache()).searches)).toEqual(["browse"]);

    expect(await store.pruneSourceMetadataCache(["beta"])).toEqual({
      beta: {
        sourceId: "beta",
        status: "unsupported",
        checkedAt: "2026-03-28T00:00:00.000Z",
        expiresAt: "2026-03-29T00:00:00.000Z",
        reasonCode: "provider_not_supported",
      },
    });
  });
});

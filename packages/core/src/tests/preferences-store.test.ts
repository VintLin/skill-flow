import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { StateStore } from "../state/store.js";
import * as fsUtils from "../utils/fs.js";

describe("shared preferences store", () => {
  const sandboxRoots: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      sandboxRoots.splice(0).map((sandboxRoot) =>
        fs.rm(sandboxRoot, { recursive: true, force: true }),
      ),
    );
  });

  async function createStore() {
    const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-preferences-"));
    sandboxRoots.push(sandboxRoot);
    return new StateStore(path.join(sandboxRoot, "state"));
  }

  test("returns empty shared preferences when the file is missing", async () => {
    const store = await createStore();

    await expect(store.readPreferences()).resolves.toEqual({
      schemaVersion: 1,
      pinnedSourceIds: [],
    });
  });

  test("returns empty shared preferences when the file contains invalid JSON", async () => {
    const store = await createStore();
    await store.init();
    await fs.writeFile(store.preferencesPath, "{not valid json", "utf8");

    await expect(store.readPreferences()).resolves.toEqual({
      schemaVersion: 1,
      pinnedSourceIds: [],
    });
  });

  test("dedupes pinned source ids while preserving the first-seen order", async () => {
    const store = await createStore();

    await store.writePreferences({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "beta", "alpha", "gamma", "beta"],
    });

    await expect(store.readPreferences()).resolves.toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "beta", "gamma"],
    });

    await expect(fs.readFile(store.preferencesPath, "utf8")).resolves.toContain(
      `"pinnedSourceIds": [\n    "alpha",\n    "beta",\n    "gamma"\n  ]`,
    );
  });

  test("prunes pinned source ids that are missing from the manifest", async () => {
    const store = await createStore();

    await store.writeManifest({
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "/tmp/alpha",
          kind: "local",
          displayName: "Alpha",
          addedAt: "2026-03-27T00:00:00.000Z",
        },
        {
          id: "gamma",
          locator: "/tmp/gamma",
          kind: "local",
          displayName: "Gamma",
          addedAt: "2026-03-27T00:00:00.000Z",
        },
      ],
      bindings: {},
    });
    await store.writePreferences({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "beta", "gamma", "beta"],
    });

    await expect(store.pruneMissingSourceIds()).resolves.toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "gamma"],
    });
    await expect(store.readPreferences()).resolves.toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "gamma"],
    });
  });

  test("toggles a pinned source id on and off", async () => {
    const store = await createStore();

    await expect(store.togglePinnedSource("alpha")).resolves.toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha"],
    });
    await expect(store.togglePinnedSource("alpha")).resolves.toEqual({
      schemaVersion: 1,
      pinnedSourceIds: [],
    });
  });

  test("surfaces write failures", async () => {
    const store = await createStore();
    await store.init();

    vi.spyOn(fsUtils, "writeJsonFile").mockRejectedValueOnce(new Error("disk full"));

    await expect(
      store.writePreferences({
        schemaVersion: 1,
        pinnedSourceIds: ["alpha"],
      }),
    ).rejects.toThrow("disk full");
  });
});

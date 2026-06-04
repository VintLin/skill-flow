import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type {
  CollectionsFileV2,
  LockFileV2,
  ManifestFileV2,
  PreferencesFileV2,
} from "@skill-flow/domain/types";
import { StateStoreV2, StateStoreV2Error } from "../state-store-v2.js";

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

describe("StateStoreV2", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-state-store-v2-"));
  });

  afterEach(async () => {
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("init creates V2 authority files with one migrationGeneration", async () => {
    const store = new StateStoreV2(stateRoot);

    await store.init();

    const manifest = await readJsonFile<ManifestFileV2>(store.manifestPath);
    const lockFile = await readJsonFile<LockFileV2>(store.lockPath);
    const preferences = await readJsonFile<PreferencesFileV2>(store.preferencesPath);
    const collections = await readJsonFile<CollectionsFileV2>(store.collectionsPath);

    expect(manifest).toEqual({
      schemaVersion: 2,
      migrationGeneration: manifest.migrationGeneration,
      sources: [],
      bindings: {},
      targets: {},
    });
    expect(lockFile).toEqual({
      schemaVersion: 2,
      migrationGeneration: manifest.migrationGeneration,
      sources: {},
      leafInventory: [],
      projections: [],
    });
    expect(preferences).toEqual({
      schemaVersion: 2,
      migrationGeneration: manifest.migrationGeneration,
      pinnedSourceIds: [],
      projectSourceDrafts: {},
    });
    expect(collections).toEqual({
      schemaVersion: 2,
      migrationGeneration: manifest.migrationGeneration,
      collections: {},
    });
    expect(manifest.migrationGeneration).toMatch(/^mg_/);
  });

  test("readState returns V2 structures without projecting to V1", async () => {
    const store = new StateStoreV2(stateRoot);
    const migrationGeneration = "mg_runtime_read";
    const manifest: ManifestFileV2 = {
      schemaVersion: 2,
      migrationGeneration,
      sources: [
        {
          id: "source-alpha",
          kind: "git",
          locator: "https://github.com/acme/alpha.git",
          canonicalLocator: "github:acme/alpha",
          displayName: "Alpha",
          enabled: true,
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
      bindings: {
        "source-alpha": {
          sourceId: "source-alpha",
          selectionMode: "selected",
          selectedLeafIds: ["source-alpha:skills/build"],
          enabledTargets: ["codex"],
        },
      },
      targets: {
        codex: {
          target: "codex",
          leafIds: ["source-alpha:skills/build"],
        },
      },
    };
    const lockFile: LockFileV2 = {
      schemaVersion: 2,
      migrationGeneration,
      sources: {
        "source-alpha": {
          sourceId: "source-alpha",
          canonicalLocator: "github:acme/alpha",
          revision: {
            provider: "git",
            commit: "abc123",
            capturedAt: "2026-06-04T00:00:00.000Z",
          },
          localPath: "/tmp/alpha",
          leafIds: ["source-alpha:skills/build"],
        },
      },
      leafInventory: [
        {
          id: "source-alpha:skills/build",
          sourceId: "source-alpha",
          relativePath: "skills/build",
          skillFilePath: "/tmp/alpha/skills/build/SKILL.md",
          displayName: "Build",
          contentHash: "hash",
          selectors: { legacyAliases: ["alpha:build"] },
          valid: true,
          diagnostics: [],
        },
      ],
      projections: [
        {
          target: "codex",
          sourceId: "source-alpha",
          leafId: "source-alpha:skills/build",
          targetPath: "/tmp/codex/build",
          contentHash: "hash",
          status: "active",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    };
    const preferences: PreferencesFileV2 = {
      schemaVersion: 2,
      migrationGeneration,
      pinnedSourceIds: ["source-alpha"],
      projectSourceDrafts: {
        "project:/tmp/demo": {
          "source-alpha": {
            sourceId: "source-alpha",
            selectedLeafIds: ["source-alpha:skills/build"],
            enabledTargets: ["codex"],
            updatedAt: "2026-06-04T00:00:00.000Z",
          },
        },
      },
    };
    const collections: CollectionsFileV2 = {
      schemaVersion: 2,
      migrationGeneration,
      collections: {},
    };
    await writeJsonFile(store.manifestPath, manifest);
    await writeJsonFile(store.lockPath, lockFile);
    await writeJsonFile(store.preferencesPath, preferences);
    await writeJsonFile(store.collectionsPath, collections);

    const state = await store.readState();

    expect(state).toEqual({ manifest, lockFile, preferences, collections });
    expect(Array.isArray(state.lockFile.sources)).toBe(false);
    expect("deployments" in state.lockFile).toBe(false);
  });

  test("V1 manifest causes STATE_MIGRATION_REQUIRED", async () => {
    const store = new StateStoreV2(stateRoot);
    await writeJsonFile(store.manifestPath, {
      schemaVersion: 1,
      sources: [],
      bindings: {},
    });

    await expect(store.readState()).rejects.toMatchObject({
      code: "STATE_MIGRATION_REQUIRED",
      reasonCode: "STATE_MIGRATION_REQUIRED",
      path: store.manifestPath,
      details: {
        command: "skill-flow migrate-state --to v2",
      },
    });
  });

  test("unsupported schema causes STATE_SCHEMA_UNSUPPORTED", async () => {
    const store = new StateStoreV2(stateRoot);
    await writeJsonFile(store.manifestPath, {
      schemaVersion: 3,
      migrationGeneration: "mg_unknown",
      sources: [],
      bindings: {},
      targets: {},
    });

    await expect(store.readState()).rejects.toBeInstanceOf(StateStoreV2Error);
    await expect(store.readState()).rejects.toMatchObject({
      code: "STATE_SCHEMA_UNSUPPORTED",
      reasonCode: "STATE_SCHEMA_UNSUPPORTED",
      path: store.manifestPath,
      details: {
        schemaVersion: 3,
      },
    });
  });

  test("manifest missing required root field causes STATE_MIGRATION_BLOCKED", async () => {
    const store = new StateStoreV2(stateRoot);
    await writeJsonFile(store.manifestPath, {
      schemaVersion: 2,
      migrationGeneration: "mg_missing_bindings",
      sources: [],
      targets: {},
    });

    await expect(store.readManifest()).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      reasonCode: "STATE_MIGRATION_BLOCKED",
      path: store.manifestPath,
      details: {
        fieldPath: "bindings",
      },
    });
  });

  test("writeManifest validates required root fields", async () => {
    const store = new StateStoreV2(stateRoot);

    await expect(
      store.writeManifest({
        schemaVersion: 2,
        migrationGeneration: "mg_write_invalid",
        sources: [],
        targets: {},
      } as unknown as ManifestFileV2),
    ).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      reasonCode: "STATE_MIGRATION_BLOCKED",
      path: store.manifestPath,
      details: {
        fieldPath: "bindings",
      },
    });
  });

  test("readState rejects authority files with mismatched migrationGeneration", async () => {
    const store = new StateStoreV2(stateRoot);
    await writeJsonFile(store.manifestPath, {
      schemaVersion: 2,
      migrationGeneration: "mg_manifest",
      sources: [],
      bindings: {},
      targets: {},
    });
    await writeJsonFile(store.lockPath, {
      schemaVersion: 2,
      migrationGeneration: "mg_manifest",
      sources: {},
      leafInventory: [],
      projections: [],
    });
    await writeJsonFile(store.preferencesPath, {
      schemaVersion: 2,
      migrationGeneration: "mg_preferences",
      pinnedSourceIds: [],
      projectSourceDrafts: {},
    });
    await writeJsonFile(store.collectionsPath, {
      schemaVersion: 2,
      migrationGeneration: "mg_manifest",
      collections: {},
    });

    await expect(store.readState()).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      reasonCode: "STATE_MIGRATION_BLOCKED",
      path: stateRoot,
      details: {
        reasonCode: "STATE_MIGRATION_GENERATION_MISMATCH",
      },
    });
  });

  test("writeState rejects authority files with mismatched migrationGeneration", async () => {
    const store = new StateStoreV2(stateRoot);
    await store.init();

    await expect(
      store.writeState({
        manifest: {
          schemaVersion: 2,
          migrationGeneration: "mg_write_manifest",
          sources: [],
          bindings: {},
          targets: {},
        },
        lockFile: {
          schemaVersion: 2,
          migrationGeneration: "mg_write_lock",
          sources: {},
          leafInventory: [],
          projections: [],
        },
        preferences: {
          schemaVersion: 2,
          migrationGeneration: "mg_write_manifest",
          pinnedSourceIds: [],
          projectSourceDrafts: {},
        },
        collections: {
          schemaVersion: 2,
          migrationGeneration: "mg_write_manifest",
          collections: {},
        },
      }),
    ).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      reasonCode: "STATE_MIGRATION_BLOCKED",
      path: stateRoot,
      details: {
        reasonCode: "STATE_MIGRATION_GENERATION_MISMATCH",
      },
    });
  });
});

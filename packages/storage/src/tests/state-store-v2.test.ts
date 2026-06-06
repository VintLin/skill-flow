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
import type { StateStoreV2State } from "../state-store-v2.js";

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
    });
    expect(manifest).not.toHaveProperty("targets");
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
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
    });
    expect(collections).toEqual({
      schemaVersion: 2,
      migrationGeneration: manifest.migrationGeneration,
      collections: {},
    });
    expect(manifest.migrationGeneration).toMatch(/^mg_/);
  });

  test("allows nested mutation lock calls on the same store instance", async () => {
    const store = new StateStoreV2(stateRoot);
    await store.init();

    const result = await store.withMutationLock(() =>
      store.withMutationLock(async () => "nested-ok")
    );

    expect(result).toBe("nested-ok");
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
          linkName: "build",
          title: "Build",
          description: "Build project artifacts",
          absolutePath: "/tmp/alpha/skills/build",
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
          targetRootPath: "/tmp/codex",
          strategy: "symlink",
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
      selectedProjectScope: { kind: "project", projectId: "project:/tmp/demo" },
      recentProjects: [
        {
          projectId: "project:/tmp/demo",
          title: "Demo",
          lastActivityAt: "2026-06-04T00:00:00.000Z",
          projectPath: "/tmp/demo",
          tools: ["codex"],
        },
      ],
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
      customTargets: [
        {
          id: "custom-target",
          name: "Custom target",
          globalPath: "/tmp/custom/global",
          projectPathTemplate: ".custom",
          strategy: "copy",
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
      agentDisplayOrder: ["codex", "custom-target"],
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
    const cases = [
      {
        name: "manifest",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.manifestPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_bindings",
          sources: [],
        }),
        read: (store: StateStoreV2) => store.readManifest(),
        path: (store: StateStoreV2) => store.manifestPath,
        fieldPath: "bindings",
      },
      {
        name: "lock",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.lockPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_leaf_inventory",
          sources: {},
          projections: [],
        }),
        read: (store: StateStoreV2) => store.readLock(),
        path: (store: StateStoreV2) => store.lockPath,
        fieldPath: "leafInventory",
      },
      {
        name: "preferences",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_project_drafts",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          recentProjects: [],
          customTargets: [],
          agentDisplayOrder: [],
        }),
        read: (store: StateStoreV2) => store.readPreferences(),
        path: (store: StateStoreV2) => store.preferencesPath,
        fieldPath: "projectSourceDrafts",
      },
      {
        name: "preferences selected scope",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_selected_scope",
          pinnedSourceIds: [],
          recentProjects: [],
          projectSourceDrafts: {},
          customTargets: [],
          agentDisplayOrder: [],
        }),
        read: (store: StateStoreV2) => store.readPreferences(),
        path: (store: StateStoreV2) => store.preferencesPath,
        fieldPath: "selectedProjectScope",
      },
      {
        name: "preferences recent projects",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_recent_projects",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          projectSourceDrafts: {},
          customTargets: [],
          agentDisplayOrder: [],
        }),
        read: (store: StateStoreV2) => store.readPreferences(),
        path: (store: StateStoreV2) => store.preferencesPath,
        fieldPath: "recentProjects",
      },
      {
        name: "preferences custom targets",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_custom_targets",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          recentProjects: [],
          projectSourceDrafts: {},
          agentDisplayOrder: [],
        }),
        read: (store: StateStoreV2) => store.readPreferences(),
        path: (store: StateStoreV2) => store.preferencesPath,
        fieldPath: "customTargets",
      },
      {
        name: "preferences agent display order",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_agent_order",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          recentProjects: [],
          projectSourceDrafts: {},
          customTargets: [],
        }),
        read: (store: StateStoreV2) => store.readPreferences(),
        path: (store: StateStoreV2) => store.preferencesPath,
        fieldPath: "agentDisplayOrder",
      },
      {
        name: "collections",
        writeInvalidFile: async (store: StateStoreV2) => writeJsonFile(store.collectionsPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_collections",
        }),
        read: (store: StateStoreV2) => store.readCollections(),
        path: (store: StateStoreV2) => store.collectionsPath,
        fieldPath: "collections",
      },
    ];

    for (const testCase of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-${testCase.name}-missing-root-`));
      try {
        const store = new StateStoreV2(caseRoot);
        await store.init();
        await testCase.writeInvalidFile(store);

        await expect(testCase.read(store), testCase.name).rejects.toMatchObject({
          code: "STATE_MIGRATION_BLOCKED",
          reasonCode: "STATE_MIGRATION_BLOCKED",
          path: testCase.path(store),
          details: {
            fieldPath: testCase.fieldPath,
          },
        });
      } finally {
        await fs.rm(caseRoot, { recursive: true, force: true });
      }
    }
  });

  test("writeManifest validates required root fields", async () => {
    const store = new StateStoreV2(stateRoot);

    await expect(
      store.writeManifest({
        schemaVersion: 2,
        migrationGeneration: "mg_write_invalid",
        sources: [],
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

  test("readLock rejects leaf records missing V2 runtime fields", async () => {
    const cases = ["linkName", "title", "description", "absolutePath"] as const;

    for (const field of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-lock-missing-${field}-`));
      try {
        const store = new StateStoreV2(caseRoot);
        await store.init();
        const lockFile = createValidLockFile();
        delete (lockFile.leafInventory[0] as Record<string, unknown>)[field];
        await writeJsonFile(store.lockPath, lockFile);

        await expect(store.readLock(), field).rejects.toMatchObject({
          code: "STATE_MIGRATION_BLOCKED",
          reasonCode: "STATE_MIGRATION_BLOCKED",
          path: store.lockPath,
          details: {
            fieldPath: `leafInventory[0].${field}`,
          },
        });
      } finally {
        await fs.rm(caseRoot, { recursive: true, force: true });
      }
    }
  });

  test("readLock rejects projections missing strategy or carrying legacy mode", async () => {
    const cases = [
      {
        name: "missing strategy",
        mutate: (lockFile: LockFileV2) => {
          delete (lockFile.projections[0] as Record<string, unknown>).strategy;
        },
        fieldPath: "projections[0].strategy",
      },
      {
        name: "legacy mode",
        mutate: (lockFile: LockFileV2) => {
          (lockFile.projections[0] as Record<string, unknown>).mode = "managed";
        },
        fieldPath: "projections[0].mode",
      },
      {
        name: "invalid target root",
        mutate: (lockFile: LockFileV2) => {
          (lockFile.projections[0] as Record<string, unknown>).targetRootPath = 42;
        },
        fieldPath: "projections[0].targetRootPath",
      },
    ];

    for (const testCase of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-lock-${testCase.name}-`));
      try {
        const store = new StateStoreV2(caseRoot);
        await store.init();
        const lockFile = createValidLockFile();
        testCase.mutate(lockFile);
        await writeJsonFile(store.lockPath, lockFile);

        await expect(store.readLock(), testCase.name).rejects.toMatchObject({
          code: "STATE_MIGRATION_BLOCKED",
          reasonCode: "STATE_MIGRATION_BLOCKED",
          path: store.lockPath,
          details: {
            fieldPath: testCase.fieldPath,
          },
        });
      } finally {
        await fs.rm(caseRoot, { recursive: true, force: true });
      }
    }
  });

  test("readState rejects authority files with mismatched migrationGeneration", async () => {
    const store = new StateStoreV2(stateRoot);
    await writeJsonFile(store.manifestPath, {
      schemaVersion: 2,
      migrationGeneration: "mg_manifest",
      sources: [],
      bindings: {},
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
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
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
          selectedProjectScope: { kind: "global" },
          recentProjects: [],
          projectSourceDrafts: {},
          customTargets: [],
          agentDisplayOrder: [],
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

  test("single authority writes reject mismatched migrationGeneration without changing files", async () => {
    const cases = [
      {
        name: "manifest",
        path: (store: StateStoreV2) => store.manifestPath,
        payload: (state: StateStoreV2State) => ({
          ...state.manifest,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStoreV2, payload: unknown) =>
          store.writeManifest(payload as ManifestFileV2),
      },
      {
        name: "lock",
        path: (store: StateStoreV2) => store.lockPath,
        payload: (state: StateStoreV2State) => ({
          ...state.lockFile,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStoreV2, payload: unknown) =>
          store.writeLock(payload as LockFileV2),
      },
      {
        name: "preferences",
        path: (store: StateStoreV2) => store.preferencesPath,
        payload: (state: StateStoreV2State) => ({
          ...state.preferences,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStoreV2, payload: unknown) =>
          store.writePreferences(payload as PreferencesFileV2),
      },
      {
        name: "collections",
        path: (store: StateStoreV2) => store.collectionsPath,
        payload: (state: StateStoreV2State) => ({
          ...state.collections,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStoreV2, payload: unknown) =>
          store.writeCollections(payload as CollectionsFileV2),
      },
    ];

    for (const testCase of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-${testCase.name}-generation-mismatch-`));
      try {
        const store = new StateStoreV2(caseRoot);
        await store.init();
        const currentState = await store.readState();
        const originalPayload = await readJsonFile<unknown>(testCase.path(store));

        await expect(
          testCase.write(store, testCase.payload(cloneJson(currentState))),
          testCase.name,
        ).rejects.toMatchObject({
          code: "STATE_MIGRATION_BLOCKED",
          reasonCode: "STATE_MIGRATION_BLOCKED",
          path: caseRoot,
          details: {
            reasonCode: "STATE_MIGRATION_GENERATION_MISMATCH",
          },
        });
        await expect(readJsonFile<unknown>(testCase.path(store)), testCase.name)
          .resolves.toEqual(originalPayload);
      } finally {
        await fs.rm(caseRoot, { recursive: true, force: true });
      }
    }
  });
});

function createValidLockFile(): LockFileV2 {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_valid_lock",
    sources: {
      "source-alpha": {
        sourceId: "source-alpha",
        canonicalLocator: "github:acme/alpha",
        revision: {
          provider: "git",
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
        linkName: "build",
        title: "Build",
        description: "Build project artifacts",
        absolutePath: "/tmp/alpha/skills/build",
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
        targetRootPath: "/tmp/codex",
        strategy: "symlink",
        contentHash: "hash",
        status: "active",
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
    ],
  };
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  CollectionsFile,
  LockFile,
  ManifestFile,
  PreferencesFile,
} from "@skill-flow/domain/types";
import { withFileLock } from "@skill-flow/integration/utils/fs";
import { StateStore, StateStoreError } from "../state-store.js";
import type { StateStoreState } from "../state-store.js";

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

describe("StateStore", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-state-store-"));
  });

  afterEach(async () => {
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("init creates V2 authority files with one migrationGeneration", async () => {
    const store = new StateStore(stateRoot);

    await store.init();

    const manifest = await readJsonFile<ManifestFile>(store.manifestPath);
    const lockFile = await readJsonFile<LockFile>(store.lockPath);
    const preferences = await readJsonFile<PreferencesFile>(store.preferencesPath);
    const collections = await readJsonFile<CollectionsFile>(store.collectionsPath);

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

  test("keeps the previous lock file when atomic replacement fails", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    const before = await store.readLock();
    const next: LockFile = {
      ...before,
      projections: [{
        target: "codex",
        sourceId: "source-a",
        leafId: "source-a:skills/one",
        targetPath: "/tmp/one",
        strategy: "symlink",
        contentHash: "hash-one",
        status: "active",
        updatedAt: "2026-08-21T00:00:00.000Z",
      }],
    };
    const realRename = fs.rename.bind(fs);
    const rename = vi.spyOn(fs, "rename")
      .mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
        const [, destination] = args;
        if (String(destination) === store.lockPath) {
          throw new Error("injected atomic replacement failure");
        }
        return realRename(...args);
      });

    await expect(store.writeLock(next)).rejects.toThrow("injected atomic replacement failure");
    rename.mockRestore();

    expect(await store.readLock()).toEqual(before);
    expect((await fs.readdir(stateRoot)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  test("allows nested mutation lock calls on the same store instance", async () => {
    const store = new StateStore(stateRoot);
    await store.init();

    const result = await store.withMutationLock(() =>
      store.withMutationLock(async () => "nested-ok")
    );

    expect(result).toBe("nested-ok");
  });

  test("withMutationLock writes owner metadata", async () => {
    const store = new StateStore(stateRoot);
    await store.init();

    await store.withMutationLock(async () => {
      const metadata = await readJsonFile<Record<string, unknown>>(
        path.join(stateRoot, ".mutation.lock", "owner.json"),
      );

      expect(metadata.pid).toBe(process.pid);
      expect(metadata.startedAt).toEqual(expect.any(String));
      expect(metadata.command).toBe(process.argv.join(" "));
    });
  });

  test("withFileLock metadata cannot spoof owner pid", async () => {
    const lockPath = path.join(stateRoot, ".spoof.lock");

    await withFileLock(lockPath, async () => {
      const metadata = await readJsonFile<Record<string, unknown>>(
        path.join(lockPath, "owner.json"),
      );

      expect(metadata.pid).toBe(process.pid);
    }, {
      metadata: { pid: -1 },
    });
  });

  test("readState returns V2 structures without projecting to V1", async () => {
    const store = new StateStore(stateRoot);
    const migrationGeneration = "mg_runtime_read";
    const manifest: ManifestFile = {
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
    const lockFile: LockFile = {
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
          contentHash: "hash",
          selectors: { aliases: ["alpha:build"] },
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
    const preferences: PreferencesFile = {
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
    const collections: CollectionsFile = {
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

  test("readState accepts BOM-prefixed authority JSON files", async () => {
    const store = new StateStore(stateRoot);
    await store.init();

    for (const filePath of [
      store.manifestPath,
      store.lockPath,
      store.preferencesPath,
      store.collectionsPath,
    ]) {
      const raw = await fs.readFile(filePath, "utf8");
      await fs.writeFile(filePath, `\uFEFF${raw}`, "utf8");
    }

    const state = await store.readState();

    expect(state.manifest.schemaVersion).toBe(2);
    expect(state.lockFile.schemaVersion).toBe(2);
    expect(state.preferences.schemaVersion).toBe(2);
    expect(state.collections.schemaVersion).toBe(2);
  });

  test("malformed BOM-prefixed authority JSON reports BOM detection", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    await fs.writeFile(store.manifestPath, "\uFEFF{", "utf8");

    await expect(store.readState()).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      reasonCode: "STATE_MIGRATION_BLOCKED",
      path: store.manifestPath,
      details: {
        cause: "STATE_FILE_PARSE_FAILED",
        bomDetected: true,
      },
    });
  });

  test("V1 manifest causes STATE_MIGRATION_REQUIRED", async () => {
    const store = new StateStore(stateRoot);
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
    const store = new StateStore(stateRoot);
    await writeJsonFile(store.manifestPath, {
      schemaVersion: 3,
      migrationGeneration: "mg_unknown",
      sources: [],
      bindings: {},
    });

    await expect(store.readState()).rejects.toBeInstanceOf(StateStoreError);
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
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.manifestPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_bindings",
          sources: [],
        }),
        read: (store: StateStore) => store.readManifest(),
        path: (store: StateStore) => store.manifestPath,
        fieldPath: "bindings",
      },
      {
        name: "lock",
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.lockPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_leaf_inventory",
          sources: {},
          projections: [],
        }),
        read: (store: StateStore) => store.readLock(),
        path: (store: StateStore) => store.lockPath,
        fieldPath: "leafInventory",
      },
      {
        name: "preferences",
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_project_drafts",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          recentProjects: [],
          customTargets: [],
          agentDisplayOrder: [],
        }),
        read: (store: StateStore) => store.readPreferences(),
        path: (store: StateStore) => store.preferencesPath,
        fieldPath: "projectSourceDrafts",
      },
      {
        name: "preferences selected scope",
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_selected_scope",
          pinnedSourceIds: [],
          recentProjects: [],
          projectSourceDrafts: {},
          customTargets: [],
          agentDisplayOrder: [],
        }),
        read: (store: StateStore) => store.readPreferences(),
        path: (store: StateStore) => store.preferencesPath,
        fieldPath: "selectedProjectScope",
      },
      {
        name: "preferences recent projects",
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_recent_projects",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          projectSourceDrafts: {},
          customTargets: [],
          agentDisplayOrder: [],
        }),
        read: (store: StateStore) => store.readPreferences(),
        path: (store: StateStore) => store.preferencesPath,
        fieldPath: "recentProjects",
      },
      {
        name: "preferences custom targets",
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_custom_targets",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          recentProjects: [],
          projectSourceDrafts: {},
          agentDisplayOrder: [],
        }),
        read: (store: StateStore) => store.readPreferences(),
        path: (store: StateStore) => store.preferencesPath,
        fieldPath: "customTargets",
      },
      {
        name: "preferences agent display order",
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.preferencesPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_agent_order",
          pinnedSourceIds: [],
          selectedProjectScope: { kind: "global" },
          recentProjects: [],
          projectSourceDrafts: {},
          customTargets: [],
        }),
        read: (store: StateStore) => store.readPreferences(),
        path: (store: StateStore) => store.preferencesPath,
        fieldPath: "agentDisplayOrder",
      },
      {
        name: "collections",
        writeInvalidFile: async (store: StateStore) => writeJsonFile(store.collectionsPath, {
          schemaVersion: 2,
          migrationGeneration: "mg_missing_collections",
        }),
        read: (store: StateStore) => store.readCollections(),
        path: (store: StateStore) => store.collectionsPath,
        fieldPath: "collections",
      },
    ];

    for (const testCase of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-${testCase.name}-missing-root-`));
      try {
        const store = new StateStore(caseRoot);
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

  test("lock invalid leaf valid flag causes STATE_MIGRATION_BLOCKED", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    const currentState = await store.readState();
    const lock = createValidLockFile();
    lock.migrationGeneration = currentState.manifest.migrationGeneration;
    await writeJsonFile(path.join(stateRoot, "lock.json"), {
      ...lock,
      leafInventory: [
        {
          ...lock.leafInventory[0],
          valid: "false",
        },
      ],
    });

    await expect(store.readLock()).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      path: path.join(stateRoot, "lock.json"),
      details: {
        reasonCode: "STATE_AUTHORITY_FIELD_INVALID",
        fieldPath: "leafInventory[0].valid",
        expected: "boolean",
      },
    });
  });

  test("lock invalid projection status causes STATE_MIGRATION_BLOCKED", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    const currentState = await store.readState();
    const lock = createValidLockFile();
    lock.migrationGeneration = currentState.manifest.migrationGeneration;
    await writeJsonFile(path.join(stateRoot, "lock.json"), {
      ...lock,
      projections: [
        {
          ...lock.projections[0],
          status: "PENDING",
        },
      ],
    });

    await expect(store.readLock()).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      path: path.join(stateRoot, "lock.json"),
      details: {
        reasonCode: "STATE_AUTHORITY_FIELD_INVALID",
        fieldPath: "projections[0].status",
        expected: "active | removed | blocked",
      },
    });
  });

  test("writeManifest validates required root fields", async () => {
    const store = new StateStore(stateRoot);

    await expect(
      store.writeManifest({
        schemaVersion: 2,
        migrationGeneration: "mg_write_invalid",
        sources: [],
      } as unknown as ManifestFile),
    ).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      reasonCode: "STATE_MIGRATION_BLOCKED",
      path: store.manifestPath,
      details: {
        fieldPath: "bindings",
      },
    });
  });

  test("rejects malformed external source observations before writing authority", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    const state = await store.readState();

    await expect(store.writeManifest({
      ...state.manifest,
      sources: [{
        id: "external-alpha",
        kind: "local",
        ownership: "external",
        locator: "/tmp/external-alpha",
        canonicalLocator: "/tmp/external-alpha",
        displayName: "External Alpha",
        enabled: true,
        createdAt: "2026-08-16T00:00:00.000Z",
        updatedAt: "2026-08-16T00:00:00.000Z",
        observedPaths: [],
      }],
      bindings: {},
    })).rejects.toMatchObject({
      code: "STATE_MIGRATION_BLOCKED",
      details: { fieldPath: "sources[0].observedPaths" },
    });
  });

  test("readLock rejects leaf records missing V2 runtime fields", async () => {
    const cases = ["linkName", "title", "description", "absolutePath"] as const;

    for (const field of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-lock-missing-${field}-`));
      try {
        const store = new StateStore(caseRoot);
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

  test("normalizes leaf inventory by discarding duplicate displayName", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    const currentState = await store.readState();
    const lockFile = createValidLockFile();
    lockFile.migrationGeneration = currentState.manifest.migrationGeneration;
    (lockFile.leafInventory[0] as Record<string, unknown>).displayName = "Legacy Build";
    await writeJsonFile(store.lockPath, lockFile);

    const state = await store.readState();

    expect(state.lockFile.leafInventory[0]).toMatchObject({ title: "Build" });
    expect(state.lockFile.leafInventory[0]).not.toHaveProperty("displayName");

    await store.writeState(state);
    const persisted = await readJsonFile<LockFile>(store.lockPath);
    expect(persisted.leafInventory[0]).toMatchObject({ title: "Build" });
    expect(persisted.leafInventory[0]).not.toHaveProperty("displayName");
  });

  test("normalizes source locks by discarding summary-only fields", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    const currentState = await store.readState();
    const lockFile = createValidLockFile();
    lockFile.migrationGeneration = currentState.manifest.migrationGeneration;
    Object.assign(lockFile.sources["source-alpha"] as Record<string, unknown>, {
      id: "source-alpha",
      locator: "github:acme/alpha",
      kind: "git",
      displayName: "Alpha",
      originalDisplayName: "Alpha",
      checkoutPath: "/tmp/alpha",
      updatedAt: "2026-06-04T00:00:00.000Z",
      invalidLeafs: [],
      invalidLeafPaths: [],
      commitSha: "abc123",
    });
    await writeJsonFile(store.lockPath, lockFile);

    const state = await store.readState();

    expect(state.lockFile.sources["source-alpha"]).toMatchObject({
      sourceId: "source-alpha",
      canonicalLocator: "github:acme/alpha",
      localPath: "/tmp/alpha",
    });
    for (const field of [
      "id",
      "locator",
      "kind",
      "displayName",
      "originalDisplayName",
      "checkoutPath",
      "updatedAt",
      "invalidLeafs",
      "invalidLeafPaths",
      "commitSha",
    ]) {
      expect(state.lockFile.sources["source-alpha"]).not.toHaveProperty(field);
    }

    await store.writeState(state);
    const persisted = await readJsonFile<LockFile>(store.lockPath);
    for (const field of [
      "id",
      "locator",
      "kind",
      "displayName",
      "originalDisplayName",
      "checkoutPath",
      "updatedAt",
      "invalidLeafs",
      "invalidLeafPaths",
      "commitSha",
    ]) {
      expect(persisted.sources["source-alpha"]).not.toHaveProperty(field);
    }
  });

  test("readLock rejects projections missing strategy or carrying legacy mode", async () => {
    const cases = [
      {
        name: "missing strategy",
        mutate: (lockFile: LockFile) => {
          delete (lockFile.projections[0] as Record<string, unknown>).strategy;
        },
        fieldPath: "projections[0].strategy",
      },
      {
        name: "legacy mode",
        mutate: (lockFile: LockFile) => {
          (lockFile.projections[0] as Record<string, unknown>).mode = "managed";
        },
        fieldPath: "projections[0].mode",
      },
      {
        name: "invalid target root",
        mutate: (lockFile: LockFile) => {
          (lockFile.projections[0] as Record<string, unknown>).targetRootPath = 42;
        },
        fieldPath: "projections[0].targetRootPath",
      },
    ];

    for (const testCase of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-lock-${testCase.name}-`));
      try {
        const store = new StateStore(caseRoot);
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
    const store = new StateStore(stateRoot);
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
    const store = new StateStore(stateRoot);
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
        path: (store: StateStore) => store.manifestPath,
        payload: (state: StateStoreState) => ({
          ...state.manifest,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStore, payload: unknown) =>
          store.writeManifest(payload as ManifestFile),
      },
      {
        name: "lock",
        path: (store: StateStore) => store.lockPath,
        payload: (state: StateStoreState) => ({
          ...state.lockFile,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStore, payload: unknown) =>
          store.writeLock(payload as LockFile),
      },
      {
        name: "preferences",
        path: (store: StateStore) => store.preferencesPath,
        payload: (state: StateStoreState) => ({
          ...state.preferences,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStore, payload: unknown) =>
          store.writePreferences(payload as PreferencesFile),
      },
      {
        name: "collections",
        path: (store: StateStore) => store.collectionsPath,
        payload: (state: StateStoreState) => ({
          ...state.collections,
          migrationGeneration: "mg_single_write_other",
        }),
        write: (store: StateStore, payload: unknown) =>
          store.writeCollections(payload as CollectionsFile),
      },
    ];

    for (const testCase of cases) {
      const caseRoot = await fs.mkdtemp(path.join(os.tmpdir(), `skill-flow-${testCase.name}-generation-mismatch-`));
      try {
        const store = new StateStore(caseRoot);
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

function createValidLockFile(): LockFile {
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
        contentHash: "hash",
        selectors: { aliases: ["alpha:build"] },
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

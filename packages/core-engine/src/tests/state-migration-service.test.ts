import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hashDirectory } from "@skill-flow/integration/utils/fs";
import {
  CURRENT_MIGRATION_MARKER_VERSION,
  inspectStateMigrationStatus,
} from "@skill-flow/storage/state-schema";
import { StateMigrationService } from "../services/state-migration-service.js";

describe("state migration service", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-state-migration-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("dry-run reports rewrite and prune actions without modifying files", async () => {
    await seedV1BasicState();
    const service = new StateMigrationService({ stateRoot });
    const before = await readJsonFile(path.join(stateRoot, "manifest.json"), {});

    const result = await service.migrate({ to: 2, dryRun: true, backup: true });
    const after = await readJsonFile(path.join(stateRoot, "manifest.json"), {});

    expect(result.status).toBe("dry-run");
    expect(result.actions).toContainEqual(expect.objectContaining({ action: "rewrite" }));
    expect(result.actions).toContainEqual(expect.objectContaining({ action: "prune" }));
    expect(after).toEqual(before);
  });

  test("migrates authority files to schemaVersion 2 and creates backup", async () => {
    await seedV1BasicState();
    const service = new StateMigrationService({ stateRoot });

    const result = await service.migrate({ to: 2, backup: true });

    expect(result.status).toBe("migrated");
    if (result.status !== "migrated") {
      throw new Error(`Expected migrated status, received ${result.status}`);
    }
    expect(result.backupPath).toBeTruthy();
    if (!result.backupPath) {
      throw new Error("Expected backupPath");
    }
    expect(await pathExists(result.backupPath)).toBe(true);

    const manifest = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "manifest.json"), {});
    const lock = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "lock.json"), {});
    const preferences = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "preferences.json"), {});
    const collections = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "collections.json"), {});

    expect(Object.keys(manifest).sort()).toEqual([
      "bindings",
      "migrationGeneration",
      "schemaVersion",
      "sources",
    ]);
    expect(Object.keys(lock).sort()).toEqual([
      "leafInventory",
      "migrationGeneration",
      "projections",
      "schemaVersion",
      "sources",
    ]);
    expect(Object.keys(preferences).sort()).toEqual([
      "agentDisplayOrder",
      "customTargets",
      "migrationGeneration",
      "pinnedSourceIds",
      "projectSourceDrafts",
      "recentProjects",
      "schemaVersion",
      "selectedProjectScope",
    ]);
    expect(Object.keys(collections).sort()).toEqual([
      "collections",
      "migrationGeneration",
      "schemaVersion",
    ]);
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.migrationGeneration).toMatch(/^mg_/);
    expect(lock.migrationGeneration).toBe(manifest.migrationGeneration);
    expect(preferences.migrationGeneration).toBe(manifest.migrationGeneration);
    expect(collections.migrationGeneration).toBe(manifest.migrationGeneration);

    const [source] = manifest.sources as Array<Record<string, unknown>>;
    if (!source) {
      throw new Error("Expected migrated source");
    }
    expect(Object.keys(source).sort()).toEqual([
      "canonicalLocator",
      "createdAt",
      "displayName",
      "enabled",
      "id",
      "kind",
      "locator",
      "updatedAt",
    ]);
    expect(source).not.toHaveProperty("originalDisplayName");
    expect(source).not.toHaveProperty("addedAt");
    expect(source).not.toHaveProperty("selectionMode");
    expect(source).not.toHaveProperty("originLocator");
    expect(source).not.toHaveProperty("originRequestedPath");

    expect(lock).not.toHaveProperty("deployments");
    expect(manifest).not.toHaveProperty("targets");
    expect(preferences).not.toHaveProperty("projectDrafts");
    expect(collections).not.toHaveProperty("selectionMode");
    const [leaf] = lock.leafInventory as Array<Record<string, unknown>>;
    if (!leaf) {
      throw new Error("Expected migrated leaf");
    }
    expect(leaf).toMatchObject({
      id: "leaf-a",
      sourceId: "source-a",
      linkName: "review",
      title: "Review",
      description: "",
      absolutePath: path.join(stateRoot, "source", "local", "source-a", "skills", "review"),
    });
    const [projection] = lock.projections as Array<Record<string, unknown>>;
    if (!projection) {
      throw new Error("Expected migrated projection");
    }
    expect(projection).toMatchObject({
      sourceId: "source-a",
      leafId: "leaf-a",
      target: "codex",
      strategy: "symlink",
      targetRootPath: path.join(stateRoot, "targets", "codex"),
    });
    expect(projection).not.toHaveProperty("mode");
    expect(preferences.projectSourceDrafts).toEqual({
      "project:/tmp/demo": {
        "source-a": {
          sourceId: "source-a",
          selectedLeafIds: ["leaf-a"],
          enabledTargets: ["codex"],
          updatedAt: expect.any(String),
        },
      },
    });
    expect(preferences.selectedProjectScope).toEqual({ kind: "project", projectId: "project:/tmp/demo" });
    expect(preferences.recentProjects).toEqual([
      {
        projectId: "project:/tmp/demo",
        title: "Demo",
        lastActivityAt: "2026-06-04T00:00:00.000Z",
        projectPath: "/tmp/demo",
        tools: ["codex"],
      },
    ]);
    expect(preferences.customTargets).toEqual([
      {
        id: "custom-target",
        name: "Custom Target",
        globalPath: path.join(stateRoot, "custom-targets", "global"),
        projectPathTemplate: ".custom-target",
        strategy: "copy",
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
    ]);
    expect(preferences.agentDisplayOrder).toEqual(["codex", "custom-target"]);
  });

  test("migrates legacy github source kind and checkout directory to git", async () => {
    await seedV1BasicState();
    const now = "2026-06-04T00:00:00.000Z";
    const sourceId = "github-source";
    const oldCheckoutRoot = path.join(stateRoot, "source", "github", sourceId);
    const newCheckoutRoot = path.join(stateRoot, "source", "git", sourceId);
    const skillDir = path.join(oldCheckoutRoot, "skills", "review");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Review\n", "utf8");

    const manifestPath = path.join(stateRoot, "manifest.json");
    const lockPath = path.join(stateRoot, "lock.json");
    const legacyManifest = await readJsonFile<Record<string, unknown>>(manifestPath, {});
    const legacyLock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    await writeJsonFile(manifestPath, {
      ...legacyManifest,
      sources: [
        {
          id: sourceId,
          locator: "https://github.com/acme/skills.git",
          kind: "github",
          displayName: "GitHub Source",
          addedAt: now,
        },
      ],
      bindings: {},
    });
    await writeJsonFile(lockPath, {
      ...legacyLock,
      sources: [
        {
          id: sourceId,
          locator: "https://github.com/acme/skills.git",
          kind: "github",
          displayName: "GitHub Source",
          checkoutPath: oldCheckoutRoot,
          updatedAt: now,
          leafIds: [`${sourceId}:skills/review`],
          commitSha: "abc123",
        },
      ],
      leafInventory: [
        {
          id: `${sourceId}:skills/review`,
          sourceId,
          name: "review",
          linkName: "review",
          title: "Review",
          description: "",
          relativePath: "skills/review",
          absolutePath: skillDir,
          skillFilePath: path.join(skillDir, "SKILL.md"),
          contentHash: "hash-review",
          metadataWarnings: [],
        },
      ],
      deployments: [],
    });

    const service = new StateMigrationService({ stateRoot });
    const result = await service.migrate({ to: 2, backup: false });

    expect(result.actions).toContainEqual({
      action: "move",
      path: path.join(stateRoot, "source", "github"),
      to: path.join(stateRoot, "source", "git"),
    });
    expect(await pathExists(oldCheckoutRoot)).toBe(false);
    expect(await pathExists(path.join(newCheckoutRoot, "skills", "review", "SKILL.md"))).toBe(true);
    const manifest = await readJsonFile<Record<string, unknown>>(manifestPath, {});
    const lock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const [source] = manifest.sources as Array<Record<string, unknown>>;
    const migratedLock = (lock.sources as Record<string, Record<string, unknown>>)[sourceId];
    const [leaf] = lock.leafInventory as Array<Record<string, unknown>>;
    expect(source).toMatchObject({
      id: sourceId,
      kind: "git",
      locator: "https://github.com/acme/skills.git",
    });
    expect(migratedLock).toMatchObject({
      sourceId,
      revision: {
        provider: "git",
        commit: "abc123",
        capturedAt: now,
      },
      localPath: newCheckoutRoot,
    });
    expect(leaf).toMatchObject({
      id: `${sourceId}:skills/review`,
      absolutePath: path.join(newCheckoutRoot, "skills", "review"),
      skillFilePath: path.join(newCheckoutRoot, "skills", "review", "SKILL.md"),
    });
  });

  test("normalizes deprecated github source kind in existing v2 authority", async () => {
    const migrationGeneration = "mg_existing";
    const sourceId = "github-source";
    const oldCheckoutRoot = path.join(stateRoot, "source", "github", sourceId);
    const newCheckoutRoot = path.join(stateRoot, "source", "git", sourceId);
    const skillDir = path.join(oldCheckoutRoot, "skills", "review");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Review\n", "utf8");
    await writeJsonFile(path.join(stateRoot, "manifest.json"), {
      schemaVersion: 2,
      migrationGeneration,
      sources: [
        {
          id: sourceId,
          kind: "github",
          locator: "https://github.com/acme/skills.git",
          canonicalLocator: "https://github.com/acme/skills.git",
          displayName: "GitHub Source",
          enabled: true,
          createdAt: "2026-06-07T00:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ],
      bindings: {},
    });
    await writeJsonFile(path.join(stateRoot, "lock.json"), {
      schemaVersion: 2,
      migrationGeneration,
      sources: {
        [sourceId]: {
          sourceId,
          canonicalLocator: "https://github.com/acme/skills.git",
          revision: {
            provider: "github",
            commit: "abc123",
            capturedAt: "2026-06-07T00:00:00.000Z",
          },
          localPath: oldCheckoutRoot,
          leafIds: [`${sourceId}:skills/review`],
        },
      },
      leafInventory: [
        {
          id: `${sourceId}:skills/review`,
          sourceId,
          relativePath: "skills/review",
          linkName: "review",
          title: "Review",
          description: "",
          absolutePath: skillDir,
          skillFilePath: path.join(skillDir, "SKILL.md"),
          contentHash: "hash-review",
          selectors: { aliases: [] },
          valid: true,
          diagnostics: [],
        },
      ],
      projections: [],
    });
    await writeJsonFile(path.join(stateRoot, "preferences.json"), {
      schemaVersion: 2,
      migrationGeneration,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
    });
    await writeJsonFile(path.join(stateRoot, "collections.json"), {
      schemaVersion: 2,
      migrationGeneration,
      collections: {},
    });
    const service = new StateMigrationService({ stateRoot });
    await expect(service.inspect()).resolves.toMatchObject({
      status: "migration-required",
      fromVersion: 2,
    });

    const result = await service.migrate({ to: 2, backup: false });

    expect(result.status).toBe("migrated");
    if (result.status !== "migrated") {
      throw new Error(`Expected migrated status, received ${result.status}`);
    }
    expect(result.migrationGeneration).toBe(migrationGeneration);
    expect(await pathExists(oldCheckoutRoot)).toBe(false);
    expect(await pathExists(path.join(newCheckoutRoot, "skills", "review", "SKILL.md"))).toBe(true);
    const manifest = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "manifest.json"), {});
    const lock = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "lock.json"), {});
    const [source] = manifest.sources as Array<Record<string, unknown>>;
    const migratedLock = (lock.sources as Record<string, Record<string, unknown>>)[sourceId];
    const [leaf] = lock.leafInventory as Array<Record<string, unknown>>;
    expect(source?.kind).toBe("git");
    expect(migratedLock?.revision).toMatchObject({ provider: "git" });
    expect(migratedLock?.localPath).toBe(newCheckoutRoot);
    expect(leaf?.absolutePath).toBe(path.join(newCheckoutRoot, "skills", "review"));
    expect(leaf?.skillFilePath).toBe(path.join(newCheckoutRoot, "skills", "review", "SKILL.md"));
    await expect(service.inspect()).resolves.toMatchObject({
      status: "current",
    });
  });

  test("falls back to legacy deployments when legacy projections has no managed entries", async () => {
    await seedV1BasicState();
    const lockPath = path.join(stateRoot, "lock.json");
    const legacyLock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    await writeJsonFile(lockPath, {
      ...legacyLock,
      projections: [],
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true });

    const lock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    expect(lock).not.toHaveProperty("deployments");
    expect(lock.projections).toEqual([
      expect.objectContaining({
        sourceId: "source-a",
        leafId: "leaf-a",
        target: "codex",
        targetPath: path.join(stateRoot, "targets", "codex", "review"),
        strategy: "symlink",
        targetRootPath: path.join(stateRoot, "targets", "codex"),
        contentHash: "hash-review",
        status: "active",
      }),
    ]);
  });

  test("defaults missing legacy projection status to active", async () => {
    await seedV1BasicState();
    const lockPath = path.join(stateRoot, "lock.json");
    const legacyLock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const deployments = legacyLock.deployments as Array<Record<string, unknown>>;
    delete deployments[0]?.status;
    await writeJsonFile(lockPath, {
      ...legacyLock,
      deployments,
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true });

    const lock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const [projection] = lock.projections as Array<Record<string, unknown>>;
    expect(projection).toMatchObject({
      sourceId: "source-a",
      leafId: "leaf-a",
      status: "active",
    });
  });

  test("normalizes unsupported legacy projection status to active", async () => {
    await seedV1BasicState();
    const lockPath = path.join(stateRoot, "lock.json");
    const legacyLock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const deployments = legacyLock.deployments as Array<Record<string, unknown>>;
    deployments[0] = {
      ...deployments[0],
      status: "PENDING",
    };
    await writeJsonFile(lockPath, {
      ...legacyLock,
      deployments,
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true });

    const lock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const [projection] = lock.projections as Array<Record<string, unknown>>;
    expect(projection).toMatchObject({
      sourceId: "source-a",
      leafId: "leaf-a",
      status: "active",
    });
  });

  test("preserves legacy leaf valid false during migration", async () => {
    await seedV1BasicState();
    const lockPath = path.join(stateRoot, "lock.json");
    const legacyLock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const leafInventory = legacyLock.leafInventory as Array<Record<string, unknown>>;
    leafInventory[0] = {
      ...leafInventory[0],
      valid: false,
    };
    await writeJsonFile(lockPath, {
      ...legacyLock,
      leafInventory,
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true });

    const lock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const [leaf] = lock.leafInventory as Array<Record<string, unknown>>;
    expect(leaf).toMatchObject({
      id: "leaf-a",
      valid: false,
    });
  });

  test("blocks orphaned legacy virtual sources without a virtual group", async () => {
    await seedV1BasicState();
    const manifestPath = path.join(stateRoot, "manifest.json");
    const legacyManifest = await readJsonFile<Record<string, unknown>>(manifestPath, {});
    const sources = legacyManifest.sources as Array<Record<string, unknown>>;
    await writeJsonFile(manifestPath, {
      ...legacyManifest,
      sources: [
        ...sources,
        {
          id: "orphan-virtual",
          locator: "virtual:orphan-virtual",
          kind: "virtual",
          displayName: "Orphan Virtual",
          addedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    });
    const service = new StateMigrationService({ stateRoot });

    await expect(service.migrate({ to: 2, backup: true })).rejects.toMatchObject({
      reasonCode: "STATE_MIGRATION_LEGACY_SOURCE_ORPHANED",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "STATE_MIGRATION_LEGACY_SOURCE_ORPHANED",
          path: expect.stringContaining("manifest.json"),
          details: expect.objectContaining({ sourceId: "orphan-virtual", kind: "virtual" }),
        }),
      ]),
    });
  });

  test("can drop orphaned legacy virtual sources when explicitly tolerated", async () => {
    await seedV1BasicState();
    const manifestPath = path.join(stateRoot, "manifest.json");
    const legacyManifest = await readJsonFile<Record<string, unknown>>(manifestPath, {});
    const sources = legacyManifest.sources as Array<Record<string, unknown>>;
    await writeJsonFile(manifestPath, {
      ...legacyManifest,
      sources: [
        ...sources,
        {
          id: "orphan-virtual",
          locator: "virtual:orphan-virtual",
          kind: "virtual",
          displayName: "Orphan Virtual",
          addedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true, tolerateOrphanSources: true });

    const manifest = await readJsonFile<Record<string, unknown>>(manifestPath, {});
    expect((manifest.sources as Array<Record<string, unknown>>).map((source) => source.id))
      .not.toContain("orphan-virtual");
  });

  test("normalizes quoted legacy leaf metadata during migration", async () => {
    await seedV1BasicState();
    const lockPath = path.join(stateRoot, "lock.json");
    const legacyLock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const leafInventory = legacyLock.leafInventory as Array<Record<string, unknown>>;
    leafInventory[0] = {
      ...leafInventory[0],
      name: "\"keep-codex-fast\"",
      linkName: "keep-codex-fast",
      title: "\"keep-codex-fast\"",
      description: "\"Safe Codex local-state maintenance\"",
      metadataWarnings: ["name should match parent directory name 'keep-codex-fast'"],
    };
    await writeJsonFile(lockPath, {
      ...legacyLock,
      leafInventory,
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: false });

    const lock = await readJsonFile<Record<string, unknown>>(lockPath, {});
    const [leaf] = lock.leafInventory as Array<Record<string, unknown>>;
    if (!leaf) {
      throw new Error("Expected migrated leaf");
    }
    expect(leaf).toMatchObject({
      title: "keep-codex-fast",
      displayName: "keep-codex-fast",
      description: "Safe Codex local-state maintenance",
    });
    expect(leaf.diagnostics).toEqual([]);
  });

  test("prunes rebuildable cache only after authority state is current", async () => {
    await seedV1BasicState();
    await writeJsonFile(path.join(stateRoot, "catalog", "source-metadata.json"), {});
    await writeJsonFile(path.join(stateRoot, "catalog", "import-preparations.json"), {});
    await writeJsonFile(path.join(stateRoot, "catalog", "import-preparations", "record.json"), {});
    await writeJsonFile(path.join(stateRoot, "catalog", "git", "record.json"), {});
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true });

    expect(await pathExists(path.join(stateRoot, "catalog/import-data.json"))).toBe(false);
    expect(await pathExists(path.join(stateRoot, "catalog/source-metadata.json"))).toBe(false);
    expect(await pathExists(path.join(stateRoot, "catalog/import-preparations.json"))).toBe(false);
    expect(await pathExists(path.join(stateRoot, "catalog/import-preparations"))).toBe(false);
    expect(await pathExists(path.join(stateRoot, "catalog/git"))).toBe(false);

    const status = await inspectStateMigrationStatus(stateRoot);
    expect(status.status).toBe("current");
  });

  test("keeps original state and cache when staging validation fails", async () => {
    await seedBrokenVirtualGroupState();
    const beforeManifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
    const beforeCacheExists = await pathExists(path.join(stateRoot, "catalog/import-data.json"));
    const service = new StateMigrationService({ stateRoot });

    await expect(service.migrate({ to: 2, backup: true })).rejects.toThrow(
      "STATE_MIGRATION_VALIDATION_FAILED",
    );

    expect(await readJsonFile(path.join(stateRoot, "manifest.json"), {})).toEqual(beforeManifest);
    expect(await pathExists(path.join(stateRoot, "catalog/import-data.json"))).toBe(beforeCacheExists);
  });

  test("rolls back authority files when authority replace fails", async () => {
    await seedV1BasicState();
    const beforeManifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
    const beforeLock = await readJsonFile(path.join(stateRoot, "lock.json"), {});
    const beforePreferences = await readJsonFile(path.join(stateRoot, "preferences.json"), {});
    const beforeCollections = await readJsonFile(path.join(stateRoot, "collections.json"), {});
    const realCopyFile = fs.copyFile.bind(fs);
    vi.spyOn(fs, "copyFile").mockImplementation(async (...args: Parameters<typeof fs.copyFile>) => {
      const [source, destination] = args;
      if (
        String(source).includes(".skillflow-authority-replace") &&
        String(destination) === path.join(stateRoot, "preferences.json")
      ) {
        throw new Error("simulated authority replace failure");
      }
      return realCopyFile(...args);
    });
    const service = new StateMigrationService({ stateRoot });

    await expect(service.migrate({ to: 2, backup: false })).rejects.toMatchObject({
      reasonCode: "STATE_MIGRATION_VALIDATION_FAILED",
    });

    expect(await readJsonFile(path.join(stateRoot, "manifest.json"), {})).toEqual(beforeManifest);
    expect(await readJsonFile(path.join(stateRoot, "lock.json"), {})).toEqual(beforeLock);
    expect(await readJsonFile(path.join(stateRoot, "preferences.json"), {})).toEqual(beforePreferences);
    expect(await readJsonFile(path.join(stateRoot, "collections.json"), {})).toEqual(beforeCollections);
    await expect(service.inspect()).resolves.toMatchObject({
      status: "migration-required",
    });
  });

  test("rolls back authority and collection source when collection replace fails", async () => {
    await seedLegacyVirtualGroupState({
      groupId: "group-1",
      sourceId: "source-a",
      leafId: "leaf-a",
      skillPath: "skills/frontend-design",
      skillContent: "# Frontend Design\n",
    });
    const existingCollectionFile = path.join(stateRoot, "source", "collection", "legacy", "SKILL.md");
    await fs.mkdir(path.dirname(existingCollectionFile), { recursive: true });
    await fs.writeFile(existingCollectionFile, "# Existing\n", "utf8");
    const beforeManifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
    const realRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      const [source, destination] = args;
      if (
        String(source).includes(".skillflow-collection-replace") &&
        String(destination) === path.join(stateRoot, "source", "collection")
      ) {
        throw new Error("simulated collection replace failure");
      }
      return realRename(...args);
    });
    const service = new StateMigrationService({ stateRoot });

    await expect(service.migrate({ to: 2, backup: false })).rejects.toMatchObject({
      reasonCode: "STATE_MIGRATION_VALIDATION_FAILED",
    });

    expect(await readJsonFile(path.join(stateRoot, "manifest.json"), {})).toEqual(beforeManifest);
    expect(await pathExists(existingCollectionFile)).toBe(true);
    expect(await pathExists(path.join(stateRoot, "source", "collection", "group-1"))).toBe(false);
    await expect(service.inspect()).resolves.toMatchObject({
      status: "migration-required",
    });
  });

  test("reports incomplete when migration marker remains", async () => {
    await seedV1BasicState();
    await writeJsonFile(path.join(stateRoot, ".skillflow-migration.json"), {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      status: "running",
      startedAt: "2026-06-04T00:00:00.000Z",
      stagingRoot: path.join(stateRoot, ".migration-staging-test"),
      diagnostics: [],
    });
    const service = new StateMigrationService({ stateRoot });

    const status = await service.inspect();

    expect(status).toMatchObject({
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
    });
  });

  test("treats leftover marker as current when authority replace completed", async () => {
    await seedV1BasicState();
    const service = new StateMigrationService({ stateRoot });
    await service.migrate({ to: 2, backup: true });
    const manifest = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "manifest.json"), {});
    await writeJsonFile(path.join(stateRoot, ".skillflow-migration.json"), {
      schemaVersion: 2,
      version: CURRENT_MIGRATION_MARKER_VERSION,
      migrationGeneration: manifest.migrationGeneration,
      status: "running",
      startedAt: "2026-06-04T00:00:00.000Z",
      stagingRoot: path.join(stateRoot, ".migration-staging-test"),
      diagnostics: [],
    });

    const status = await service.inspect();
    const result = await service.migrate({ to: 2, backup: true });

    expect(status).toMatchObject({
      status: "current",
      migrationGeneration: manifest.migrationGeneration,
    });
    expect(result).toEqual({
      status: "current",
      stateRoot,
      actions: [],
    });
  });

  test("migrates legacy virtual group refs into materialized collection members", async () => {
    await seedLegacyVirtualGroupState({
      groupId: "group-1",
      sourceId: "source-a",
      leafId: "leaf-a",
      skillPath: "skills/frontend-design",
      skillContent: "# Frontend Design\n",
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true });

    const collections = await readJsonFile<CollectionsJson>(path.join(stateRoot, "collections.json"), {
      collections: {},
    });
    const manifest = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "manifest.json"), {});
    const generation = await readJsonFile<Record<string, unknown>>(
      path.join(stateRoot, "source/collection/group-1/.skillflow-generation.json"),
      {},
    );

    const collection = collections.collections["group-1"];
    if (!collection) {
      throw new Error("Expected group-1 collection");
    }
    expect(collection.materializedSourceId).toBe("group-1");
    expect(generation.migrationGeneration).toBe(manifest.migrationGeneration);
    expect(await pathExists(path.join(stateRoot, "source/collection/group-1/.skillflow-complete"))).toBe(true);
    expect(collection.members[0]).toMatchObject({
      origin: {
        sourceId: "source-a",
        leafId: "leaf-a",
        repoPath: "skills/frontend-design",
      },
      updatePolicy: "frozen",
    });
  });

  test("collection restore selections keep original source leaf ids", async () => {
    await seedLegacyVirtualGroupState({
      groupId: "group-1",
      sourceId: "source-a",
      leafId: "leaf-a",
      skillPath: "skills/frontend-design",
      restoreSelectedLeafIds: ["leaf-a", "source-a:missing-legacy-leaf"],
    });
    const service = new StateMigrationService({ stateRoot });

    await service.migrate({ to: 2, backup: true });

    const collections = await readJsonFile<CollectionsJson>(path.join(stateRoot, "collections.json"), {
      collections: {},
    });
    const collection = collections.collections["group-1"];
    if (!collection) {
      throw new Error("Expected group-1 collection");
    }
    const restoreSelection = collection.restoreSelections["source-a"];
    if (!restoreSelection) {
      throw new Error("Expected source-a restore selection");
    }

    expect(restoreSelection.bestEffort).toBe(true);
    expect(restoreSelection.selectedLeafIds).toContain("leaf-a");
    expect(restoreSelection.enabledTargets).toEqual(["codex"]);
    expect(restoreSelection.selectedLeafIds).not.toContain("group-1:member-1");
    expect(restoreSelection.selectedLeafIds).not.toContain("source-a:missing-legacy-leaf");
    expect(restoreSelection.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RESTORE_SELECTION_LEAF_UNMAPPED",
        details: expect.objectContaining({ legacyLeafId: "source-a:missing-legacy-leaf" }),
      }),
    );
  });

  test("fails when a virtual group member origin leaf is missing", async () => {
    await seedLegacyVirtualGroupState({
      groupId: "group-1",
      sourceId: "source-a",
      leafId: "leaf-a",
      skillPath: "skills/frontend-design",
      includedLeafId: "leaf-missing",
    });
    const service = new StateMigrationService({ stateRoot });

    await expect(service.migrate({ to: 2, backup: true })).rejects.toMatchObject({
      reasonCode: "STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING",
          path: expect.stringContaining("virtual-groups.json"),
          details: expect.objectContaining({ sourceId: "source-a", leafId: "leaf-missing" }),
        }),
      ]),
    });
  });

  test("fails when copied collection member hash differs from v1 lock hash", async () => {
    await seedLegacyVirtualGroupState({
      groupId: "group-1",
      sourceId: "source-a",
      leafId: "leaf-a",
      skillPath: "skills/frontend-design",
      skillContent: "# Frontend Design\n",
      lockedContentHash: "hash-original",
    });
    const service = new StateMigrationService({ stateRoot });

    await expect(service.migrate({ to: 2, backup: true })).rejects.toMatchObject({
      reasonCode: "STATE_MIGRATION_COLLECTION_HASH_MISMATCH",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "STATE_MIGRATION_COLLECTION_HASH_MISMATCH",
          path: expect.stringContaining("source/collection/group-1"),
          details: expect.objectContaining({
            expectedHash: "hash-original",
            actualHash: expect.any(String),
          }),
        }),
      ]),
    });
  });

  async function seedV1BasicState() {
    const now = "2026-06-04T00:00:00.000Z";
    await writeJsonFile(path.join(stateRoot, "manifest.json"), {
      schemaVersion: 1,
      originalDisplayName: "Legacy manifest",
      sources: [
        {
          id: "source-a",
          locator: path.join(stateRoot, "source", "local", "source-a"),
          kind: "local",
          displayName: "Source A",
          originalDisplayName: "Original Source A",
          addedAt: now,
          selectionMode: "selected",
          originLocator: "legacy:source-a",
          originRequestedPath: "/legacy/source-a",
        },
      ],
      bindings: {
        "source-a": {
          selectedLeafIds: ["leaf-a"],
          targets: {
            codex: {
              enabled: true,
              leafIds: ["leaf-a"],
            },
          },
        },
      },
      targets: {},
    });
    await writeJsonFile(path.join(stateRoot, "lock.json"), {
      schemaVersion: 1,
      sources: [
        {
          id: "source-a",
          locator: path.join(stateRoot, "source", "local", "source-a"),
          kind: "local",
          displayName: "Source A",
          checkoutPath: path.join(stateRoot, "source", "local", "source-a"),
          updatedAt: now,
          leafIds: ["leaf-a"],
          originalDisplayName: "Original Source A",
        },
      ],
      leafInventory: [
        {
          id: "leaf-a",
          sourceId: "source-a",
          name: "review",
          linkName: "review",
          title: "Review",
          description: "",
          relativePath: "skills/review",
          skillFilePath: "skills/review/SKILL.md",
          contentHash: "hash-review",
          metadataWarnings: [],
        },
      ],
      deployments: [
        {
          sourceId: "source-a",
          leafId: "leaf-a",
          target: "codex",
          targetPath: path.join(stateRoot, "targets", "codex", "review"),
          strategy: "symlink",
          status: "active",
          contentHash: "hash-review",
          appliedAt: now,
        },
      ],
    });
    await writeJsonFile(path.join(stateRoot, "preferences.json"), {
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "project", projectId: "project:/tmp/demo" },
      recentProjects: [
        {
          projectId: "project:/tmp/demo",
          title: "Demo",
          lastActivityAt: now,
          projectPath: "/tmp/demo",
          tools: ["codex"],
        },
      ],
      projectDrafts: {
        "project:/tmp/demo": {
          "source-a": {
            selectedLeafIds: ["leaf-a"],
            enabledTargets: ["codex"],
          },
        },
      },
      customTargets: [
        {
          id: "custom-target",
          name: "Custom Target",
          globalPath: path.join(stateRoot, "custom-targets", "global"),
          projectPathTemplate: ".custom-target",
          strategy: "copy",
          createdAt: now,
          updatedAt: now,
        },
      ],
      agentDisplayOrder: ["codex", "custom-target"],
      localImportChoices: [{ sourceChoiceId: "legacy-local" }],
      localScanImportChoices: [{ sourceChoiceId: "legacy-scan" }],
      legacyPanelState: { expanded: true },
    });
    await writeJsonFile(path.join(stateRoot, "collections.json"), {
      collections: {},
      selectionMode: "legacy",
    });
    await writeJsonFile(path.join(stateRoot, "catalog", "import-data.json"), {
      schemaVersion: 1,
      sources: {},
    });
  }

  async function seedBrokenVirtualGroupState() {
    await seedV1BasicState();
    await fs.writeFile(path.join(stateRoot, "virtual-groups.json"), "{", "utf8");
  }

  async function seedLegacyVirtualGroupState(input: {
    groupId: string;
    sourceId: string;
    leafId: string;
    skillPath: string;
    skillContent?: string;
    lockedContentHash?: string;
    includedLeafId?: string;
    restoreSelectedLeafIds?: string[];
  }) {
    const now = "2026-06-04T00:00:00.000Z";
    const sourceRoot = path.join(stateRoot, "source", "local", input.sourceId);
    const skillDir = path.join(sourceRoot, input.skillPath);
    const skillFilePath = path.join(skillDir, "SKILL.md");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillFilePath, input.skillContent ?? "# Skill\n", "utf8");
    const actualHash = await hashDirectory(skillDir);
    const contentHash = input.lockedContentHash ?? actualHash;
    const includedLeafId = input.includedLeafId ?? input.leafId;

    await writeJsonFile(path.join(stateRoot, "manifest.json"), {
      schemaVersion: 1,
      sources: [
        {
          id: input.sourceId,
          locator: sourceRoot,
          kind: "local",
          displayName: "Source A",
          originalDisplayName: "Source A",
          addedAt: now,
          selectionMode: "all",
        },
        {
          id: input.groupId,
          locator: `virtual:${input.groupId}`,
          kind: "virtual",
          displayName: "Group 1",
          originalDisplayName: "Group 1",
          addedAt: now,
          selectionMode: "all",
        },
      ],
      bindings: {
        [input.sourceId]: {
          selectedLeafIds: [input.leafId],
          targets: {},
        },
        [input.groupId]: {
          selectedLeafIds: [includedLeafId],
          targets: {
            codex: {
              enabled: true,
              leafIds: [includedLeafId],
            },
          },
        },
      },
    });
    await writeJsonFile(path.join(stateRoot, "lock.json"), {
      schemaVersion: 1,
      sources: [
        {
          id: input.sourceId,
          locator: sourceRoot,
          kind: "local",
          displayName: "Source A",
          originalDisplayName: "Source A",
          checkoutPath: sourceRoot,
          updatedAt: now,
          leafIds: [input.leafId],
          invalidLeafs: [],
        },
      ],
      leafInventory: [
        {
          id: input.leafId,
          sourceId: input.sourceId,
          name: "frontend-design",
          linkName: "frontend-design",
          title: "Frontend Design",
          description: "",
          relativePath: input.skillPath,
          absolutePath: skillDir,
          skillFilePath,
          contentHash,
          metadataWarnings: [],
          valid: true,
        },
      ],
      deployments: [
        {
          sourceId: input.groupId,
          leafId: includedLeafId,
          target: "codex",
          targetPath: path.join(stateRoot, "targets", "codex", "frontend-design"),
          strategy: "symlink",
          status: "active",
          contentHash,
          appliedAt: now,
        },
      ],
    });
    await writeJsonFile(path.join(stateRoot, "preferences.json"), {
      pinnedSourceIds: [],
      projectDrafts: {},
    });
    await writeJsonFile(path.join(stateRoot, "collections.json"), {
      collections: {},
    });
    await writeJsonFile(path.join(stateRoot, "virtual-groups.json"), {
      schemaVersion: 1,
      groups: {
        [input.groupId]: {
          id: input.groupId,
          displayName: "Group 1",
          includedSkills: [{ sourceId: input.sourceId, leafId: includedLeafId }],
          hiddenSourceIds: [input.sourceId],
          restoreSnapshots: input.restoreSelectedLeafIds
            ? {
                [input.sourceId]: {
                  selectedLeafIds: input.restoreSelectedLeafIds,
                  enabledTargets: ["codex"],
                },
              }
            : {},
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  }
});

type CollectionsJson = {
  collections: Record<
    string,
    {
      materializedSourceId: string;
      members: Array<Record<string, unknown>>;
      restoreSelections: Record<
        string,
        {
          selectedLeafIds: string[];
          enabledTargets: string[];
          bestEffort: boolean;
          diagnostics: Array<Record<string, unknown>>;
        }
      >;
    }
  >;
};

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

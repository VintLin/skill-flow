import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { inspectStateMigrationStatus } from "@skill-flow/storage/state-schema-v2";
import { StateMigrationService } from "../services/state-migration-service.js";

describe("state migration service", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-state-migration-"));
  });

  afterEach(async () => {
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

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.migrationGeneration).toMatch(/^mg_/);
    expect(lock.migrationGeneration).toBe(manifest.migrationGeneration);
    expect(preferences.migrationGeneration).toBe(manifest.migrationGeneration);
    expect(collections.migrationGeneration).toBe(manifest.migrationGeneration);
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

  async function seedV1BasicState() {
    await writeJsonFile(path.join(stateRoot, "manifest.json"), {
      schemaVersion: 1,
      sources: [],
      bindings: {},
      targets: {},
    });
    await writeJsonFile(path.join(stateRoot, "lock.json"), {
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      deployments: [],
    });
    await writeJsonFile(path.join(stateRoot, "preferences.json"), {
      pinnedSourceIds: [],
      projectDrafts: {},
    });
    await writeJsonFile(path.join(stateRoot, "collections.json"), {
      collections: {},
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
});

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

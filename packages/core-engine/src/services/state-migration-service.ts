import fs from "node:fs/promises";
import path from "node:path";
import type { DiagnosticV2 } from "@skill-flow/domain/types";
import {
  inspectStateMigrationStatus,
  type StateMigrationStatus,
} from "@skill-flow/storage/state-schema-v2";

export type StateMigrationAction =
  | {
      action: "rewrite";
      path: string;
    }
  | {
      action: "materialize-collection";
      path: string;
    }
  | {
      action: "prune";
      path: string;
    };

export type StateMigrationResult =
  | {
      status: "current";
      stateRoot: string;
      actions: StateMigrationAction[];
    }
  | {
      status: "dry-run";
      stateRoot: string;
      actions: StateMigrationAction[];
      backup: boolean;
    }
  | {
      status: "migrated";
      stateRoot: string;
      actions: StateMigrationAction[];
      backupPath?: string;
      migrationGeneration: string;
    };

export type StateMigrationOptions = {
  to: 2;
  dryRun?: boolean;
  backup?: boolean;
};

export type StateMigrationServiceOptions = {
  stateRoot: string;
};

export class StateMigrationError extends Error {
  readonly reasonCode: string;
  readonly diagnostics: DiagnosticV2[];

  constructor(input: {
    reasonCode: string;
    diagnostics: DiagnosticV2[];
  }) {
    super(input.reasonCode);
    this.name = "StateMigrationError";
    this.reasonCode = input.reasonCode;
    this.diagnostics = input.diagnostics;
  }
}

export class StateMigrationService {
  private readonly stateRoot: string;

  constructor(options: StateMigrationServiceOptions) {
    this.stateRoot = options.stateRoot;
  }

  inspect(): Promise<StateMigrationStatus> {
    return inspectStateMigrationStatus(this.stateRoot);
  }

  async migrate(options: StateMigrationOptions): Promise<StateMigrationResult> {
    const status = await this.inspect();

    if (status.status === "current") {
      return {
        status: "current",
        stateRoot: this.stateRoot,
        actions: [],
      };
    }

    if (status.status === "incomplete" || status.status === "invalid") {
      throw new StateMigrationError({
        reasonCode: status.reasonCode,
        diagnostics: status.diagnostics,
      });
    }

    const actions = await this.planMigrationActions();
    if (options.dryRun) {
      return {
        status: "dry-run",
        stateRoot: this.stateRoot,
        actions,
        backup: options.backup !== false,
      };
    }

    return this.migrateStateRoot(options, actions);
  }

  private async planMigrationActions(): Promise<StateMigrationAction[]> {
    const actions: StateMigrationAction[] = [
      { action: "rewrite", path: path.join(this.stateRoot, "manifest.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "lock.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "preferences.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "collections.json") },
    ];

    if (await pathExists(path.join(this.stateRoot, "virtual-groups.json"))) {
      actions.push({
        action: "materialize-collection",
        path: path.join(this.stateRoot, "source", "collection"),
      });
    }

    actions.push(
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-data.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "source-metadata.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-preparations.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-preparations") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "git") },
    );

    return actions;
  }

  private async migrateStateRoot(
    options: StateMigrationOptions,
    actions: StateMigrationAction[],
  ): Promise<StateMigrationResult> {
    const migrationGeneration = createMigrationGeneration();
    const startedAt = new Date().toISOString();
    const stagingRoot = `${this.stateRoot}.migration-staging-${process.pid}-${Date.now()}`;
    const markerPath = path.join(this.stateRoot, ".skillflow-migration.json");
    let backupPath: string | undefined;

    try {
      if (options.backup !== false) {
        backupPath = await this.createBackup();
      }

      await writeJsonFile(markerPath, {
        schemaVersion: 2,
        migrationGeneration,
        status: "running",
        startedAt,
        stagingRoot,
        diagnostics: [],
      });

      await validateLegacyMigrationInputs(this.stateRoot);
      await fs.cp(this.stateRoot, stagingRoot, { recursive: true, force: false });
      await fs.rm(path.join(stagingRoot, ".skillflow-migration.json"), { force: true });
      await rewriteAuthorityFiles(stagingRoot, migrationGeneration);
      await requireCurrentState(stagingRoot, "STATE_MIGRATION_VALIDATION_FAILED");

      await replaceAuthorityFiles(this.stateRoot, stagingRoot);
      await replaceCollectionSource(this.stateRoot, stagingRoot);
      await fs.rm(markerPath, { force: true });
      await pruneRebuildableCache(this.stateRoot);
      await requireCurrentState(this.stateRoot, "STATE_MIGRATION_VALIDATION_FAILED");

      const result: StateMigrationResult = {
        status: "migrated",
        stateRoot: this.stateRoot,
        actions,
        migrationGeneration,
      };
      if (backupPath) {
        result.backupPath = backupPath;
      }
      return result;
    } catch (error) {
      await fs.rm(stagingRoot, { recursive: true, force: true });
      await fs.rm(markerPath, { force: true });
      if (error instanceof StateMigrationError) {
        throw error;
      }
      throw new StateMigrationError({
        reasonCode: "STATE_MIGRATION_VALIDATION_FAILED",
        diagnostics: [
          {
            code: "STATE_MIGRATION_VALIDATION_FAILED",
            message: error instanceof Error ? error.message : "State migration validation failed.",
            path: this.stateRoot,
            retryable: false,
          },
        ],
      });
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    }
  }

  private async createBackup(): Promise<string> {
    const backupPath = `${this.stateRoot}.backup-${formatBackupTimestamp(new Date())}`;
    await fs.cp(this.stateRoot, backupPath, { recursive: true, force: false });
    return backupPath;
  }
}

async function validateLegacyMigrationInputs(stateRoot: string): Promise<void> {
  const virtualGroupsPath = path.join(stateRoot, "virtual-groups.json");
  if (!(await pathExists(virtualGroupsPath))) {
    return;
  }

  try {
    JSON.parse(await fs.readFile(virtualGroupsPath, "utf8")) as unknown;
  } catch (error) {
    throw new StateMigrationError({
      reasonCode: "STATE_MIGRATION_VALIDATION_FAILED",
      diagnostics: [
        {
          code: "STATE_MIGRATION_VALIDATION_FAILED",
          message: error instanceof Error ? error.message : "Virtual group state is invalid.",
          path: virtualGroupsPath,
          retryable: false,
        },
      ],
    });
  }
}

async function rewriteAuthorityFiles(
  stateRoot: string,
  migrationGeneration: string,
): Promise<void> {
  const manifest = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "manifest.json"), {});
  await writeJsonFile(path.join(stateRoot, "manifest.json"), {
    ...manifest,
    schemaVersion: 2,
    migrationGeneration,
    sources: Array.isArray(manifest.sources) ? manifest.sources : [],
    bindings: isRecord(manifest.bindings) ? manifest.bindings : {},
    targets: isRecord(manifest.targets) ? manifest.targets : {},
  });

  const lock = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "lock.json"), {});
  await writeJsonFile(path.join(stateRoot, "lock.json"), {
    ...lock,
    schemaVersion: 2,
    migrationGeneration,
    sources: isRecord(lock.sources) ? lock.sources : {},
    leafInventory: Array.isArray(lock.leafInventory) ? lock.leafInventory : [],
    projections: Array.isArray(lock.projections)
      ? lock.projections
      : Array.isArray(lock.deployments)
        ? lock.deployments
        : [],
  });

  const preferences = await readJsonFile<Record<string, unknown>>(
    path.join(stateRoot, "preferences.json"),
    {},
  );
  await writeJsonFile(path.join(stateRoot, "preferences.json"), {
    ...preferences,
    schemaVersion: 2,
    migrationGeneration,
    pinnedSourceIds: Array.isArray(preferences.pinnedSourceIds) ? preferences.pinnedSourceIds : [],
    projectSourceDrafts: isRecord(preferences.projectSourceDrafts)
      ? preferences.projectSourceDrafts
      : isRecord(preferences.projectDrafts)
        ? preferences.projectDrafts
        : {},
  });

  const collections = await readJsonFile<Record<string, unknown>>(
    path.join(stateRoot, "collections.json"),
    {},
  );
  await writeJsonFile(path.join(stateRoot, "collections.json"), {
    ...collections,
    schemaVersion: 2,
    migrationGeneration,
    collections: isRecord(collections.collections) ? collections.collections : {},
  });
}

async function replaceAuthorityFiles(stateRoot: string, stagingRoot: string): Promise<void> {
  for (const fileName of ["manifest.json", "lock.json", "preferences.json", "collections.json"]) {
    await fs.copyFile(path.join(stagingRoot, fileName), path.join(stateRoot, fileName));
  }
}

async function replaceCollectionSource(stateRoot: string, stagingRoot: string): Promise<void> {
  const stagingCollectionRoot = path.join(stagingRoot, "source", "collection");
  if (!(await pathExists(stagingCollectionRoot))) {
    return;
  }

  const targetCollectionRoot = path.join(stateRoot, "source", "collection");
  await fs.rm(targetCollectionRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetCollectionRoot), { recursive: true });
  await fs.cp(stagingCollectionRoot, targetCollectionRoot, { recursive: true, force: true });
}

async function pruneRebuildableCache(stateRoot: string): Promise<void> {
  await Promise.all([
    fs.rm(path.join(stateRoot, "catalog", "import-data.json"), { force: true }),
    fs.rm(path.join(stateRoot, "catalog", "source-metadata.json"), { force: true }),
    fs.rm(path.join(stateRoot, "catalog", "import-preparations.json"), { force: true }),
    fs.rm(path.join(stateRoot, "catalog", "import-preparations"), { recursive: true, force: true }),
    fs.rm(path.join(stateRoot, "catalog", "git"), { recursive: true, force: true }),
  ]);
}

async function requireCurrentState(stateRoot: string, reasonCode: string): Promise<void> {
  const status = await inspectStateMigrationStatus(stateRoot);
  if (status.status === "current") {
    return;
  }

  throw new StateMigrationError({
    reasonCode,
    diagnostics: "diagnostics" in status
      ? status.diagnostics
      : [
          {
            code: reasonCode,
            message: "State migration did not produce a current schema v2 state.",
            path: stateRoot,
            retryable: false,
          },
        ],
  });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createMigrationGeneration(): string {
  return `mg_${Date.now().toString(36)}_${process.pid.toString(36)}`;
}

function formatBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

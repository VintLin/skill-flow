import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  CollectionsFileV2,
  LockFileV2,
  ManifestFileV2,
  MigrationGenerationV2,
  PreferencesFileV2,
} from "@skill-flow/domain/types";
import {
  writeCollectionsV2,
  writeLockV2,
  writeManifestV2,
  writePreferencesV2,
} from "./state-schema-v2.js";
import { withFileLock } from "@skill-flow/integration/utils/fs";

const MIGRATION_COMMAND = "skill-flow migrate-state --to v2";
const AUTHORITY_FILES = [
  "manifest.json",
  "lock.json",
  "preferences.json",
  "collections.json",
] as const;
const MIGRATION_GENERATION_PATTERN = /^mg_/;

type AuthorityFileName = typeof AUTHORITY_FILES[number];

export type StateStoreV2State = {
  manifest: ManifestFileV2;
  lockFile: LockFileV2;
  preferences: PreferencesFileV2;
  collections: CollectionsFileV2;
};

export type StateStoreV2ErrorCode =
  | "STATE_MIGRATION_REQUIRED"
  | "STATE_MIGRATION_BLOCKED"
  | "STATE_SCHEMA_UNSUPPORTED";

export class StateStoreV2Error extends Error {
  readonly reasonCode: StateStoreV2ErrorCode;

  constructor(
    readonly code: StateStoreV2ErrorCode,
    message: string,
    readonly path?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StateStoreV2Error";
    this.reasonCode = code;
  }
}

export class StateStoreV2 {
  private initPromise: Promise<void> | undefined;
  private ioQueue: Promise<void> = Promise.resolve();

  constructor(private readonly stateRoot: string) {}

  get rootPath(): string {
    return this.stateRoot;
  }

  get manifestPath(): string {
    return path.join(this.stateRoot, "manifest.json");
  }

  get lockPath(): string {
    return path.join(this.stateRoot, "lock.json");
  }

  get preferencesPath(): string {
    return path.join(this.stateRoot, "preferences.json");
  }

  get collectionsPath(): string {
    return path.join(this.stateRoot, "collections.json");
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeState();
    }
    await this.initPromise;
  }

  async readState(): Promise<StateStoreV2State> {
    return this.withIoLock(async () => {
      await this.init();
      const [manifest, lockFile, preferences, collections] = await Promise.all([
        this.readManifestRaw(),
        this.readLockRaw(),
        this.readPreferencesRaw(),
        this.readCollectionsRaw(),
      ]);
      assertMigrationGenerationMatch(
        this.stateRoot,
        manifest,
        lockFile,
        preferences,
        collections,
      );
      return { manifest, lockFile, preferences, collections };
    });
  }

  async readManifest(): Promise<ManifestFileV2> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readManifestRaw();
    });
  }

  async writeManifest(manifest: ManifestFileV2): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertManifestFileV2(manifest, this.manifestPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        manifest,
      });
      await writeManifestV2(this.stateRoot, manifest);
    });
  }

  async readLock(): Promise<LockFileV2> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readLockRaw();
    });
  }

  async writeLock(lockFile: LockFileV2): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertLockFileV2(lockFile, this.lockPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        lockFile,
      });
      await writeLockV2(this.stateRoot, lockFile);
    });
  }

  async readPreferences(): Promise<PreferencesFileV2> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readPreferencesRaw();
    });
  }

  async writePreferences(preferences: PreferencesFileV2): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertPreferencesFileV2(preferences, this.preferencesPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        preferences,
      });
      await writePreferencesV2(this.stateRoot, preferences);
    });
  }

  async readCollections(): Promise<CollectionsFileV2> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readCollectionsRaw();
    });
  }

  async writeCollections(collections: CollectionsFileV2): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertCollectionsFileV2(collections, this.collectionsPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        collections,
      });
      await writeCollectionsV2(this.stateRoot, collections);
    });
  }

  async writeState(state: StateStoreV2State): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertManifestFileV2(state.manifest, this.manifestPath);
      assertLockFileV2(state.lockFile, this.lockPath);
      assertPreferencesFileV2(state.preferences, this.preferencesPath);
      assertCollectionsFileV2(state.collections, this.collectionsPath);
      assertMigrationGenerationMatch(
        this.stateRoot,
        state.manifest,
        state.lockFile,
        state.preferences,
        state.collections,
      );
      await Promise.all([
        writeManifestV2(this.stateRoot, state.manifest),
        writeLockV2(this.stateRoot, state.lockFile),
        writePreferencesV2(this.stateRoot, state.preferences),
        writeCollectionsV2(this.stateRoot, state.collections),
      ]);
    });
  }

  async withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    await this.init();
    return withFileLock(path.join(this.stateRoot, ".mutation.lock"), task);
  }

  private async initializeState(): Promise<void> {
    await fs.mkdir(this.stateRoot, { recursive: true });

    const existingAuthorityFiles = await Promise.all(
      AUTHORITY_FILES.map(async (fileName) => pathExists(this.getAuthorityPath(fileName))),
    );
    if (existingAuthorityFiles.every((exists) => !exists)) {
      await this.createEmptyAuthorityFiles(createMigrationGeneration());
      return;
    }

    await this.readManifestRaw();
    await Promise.all([
      this.readLockRaw(),
      this.readPreferencesRaw(),
      this.readCollectionsRaw(),
    ]);
  }

  private async createEmptyAuthorityFiles(migrationGeneration: MigrationGenerationV2): Promise<void> {
    await Promise.all([
      writeManifestV2(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        sources: [],
        bindings: {},
      }),
      writeLockV2(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        sources: {},
        leafInventory: [],
        projections: [],
      }),
      writePreferencesV2(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        pinnedSourceIds: [],
        selectedProjectScope: { kind: "global" },
        recentProjects: [],
        projectSourceDrafts: {},
        customTargets: [],
        agentDisplayOrder: [],
      }),
      writeCollectionsV2(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        collections: {},
      }),
    ]);
  }

  private readManifestRaw(): Promise<ManifestFileV2> {
    return readAuthorityFile(this.manifestPath, assertManifestFileV2);
  }

  private readLockRaw(): Promise<LockFileV2> {
    return readAuthorityFile(this.lockPath, assertLockFileV2);
  }

  private readPreferencesRaw(): Promise<PreferencesFileV2> {
    return readAuthorityFile(this.preferencesPath, assertPreferencesFileV2);
  }

  private readCollectionsRaw(): Promise<CollectionsFileV2> {
    return readAuthorityFile(this.collectionsPath, assertCollectionsFileV2);
  }

  private async assertMigrationGenerationMatchesExistingAuthorityFiles(
    nextState: Partial<StateStoreV2State>,
  ): Promise<void> {
    const [manifest, lockFile, preferences, collections] = await Promise.all([
      nextState.manifest ? Promise.resolve(nextState.manifest) : this.readManifestRaw(),
      nextState.lockFile ? Promise.resolve(nextState.lockFile) : this.readLockRaw(),
      nextState.preferences ? Promise.resolve(nextState.preferences) : this.readPreferencesRaw(),
      nextState.collections ? Promise.resolve(nextState.collections) : this.readCollectionsRaw(),
    ]);
    assertMigrationGenerationMatch(
      this.stateRoot,
      manifest,
      lockFile,
      preferences,
      collections,
    );
  }

  private getAuthorityPath(fileName: AuthorityFileName): string {
    return path.join(this.stateRoot, fileName);
  }

  private withIoLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.ioQueue.then(operation, operation);
    this.ioQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

async function readAuthorityFile<T>(
  filePath: string,
  validate: (payload: unknown, filePath: string) => asserts payload is T,
): Promise<T> {
  let payload: unknown;
  try {
    payload = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new StateStoreV2Error(
      "STATE_MIGRATION_BLOCKED",
      "State authority file could not be read.",
      filePath,
      { cause: getFileErrorCode(error) },
    );
  }

  validate(payload, filePath);
  return payload;
}

function assertManifestFileV2(payload: unknown, filePath: string): asserts payload is ManifestFileV2 {
  assertAuthoritySchema(payload, filePath);
  assertArrayField(payload, filePath, "sources");
  assertRecordField(payload, filePath, "bindings");
}

function assertLockFileV2(payload: unknown, filePath: string): asserts payload is LockFileV2 {
  assertAuthoritySchema(payload, filePath);
  assertRecordField(payload, filePath, "sources");
  assertArrayField(payload, filePath, "leafInventory");
  assertArrayField(payload, filePath, "projections");
  assertLeafInventoryV2(payload.leafInventory as unknown[], filePath);
  assertProjectionsV2(payload.projections as unknown[], filePath);
}

function assertPreferencesFileV2(
  payload: unknown,
  filePath: string,
): asserts payload is PreferencesFileV2 {
  assertAuthoritySchema(payload, filePath);
  assertArrayField(payload, filePath, "pinnedSourceIds");
  assertRecordField(payload, filePath, "selectedProjectScope");
  assertArrayField(payload, filePath, "recentProjects");
  assertRecordField(payload, filePath, "projectSourceDrafts");
  assertArrayField(payload, filePath, "customTargets");
  assertArrayField(payload, filePath, "agentDisplayOrder");
}

function assertCollectionsFileV2(
  payload: unknown,
  filePath: string,
): asserts payload is CollectionsFileV2 {
  assertAuthoritySchema(payload, filePath);
  assertRecordField(payload, filePath, "collections");
}

function assertAuthoritySchema(
  payload: unknown,
  filePath: string,
): asserts payload is { schemaVersion: 2; migrationGeneration: MigrationGenerationV2 } & Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new StateStoreV2Error(
      "STATE_MIGRATION_BLOCKED",
      "State authority file is not a JSON object.",
      filePath,
    );
  }

  if (!("schemaVersion" in payload) || payload.schemaVersion === 1) {
    throw new StateStoreV2Error(
      "STATE_MIGRATION_REQUIRED",
      `State authority file requires migration. Run ${MIGRATION_COMMAND}.`,
      filePath,
      { command: MIGRATION_COMMAND },
    );
  }

  if (payload.schemaVersion !== 2) {
    throw new StateStoreV2Error(
      "STATE_SCHEMA_UNSUPPORTED",
      "State schema version is not supported.",
      filePath,
      { schemaVersion: payload.schemaVersion },
    );
  }

  if (
    typeof payload.migrationGeneration !== "string"
    || !MIGRATION_GENERATION_PATTERN.test(payload.migrationGeneration)
  ) {
    throw new StateStoreV2Error(
      "STATE_MIGRATION_BLOCKED",
      "State authority file has an invalid migrationGeneration.",
      filePath,
      {
        reasonCode: "STATE_AUTHORITY_FIELD_INVALID",
        fieldPath: "migrationGeneration",
        expected: "string matching /^mg_/",
      },
    );
  }
}

function assertArrayField(
  payload: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
): void {
  if (!Array.isArray(payload[fieldPath])) {
    throw new StateStoreV2Error(
      "STATE_MIGRATION_BLOCKED",
      "State authority file has an invalid root field.",
      filePath,
      {
        reasonCode: "STATE_AUTHORITY_FIELD_INVALID",
        fieldPath,
        expected: "array",
      },
    );
  }
}

function assertRecordField(
  payload: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
): void {
  if (!isRecord(payload[fieldPath])) {
    throw new StateStoreV2Error(
      "STATE_MIGRATION_BLOCKED",
      "State authority file has an invalid root field.",
      filePath,
      {
        reasonCode: "STATE_AUTHORITY_FIELD_INVALID",
        fieldPath,
        expected: "object",
      },
    );
  }
}

function assertLeafInventoryV2(
  leafInventory: unknown[],
  filePath: string,
): void {
  leafInventory.forEach((leaf, index) => {
    const itemPath = `leafInventory[${index}]`;
    if (!isRecord(leaf)) {
      throwInvalidAuthorityField(filePath, itemPath, "object");
    }

    for (const field of ["linkName", "title", "description", "absolutePath"]) {
      assertStringField(leaf, filePath, `${itemPath}.${field}`);
    }
  });
}

function assertProjectionsV2(
  projections: unknown[],
  filePath: string,
): void {
  projections.forEach((projection, index) => {
    const itemPath = `projections[${index}]`;
    if (!isRecord(projection)) {
      throwInvalidAuthorityField(filePath, itemPath, "object");
    }

    assertStringField(projection, filePath, `${itemPath}.strategy`);
    if ("targetRootPath" in projection && typeof projection.targetRootPath !== "string") {
      throwInvalidAuthorityField(filePath, `${itemPath}.targetRootPath`, "string");
    }
    if ("mode" in projection) {
      throwInvalidAuthorityField(filePath, `${itemPath}.mode`, "absent");
    }
  });
}

function assertStringField(
  payload: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
): void {
  const fieldName = fieldPath.slice(fieldPath.lastIndexOf(".") + 1);
  if (typeof payload[fieldName] !== "string") {
    throwInvalidAuthorityField(filePath, fieldPath, "string");
  }
}

function throwInvalidAuthorityField(
  filePath: string,
  fieldPath: string,
  expected: string,
): never {
  throw new StateStoreV2Error(
    "STATE_MIGRATION_BLOCKED",
    "State authority file has an invalid field.",
    filePath,
    {
      reasonCode: "STATE_AUTHORITY_FIELD_INVALID",
      fieldPath,
      expected,
    },
  );
}

function assertMigrationGenerationMatch(
  stateRoot: string,
  manifest: ManifestFileV2,
  lockFile: LockFileV2,
  preferences: PreferencesFileV2,
  collections: CollectionsFileV2,
): void {
  const migrationGenerations = {
    manifest: manifest.migrationGeneration,
    lock: lockFile.migrationGeneration,
    preferences: preferences.migrationGeneration,
    collections: collections.migrationGeneration,
  };
  const uniqueGenerations = new Set(Object.values(migrationGenerations));

  if (uniqueGenerations.size > 1) {
    throw new StateStoreV2Error(
      "STATE_MIGRATION_BLOCKED",
      "State authority files have different migrationGeneration values.",
      stateRoot,
      {
        reasonCode: "STATE_MIGRATION_GENERATION_MISMATCH",
        migrationGenerations,
      },
    );
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

function createMigrationGeneration(): MigrationGenerationV2 {
  return `mg_${randomUUID()}`;
}

function getFileErrorCode(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "STATE_FILE_PARSE_FAILED";
  }
  if (isNodeError(error) && error.code === "ENOENT") {
    return "STATE_FILE_MISSING";
  }
  return "STATE_FILE_READ_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error;
}

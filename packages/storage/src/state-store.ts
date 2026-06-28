import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  CollectionsFile,
  LockFile,
  ManifestFile,
  MigrationGeneration,
  PreferencesFile,
  ProjectionRecord,
} from "@skill-flow/domain/types";
import {
  stripUtf8Bom,
  writeCollections,
  writeLock,
  writeManifest,
  writePreferences,
} from "./state-schema.js";
import { withFileLock } from "@skill-flow/integration/utils/fs";

const MIGRATION_COMMAND = "skill-flow migrate-state --to v2";
const PROJECTION_STATUSES = new Set<ProjectionRecord["status"]>(["active", "removed", "blocked"]);
const AUTHORITY_FILES = [
  "manifest.json",
  "lock.json",
  "preferences.json",
  "collections.json",
] as const;
const MIGRATION_GENERATION_PATTERN = /^mg_/;

type AuthorityFileName = typeof AUTHORITY_FILES[number];

export type StateStoreState = {
  manifest: ManifestFile;
  lockFile: LockFile;
  preferences: PreferencesFile;
  collections: CollectionsFile;
};

export type StateStoreErrorCode =
  | "STATE_MIGRATION_REQUIRED"
  | "STATE_MIGRATION_BLOCKED"
  | "STATE_SCHEMA_UNSUPPORTED";

export class StateStoreError extends Error {
  readonly reasonCode: StateStoreErrorCode;

  constructor(
    readonly code: StateStoreErrorCode,
    message: string,
    readonly path?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StateStoreError";
    this.reasonCode = code;
  }
}

export class StateStore {
  private initPromise: Promise<void> | undefined;
  private ioQueue: Promise<void> = Promise.resolve();
  private mutationLockDepth = 0;

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

  async readState(): Promise<StateStoreState> {
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

  async readManifest(): Promise<ManifestFile> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readManifestRaw();
    });
  }

  async writeManifest(manifest: ManifestFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertManifestFile(manifest, this.manifestPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        manifest,
      });
      await writeManifest(this.stateRoot, manifest);
    });
  }

  async readLock(): Promise<LockFile> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readLockRaw();
    });
  }

  async writeLock(lockFile: LockFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const normalizedLock = normalizeLockFile(lockFile);
      assertLockFile(normalizedLock, this.lockPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        lockFile: normalizedLock,
      });
      await writeLock(this.stateRoot, normalizedLock);
    });
  }

  async readPreferences(): Promise<PreferencesFile> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readPreferencesRaw();
    });
  }

  async writePreferences(preferences: PreferencesFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertPreferencesFile(preferences, this.preferencesPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        preferences,
      });
      await writePreferences(this.stateRoot, preferences);
    });
  }

  async readCollections(): Promise<CollectionsFile> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readCollectionsRaw();
    });
  }

  async writeCollections(collections: CollectionsFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertCollectionsFile(collections, this.collectionsPath);
      await this.assertMigrationGenerationMatchesExistingAuthorityFiles({
        collections,
      });
      await writeCollections(this.stateRoot, collections);
    });
  }

  async writeState(state: StateStoreState): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const normalizedLock = normalizeLockFile(state.lockFile);
      assertManifestFile(state.manifest, this.manifestPath);
      assertLockFile(normalizedLock, this.lockPath);
      assertPreferencesFile(state.preferences, this.preferencesPath);
      assertCollectionsFile(state.collections, this.collectionsPath);
      assertMigrationGenerationMatch(
        this.stateRoot,
        state.manifest,
        normalizedLock,
        state.preferences,
        state.collections,
      );
      await Promise.all([
        writeManifest(this.stateRoot, state.manifest),
        writeLock(this.stateRoot, normalizedLock),
        writePreferences(this.stateRoot, state.preferences),
        writeCollections(this.stateRoot, state.collections),
      ]);
    });
  }

  async withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    await this.init();
    if (this.mutationLockDepth > 0) {
      return task();
    }
    return withFileLock(path.join(this.stateRoot, ".mutation.lock"), async () => {
      this.mutationLockDepth += 1;
      try {
        return await task();
      } finally {
        this.mutationLockDepth -= 1;
      }
    }, {
      metadata: {
        command: process.argv.join(" "),
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
    });
  }

  private async initializeState(): Promise<void> {
    await fs.mkdir(this.stateRoot, { recursive: true });

    await withFileLock(path.join(this.stateRoot, ".init.lock"), async () => {
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
    });
  }

  private async createEmptyAuthorityFiles(migrationGeneration: MigrationGeneration): Promise<void> {
    await Promise.all([
      writeManifest(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        sources: [],
        bindings: {},
      }),
      writeLock(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        sources: {},
        leafInventory: [],
        projections: [],
      }),
      writePreferences(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        pinnedSourceIds: [],
        selectedProjectScope: { kind: "global" },
        recentProjects: [],
        projectSourceDrafts: {},
        customTargets: [],
        agentDisplayOrder: [],
      }),
      writeCollections(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        collections: {},
      }),
    ]);
  }

  private readManifestRaw(): Promise<ManifestFile> {
    return readAuthorityFile(this.manifestPath, assertManifestFile);
  }

  private readLockRaw(): Promise<LockFile> {
    return readAuthorityFile(this.lockPath, assertLockFile).then(normalizeLockFile);
  }

  private readPreferencesRaw(): Promise<PreferencesFile> {
    return readAuthorityFile(this.preferencesPath, assertPreferencesFile);
  }

  private readCollectionsRaw(): Promise<CollectionsFile> {
    return readAuthorityFile(this.collectionsPath, assertCollectionsFile);
  }

  private async assertMigrationGenerationMatchesExistingAuthorityFiles(
    nextState: Partial<StateStoreState>,
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
  let bomDetected = false;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    bomDetected = raw.charCodeAt(0) === 0xFEFF;
    payload = JSON.parse(stripUtf8Bom(raw)) as unknown;
  } catch (error) {
    throw new StateStoreError(
      "STATE_MIGRATION_BLOCKED",
      "State authority file could not be read.",
      filePath,
      {
        cause: getFileErrorCode(error),
        ...(bomDetected ? { bomDetected } : {}),
      },
    );
  }

  validate(payload, filePath);
  return payload;
}

function assertManifestFile(payload: unknown, filePath: string): asserts payload is ManifestFile {
  assertAuthoritySchema(payload, filePath);
  assertArrayField(payload, filePath, "sources");
  assertRecordField(payload, filePath, "bindings");
}

function assertLockFile(payload: unknown, filePath: string): asserts payload is LockFile {
  assertAuthoritySchema(payload, filePath);
  assertRecordField(payload, filePath, "sources");
  assertArrayField(payload, filePath, "leafInventory");
  assertArrayField(payload, filePath, "projections");
  assertLeafInventory(payload.leafInventory as unknown[], filePath);
  assertProjections(payload.projections as unknown[], filePath);
}

function normalizeLockFile(lockFile: LockFile): LockFile {
  return {
    ...lockFile,
    sources: Object.fromEntries(
      Object.entries(lockFile.sources).map(([sourceId, source]) => {
        const {
          id: _discardId,
          locator: _discardLocator,
          kind: _discardKind,
          displayName: _discardDisplayName,
          originalDisplayName: _discardOriginalDisplayName,
          checkoutPath: _discardCheckoutPath,
          updatedAt: _discardUpdatedAt,
          invalidLeafs: _discardInvalidLeafs,
          invalidLeafPaths: _discardInvalidLeafPaths,
          commitSha: _discardCommitSha,
          ...currentSource
        } = source as typeof source & {
          id?: string;
          locator?: string;
          kind?: string;
          displayName?: string;
          originalDisplayName?: string;
          checkoutPath?: string;
          updatedAt?: string;
          invalidLeafs?: unknown[];
          invalidLeafPaths?: string[];
          commitSha?: string;
        };
        return [sourceId, currentSource];
      }),
    ),
    leafInventory: lockFile.leafInventory.map((leaf) => {
      const { displayName: _discardDisplayName, ...currentLeaf } = leaf as typeof leaf & {
        displayName?: string;
      };
      return currentLeaf;
    }),
  };
}

function assertPreferencesFile(
  payload: unknown,
  filePath: string,
): asserts payload is PreferencesFile {
  assertAuthoritySchema(payload, filePath);
  assertArrayField(payload, filePath, "pinnedSourceIds");
  assertRecordField(payload, filePath, "selectedProjectScope");
  assertArrayField(payload, filePath, "recentProjects");
  assertRecordField(payload, filePath, "projectSourceDrafts");
  assertArrayField(payload, filePath, "customTargets");
  assertArrayField(payload, filePath, "agentDisplayOrder");
}

function assertCollectionsFile(
  payload: unknown,
  filePath: string,
): asserts payload is CollectionsFile {
  assertAuthoritySchema(payload, filePath);
  assertRecordField(payload, filePath, "collections");
}

function assertAuthoritySchema(
  payload: unknown,
  filePath: string,
): asserts payload is { schemaVersion: 2; migrationGeneration: MigrationGeneration } & Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new StateStoreError(
      "STATE_MIGRATION_BLOCKED",
      "State authority file is not a JSON object.",
      filePath,
    );
  }

  if (!("schemaVersion" in payload) || payload.schemaVersion === 1) {
    throw new StateStoreError(
      "STATE_MIGRATION_REQUIRED",
      `State authority file requires migration. Run ${MIGRATION_COMMAND}.`,
      filePath,
      { command: MIGRATION_COMMAND },
    );
  }

  if (payload.schemaVersion !== 2) {
    throw new StateStoreError(
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
    throw new StateStoreError(
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
    throw new StateStoreError(
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
    throw new StateStoreError(
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

function assertLeafInventory(
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
    assertBooleanField(leaf, filePath, `${itemPath}.valid`);
  });
}

function assertProjections(
  projections: unknown[],
  filePath: string,
): void {
  projections.forEach((projection, index) => {
    const itemPath = `projections[${index}]`;
    if (!isRecord(projection)) {
      throwInvalidAuthorityField(filePath, itemPath, "object");
    }

    assertStringField(projection, filePath, `${itemPath}.strategy`);
    assertProjectionStatus(projection, filePath, `${itemPath}.status`);
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

function assertBooleanField(
  payload: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
): void {
  const fieldName = fieldPath.slice(fieldPath.lastIndexOf(".") + 1);
  if (typeof payload[fieldName] !== "boolean") {
    throwInvalidAuthorityField(filePath, fieldPath, "boolean");
  }
}

function assertProjectionStatus(
  payload: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
): void {
  const fieldName = fieldPath.slice(fieldPath.lastIndexOf(".") + 1);
  if (!PROJECTION_STATUSES.has(payload[fieldName] as ProjectionRecord["status"])) {
    throwInvalidAuthorityField(filePath, fieldPath, "active | removed | blocked");
  }
}

function throwInvalidAuthorityField(
  filePath: string,
  fieldPath: string,
  expected: string,
): never {
  throw new StateStoreError(
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
  manifest: ManifestFile,
  lockFile: LockFile,
  preferences: PreferencesFile,
  collections: CollectionsFile,
): void {
  const migrationGenerations = {
    manifest: manifest.migrationGeneration,
    lock: lockFile.migrationGeneration,
    preferences: preferences.migrationGeneration,
    collections: collections.migrationGeneration,
  };
  const uniqueGenerations = new Set(Object.values(migrationGenerations));

  if (uniqueGenerations.size > 1) {
    throw new StateStoreError(
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

function createMigrationGeneration(): MigrationGeneration {
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

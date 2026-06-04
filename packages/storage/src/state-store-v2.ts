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

const MIGRATION_COMMAND = "skill-flow migrate-state --to v2";
const AUTHORITY_FILES = [
  "manifest.json",
  "lock.json",
  "preferences.json",
  "collections.json",
] as const;

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
      assertAuthoritySchema(manifest, this.manifestPath);
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
      assertAuthoritySchema(lockFile, this.lockPath);
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
      assertAuthoritySchema(preferences, this.preferencesPath);
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
      assertAuthoritySchema(collections, this.collectionsPath);
      await writeCollectionsV2(this.stateRoot, collections);
    });
  }

  async writeState(state: StateStoreV2State): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      assertAuthoritySchema(state.manifest, this.manifestPath);
      assertAuthoritySchema(state.lockFile, this.lockPath);
      assertAuthoritySchema(state.preferences, this.preferencesPath);
      assertAuthoritySchema(state.collections, this.collectionsPath);
      await Promise.all([
        writeManifestV2(this.stateRoot, state.manifest),
        writeLockV2(this.stateRoot, state.lockFile),
        writePreferencesV2(this.stateRoot, state.preferences),
        writeCollectionsV2(this.stateRoot, state.collections),
      ]);
    });
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
        targets: {},
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
        projectSourceDrafts: {},
      }),
      writeCollectionsV2(this.stateRoot, {
        schemaVersion: 2,
        migrationGeneration,
        collections: {},
      }),
    ]);
  }

  private readManifestRaw(): Promise<ManifestFileV2> {
    return readAuthorityFile(this.manifestPath);
  }

  private readLockRaw(): Promise<LockFileV2> {
    return readAuthorityFile(this.lockPath);
  }

  private readPreferencesRaw(): Promise<PreferencesFileV2> {
    return readAuthorityFile(this.preferencesPath);
  }

  private readCollectionsRaw(): Promise<CollectionsFileV2> {
    return readAuthorityFile(this.collectionsPath);
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

async function readAuthorityFile<T>(filePath: string): Promise<T> {
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

  assertAuthoritySchema(payload, filePath);
  return payload as T;
}

function assertAuthoritySchema(payload: unknown, filePath: string): void {
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

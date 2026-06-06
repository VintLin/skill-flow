import fs from "node:fs/promises";
import path from "node:path";
import type {
  CollectionsFileV2,
  DiagnosticV2,
  LockFileV2,
  ManifestFileV2,
  PreferencesFileV2,
} from "@skill-flow/domain/types";

const AUTHORITY_FILES = [
  "manifest.json",
  "lock.json",
  "preferences.json",
  "collections.json",
] as const;
export const CURRENT_MIGRATION_MARKER_VERSION = "1.3.11";

type AuthorityFileName = typeof AUTHORITY_FILES[number];

export type StateMigrationStatus =
  | {
      status: "current";
      version: 2;
      stateRoot: string;
      migrationGeneration: string;
    }
  | {
      status: "migration-required";
      fromVersion: 1;
      toVersion: 2;
      stateRoot: string;
    }
  | {
      status: "incomplete";
      reasonCode: "STATE_MIGRATION_INCOMPLETE";
      diagnostics: DiagnosticV2[];
    }
  | {
      status: "invalid";
      reasonCode: "STATE_MIGRATION_BLOCKED";
      diagnostics: DiagnosticV2[];
    };

async function writeAuthorityFile(stateRoot: string, fileName: string, payload: unknown): Promise<void> {
  await fs.mkdir(stateRoot, { recursive: true });
  await fs.writeFile(path.join(stateRoot, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function writeManifestV2(stateRoot: string, manifest: ManifestFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "manifest.json", manifest);
}

export function writeLockV2(stateRoot: string, lockFile: LockFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "lock.json", lockFile);
}

export function writePreferencesV2(stateRoot: string, preferences: PreferencesFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "preferences.json", preferences);
}

export function writeCollectionsV2(stateRoot: string, collections: CollectionsFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "collections.json", collections);
}

export async function inspectStateMigrationStatus(stateRoot: string): Promise<StateMigrationStatus> {
  const markerPath = path.join(stateRoot, ".skillflow-migration.json");
  if (await pathExists(markerPath)) {
    const authorityStatus = await inspectAuthorityFiles(stateRoot);
    const markerDiagnostics: DiagnosticV2[] = [];
    const markerResult = await readJsonFile(markerPath);
    let markerGeneration: string | undefined;

    if (!markerResult.ok) {
      markerDiagnostics.push(markerResult.diagnostic);
    } else {
      const markerVersion = getMarkerVersion(markerResult.value);
      markerGeneration = getMigrationGeneration(markerResult.value);

      if (!markerVersion) {
        markerDiagnostics.push({
          code: "STATE_MIGRATION_MARKER_VERSION_MISSING",
          message: "Migration marker is missing version.",
          path: markerPath,
          retryable: false,
        });
      } else if (markerVersion !== CURRENT_MIGRATION_MARKER_VERSION) {
        markerDiagnostics.push({
          code: "STATE_MIGRATION_MARKER_VERSION_UNSUPPORTED",
          message: "Migration marker version is not supported by this CLI.",
          path: markerPath,
          details: {
            expectedVersion: CURRENT_MIGRATION_MARKER_VERSION,
            actualVersion: markerVersion,
          },
          retryable: false,
        });
      }

      if (!markerGeneration) {
        markerDiagnostics.push({
          code: "STATE_MIGRATION_GENERATION_MISSING",
          message: "Migration marker is missing migrationGeneration.",
          path: markerPath,
          retryable: false,
        });
      }
    }

    if (
      authorityStatus.status === "current" &&
      markerDiagnostics.length === 0 &&
      markerGeneration === authorityStatus.migrationGeneration
    ) {
      return authorityStatus;
    }

    if (
      authorityStatus.status === "current" &&
      markerGeneration &&
      markerGeneration !== authorityStatus.migrationGeneration
    ) {
      markerDiagnostics.push({
        code: "STATE_MIGRATION_MARKER_GENERATION_MISMATCH",
        message: "Migration marker generation does not match authority files.",
        path: markerPath,
        details: {
          expectedGeneration: authorityStatus.migrationGeneration,
          actualGeneration: markerGeneration,
        },
        retryable: false,
      });
    }

    if (markerDiagnostics.length === 0) {
      markerDiagnostics.push({
        code: "STATE_MIGRATION_MARKER_PRESENT",
        message: "A state migration marker is present.",
        path: markerPath,
        retryable: false,
      });
    }

    return {
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
      diagnostics: [...markerDiagnostics, ...statusDiagnostics(authorityStatus)],
    };
  }

  return inspectAuthorityFiles(stateRoot);
}

async function inspectAuthorityFiles(stateRoot: string): Promise<StateMigrationStatus> {
  const manifestResult = await readJsonAuthorityFile(stateRoot, "manifest.json");
  if (!manifestResult.ok) {
    return invalidStatus(manifestResult.diagnostic);
  }

  const manifest = manifestResult.value;
  const manifestVersion = getSchemaVersion(manifest);

  if (manifestVersion === undefined || manifestVersion === 1) {
    return {
      status: "migration-required",
      fromVersion: 1,
      toVersion: 2,
      stateRoot,
    };
  }

  if (manifestVersion !== 2) {
    return invalidStatus({
      code: "STATE_SCHEMA_UNSUPPORTED",
      message: "State schema version is not supported.",
      path: manifestResult.path,
      details: { schemaVersion: manifestVersion },
      retryable: false,
    });
  }

  const diagnostics: DiagnosticV2[] = [];
  const generations = new Map<string, string[]>();
  let collectionsPayload: unknown;

  for (const fileName of AUTHORITY_FILES) {
    const result = fileName === "manifest.json"
      ? manifestResult
      : await readJsonAuthorityFile(stateRoot, fileName);

    if (!result.ok) {
      return invalidStatus(result.diagnostic);
    }

    const version = getSchemaVersion(result.value);
    if (version !== 2) {
      return invalidStatus({
        code: "STATE_SCHEMA_UNSUPPORTED",
        message: "State schema version is not supported.",
        path: result.path,
        details: { schemaVersion: version },
        retryable: false,
      });
    }

    const generation = getMigrationGeneration(result.value);
    if (!generation) {
      diagnostics.push({
        code: "STATE_MIGRATION_GENERATION_MISSING",
        message: "Schema v2 authority file is missing migrationGeneration.",
        path: result.path,
        retryable: false,
      });
      continue;
    }

    const paths = generations.get(generation) ?? [];
    paths.push(result.path);
    generations.set(generation, paths);

    if (fileName === "collections.json") {
      collectionsPayload = result.value;
    }
  }

  if (generations.size > 1) {
    diagnostics.push({
      code: "STATE_MIGRATION_GENERATION_MISMATCH",
      message: "Schema v2 authority files have different migrationGeneration values.",
      path: stateRoot,
      details: { generations: Object.fromEntries(generations) },
      retryable: false,
    });
  }

  const authorityGeneration = [...generations.keys()][0];
  if (authorityGeneration) {
    diagnostics.push(...await inspectCollectionGenerationMarkers(
      stateRoot,
      collectionsPayload,
      authorityGeneration,
    ));
  }

  if (diagnostics.length > 0) {
    return {
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
      diagnostics,
    };
  }

  return {
    status: "current",
    version: 2,
    stateRoot,
    migrationGeneration: authorityGeneration ?? "",
  };
}

function statusDiagnostics(status: StateMigrationStatus): DiagnosticV2[] {
  return status.status === "incomplete" || status.status === "invalid"
    ? status.diagnostics
    : [];
}

async function inspectCollectionGenerationMarkers(
  stateRoot: string,
  collectionsPayload: unknown,
  authorityGeneration: string,
): Promise<DiagnosticV2[]> {
  if (!isRecord(collectionsPayload) || !isRecord(collectionsPayload.collections)) {
    return [];
  }

  const diagnostics: DiagnosticV2[] = [];
  for (const collectionId of Object.keys(collectionsPayload.collections)) {
    const markerPath = path.join(
      stateRoot,
      "source",
      "collection",
      collectionId,
      ".skillflow-generation.json",
    );
    const markerResult = await readJsonFile(markerPath);
    if (!markerResult.ok) {
      diagnostics.push(markerResult.diagnostic);
      continue;
    }

    const markerGeneration = getMigrationGeneration(markerResult.value);
    if (!markerGeneration) {
      diagnostics.push({
        code: "STATE_MIGRATION_GENERATION_MISSING",
        message: "Collection generation marker is missing migrationGeneration.",
        path: markerPath,
        retryable: false,
      });
      continue;
    }

    if (markerGeneration !== authorityGeneration) {
      diagnostics.push({
        code: "STATE_MIGRATION_COLLECTION_GENERATION_MISMATCH",
        message: "Collection generation marker does not match authority files.",
        path: markerPath,
        details: {
          expectedGeneration: authorityGeneration,
          actualGeneration: markerGeneration,
        },
        retryable: false,
      });
    }
  }

  return diagnostics;
}

function invalidStatus(diagnostic: DiagnosticV2): StateMigrationStatus {
  return {
    status: "invalid",
    reasonCode: "STATE_MIGRATION_BLOCKED",
    diagnostics: [diagnostic],
  };
}

async function readJsonAuthorityFile(
  stateRoot: string,
  fileName: AuthorityFileName,
): Promise<JsonReadResult> {
  return readJsonFile(path.join(stateRoot, fileName));
}

type JsonReadResult =
  | { ok: true; path: string; value: unknown }
  | { ok: false; path: string; diagnostic: DiagnosticV2 };

async function readJsonFile(filePath: string): Promise<JsonReadResult> {
  try {
    return {
      ok: true,
      path: filePath,
      value: JSON.parse(await fs.readFile(filePath, "utf8")) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      path: filePath,
      diagnostic: {
        code: getFileErrorCode(error),
        message: "State authority file could not be read.",
        path: filePath,
        retryable: false,
      },
    };
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

function getFileErrorCode(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "STATE_FILE_PARSE_FAILED";
  }
  if (isNodeError(error) && error.code === "ENOENT") {
    return "STATE_FILE_MISSING";
  }
  return "STATE_FILE_READ_FAILED";
}

function getSchemaVersion(value: unknown): number | undefined {
  return isRecord(value) && typeof value.schemaVersion === "number"
    ? value.schemaVersion
    : undefined;
}

function getMigrationGeneration(value: unknown): string | undefined {
  return isRecord(value) && typeof value.migrationGeneration === "string"
    ? value.migrationGeneration
    : undefined;
}

function getMarkerVersion(value: unknown): string | undefined {
  return isRecord(value) && typeof value.version === "string"
    ? value.version
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error;
}

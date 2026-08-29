import type {
  ImportPreparationCache,
  ImportPreparationRecord,
  ImportPreparationStatus,
  SourceKind,
} from "@skill-flow/domain/types";

const PREPARATION_STATUSES = new Set<ImportPreparationStatus>([
  "preparing",
  "ready",
  "committing",
  "failed",
  "stale",
]);

const SOURCE_KINDS = new Set<SourceKind>(["local", "git", "clawhub", "collection"]);
const COMMITTING_PREPARATION_STALE_MS = 5 * 60 * 1000;

export function createEmptyImportPreparationCache(): ImportPreparationCache {
  return {
    records: {},
  };
}

export function normalizeImportPreparationCache(value: unknown): ImportPreparationCache {
  if (!isRecord(value)) {
    return createEmptyImportPreparationCache();
  }

  const records = normalizeRecords(value.records);
  return {
    records,
  };
}

export function isImportPreparationExpired(
  entry: Pick<ImportPreparationRecord, "expiresAt"> | { expiresAt: string },
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(entry.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

export function pruneImportPreparationCache(
  cache: ImportPreparationCache,
  options: { now?: Date; maxRecords?: number } = {},
): ImportPreparationCache {
  const now = options.now ?? new Date();
  const maxRecords = options.maxRecords ?? 12;
  const retained = Object.values(cache.records)
    .filter((record) => record.status === "committing"
      ? !isImportPreparationCommittingAbandoned(record, now)
      : !isImportPreparationExpired(record, now))
    .sort((left, right) => Date.parse(right.preparedAt) - Date.parse(left.preparedAt))
    .slice(0, maxRecords);
  const records = Object.fromEntries(retained.map((record) => [record.id, record]));

  return {
    records,
  };
}

function isImportPreparationCommittingAbandoned(
  entry: Pick<ImportPreparationRecord, "preparedAt">,
  now: Date,
): boolean {
  const preparedAt = Date.parse(entry.preparedAt);
  return !Number.isFinite(preparedAt) || now.getTime() - preparedAt >= COMMITTING_PREPARATION_STALE_MS;
}

function normalizeRecords(value: unknown): Record<string, ImportPreparationRecord> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([id, record]) => {
      const normalized = normalizeRecord(id, record);
      return normalized ? [[id, normalized] as const] : [];
    }),
  );
}

function normalizeRecord(id: string, value: unknown): ImportPreparationRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const locator = stringValue(value.locator);
  const canonicalRepo = stringValue(value.canonicalRepo);
  const sourceKind = sourceKindValue(value.sourceKind);
  const checkoutPath = stringValue(value.checkoutPath);
  const sourceId = stringValue(value.sourceId);
  const displayName = stringValue(value.displayName);
  const status = statusValue(value.status);
  const preparedAt = stringValue(value.preparedAt);
  const expiresAt = stringValue(value.expiresAt);

  if (
    !locator ||
    !canonicalRepo ||
    !sourceKind ||
    !checkoutPath ||
    !sourceId ||
    !displayName ||
    !status ||
    !preparedAt ||
    !expiresAt
  ) {
    return undefined;
  }

  return {
    id,
    ...(stringValue(value.cacheKey) ? { cacheKey: stringValue(value.cacheKey)! } : {}),
    locator,
    canonicalRepo,
    sourceKind,
    checkoutPath,
    sourceId,
    displayName,
    ...(stringValue(value.requestedPath) ? { requestedPath: stringValue(value.requestedPath)! } : {}),
    status,
    preparedAt,
    expiresAt,
    ...(normalizeFailure(value.failure) ? { failure: normalizeFailure(value.failure)! } : {}),
  };
}

function normalizeFailure(value: unknown): ImportPreparationRecord["failure"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const reasonCode = stringValue(value.reasonCode);
  const retryable = typeof value.retryable === "boolean" ? value.retryable : undefined;
  const message = stringValue(value.message);
  return reasonCode && retryable !== undefined && message
    ? { reasonCode, retryable, message }
    : undefined;
}

function statusValue(value: unknown): ImportPreparationStatus | undefined {
  return typeof value === "string" && PREPARATION_STATUSES.has(value as ImportPreparationStatus)
    ? value as ImportPreparationStatus
    : undefined;
}

function sourceKindValue(value: unknown): SourceKind | undefined {
  return typeof value === "string" && SOURCE_KINDS.has(value as SourceKind)
    ? value as SourceKind
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

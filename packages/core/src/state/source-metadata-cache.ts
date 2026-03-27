import type {
  SourceMetadataCache,
  SourceMetadataCacheEntry,
  SourceMetadataProvider,
  SourceMetadataReasonCode,
  SourceMetadataResult,
  SourceStats,
} from "../domain/types.js";

export function createEmptySourceMetadataCache(): SourceMetadataCache {
  return {};
}

export function normalizeSourceMetadataCache(value: unknown): SourceMetadataCache {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const normalizedEntries = Object.entries(value).flatMap(([sourceId, entry]) => {
    const normalizedEntry = normalizeSourceMetadataCacheEntry(sourceId, entry);
    return normalizedEntry ? [[sourceId, normalizedEntry] as const] : [];
  });

  return Object.fromEntries(normalizedEntries);
}

export function sourceMetadataResultToCacheEntry(args: {
  sourceId: string;
  result: SourceMetadataResult;
  checkedAt: string;
  expiresAt: string;
}): SourceMetadataCacheEntry {
  const baseEntry = {
    sourceId: args.sourceId,
    checkedAt: args.checkedAt,
    expiresAt: args.expiresAt,
    status: args.result.status,
  } satisfies Pick<
    SourceMetadataCacheEntry,
    "sourceId" | "checkedAt" | "expiresAt" | "status"
  >;

  switch (args.result.status) {
    case "ready": {
      const data = normalizeSourceStats(args.result.data) ?? args.result.data;
      return {
        ...baseEntry,
        provider: args.result.provider,
        data,
      };
    }
    case "unsupported":
      return {
        ...baseEntry,
        ...(args.result.provider ? { provider: args.result.provider } : {}),
        reasonCode: args.result.reasonCode,
      };
    case "failed":
      return {
        ...baseEntry,
        ...(args.result.provider ? { provider: args.result.provider } : {}),
        reasonCode: args.result.reasonCode,
        retryable: args.result.retryable,
      };
  }
}

export function sourceMetadataCacheEntryToResult(
  entry: SourceMetadataCacheEntry,
): SourceMetadataResult {
  switch (entry.status) {
    case "ready": {
      const provider = entry.provider;
      const data = entry.data ? (normalizeSourceStats(entry.data) ?? entry.data) : undefined;
      if (!provider || !data) {
        return {
          status: "unsupported",
          reasonCode: "provider_data_unavailable",
        };
      }
      return {
        status: "ready",
        provider,
        data,
      };
    }
    case "unsupported":
      return {
        status: "unsupported",
        ...(entry.provider ? { provider: entry.provider } : {}),
        reasonCode: entry.reasonCode ?? "provider_data_unavailable",
      };
    case "failed":
      return {
        status: "failed",
        ...(entry.provider ? { provider: entry.provider } : {}),
        reasonCode: entry.reasonCode ?? "provider_request_failed",
        retryable: entry.retryable ?? true,
      };
  }
}

export function isSourceMetadataCacheExpired(
  entry: SourceMetadataCacheEntry,
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(entry.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= now.getTime();
}

function normalizeSourceMetadataCacheEntry(
  sourceId: string,
  value: unknown,
): SourceMetadataCacheEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const status = candidate.status;
  const checkedAt = candidate.checkedAt;
  const expiresAt = candidate.expiresAt;
  if (
    typeof status !== "string" ||
    !isCacheStatus(status) ||
    typeof checkedAt !== "string" ||
    checkedAt.length === 0 ||
    typeof expiresAt !== "string" ||
    expiresAt.length === 0
  ) {
    return undefined;
  }

  const provider = isSourceMetadataProvider(candidate.provider)
    ? candidate.provider
    : undefined;
  const reasonCode = isSourceMetadataReasonCode(candidate.reasonCode)
    ? candidate.reasonCode
    : undefined;
  const retryable = typeof candidate.retryable === "boolean"
    ? candidate.retryable
    : undefined;
  const data = normalizeSourceStats(candidate.data);

  return {
    sourceId,
    status,
    checkedAt,
    expiresAt,
    ...(provider ? { provider } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(data ? { data } : {}),
  };
}

function normalizeSourceStats(value: unknown): SourceStats | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const provider = isSourceMetadataProvider(candidate.provider)
    ? candidate.provider
    : undefined;
  const repoLabel = normalizeString(candidate.repoLabel);
  const repoUrl = normalizeString(candidate.repoUrl);
  const sourceUrl = normalizeString(candidate.sourceUrl);
  const starCount = normalizeNumber(candidate.starCount);
  const forkCount = normalizeNumber(candidate.forkCount);
  const totalInstalls = normalizeNumber(candidate.totalInstalls);
  const weeklyInstalls = normalizeNumber(candidate.weeklyInstalls);
  const downloadCount = normalizeNumber(candidate.downloadCount);
  const ownerHandle = normalizeString(candidate.ownerHandle);
  const ownerDisplayName = normalizeString(candidate.ownerDisplayName);
  const summary = normalizeString(candidate.summary);
  const description = normalizeString(candidate.description);
  const topics = Array.isArray(candidate.topics)
    ? candidate.topics.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const language = normalizeString(candidate.language);
  const defaultBranch = normalizeString(candidate.defaultBranch);
  const pushedAt = normalizeString(candidate.pushedAt);

  const normalized = {
    ...(provider ? { provider } : {}),
    ...(repoLabel ? { repoLabel } : {}),
    ...(repoUrl ? { repoUrl } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(starCount !== undefined ? { starCount } : {}),
    ...(forkCount !== undefined ? { forkCount } : {}),
    ...(totalInstalls !== undefined ? { totalInstalls } : {}),
    ...(weeklyInstalls !== undefined ? { weeklyInstalls } : {}),
    ...(downloadCount !== undefined ? { downloadCount } : {}),
    ...(ownerHandle ? { ownerHandle } : {}),
    ...(ownerDisplayName ? { ownerDisplayName } : {}),
    ...(summary ? { summary } : {}),
    ...(description ? { description } : {}),
    ...(topics.length > 0 ? { topics } : {}),
    ...(language ? { language } : {}),
    ...(defaultBranch ? { defaultBranch } : {}),
    ...(pushedAt ? { pushedAt } : {}),
  } satisfies SourceStats;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isCacheStatus(value: string): value is SourceMetadataCacheEntry["status"] {
  return value === "ready" || value === "unsupported" || value === "failed";
}

function isSourceMetadataProvider(value: unknown): value is SourceMetadataProvider {
  return value === "github" || value === "skills" || value === "clawhub";
}

function isSourceMetadataReasonCode(value: unknown): value is SourceMetadataReasonCode {
  return (
    value === "provider_not_supported" ||
    value === "provider_data_unavailable" ||
    value === "provider_request_failed" ||
    value === "provider_rate_limited" ||
    value === "provider_response_invalid"
  );
}

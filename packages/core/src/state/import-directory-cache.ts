import type {
  DeploymentTargetName,
  ImportDirectoryCache,
  ImportGroupCacheEntry,
  ImportPreviewSkill,
  ImportPreviewCacheEntry,
  ImportPreviewResult,
  ImportPreviewTarget,
  ImportReasonCode,
} from "../domain/types.js";

export function createEmptyImportDirectoryCache(): ImportDirectoryCache {
  return {
    groups: {},
    previews: {},
  };
}

export function normalizeImportDirectoryCache(value: unknown): ImportDirectoryCache {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return createEmptyImportDirectoryCache();
  }

  const candidate = value as Record<string, unknown>;
  return {
    groups: normalizeGroupEntries(candidate.groups),
    previews: normalizePreviewEntries(candidate.previews),
  };
}

export function importGroupCacheEntryToDetails(entry: ImportGroupCacheEntry): ImportGroupCacheEntry["data"] | undefined {
  return entry.status === "ready" ? entry.data : undefined;
}

export function importPreviewCacheEntryToResult(entry: ImportPreviewCacheEntry): ImportPreviewResult {
  if (entry.status === "ready" && entry.data) {
    return {
      status: "ready",
      locator: entry.data.locator,
      canonicalRepo: entry.canonicalRepo,
      selectedSkillIds: entry.data.selectedSkillIds,
      enabledTargets: entry.data.enabledTargets,
      skills: entry.data.skills,
      targets: entry.data.targets,
    };
  }

  return {
    status: "failed",
    reasonCode: entry.reasonCode ?? "provider_data_unavailable",
    retryable: entry.retryable ?? true,
  };
}

export function isImportDirectoryCacheExpired(
  entry: { expiresAt: string },
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(entry.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= now.getTime();
}

function normalizeGroupEntries(value: unknown): Record<string, ImportGroupCacheEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).flatMap(([canonicalRepo, entry]) => {
    const normalized = normalizeGroupEntry(canonicalRepo, entry);
    return normalized ? [[canonicalRepo, normalized] as const] : [];
  });

  return Object.fromEntries(entries);
}

function normalizePreviewEntries(value: unknown): Record<string, ImportPreviewCacheEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).flatMap(([canonicalRepo, entry]) => {
    const normalized = normalizePreviewEntry(canonicalRepo, entry);
    return normalized ? [[canonicalRepo, normalized] as const] : [];
  });

  return Object.fromEntries(entries);
}

function normalizeGroupEntry(
  canonicalRepo: string,
  value: unknown,
): ImportGroupCacheEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (
    !isGroupStatus(candidate.status) ||
    typeof candidate.checkedAt !== "string" ||
    typeof candidate.expiresAt !== "string"
  ) {
    return undefined;
  }

  const data = normalizeGroupData(candidate.data);
  const reasonCode = isImportReasonCode(candidate.reasonCode) ? candidate.reasonCode : undefined;
  const retryable = typeof candidate.retryable === "boolean" ? candidate.retryable : undefined;

  return {
    canonicalRepo,
    status: candidate.status,
    checkedAt: candidate.checkedAt,
    expiresAt: candidate.expiresAt,
    ...(reasonCode ? { reasonCode } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(data ? { data } : {}),
  };
}

function normalizePreviewEntry(
  canonicalRepo: string,
  value: unknown,
): ImportPreviewCacheEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (
    !isPreviewStatus(candidate.status) ||
    typeof candidate.checkedAt !== "string" ||
    typeof candidate.expiresAt !== "string"
  ) {
    return undefined;
  }

  const data = normalizePreviewData(candidate.data);
  const reasonCode = isImportReasonCode(candidate.reasonCode) ? candidate.reasonCode : undefined;
  const retryable = typeof candidate.retryable === "boolean" ? candidate.retryable : undefined;

  return {
    canonicalRepo,
    status: candidate.status,
    checkedAt: candidate.checkedAt,
    expiresAt: candidate.expiresAt,
    ...(reasonCode ? { reasonCode } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(data ? { data } : {}),
  };
}

function normalizeGroupData(
  value: unknown,
): ImportGroupCacheEntry["data"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const aliases = Array.isArray(candidate.aliases)
    ? candidate.aliases.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const title = typeof candidate.title === "string" && candidate.title.length > 0
    ? candidate.title
    : undefined;
  if (!title) {
    return undefined;
  }

  return {
    aliases,
    title,
    ...(normalizeString(candidate.summary) ? { summary: normalizeString(candidate.summary)! } : {}),
    ...(normalizeString(candidate.sourceUrl) ? { sourceUrl: normalizeString(candidate.sourceUrl)! } : {}),
    ...(normalizeString(candidate.repoUrl) ? { repoUrl: normalizeString(candidate.repoUrl)! } : {}),
    ...(normalizeNumber(candidate.starCount) !== undefined ? { starCount: normalizeNumber(candidate.starCount)! } : {}),
    ...(normalizeNumber(candidate.totalInstalls) !== undefined ? { totalInstalls: normalizeNumber(candidate.totalInstalls)! } : {}),
    ...(normalizeNumber(candidate.skillCount) !== undefined ? { skillCount: normalizeNumber(candidate.skillCount)! } : {}),
  };
}

function normalizePreviewData(
  value: unknown,
): ImportPreviewCacheEntry["data"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const locator = normalizeString(candidate.locator);
  if (!locator) {
    return undefined;
  }

  const selectedSkillIds = normalizeStringArray(candidate.selectedSkillIds);
  const enabledTargets = normalizeTargetArray(candidate.enabledTargets);
  const skills = normalizeSkills(candidate.skills);
  const targets = normalizeTargets(candidate.targets);

  return {
    locator,
    selectedSkillIds,
    enabledTargets,
    skills,
    targets,
  };
}

function normalizeSkills(value: unknown): ImportPreviewSkill[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }
    const candidate = item as Record<string, unknown>;
    const id = normalizeString(candidate.id);
    const title = normalizeString(candidate.title);
    if (!id || !title) {
      return [];
    }
    return [{
      id,
      title,
      summary: normalizeString(candidate.summary) ?? "",
      selectedByDefault: candidate.selectedByDefault === true,
    }];
  });
}

function normalizeTargets(value: unknown): ImportPreviewTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }
    const candidate = item as Record<string, unknown>;
    const id = normalizeTarget(candidate.id);
    if (!id) {
      return [];
    }
    return [{
      id,
      selectedByDefault: candidate.selectedByDefault === true,
    }];
  });
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeTargetArray(value: unknown): DeploymentTargetName[] {
  return normalizeStringArray(value).flatMap((item) => normalizeTarget(item) ? [item as DeploymentTargetName] : []);
}

function normalizeTarget(value: unknown): DeploymentTargetName | undefined {
  return (
    value === "claude-code" ||
    value === "codex" ||
    value === "cursor" ||
    value === "github-copilot" ||
    value === "gemini-cli" ||
    value === "opencode" ||
    value === "openclaw" ||
    value === "pi" ||
    value === "windsurf" ||
    value === "roo-code" ||
    value === "cline" ||
    value === "amp" ||
    value === "kiro"
  ) ? value : undefined;
}

function isGroupStatus(value: unknown): value is ImportGroupCacheEntry["status"] {
  return value === "ready" || value === "failed";
}

function isPreviewStatus(value: unknown): value is ImportPreviewCacheEntry["status"] {
  return value === "ready" || value === "failed";
}

function isImportReasonCode(value: unknown): value is ImportReasonCode {
  return (
    value === "provider_not_supported" ||
    value === "provider_data_unavailable" ||
    value === "provider_request_failed" ||
    value === "provider_rate_limited" ||
    value === "provider_response_invalid"
  );
}

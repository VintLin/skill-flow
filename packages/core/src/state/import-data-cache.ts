import type {
  ImportDataCache,
  ImportRecommendationFeed,
  ImportRecommendationFeedId,
  ImportSearchHit,
  ImportSearchSnapshot,
  UnifiedSourceOwner,
  UnifiedSourceSkill,
  UnifiedSourceSkillInstalledOn,
  UnifiedSourceSnapshot,
  UnifiedSourceSnapshotCacheEntry,
  UnifiedSourceTrust,
} from "../domain/types.js";

export function createEmptyImportDataCache(): ImportDataCache {
  return {
    searches: {},
    sources: {},
    recommendations: {},
  };
}

export function normalizeImportDataCache(value: unknown): ImportDataCache {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return createEmptyImportDataCache();
  }

  const candidate = value as Record<string, unknown>;
  return {
    searches: normalizeSearchSnapshots(candidate.searches),
    sources: normalizeSourceSnapshots(candidate.sources),
    recommendations: normalizeRecommendationFeeds(candidate.recommendations),
  };
}

export function isImportDataCacheExpired(
  entry: { expiresAt: string },
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(entry.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= now.getTime();
}

function normalizeSearchSnapshots(value: unknown): Record<string, ImportSearchSnapshot> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([query, snapshot]) => {
      const normalized = normalizeSearchSnapshot(query, snapshot);
      return normalized ? [[query, normalized] as const] : [];
    }),
  );
}

function normalizeSourceSnapshots(value: unknown): Record<string, UnifiedSourceSnapshotCacheEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([canonicalRepo, entry]) => {
      const normalized = normalizeSourceSnapshotEntry(canonicalRepo, entry);
      return normalized ? [[canonicalRepo, normalized] as const] : [];
    }),
  );
}

function normalizeRecommendationFeeds(value: unknown): Record<string, ImportRecommendationFeed> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([id, feed]) => {
      const normalized = normalizeRecommendationFeed(feed);
      return normalized ? [[id, normalized] as const] : [];
    }),
  );
}

function normalizeSearchSnapshot(
  query: string,
  value: unknown,
): ImportSearchSnapshot | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const checkedAt = normalizeString(candidate.checkedAt);
  const expiresAt = normalizeString(candidate.expiresAt);
  if (!checkedAt || !expiresAt) {
    return undefined;
  }

  return {
    query,
    checkedAt,
    expiresAt,
    hits: normalizeSearchHits(candidate.hits),
    groups: normalizeStringArray(candidate.groups),
  };
}

function normalizeSourceSnapshotEntry(
  canonicalRepo: string,
  value: unknown,
): UnifiedSourceSnapshotCacheEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const checkedAt = normalizeString(candidate.checkedAt);
  const expiresAt = normalizeString(candidate.expiresAt);
  const data = normalizeUnifiedSourceSnapshot(candidate.data);
  if (!checkedAt || !expiresAt || !data) {
    return undefined;
  }

  return {
    canonicalRepo,
    checkedAt,
    expiresAt,
    data,
  };
}

function normalizeRecommendationFeed(value: unknown): ImportRecommendationFeed | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const id = normalizeRecommendationFeedId(candidate.id);
  const checkedAt = normalizeString(candidate.checkedAt);
  const expiresAt = normalizeString(candidate.expiresAt);
  if (!id || !checkedAt || !expiresAt) {
    return undefined;
  }

  return {
    id,
    checkedAt,
    expiresAt,
    groups: normalizeStringArray(candidate.groups),
  };
}

function normalizeSearchHits(value: unknown): ImportSearchHit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const id = normalizeString(candidate.id);
    const skillId = normalizeString(candidate.skillId);
    const title = normalizeString(candidate.title) ?? normalizeString(candidate.name);
    const source = normalizeString(candidate.source);
    const canonicalRepo = normalizeString(candidate.canonicalRepo);
    if (!id || !skillId || !title || !source || !canonicalRepo) {
      return [];
    }

    return [{
      id,
      skillId,
      title,
      source,
      canonicalRepo,
      ...(normalizeNumber(candidate.installs) !== undefined
        ? { installs: normalizeNumber(candidate.installs)! }
        : {}),
    }];
  });
}

function normalizeUnifiedSourceSnapshot(value: unknown): UnifiedSourceSnapshot | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const canonicalRepo = normalizeString(candidate.canonicalRepo);
  const title = normalizeString(candidate.title);
  const sourceUrl = normalizeString(candidate.sourceUrl);
  const repoUrl = normalizeString(candidate.repoUrl);
  const repoLabel = normalizeString(candidate.repoLabel);
  const owner = normalizeSourceOwner(candidate.owner);
  if (!canonicalRepo || !title || !sourceUrl || !repoUrl || !repoLabel || !owner) {
    return undefined;
  }

  return {
    canonicalRepo,
    aliases: normalizeStringArray(candidate.aliases),
    title,
    provider: "skills",
    sourceUrl,
    repoUrl,
    repoLabel,
    ...(normalizeNumber(candidate.totalInstalls) !== undefined
      ? { totalInstalls: normalizeNumber(candidate.totalInstalls)! }
      : {}),
    ...(normalizeNumber(candidate.skillCount) !== undefined
      ? { skillCount: normalizeNumber(candidate.skillCount)! }
      : {}),
    ...(normalizeNumber(candidate.repoStars) !== undefined
      ? { repoStars: normalizeNumber(candidate.repoStars)! }
      : {}),
    ...(normalizeNumber(candidate.forkCount) !== undefined
      ? { forkCount: normalizeNumber(candidate.forkCount)! }
      : {}),
    ...(normalizeString(candidate.description)
      ? { description: normalizeString(candidate.description)! }
      : {}),
    ...(normalizeStringArray(candidate.topics).length > 0
      ? { topics: normalizeStringArray(candidate.topics) }
      : {}),
    ...(normalizeString(candidate.language)
      ? { language: normalizeString(candidate.language)! }
      : {}),
    ...(normalizeString(candidate.defaultBranch)
      ? { defaultBranch: normalizeString(candidate.defaultBranch)! }
      : {}),
    ...(normalizeString(candidate.pushedAt)
      ? { pushedAt: normalizeString(candidate.pushedAt)! }
      : {}),
    owner,
    skills: normalizeSourceSkills(candidate.skills),
    ...(normalizeSourceTrust(candidate.trust) ? { trust: normalizeSourceTrust(candidate.trust)! } : {}),
  };
}

function normalizeSourceOwner(value: unknown): UnifiedSourceOwner | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const slug = normalizeString(candidate.slug);
  const sourceUrl = normalizeString(candidate.sourceUrl);
  if (!slug || !sourceUrl) {
    return undefined;
  }

  return {
    slug,
    sourceUrl,
    ...(normalizeString(candidate.githubUrl) ? { githubUrl: normalizeString(candidate.githubUrl)! } : {}),
    ...(normalizeNumber(candidate.sourceCount) !== undefined
      ? { sourceCount: normalizeNumber(candidate.sourceCount)! }
      : {}),
    ...(normalizeNumber(candidate.skillCount) !== undefined
      ? { skillCount: normalizeNumber(candidate.skillCount)! }
      : {}),
    ...(normalizeNumber(candidate.totalInstalls) !== undefined
      ? { totalInstalls: normalizeNumber(candidate.totalInstalls)! }
      : {}),
  };
}

function normalizeSourceSkills(value: unknown): UnifiedSourceSkill[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const skillId = normalizeString(candidate.skillId);
    const title = normalizeString(candidate.title);
    if (!skillId || !title) {
      return [];
    }

    const installedOn = normalizeInstalledOn(candidate.installedOn);
    const audits = normalizeSkillAudits(candidate.audits);

    return [{
      skillId,
      title,
      ...(normalizeNumber(candidate.installs) !== undefined
        ? { installs: normalizeNumber(candidate.installs)! }
        : {}),
      ...(normalizeNumber(candidate.weeklyInstalls) !== undefined
        ? { weeklyInstalls: normalizeNumber(candidate.weeklyInstalls)! }
        : {}),
      ...(normalizeString(candidate.firstSeen)
        ? { firstSeen: normalizeString(candidate.firstSeen)! }
        : {}),
      ...(normalizeString(candidate.summary)
        ? { summary: normalizeString(candidate.summary)! }
        : {}),
      ...(installedOn.length > 0 ? { installedOn } : {}),
      ...(audits ? { audits } : {}),
    }];
  });
}

function normalizeInstalledOn(
  value: unknown,
): UnifiedSourceSkillInstalledOn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const agent = normalizeString(candidate.agent);
    if (!agent) {
      return [];
    }

    return [{
      agent,
      ...(normalizeNumber(candidate.installs) !== undefined
        ? { installs: normalizeNumber(candidate.installs)! }
        : {}),
    }];
  });
}

function normalizeSkillAudits(value: unknown): UnifiedSourceSkill["audits"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const normalized = {
    ...(normalizeString(candidate.gen) ? { gen: normalizeString(candidate.gen)! } : {}),
    ...(normalizeString(candidate.socket) ? { socket: normalizeString(candidate.socket)! } : {}),
    ...(normalizeString(candidate.snyk) ? { snyk: normalizeString(candidate.snyk)! } : {}),
    ...(normalizeString(candidate.riskLevel) ? { riskLevel: normalizeString(candidate.riskLevel)! } : {}),
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeSourceTrust(value: unknown): UnifiedSourceTrust | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const normalized = {
    ...(candidate.official === true ? { official: true } : {}),
    ...(candidate.trending === true ? { trending: true } : {}),
    ...(candidate.hot === true ? { hot: true } : {}),
    ...(candidate.audited === true ? { audited: true } : {}),
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeRecommendationFeedId(value: unknown): ImportRecommendationFeedId | undefined {
  return value === "seed" ||
    value === "official" ||
    value === "trending" ||
    value === "hot" ||
    value === "audits"
    ? value
    : undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

import type {
  ImportDataCache,
  ImportRecommendationFeed,
  ImportRecommendationFeedId,
  ImportSearchHit,
  ImportSearchSnapshot,
  RepoMetadataCacheEntry,
  RepoMetadataIdentity,
  RepoMetadataProvider,
  RepoMetadataProviderEntry,
  ResolvedRepoMetadata,
  ResolvedRepoMetadataField,
  UnifiedSourceOwner,
  UnifiedSourceSkill,
  UnifiedSourceSkillInstalledOn,
  UnifiedSourceSnapshot,
  UnifiedSourceTrust,
} from "@skill-flow/domain/types";

export function createEmptyImportDataCache(): ImportDataCache {
  return {
    searches: {},
    repos: {},
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
    repos: normalizeRepoSnapshots(candidate.repos),
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

function normalizeRepoSnapshots(value: unknown): Record<string, RepoMetadataCacheEntry> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
      Object.entries(value).flatMap(([canonicalRepo, entry]) => {
        const normalized = normalizeRepoSnapshotEntry(canonicalRepo, entry);
        return normalized ? [[canonicalRepo, normalized] as const] : [];
      }),
    )
    : {};
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

function normalizeRepoSnapshotEntry(
  canonicalRepo: string,
  value: unknown,
): RepoMetadataCacheEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const checkedAt = normalizeString(candidate.checkedAt);
  const expiresAt = normalizeString(candidate.expiresAt);
  const identity = normalizeRepoIdentity(candidate.identity, canonicalRepo);
  const providers = normalizeRepoProviders(candidate.providers);
  const resolved = normalizeResolvedRepoMetadata(candidate.resolved);
  if (!checkedAt || !expiresAt || !identity || !resolved) {
    return undefined;
  }

  return {
    canonicalRepo,
    checkedAt,
    expiresAt,
    identity,
    providers,
    resolved,
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

function normalizeRepoIdentity(
  value: unknown,
  canonicalRepo: string,
): RepoMetadataIdentity | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const normalizedRepo = normalizeString(candidate.canonicalRepo) ?? canonicalRepo;
  if (!normalizedRepo) {
    return undefined;
  }
  return {
    canonicalRepo: normalizedRepo,
    aliases: normalizeStringArray(candidate.aliases),
    origins: normalizeRepoProviderArray(candidate.origins),
  };
}

function normalizeRepoProviders(
  value: unknown,
): Partial<Record<RepoMetadataProvider, RepoMetadataProviderEntry>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const providers: Partial<Record<RepoMetadataProvider, RepoMetadataProviderEntry>> = {};
  for (const provider of ["skills", "github", "clawhub", "local"] as const) {
    const entry = normalizeRepoProviderEntry(candidate[provider], provider);
    if (entry) {
      providers[provider] = entry;
    }
  }
  return providers;
}

function normalizeRepoProviderEntry(
  value: unknown,
  provider: RepoMetadataProvider,
): RepoMetadataProviderEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const status = normalizeString(candidate.status);
  const checkedAt = normalizeString(candidate.checkedAt);
  const expiresAt = normalizeString(candidate.expiresAt);
  if (
    (status !== "ready" && status !== "failed" && status !== "unsupported")
    || !checkedAt
    || !expiresAt
  ) {
    return undefined;
  }

  const data = normalizeSourceStats(candidate.data);
  const snapshot = normalizeUnifiedSourceSnapshot(candidate.snapshot);

  return {
    provider,
    status,
    checkedAt,
    expiresAt,
    ...(normalizeString(candidate.reasonCode) ? { reasonCode: normalizeString(candidate.reasonCode)! as never } : {}),
    ...(typeof candidate.retryable === "boolean" ? { retryable: candidate.retryable } : {}),
    ...(data ? { data } : {}),
    ...(snapshot ? { snapshot } : {}),
  };
}

function normalizeResolvedRepoMetadata(value: unknown): ResolvedRepoMetadata | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  return {
    ...(normalizeString(candidate.title) ? { title: normalizeString(candidate.title)! } : {}),
    ...(normalizeString(candidate.author) ? { author: normalizeString(candidate.author)! } : {}),
    ...(normalizeString(candidate.summary) ? { summary: normalizeString(candidate.summary)! } : {}),
    ...(normalizeString(candidate.githubUrl) ? { githubUrl: normalizeString(candidate.githubUrl)! } : {}),
    ...(normalizeString(candidate.sourceUrl) ? { sourceUrl: normalizeString(candidate.sourceUrl)! } : {}),
    ...(normalizeNumber(candidate.skillCount) !== undefined ? { skillCount: normalizeNumber(candidate.skillCount)! } : {}),
    ...(normalizeNumber(candidate.downloadCount) !== undefined ? { downloadCount: normalizeNumber(candidate.downloadCount)! } : {}),
    ...(normalizeNumber(candidate.starCount) !== undefined ? { starCount: normalizeNumber(candidate.starCount)! } : {}),
    fieldSources: normalizeFieldSources(candidate.fieldSources),
  };
}

function normalizeFieldSources(
  value: unknown,
): Partial<Record<ResolvedRepoMetadataField, RepoMetadataProvider>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const candidate = value as Record<string, unknown>;
  const fields: ResolvedRepoMetadataField[] = [
    "title",
    "author",
    "summary",
    "githubUrl",
    "sourceUrl",
    "skillCount",
    "downloadCount",
    "starCount",
  ];
  return Object.fromEntries(
    fields.flatMap((field) => {
      const provider = normalizeRepoProvider(candidate[field]);
      return provider ? [[field, provider] as const] : [];
    }),
  );
}

function normalizeRepoProviderArray(value: unknown): RepoMetadataProvider[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const provider = normalizeRepoProvider(item);
    return provider ? [provider] : [];
  });
}

function normalizeRepoProvider(value: unknown): RepoMetadataProvider | undefined {
  const provider = normalizeString(value);
  if (provider === "skills" || provider === "github" || provider === "clawhub" || provider === "local") {
    return provider;
  }
  return undefined;
}

function normalizeSourceStats(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const provider = normalizeSourceStatsProvider(candidate.provider);
  return {
    ...(provider ? { provider } : {}),
    ...(normalizeString(candidate.repoLabel) ? { repoLabel: normalizeString(candidate.repoLabel)! } : {}),
    ...(normalizeString(candidate.repoUrl) ? { repoUrl: normalizeString(candidate.repoUrl)! } : {}),
    ...(normalizeString(candidate.sourceUrl) ? { sourceUrl: normalizeString(candidate.sourceUrl)! } : {}),
    ...(normalizeNumber(candidate.starCount) !== undefined ? { starCount: normalizeNumber(candidate.starCount)! } : {}),
    ...(normalizeNumber(candidate.forkCount) !== undefined ? { forkCount: normalizeNumber(candidate.forkCount)! } : {}),
    ...(normalizeNumber(candidate.totalInstalls) !== undefined ? { totalInstalls: normalizeNumber(candidate.totalInstalls)! } : {}),
    ...(normalizeNumber(candidate.weeklyInstalls) !== undefined ? { weeklyInstalls: normalizeNumber(candidate.weeklyInstalls)! } : {}),
    ...(normalizeNumber(candidate.downloadCount) !== undefined ? { downloadCount: normalizeNumber(candidate.downloadCount)! } : {}),
    ...(normalizeString(candidate.ownerHandle) ? { ownerHandle: normalizeString(candidate.ownerHandle)! } : {}),
    ...(normalizeString(candidate.ownerDisplayName) ? { ownerDisplayName: normalizeString(candidate.ownerDisplayName)! } : {}),
    ...(normalizeString(candidate.summary) ? { summary: normalizeString(candidate.summary)! } : {}),
    ...(normalizeString(candidate.description) ? { description: normalizeString(candidate.description)! } : {}),
    ...(normalizeStringArray(candidate.topics).length > 0 ? { topics: normalizeStringArray(candidate.topics) } : {}),
    ...(normalizeString(candidate.language) ? { language: normalizeString(candidate.language)! } : {}),
    ...(normalizeString(candidate.defaultBranch) ? { defaultBranch: normalizeString(candidate.defaultBranch)! } : {}),
    ...(normalizeString(candidate.pushedAt) ? { pushedAt: normalizeString(candidate.pushedAt)! } : {}),
  };
}

function normalizeSourceStatsProvider(value: unknown): "skills" | "github" | "clawhub" | undefined {
  const provider = normalizeString(value);
  if (provider === "skills" || provider === "github" || provider === "clawhub") {
    return provider;
  }
  return undefined;
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
    ...(typeof candidate.official === "boolean" ? { official: candidate.official } : {}),
    ...(typeof candidate.trending === "boolean" ? { trending: candidate.trending } : {}),
    ...(typeof candidate.hot === "boolean" ? { hot: candidate.hot } : {}),
    ...(typeof candidate.audited === "boolean" ? { audited: candidate.audited } : {}),
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeRecommendationFeedId(value: unknown): ImportRecommendationFeedId | undefined {
  if (
    value === "seed"
    || value === "official"
    || value === "trending"
    || value === "hot"
    || value === "audits"
  ) {
    return value;
  }
  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const normalized = normalizeString(item);
    return normalized ? [normalized] : [];
  });
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildFieldSources(
  values: Partial<Record<ResolvedRepoMetadataField, unknown>>,
  provider: RepoMetadataProvider,
): Partial<Record<ResolvedRepoMetadataField, RepoMetadataProvider>> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) => (value !== undefined && value !== "" ? [[key, provider]] : [])),
  ) as Partial<Record<ResolvedRepoMetadataField, RepoMetadataProvider>>;
}

import type {
  ImportRecommendationFeed,
  ImportRecommendationFeedId,
  ImportSearchHit,
  ImportSearchSnapshot,
  UnifiedSourceSnapshot,
  UnifiedSourceSnapshotCacheEntry,
  UnifiedSourceTrust,
} from "@skill-flow/domain/types";
import {
  IMPORT_RECOMMENDATION_CACHE_TTL_MS,
  IMPORT_SEARCH_CACHE_TTL_MS,
  IMPORT_SOURCE_CACHE_TTL_MS,
  normalizeImportCanonicalRepo,
} from "@skill-flow/integration/utils/skills-directory";
import { isImportDataCacheExpired } from "@skill-flow/storage/import-data-cache";
import { RuntimeStore } from "@skill-flow/storage/runtime-store";

export type ImportSourceReadOptions = {
  enrichSkillIds?: string[];
  includeSkillDetails?: boolean;
  refreshTrustInBackground?: boolean;
  cachedSnapshot?: UnifiedSourceSnapshot;
};

export type ImportDiscoveryProvider = {
  fetchRecommendationGroups(
    feedId: Exclude<ImportRecommendationFeedId, "seed">,
  ): Promise<string[]>;
  search(query: string, limit: number): Promise<ImportSearchHit[]>;
  fetchSource(
    canonicalRepo: string,
    options: {
      enrichSkillIds?: string[];
      includeSkillDetails: boolean;
      trust?: UnifiedSourceTrust;
    },
  ): Promise<UnifiedSourceSnapshot>;
};

const IMPORT_RECOMMENDATION_SEEDS = [
  "anthropics/skills",
  "garrytan/gstack",
  "vercel-labs/agent-skills",
];

export class ImportDiscovery {
  private readonly recommendationRefreshes = new Map<
    ImportRecommendationFeedId,
    Promise<ImportRecommendationFeed>
  >();
  private readonly searchRefreshes = new Map<string, Promise<ImportSearchSnapshot>>();
  private readonly sourceRefreshes = new Map<string, Promise<UnifiedSourceSnapshot>>();

  constructor(private readonly options: {
    provider: ImportDiscoveryProvider;
    store: RuntimeStore;
  }) {}

  async resolveRecommendations(
    feedIds: readonly ImportRecommendationFeedId[],
  ): Promise<{
    groups: string[];
    cachedSources: Record<string, UnifiedSourceSnapshotCacheEntry>;
  }> {
    const cache = await this.options.store.readImportDataCache();
    const groupLists = await Promise.all(feedIds.map(async (feedId) => {
      const cached = cache.recommendations[feedId];
      if (cached) {
        if (isImportDataCacheExpired(cached)) {
          void this.refreshRecommendation(feedId).catch(() => undefined);
        }
        return cached.groups;
      }

      if (feedId === "seed") {
        const refreshed = await this.refreshRecommendation(feedId);
        cache.recommendations[feedId] = refreshed;
        return refreshed.groups;
      }
      void this.refreshRecommendation(feedId).catch(() => undefined);
      return [];
    }));
    const groups = [...new Set(groupLists.flat())];

    return {
      groups,
      cachedSources: Object.fromEntries(groups.flatMap((canonicalRepo) => {
        const cached = cache.repos[canonicalRepo];
        return cached ? [[canonicalRepo, cached] as const] : [];
      })),
    };
  }

  async resolveSearch(query: string): Promise<ImportSearchSnapshot> {
    const normalizedQuery = query.trim().toLowerCase();
    const cached = (await this.options.store.readImportDataCache()).searches[normalizedQuery];
    if (cached) {
      if (!isImportDataCacheExpired(cached)) {
        return cached;
      }
      void this.refreshSearch(query).catch(() => undefined);
      return cached;
    }
    return this.refreshSearch(query);
  }

  async resolveSource(
    canonicalRepo: string,
    options?: Omit<ImportSourceReadOptions, "cachedSnapshot">,
  ): Promise<UnifiedSourceSnapshot> {
    const normalizedRepo = normalizeImportCanonicalRepo(canonicalRepo) ?? canonicalRepo;
    const cached = (await this.options.store.readImportDataCache()).repos[normalizedRepo];
    const cachedSnapshot = cached?.data;
    const requiresSkillRefresh = cachedSnapshot
      ? this.snapshotNeedsSkillRefresh(cachedSnapshot, options?.enrichSkillIds ?? [])
      : false;

    if (cached && cachedSnapshot) {
      if (!isImportDataCacheExpired(cached) && !requiresSkillRefresh) {
        return cachedSnapshot;
      }
      if (!requiresSkillRefresh) {
        void this.refreshSource(normalizedRepo).catch(() => undefined);
        return cachedSnapshot;
      }
    }

    try {
      return await this.refreshSource(normalizedRepo, {
        ...(options?.enrichSkillIds ? { enrichSkillIds: options.enrichSkillIds } : {}),
        ...(options?.includeSkillDetails !== undefined
          ? { includeSkillDetails: options.includeSkillDetails }
          : {}),
        ...(options?.refreshTrustInBackground !== undefined
          ? { refreshTrustInBackground: options.refreshTrustInBackground }
          : {}),
        ...(cachedSnapshot ? { cachedSnapshot } : {}),
      });
    } catch (error) {
      if (cachedSnapshot) {
        return cachedSnapshot;
      }
      throw error;
    }
  }

  async resolvePreviewSource(canonicalRepo: string): Promise<UnifiedSourceSnapshot> {
    const normalizedRepo = normalizeImportCanonicalRepo(canonicalRepo) ?? canonicalRepo;
    const cached = (await this.options.store.readImportDataCache()).repos[normalizedRepo];
    const cachedSnapshot = cached?.data;
    if (cached && cachedSnapshot && !isImportDataCacheExpired(cached)) {
      return cachedSnapshot;
    }

    try {
      return await this.refreshSource(normalizedRepo, {
        includeSkillDetails: false,
        refreshTrustInBackground: false,
        ...(cachedSnapshot ? { cachedSnapshot } : {}),
      });
    } catch (error) {
      if (cachedSnapshot) {
        return cachedSnapshot;
      }
      throw error;
    }
  }

  refreshRecommendation(feedId: ImportRecommendationFeedId): Promise<ImportRecommendationFeed> {
    const inFlight = this.recommendationRefreshes.get(feedId);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.refreshRecommendationEntry(feedId).finally(() => {
      this.recommendationRefreshes.delete(feedId);
    });
    this.recommendationRefreshes.set(feedId, refresh);
    return refresh;
  }

  refreshSearch(query: string): Promise<ImportSearchSnapshot> {
    const key = query.trim().toLowerCase();
    const inFlight = this.searchRefreshes.get(key);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.refreshSearchEntry(query).finally(() => {
      this.searchRefreshes.delete(key);
    });
    this.searchRefreshes.set(key, refresh);
    return refresh;
  }

  refreshSource(
    canonicalRepo: string,
    options?: ImportSourceReadOptions,
  ): Promise<UnifiedSourceSnapshot> {
    const key = this.sourceRefreshKey(canonicalRepo, options);
    const inFlight = this.sourceRefreshes.get(key);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.refreshSourceEntry(canonicalRepo, options).finally(() => {
      this.sourceRefreshes.delete(key);
    });
    this.sourceRefreshes.set(key, refresh);
    return refresh;
  }

  private async refreshRecommendationEntry(
    feedId: ImportRecommendationFeedId,
  ): Promise<ImportRecommendationFeed> {
    const checkedAt = new Date().toISOString();
    const groups = feedId === "seed"
      ? [...IMPORT_RECOMMENDATION_SEEDS]
      : await this.options.provider.fetchRecommendationGroups(feedId);
    const entry: ImportRecommendationFeed = {
      id: feedId,
      checkedAt,
      expiresAt: new Date(Date.now() + IMPORT_RECOMMENDATION_CACHE_TTL_MS).toISOString(),
      groups,
    };
    await this.options.store.writeImportRecommendationFeedEntry(entry);
    return entry;
  }

  private async refreshSearchEntry(query: string): Promise<ImportSearchSnapshot> {
    const hits = await this.options.provider.search(query, 20);
    const snapshot: ImportSearchSnapshot = {
      query: query.trim(),
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + IMPORT_SEARCH_CACHE_TTL_MS).toISOString(),
      hits,
      groups: [...new Set(hits.map((hit) => hit.canonicalRepo))],
    };
    await this.options.store.writeImportSearchSnapshotEntry(query.trim().toLowerCase(), snapshot);
    return snapshot;
  }

  private async refreshSourceEntry(
    canonicalRepo: string,
    options?: ImportSourceReadOptions,
  ): Promise<UnifiedSourceSnapshot> {
    const includeSkillDetails = options?.includeSkillDetails
      ?? (options?.enrichSkillIds?.length ?? 0) > 0;
    const trust = await this.resolveCachedSourceTrust(canonicalRepo, {
      refreshInBackground: options?.refreshTrustInBackground ?? includeSkillDetails,
    });
    const snapshot = await this.options.provider.fetchSource(canonicalRepo, {
      includeSkillDetails,
      ...(options?.enrichSkillIds ? { enrichSkillIds: options.enrichSkillIds } : {}),
      ...(this.hasTrust(trust) ? { trust } : {}),
    });
    const mergedSnapshot = options?.cachedSnapshot
      ? this.mergeSourceSnapshots(options.cachedSnapshot, snapshot)
      : snapshot;
    await this.options.store.writeImportSourceSnapshotEntry({
      canonicalRepo,
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + IMPORT_SOURCE_CACHE_TTL_MS).toISOString(),
      data: mergedSnapshot,
    });
    return mergedSnapshot;
  }

  private async resolveCachedSourceTrust(
    canonicalRepo: string,
    options: { refreshInBackground: boolean },
  ): Promise<UnifiedSourceTrust> {
    const recommendations = (await this.options.store.readImportDataCache()).recommendations;
    const trust: UnifiedSourceTrust = {};
    for (const feedId of ["official", "trending", "hot", "audits"] as const) {
      const cachedFeed = recommendations[feedId];
      if (cachedFeed && !isImportDataCacheExpired(cachedFeed)) {
        if (cachedFeed.groups.includes(canonicalRepo)) {
          trust[feedId === "audits" ? "audited" : feedId] = true;
        }
      } else if (options.refreshInBackground) {
        void this.refreshRecommendation(feedId).catch(() => undefined);
      }
    }
    return trust;
  }

  private mergeSourceSnapshots(
    previous: UnifiedSourceSnapshot,
    next: UnifiedSourceSnapshot,
  ): UnifiedSourceSnapshot {
    const previousSkillsById = new Map(previous.skills.map((skill) => [skill.skillId, skill]));
    return {
      ...previous,
      ...next,
      owner: { ...previous.owner, ...next.owner },
      skills: next.skills.map((skill) => {
        const previousSkill = previousSkillsById.get(skill.skillId);
        return previousSkill
          ? {
              ...previousSkill,
              ...skill,
              ...(skill.installedOn?.length
                ? { installedOn: skill.installedOn }
                : previousSkill.installedOn ? { installedOn: previousSkill.installedOn } : {}),
              ...(skill.audits
                ? { audits: skill.audits }
                : previousSkill.audits ? { audits: previousSkill.audits } : {}),
            }
          : skill;
      }),
      trust: { ...(previous.trust ?? {}), ...(next.trust ?? {}) },
    };
  }

  private hasTrust(trust: UnifiedSourceTrust): boolean {
    return trust.official === true || trust.trending === true ||
      trust.hot === true || trust.audited === true;
  }

  private sourceRefreshKey(
    canonicalRepo: string,
    options?: ImportSourceReadOptions,
  ): string {
    const enrichSkillIds = [...new Set(
      (options?.enrichSkillIds ?? []).map((skillId) => skillId.trim()).filter(Boolean),
    )].sort();
    const readShape = options?.includeSkillDetails === undefined
      ? "default"
      : options.includeSkillDetails
        ? "details"
        : "summary";
    const trustShape = options?.refreshTrustInBackground === undefined
      ? "default"
      : options.refreshTrustInBackground
        ? "background"
        : "no-background";
    return JSON.stringify([canonicalRepo, enrichSkillIds, readShape, trustShape]);
  }

  private snapshotNeedsSkillRefresh(
    snapshot: UnifiedSourceSnapshot,
    skillIds: readonly string[],
  ): boolean {
    return skillIds.some((skillId) => {
      const skill = snapshot.skills.find((item) => item.skillId === skillId);
      return !skill || !skill.summary &&
        skill.weeklyInstalls === undefined &&
        !skill.firstSeen &&
        !skill.installedOn?.length &&
        !skill.audits;
    });
  }
}

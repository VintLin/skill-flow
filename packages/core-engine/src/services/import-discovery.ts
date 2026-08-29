import type {
  ImportRecommendationFeed,
  ImportRecommendationFeedId,
  ImportSearchSnapshot,
  UnifiedSourceSnapshot,
} from "@skill-flow/domain/types";
import { normalizeImportCanonicalRepo } from "@skill-flow/integration/utils/skills-directory";
import { isImportDataCacheExpired } from "@skill-flow/storage/import-data-cache";
import { RuntimeStore } from "@skill-flow/storage/runtime-store";

export type ImportSourceReadOptions = {
  enrichSkillIds?: string[];
  includeSkillDetails?: boolean;
  refreshTrustInBackground?: boolean;
  cachedSnapshot?: UnifiedSourceSnapshot;
};

export type ImportDiscoveryProvider = {
  refreshRecommendation(feedId: ImportRecommendationFeedId): Promise<ImportRecommendationFeed>;
  refreshSearch(query: string): Promise<ImportSearchSnapshot>;
  refreshSource(
    canonicalRepo: string,
    options?: ImportSourceReadOptions,
  ): Promise<UnifiedSourceSnapshot>;
};

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

  async resolveRecommendation(feedId: ImportRecommendationFeedId): Promise<string[]> {
    const cached = (await this.options.store.readImportDataCache()).recommendations[feedId];
    if (cached) {
      if (!isImportDataCacheExpired(cached)) {
        return cached.groups;
      }
      void this.refreshRecommendation(feedId).catch(() => undefined);
      return cached.groups;
    }

    if (feedId === "seed") {
      return (await this.refreshRecommendation(feedId)).groups;
    }
    void this.refreshRecommendation(feedId).catch(() => undefined);
    return [];
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
    const cachedSnapshot = cached?.providers.skills?.snapshot;
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
    const cachedSnapshot = cached?.providers.skills?.snapshot;
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

    const refresh = this.options.provider.refreshRecommendation(feedId).finally(() => {
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

    const refresh = this.options.provider.refreshSearch(query).finally(() => {
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

    const refresh = this.options.provider.refreshSource(canonicalRepo, options).finally(() => {
      this.sourceRefreshes.delete(key);
    });
    this.sourceRefreshes.set(key, refresh);
    return refresh;
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

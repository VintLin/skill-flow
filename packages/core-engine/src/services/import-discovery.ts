import type {
  ImportRecommendationFeed,
  ImportRecommendationFeedId,
  ImportSearchSnapshot,
  UnifiedSourceSnapshot,
} from "@skill-flow/domain/types";

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

  constructor(private readonly options: { provider: ImportDiscoveryProvider }) {}

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
}

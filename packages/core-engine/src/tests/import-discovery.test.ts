import { describe, expect, test, vi } from "vitest";
import type {
  ImportRecommendationFeed,
  ImportSearchSnapshot,
  UnifiedSourceSnapshot,
} from "@skill-flow/domain/types";
import {
  ImportDiscovery,
  type ImportDiscoveryProvider,
} from "../services/import-discovery.js";

describe("ImportDiscovery", () => {
  test("shares an in-flight recommendation refresh and releases it after completion", async () => {
    const pending = deferred<ImportRecommendationFeed>();
    const provider = createProvider({
      refreshRecommendation: vi.fn(() => pending.promise),
    });
    const discovery = new ImportDiscovery({ provider });

    const first = discovery.refreshRecommendation("hot");
    const second = discovery.refreshRecommendation("hot");

    expect(provider.refreshRecommendation).toHaveBeenCalledTimes(1);

    const feed = recommendationFeed("hot", ["acme/skills"]);
    pending.resolve(feed);
    await expect(Promise.all([first, second])).resolves.toEqual([feed, feed]);

    await discovery.refreshRecommendation("hot");
    expect(provider.refreshRecommendation).toHaveBeenCalledTimes(2);
  });

  test("shares an in-flight search across normalized queries and releases it after completion", async () => {
    const pending = deferred<ImportSearchSnapshot>();
    const provider = createProvider({
      refreshSearch: vi.fn(() => pending.promise),
    });
    const discovery = new ImportDiscovery({ provider });

    const first = discovery.refreshSearch(" React ");
    const second = discovery.refreshSearch("react");

    expect(provider.refreshSearch).toHaveBeenCalledTimes(1);

    const snapshot = searchSnapshot("React");
    pending.resolve(snapshot);
    await expect(Promise.all([first, second])).resolves.toEqual([snapshot, snapshot]);

    await discovery.refreshSearch("REACT");
    expect(provider.refreshSearch).toHaveBeenCalledTimes(2);
  });

  test("shares a source refresh when repository, sorted skill ids, and read shape match", async () => {
    const pending = deferred<UnifiedSourceSnapshot>();
    const provider = createProvider({
      refreshSource: vi.fn(() => pending.promise),
    });
    const discovery = new ImportDiscovery({ provider });

    const first = discovery.refreshSource("acme/skills", {
      enrichSkillIds: ["beta", "alpha", "beta"],
      includeSkillDetails: false,
    });
    const second = discovery.refreshSource("acme/skills", {
      enrichSkillIds: ["alpha", "beta"],
      includeSkillDetails: false,
    });

    expect(provider.refreshSource).toHaveBeenCalledTimes(1);

    const snapshot = sourceSnapshot("acme/skills");
    pending.resolve(snapshot);
    await expect(Promise.all([first, second])).resolves.toEqual([snapshot, snapshot]);

    await discovery.refreshSource("acme/skills", {
      enrichSkillIds: ["alpha", "beta"],
      includeSkillDetails: false,
    });
    expect(provider.refreshSource).toHaveBeenCalledTimes(2);
  });

  test("keeps repository and source read shapes in separate flights", async () => {
    const provider = createProvider({
      refreshSource: vi.fn(async (canonicalRepo) => sourceSnapshot(canonicalRepo)),
    });
    const discovery = new ImportDiscovery({ provider });

    const refreshes = [
      discovery.refreshSource("acme/skills", { enrichSkillIds: ["alpha"] }),
      discovery.refreshSource("acme/skills", {
        enrichSkillIds: ["alpha"],
        includeSkillDetails: true,
      }),
      discovery.refreshSource("acme/skills", {
        enrichSkillIds: ["alpha"],
        includeSkillDetails: false,
      }),
      discovery.refreshSource("acme/skills", {
        enrichSkillIds: ["alpha"],
        refreshTrustInBackground: true,
      }),
      discovery.refreshSource("acme/skills", {
        enrichSkillIds: ["alpha"],
        refreshTrustInBackground: false,
      }),
      discovery.refreshSource("other/skills", { enrichSkillIds: ["alpha"] }),
    ];

    expect(provider.refreshSource).toHaveBeenCalledTimes(6);
    await Promise.all(refreshes);
  });

  test("releases every flight after provider rejection", async () => {
    const feed = recommendationFeed("hot", ["acme/skills"]);
    const search = searchSnapshot("react");
    const source = sourceSnapshot("acme/skills");
    const refreshRecommendation = vi.fn()
      .mockRejectedValueOnce(new Error("recommendation failed"))
      .mockResolvedValueOnce(feed);
    const refreshSearch = vi.fn()
      .mockRejectedValueOnce(new Error("search failed"))
      .mockResolvedValueOnce(search);
    const refreshSource = vi.fn()
      .mockRejectedValueOnce(new Error("source failed"))
      .mockResolvedValueOnce(source);
    const discovery = new ImportDiscovery({
      provider: createProvider({ refreshRecommendation, refreshSearch, refreshSource }),
    });

    await expect(discovery.refreshRecommendation("hot")).rejects.toThrow("recommendation failed");
    await expect(discovery.refreshSearch("react")).rejects.toThrow("search failed");
    await expect(discovery.refreshSource("acme/skills")).rejects.toThrow("source failed");

    await expect(discovery.refreshRecommendation("hot")).resolves.toBe(feed);
    await expect(discovery.refreshSearch("react")).resolves.toBe(search);
    await expect(discovery.refreshSource("acme/skills")).resolves.toBe(source);
    expect(refreshRecommendation).toHaveBeenCalledTimes(2);
    expect(refreshSearch).toHaveBeenCalledTimes(2);
    expect(refreshSource).toHaveBeenCalledTimes(2);
  });
});

function createProvider(
  overrides: Partial<ImportDiscoveryProvider> = {},
): ImportDiscoveryProvider {
  return {
    refreshRecommendation: vi.fn(async (feedId) => recommendationFeed(feedId, [])),
    refreshSearch: vi.fn(async (query) => searchSnapshot(query)),
    refreshSource: vi.fn(async (canonicalRepo) => sourceSnapshot(canonicalRepo)),
    ...overrides,
  };
}

function recommendationFeed(
  id: ImportRecommendationFeed["id"],
  groups: string[],
): ImportRecommendationFeed {
  return {
    id,
    checkedAt: "2026-08-29T00:00:00.000Z",
    expiresAt: "2026-08-29T01:00:00.000Z",
    groups,
  };
}

function searchSnapshot(query: string): ImportSearchSnapshot {
  return {
    query,
    checkedAt: "2026-08-29T00:00:00.000Z",
    expiresAt: "2026-08-29T01:00:00.000Z",
    hits: [],
    groups: [],
  };
}

function sourceSnapshot(canonicalRepo: string): UnifiedSourceSnapshot {
  return {
    canonicalRepo,
    aliases: [canonicalRepo],
    title: canonicalRepo.split("/").at(-1) ?? canonicalRepo,
    provider: "skills",
    sourceUrl: `https://skills.sh/${canonicalRepo}`,
    repoUrl: `https://github.com/${canonicalRepo}`,
    repoLabel: canonicalRepo,
    owner: {
      slug: canonicalRepo.split("/")[0] ?? "unknown",
      sourceUrl: `https://skills.sh/${canonicalRepo.split("/")[0] ?? "unknown"}`,
    },
    skills: [],
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RuntimeStore } from "@skill-flow/storage/runtime-store";
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
  const temporaryPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryPaths.splice(0).map((entry) =>
      fs.rm(entry, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 })
    ));
  });

  const createDiscovery = (provider: ImportDiscoveryProvider) => {
    const root = path.join(
      os.tmpdir(),
      `skill-flow-import-discovery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    temporaryPaths.push(root);
    const store = new RuntimeStore(root);
    return { discovery: new ImportDiscovery({ provider, store }), store };
  };

  test("shares an in-flight recommendation refresh and releases it after completion", async () => {
    const pending = deferred<string[]>();
    const provider = createProvider({
      fetchRecommendationGroups: vi.fn(() => pending.promise),
    });
    const { discovery } = createDiscovery(provider);

    const first = discovery.refreshRecommendation("hot");
    const second = discovery.refreshRecommendation("hot");

    expect(provider.fetchRecommendationGroups).toHaveBeenCalledTimes(1);

    pending.resolve(["acme/skills"]);
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { id: "hot", groups: ["acme/skills"] },
      { id: "hot", groups: ["acme/skills"] },
    ]);

    await discovery.refreshRecommendation("hot");
    expect(provider.fetchRecommendationGroups).toHaveBeenCalledTimes(2);
  });

  test("shares an in-flight search across normalized queries and releases it after completion", async () => {
    const pending = deferred<ImportSearchSnapshot["hits"]>();
    const provider = createProvider({
      search: vi.fn(() => pending.promise),
    });
    const { discovery } = createDiscovery(provider);

    const first = discovery.refreshSearch(" React ");
    const second = discovery.refreshSearch("react");

    expect(provider.search).toHaveBeenCalledTimes(1);

    pending.resolve([]);
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { query: "React", hits: [] },
      { query: "React", hits: [] },
    ]);

    await discovery.refreshSearch("REACT");
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  test("shares a source refresh when repository, sorted skill ids, and read shape match", async () => {
    const pending = deferred<UnifiedSourceSnapshot>();
    const provider = createProvider({
      fetchSource: vi.fn(() => pending.promise),
    });
    const { discovery } = createDiscovery(provider);

    const first = discovery.refreshSource("acme/skills", {
      enrichSkillIds: ["beta", "alpha", "beta"],
      includeSkillDetails: false,
    });
    const second = discovery.refreshSource("acme/skills", {
      enrichSkillIds: ["alpha", "beta"],
      includeSkillDetails: false,
    });

    await vi.waitFor(() => expect(provider.fetchSource).toHaveBeenCalledTimes(1));

    const snapshot = sourceSnapshot("acme/skills");
    pending.resolve(snapshot);
    await expect(Promise.all([first, second])).resolves.toEqual([snapshot, snapshot]);

    await discovery.refreshSource("acme/skills", {
      enrichSkillIds: ["alpha", "beta"],
      includeSkillDetails: false,
    });
    expect(provider.fetchSource).toHaveBeenCalledTimes(2);
  });

  test("keeps repository and source read shapes in separate flights", async () => {
    const provider = createProvider({
      fetchSource: vi.fn(async (canonicalRepo) => sourceSnapshot(canonicalRepo)),
    });
    const { discovery } = createDiscovery(provider);

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

    await Promise.all(refreshes);
    expect(provider.fetchSource).toHaveBeenCalledTimes(6);
  });

  test("releases every flight after provider rejection", async () => {
    const source = sourceSnapshot("acme/skills");
    const fetchRecommendationGroups = vi.fn()
      .mockRejectedValueOnce(new Error("recommendation failed"))
      .mockResolvedValueOnce(["acme/skills"]);
    const search = vi.fn()
      .mockRejectedValueOnce(new Error("search failed"))
      .mockResolvedValueOnce([]);
    const fetchSource = vi.fn()
      .mockRejectedValueOnce(new Error("source failed"))
      .mockResolvedValueOnce(source);
    const { discovery } = createDiscovery(
      createProvider({ fetchRecommendationGroups, search, fetchSource }),
    );

    await expect(discovery.refreshRecommendation("hot")).rejects.toThrow("recommendation failed");
    await expect(discovery.refreshSearch("react")).rejects.toThrow("search failed");
    await expect(discovery.refreshSource("acme/skills")).rejects.toThrow("source failed");

    await expect(discovery.refreshRecommendation("hot")).resolves.toMatchObject({ groups: ["acme/skills"] });
    await expect(discovery.refreshSearch("react")).resolves.toMatchObject({ hits: [] });
    await expect(discovery.refreshSource("acme/skills")).resolves.toBe(source);
    expect(fetchRecommendationGroups).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledTimes(2);
    expect(fetchSource).toHaveBeenCalledTimes(2);
  });

  test("returns a fresh search cache entry without calling the provider", async () => {
    const provider = createProvider();
    const { discovery, store } = createDiscovery(provider);
    const cached = searchSnapshot("react", Date.now() + 60_000);
    await store.writeImportSearchSnapshotEntry("react", cached);

    await expect(discovery.resolveSearch(" React ")).resolves.toEqual(cached);
    expect(provider.search).not.toHaveBeenCalled();
  });

  test("returns stale search data immediately and refreshes it in the background", async () => {
    const pending = deferred<ImportSearchSnapshot["hits"]>();
    const search = vi.fn(() => pending.promise);
    const provider = createProvider({ search });
    const { discovery, store } = createDiscovery(provider);
    const stale = searchSnapshot("react", Date.now() - 1);
    await store.writeImportSearchSnapshotEntry("react", stale);

    await expect(discovery.resolveSearch("react")).resolves.toEqual(stale);
    expect(provider.search).toHaveBeenCalledTimes(1);
    pending.resolve([]);
    await search.mock.results[0]?.value;
  });

  test("falls back to a stale source snapshot when required enrichment fails", async () => {
    const provider = createProvider({
      fetchSource: vi.fn(async () => { throw new Error("provider unavailable"); }),
    });
    const { discovery, store } = createDiscovery(provider);
    const stale = sourceSnapshot("acme/skills");
    await store.writeImportSourceSnapshotEntry({
      canonicalRepo: stale.canonicalRepo,
      checkedAt: "2026-08-29T00:00:00.000Z",
      expiresAt: "2026-08-29T00:00:00.001Z",
      data: stale,
    });

    await expect(discovery.resolveSource("acme/skills", {
      enrichSkillIds: ["missing-skill"],
      refreshTrustInBackground: false,
    })).resolves.toEqual(stale);
    expect(provider.fetchSource).toHaveBeenCalledTimes(1);
  });

  test("passes cached trust to the provider and preserves prior skill enrichment", async () => {
    const previous = {
      ...sourceSnapshot("acme/skills"),
      skills: [{ skillId: "alpha", title: "Alpha", summary: "Existing summary" }],
    };
    const next = {
      ...sourceSnapshot("acme/skills"),
      skills: [{ skillId: "alpha", title: "Alpha", installs: 42 }],
    };
    const fetchSource = vi.fn(async () => next);
    const { discovery, store } = createDiscovery(createProvider({ fetchSource }));
    await store.writeImportRecommendationFeedEntry({
      id: "official",
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      groups: ["acme/skills"],
    });

    const refreshed = await discovery.refreshSource("acme/skills", {
      includeSkillDetails: true,
      refreshTrustInBackground: false,
      cachedSnapshot: previous,
    });

    expect(fetchSource).toHaveBeenCalledWith("acme/skills", {
      includeSkillDetails: true,
      trust: { official: true },
    });
    expect(refreshed.skills[0]).toMatchObject({
      skillId: "alpha",
      summary: "Existing summary",
      installs: 42,
    });
  });
});

function createProvider(
  overrides: Partial<ImportDiscoveryProvider> = {},
): ImportDiscoveryProvider {
  return {
    fetchRecommendationGroups: vi.fn(async () => []),
    search: vi.fn(async () => []),
    fetchSource: vi.fn(async (canonicalRepo) => sourceSnapshot(canonicalRepo)),
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

function searchSnapshot(query: string, expiresAt = Date.now() + 60_000): ImportSearchSnapshot {
  return {
    query,
    checkedAt: "2026-08-29T00:00:00.000Z",
    expiresAt: new Date(expiresAt).toISOString(),
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

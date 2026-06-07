import { describe, expect, test } from "vitest";
import {
  createEmptyImportPreparationCache,
  isImportPreparationExpired,
  normalizeImportPreparationCache,
  pruneImportPreparationCache,
} from "../import-preparation-cache.js";

describe("import-preparation-cache", () => {
  test("creates an empty preparation cache shape", () => {
    expect(createEmptyImportPreparationCache()).toEqual({
      records: {},
    });
  });

  test("normalizes valid records and drops invalid cache entries", () => {
    const cache = normalizeImportPreparationCache({
      records: {
        "prep-1": {
          id: "ignored",
          locator: "anthropics/skills",
          canonicalRepo: "anthropics/skills",
          sourceKind: "git",
          checkoutPath: "/tmp/prep-1",
          sourceId: "anthropics-skills",
          displayName: "skills",
          status: "ready",
          preparedAt: "2026-06-04T00:00:00.000Z",
          expiresAt: "2026-06-05T00:00:00.000Z",
          commitSha: "abc123",
          skillIds: ["review"],
          availableTargets: ["cursor"],
        },
        broken: {
          locator: "missing-fields",
        },
      },
      locatorIndex: {
        "anthropics/skills": "prep-1",
        missing: "not-present",
      },
    });

    expect(cache.records["prep-1"]).toMatchObject({
      id: "prep-1",
      locator: "anthropics/skills",
      canonicalRepo: "anthropics/skills",
      sourceKind: "git",
      status: "ready",
      skillIds: ["review"],
      availableTargets: ["cursor"],
    });
    expect(cache.records.broken).toBeUndefined();
    expect(cache).not.toHaveProperty("locatorIndex");
  });

  test("normalizes old import preparation cache by discarding locatorIndex and lease", () => {
    const normalized = normalizeImportPreparationCache({
      schemaVersion: 2,
      records: {
        "prep-1": {
          id: "prep-1",
          cacheKey: "github:owner/repo",
          locator: "https://github.com/owner/repo",
          canonicalRepo: "github:owner/repo",
          sourceKind: "git",
          checkoutPath: "/tmp/source/git/repo",
          sourceId: "repo",
          displayName: "Repo",
          status: "ready",
          preparedAt: "2026-06-07T00:00:00.000Z",
          expiresAt: "2026-06-08T00:00:00.000Z",
          skillIds: ["writer"],
          availableTargets: ["codex"],
          lease: {
            token: "legacy-token",
            expiresAt: "2026-06-08T00:00:00.000Z",
            state: "ready",
          },
        },
      },
      locatorIndex: {
        "github:owner/repo": "prep-1",
      },
    });

    expect(normalized).not.toHaveProperty("locatorIndex");
    expect(normalized.records["prep-1"]).not.toHaveProperty("lease");
  });

  test("does not derive current status from legacy lease state", () => {
    const normalized = normalizeImportPreparationCache({
      records: {
        "prep-1": {
          id: "prep-1",
          cacheKey: "github:owner/repo",
          locator: "https://github.com/owner/repo",
          canonicalRepo: "github:owner/repo",
          sourceKind: "git",
          checkoutPath: "/tmp/source/git/repo",
          sourceId: "repo",
          displayName: "Repo",
          preparedAt: "2026-06-07T00:00:00.000Z",
          expiresAt: "2026-06-08T00:00:00.000Z",
          skillIds: ["writer"],
          availableTargets: ["codex"],
          lease: {
            token: "legacy-token",
            expiresAt: "2026-06-08T00:00:00.000Z",
            state: "ready",
          },
        },
      },
    });

    expect(normalized.records["prep-1"]).toBeUndefined();
  });

  test("writes import preparation cache without locatorIndex and lease", () => {
    const normalized = normalizeImportPreparationCache({
      records: {
        "prep-1": {
          id: "prep-1",
          cacheKey: "github:owner/repo",
          locator: "https://github.com/owner/repo",
          canonicalRepo: "github:owner/repo",
          sourceKind: "git",
          checkoutPath: "/tmp/source/git/repo",
          sourceId: "repo",
          displayName: "Repo",
          status: "ready",
          preparedAt: "2026-06-07T00:00:00.000Z",
          expiresAt: "2026-06-08T00:00:00.000Z",
          skillIds: ["writer"],
          availableTargets: ["codex"],
        },
      },
    });

    expect(JSON.stringify(normalized)).not.toContain("locatorIndex");
    expect(JSON.stringify(normalized)).not.toContain("lease");
  });

  test("accepts v2 source kinds in preparation records", () => {
    const cache = normalizeImportPreparationCache({
      records: {
        "prep-git": {
          locator: "owner/repo",
          canonicalRepo: "owner/repo",
          sourceKind: "git",
          checkoutPath: "/tmp/prep-git",
          sourceId: "owner-repo",
          displayName: "repo",
          status: "ready",
          preparedAt: "2026-06-04T00:00:00.000Z",
          expiresAt: "2026-06-05T00:00:00.000Z",
          skillIds: [],
          availableTargets: [],
        },
        "prep-collection": {
          locator: "collection:stack",
          canonicalRepo: "collection:stack",
          sourceKind: "collection",
          checkoutPath: "/tmp/prep-collection",
          sourceId: "stack",
          displayName: "Stack",
          status: "ready",
          preparedAt: "2026-06-04T00:00:00.000Z",
          expiresAt: "2026-06-05T00:00:00.000Z",
          skillIds: [],
          availableTargets: [],
        },
      },
    });

    expect(cache.records["prep-git"]?.sourceKind).toBe("git");
    expect(cache.records["prep-collection"]?.sourceKind).toBe("collection");
  });

  test("treats elapsed and invalid expiry timestamps as expired", () => {
    const now = new Date("2026-06-04T12:00:00.000Z");

    expect(isImportPreparationExpired({ expiresAt: "bad" }, now)).toBe(true);
    expect(isImportPreparationExpired({ expiresAt: "2026-06-04T00:00:00.000Z" }, now)).toBe(true);
    expect(isImportPreparationExpired({ expiresAt: "2026-06-05T00:00:00.000Z" }, now)).toBe(false);
  });

  test("prunes expired records and limits retained records by preparedAt", () => {
    const cache = normalizeImportPreparationCache({
      records: Object.fromEntries(
        Array.from({ length: 14 }, (_, index) => {
          const id = `prep-${index}`;
          return [id, {
            id,
            locator: `owner/repo-${index}`,
            canonicalRepo: `owner/repo-${index}`,
            sourceKind: "git",
            checkoutPath: `/tmp/${id}`,
            sourceId: `owner-repo-${index}`,
            displayName: `repo-${index}`,
            status: "ready",
            preparedAt: `2026-06-04T00:${String(index).padStart(2, "0")}:00.000Z`,
            expiresAt: "2026-06-05T00:00:00.000Z",
            skillIds: [],
            availableTargets: [],
          }];
        }),
      ),
    });

    const pruned = pruneImportPreparationCache(cache, {
      now: new Date("2026-06-04T12:00:00.000Z"),
      maxRecords: 12,
    });

    expect(Object.keys(pruned.records)).toHaveLength(12);
    expect(pruned.records["prep-0"]).toBeUndefined();
    expect(pruned.records["prep-1"]).toBeUndefined();
    expect(pruned.records["prep-13"]).toBeDefined();
  });

  test("prunes abandoned committing records after stale threshold", () => {
    const baseRecord = {
      locator: "owner/repo",
      canonicalRepo: "owner/repo",
      sourceKind: "git",
      checkoutPath: "/tmp/repo",
      sourceId: "owner-repo",
      displayName: "repo",
      expiresAt: "2026-06-05T00:00:00.000Z",
      skillIds: [],
      availableTargets: [],
    };
    const cache = normalizeImportPreparationCache({
      records: {
        "prep-old": {
          ...baseRecord,
          status: "committing",
          preparedAt: "2026-06-04T00:00:00.000Z",
        },
        "prep-fresh": {
          ...baseRecord,
          status: "committing",
          preparedAt: "2026-06-04T00:02:00.000Z",
        },
      },
    });

    const pruned = pruneImportPreparationCache(cache, {
      now: new Date("2026-06-04T00:06:00.000Z"),
    });

    expect(pruned.records["prep-old"]).toBeUndefined();
    expect(pruned.records["prep-fresh"]).toBeDefined();
  });
});

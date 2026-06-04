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
      locatorIndex: {},
    });
  });

  test("normalizes valid records and drops invalid locator index entries", () => {
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
    expect(cache.locatorIndex).toEqual({
      "anthropics/skills": "prep-1",
    });
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
      locatorIndex: {},
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
});

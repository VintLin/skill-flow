import { describe, expect, test } from "vitest";
import {
  createEmptyImportDataCache,
  isImportDataCacheExpired,
  normalizeImportDataCache,
} from "../import-data-cache.js";

describe("import-data-cache", () => {
  test("creates an empty import cache shape", () => {
    expect(createEmptyImportDataCache()).toEqual({
      searches: {},
      repos: {},
      recommendations: {},
    });
  });

  test("normalizes invalid payloads to an empty cache", () => {
    expect(normalizeImportDataCache(null)).toEqual(createEmptyImportDataCache());
    expect(normalizeImportDataCache([])).toEqual(createEmptyImportDataCache());
  });

  test("keeps only valid search, repo, and recommendation entries", () => {
    expect(
      normalizeImportDataCache({
        searches: {
          browse: {
            checkedAt: "2026-03-28T00:00:00.000Z",
            expiresAt: "2026-03-29T00:00:00.000Z",
            hits: [
              {
                id: "browse",
                skillId: "browse",
                title: "Browse",
                source: "anthropics/skills",
                canonicalRepo: "anthropics/skills",
                installs: 12,
              },
              { broken: true },
            ],
            groups: ["anthropics/skills"],
          },
        },
        repos: {
          "anthropics/skills": {
            identity: {
              canonicalRepo: "anthropics/skills",
              aliases: [],
              origins: ["skills"],
            },
            providers: {
              skills: {
                provider: "skills",
                status: "ready",
                checkedAt: "2026-03-28T00:00:00.000Z",
                expiresAt: "2026-03-29T00:00:00.000Z",
                snapshot: {
                  canonicalRepo: "anthropics/skills",
                  aliases: [],
                  title: "skills",
                  sourceUrl: "https://skills.sh/anthropics/skills",
                  repoUrl: "https://github.com/anthropics/skills",
                  repoLabel: "anthropics/skills",
                  owner: {
                    slug: "anthropics",
                    sourceUrl: "https://skills.sh/anthropics",
                  },
                  skills: [],
                },
              },
            },
            resolved: {
              title: "skills",
              author: "anthropics",
              githubUrl: "https://github.com/anthropics/skills",
              sourceUrl: "https://skills.sh/anthropics/skills",
              skillCount: 4,
              fieldSources: {
                title: "skills",
                author: "skills",
                githubUrl: "skills",
                sourceUrl: "skills",
                skillCount: "skills",
              },
            },
            checkedAt: "2026-03-28T00:00:00.000Z",
            expiresAt: "2026-03-29T00:00:00.000Z",
          },
        },
        recommendations: {
          trending: {
            id: "trending",
            checkedAt: "2026-03-28T00:00:00.000Z",
            expiresAt: "2026-03-29T00:00:00.000Z",
            groups: ["anthropics/skills"],
          },
          broken: {},
        },
      }),
    ).toEqual({
      searches: {
        browse: {
          query: "browse",
          checkedAt: "2026-03-28T00:00:00.000Z",
          expiresAt: "2026-03-29T00:00:00.000Z",
          hits: [
            {
              id: "browse",
              skillId: "browse",
              title: "Browse",
              source: "anthropics/skills",
              canonicalRepo: "anthropics/skills",
              installs: 12,
            },
          ],
          groups: ["anthropics/skills"],
        },
      },
      repos: {
        "anthropics/skills": {
          canonicalRepo: "anthropics/skills",
          checkedAt: "2026-03-28T00:00:00.000Z",
          expiresAt: "2026-03-29T00:00:00.000Z",
          identity: {
            canonicalRepo: "anthropics/skills",
            aliases: [],
            origins: ["skills"],
          },
          providers: {
            skills: {
              provider: "skills",
              status: "ready",
              checkedAt: "2026-03-28T00:00:00.000Z",
              expiresAt: "2026-03-29T00:00:00.000Z",
              snapshot: {
                canonicalRepo: "anthropics/skills",
                aliases: [],
                title: "skills",
                provider: "skills",
                sourceUrl: "https://skills.sh/anthropics/skills",
                repoUrl: "https://github.com/anthropics/skills",
                repoLabel: "anthropics/skills",
                owner: {
                  slug: "anthropics",
                  sourceUrl: "https://skills.sh/anthropics",
                },
                skills: [],
              },
            },
          },
          resolved: {
            title: "skills",
            author: "anthropics",
            githubUrl: "https://github.com/anthropics/skills",
            sourceUrl: "https://skills.sh/anthropics/skills",
            skillCount: 4,
            fieldSources: {
              title: "skills",
              author: "skills",
              githubUrl: "skills",
              sourceUrl: "skills",
              skillCount: "skills",
            },
          },
        },
      },
      recommendations: {
        trending: {
          id: "trending",
          checkedAt: "2026-03-28T00:00:00.000Z",
          expiresAt: "2026-03-29T00:00:00.000Z",
          groups: ["anthropics/skills"],
        },
      },
    });
  });

  test("treats invalid or elapsed expiry timestamps as expired", () => {
    expect(
      isImportDataCacheExpired(
        { expiresAt: "invalid" },
        new Date("2026-03-28T12:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isImportDataCacheExpired(
        { expiresAt: "2026-03-29T00:00:00.000Z" },
        new Date("2026-03-28T12:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

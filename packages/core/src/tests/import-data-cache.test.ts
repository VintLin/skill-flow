import { describe, expect, test } from "vitest";
import {
  isImportDataCacheExpired,
  normalizeImportDataCache,
} from "../state/import-data-cache.js";

describe("import data cache", () => {
  test("normalizes unified source/search/recommendation cache payloads", () => {
    expect(normalizeImportDataCache({
      searches: {
        design: {
          checkedAt: "2026-03-27T00:00:00.000Z",
          expiresAt: "2026-03-27T00:05:00.000Z",
          hits: [
            {
              id: "anthropics/skills/frontend-design",
              skillId: "frontend-design",
              title: "frontend-design",
              installs: 208400,
              source: "anthropics/skills",
              canonicalRepo: "anthropics/skills",
            },
          ],
          groups: ["anthropics/skills"],
        },
      },
      sources: {
        "anthropics/skills": {
          checkedAt: "2026-03-27T00:00:00.000Z",
          expiresAt: "2026-03-27T00:05:00.000Z",
          data: {
            canonicalRepo: "anthropics/skills",
            aliases: ["anthropics/skills"],
            title: "skills",
            provider: "skills",
            sourceUrl: "https://skills.sh/anthropics/skills",
            repoUrl: "https://github.com/anthropics/skills",
            repoLabel: "anthropics/skills",
            totalInstalls: 744300,
            owner: {
              slug: "anthropics",
              sourceUrl: "https://skills.sh/anthropics",
              sourceCount: 11,
            },
            skills: [
              {
                skillId: "frontend-design",
                title: "frontend-design",
                installs: 208400,
              },
            ],
            trust: {
              official: true,
            },
          },
        },
      },
      recommendations: {
        seed: {
          id: "seed",
          checkedAt: "2026-03-27T00:00:00.000Z",
          expiresAt: "2026-03-27T00:05:00.000Z",
          groups: ["anthropics/skills"],
        },
      },
    })).toEqual({
      searches: {
        design: {
          query: "design",
          checkedAt: "2026-03-27T00:00:00.000Z",
          expiresAt: "2026-03-27T00:05:00.000Z",
          hits: [{
            id: "anthropics/skills/frontend-design",
            skillId: "frontend-design",
            title: "frontend-design",
            installs: 208400,
            source: "anthropics/skills",
            canonicalRepo: "anthropics/skills",
          }],
          groups: ["anthropics/skills"],
        },
      },
      sources: {
        "anthropics/skills": {
          canonicalRepo: "anthropics/skills",
          checkedAt: "2026-03-27T00:00:00.000Z",
          expiresAt: "2026-03-27T00:05:00.000Z",
          data: {
            canonicalRepo: "anthropics/skills",
            aliases: ["anthropics/skills"],
            title: "skills",
            provider: "skills",
            sourceUrl: "https://skills.sh/anthropics/skills",
            repoUrl: "https://github.com/anthropics/skills",
            repoLabel: "anthropics/skills",
            totalInstalls: 744300,
            owner: {
              slug: "anthropics",
              sourceUrl: "https://skills.sh/anthropics",
              sourceCount: 11,
            },
            skills: [{
              skillId: "frontend-design",
              title: "frontend-design",
              installs: 208400,
            }],
            trust: {
              official: true,
            },
          },
        },
      },
      recommendations: {
        seed: {
          id: "seed",
          checkedAt: "2026-03-27T00:00:00.000Z",
          expiresAt: "2026-03-27T00:05:00.000Z",
          groups: ["anthropics/skills"],
        },
      },
    });
  });

  test("marks cache entries expired from expiresAt", () => {
    expect(isImportDataCacheExpired(
      { expiresAt: "2026-03-27T00:05:00.000Z" },
      new Date("2026-03-27T00:05:00.001Z"),
    )).toBe(true);
  });
});

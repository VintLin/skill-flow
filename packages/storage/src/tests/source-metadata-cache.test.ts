import { describe, expect, test } from "vitest";
import {
  isSourceMetadataCacheExpired,
  normalizeSourceMetadataCache,
  sourceMetadataCacheEntryToResult,
  sourceMetadataResultToCacheEntry,
} from "../source-metadata-cache.js";

describe("source-metadata-cache", () => {
  test("round-trips ready metadata results through cache entries", () => {
    const entry = sourceMetadataResultToCacheEntry({
      sourceId: "alpha",
      checkedAt: "2026-03-28T00:00:00.000Z",
      expiresAt: "2026-03-29T00:00:00.000Z",
      result: {
        status: "ready",
        provider: "github",
        data: {
          provider: "github",
          repoLabel: "owner/repo",
          repoUrl: "https://github.com/owner/repo",
          starCount: 12,
        },
      },
    });

    expect(sourceMetadataCacheEntryToResult(entry)).toEqual({
      status: "ready",
      provider: "github",
      data: {
        provider: "github",
        repoLabel: "owner/repo",
        repoUrl: "https://github.com/owner/repo",
        starCount: 12,
      },
    });
  });

  test("normalizes invalid cache entries away and preserves valid ones", () => {
    expect(
      normalizeSourceMetadataCache({
        alpha: {
          status: "ready",
          checkedAt: "2026-03-28T00:00:00.000Z",
          expiresAt: "2026-03-29T00:00:00.000Z",
          provider: "github",
          data: {
            provider: "github",
            repoLabel: "owner/repo",
            repoUrl: "https://github.com/owner/repo",
            starCount: 10,
          },
        },
        beta: {
          status: "ready",
          checkedAt: "",
          expiresAt: "",
        },
      }),
    ).toEqual({
      alpha: {
        sourceId: "alpha",
        status: "ready",
        checkedAt: "2026-03-28T00:00:00.000Z",
        expiresAt: "2026-03-29T00:00:00.000Z",
        provider: "github",
        data: {
          provider: "github",
          repoLabel: "owner/repo",
          repoUrl: "https://github.com/owner/repo",
          starCount: 10,
        },
      },
    });
  });

  test("treats invalid or elapsed expiry timestamps as expired", () => {
    expect(
      isSourceMetadataCacheExpired(
        {
          sourceId: "alpha",
          status: "unsupported",
          checkedAt: "2026-03-28T00:00:00.000Z",
          expiresAt: "not-a-date",
          reasonCode: "provider_not_supported",
        },
        new Date("2026-03-28T12:00:00.000Z"),
      ),
    ).toBe(true);

    expect(
      isSourceMetadataCacheExpired(
        {
          sourceId: "alpha",
          status: "unsupported",
          checkedAt: "2026-03-28T00:00:00.000Z",
          expiresAt: "2026-03-29T00:00:00.000Z",
          reasonCode: "provider_not_supported",
        },
        new Date("2026-03-28T12:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

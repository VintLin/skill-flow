import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { StateStore } from "../state/store.js";
import {
  isSourceMetadataCacheExpired,
  sourceMetadataCacheEntryToResult,
  sourceMetadataResultToCacheEntry,
} from "../state/source-metadata-cache.js";

describe("source metadata cache", () => {
  const sandboxRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      sandboxRoots.splice(0).map((sandboxRoot) =>
        fs.rm(sandboxRoot, { recursive: true, force: true }),
      ),
    );
  });

  async function createStore() {
    const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-metadata-cache-"));
    sandboxRoots.push(sandboxRoot);
    return new StateStore(path.join(sandboxRoot, "state"));
  }

  test("writes and reads source metadata cache entries", async () => {
    const store = await createStore();
    const entry = sourceMetadataResultToCacheEntry({
      sourceId: "alpha",
      result: {
        status: "ready",
        provider: "skills",
        data: {
          provider: "skills",
          totalInstalls: 42,
        },
      },
      checkedAt: "2026-03-27T00:00:00.000Z",
      expiresAt: "2026-03-27T01:00:00.000Z",
    });

    await store.writeSourceMetadataEntry(entry);

    await expect(store.readSourceMetadataCache()).resolves.toEqual({
      alpha: entry,
    });
  });

  test("prunes source metadata cache entries for removed sources", async () => {
    const store = await createStore();
    await store.writeSourceMetadataCache({
      alpha: sourceMetadataResultToCacheEntry({
        sourceId: "alpha",
        result: {
          status: "ready",
          provider: "github",
          data: {
            provider: "github",
            starCount: 10,
          },
        },
        checkedAt: "2026-03-27T00:00:00.000Z",
        expiresAt: "2026-03-27T01:00:00.000Z",
      }),
      beta: sourceMetadataResultToCacheEntry({
        sourceId: "beta",
        result: {
          status: "failed",
          provider: "skills",
          reasonCode: "provider_request_failed",
          retryable: true,
        },
        checkedAt: "2026-03-27T00:00:00.000Z",
        expiresAt: "2026-03-27T01:00:00.000Z",
      }),
    });

    await expect(store.pruneSourceMetadataCache(["beta"])).resolves.toEqual({
      beta: sourceMetadataResultToCacheEntry({
        sourceId: "beta",
        result: {
          status: "failed",
          provider: "skills",
          reasonCode: "provider_request_failed",
          retryable: true,
        },
        checkedAt: "2026-03-27T00:00:00.000Z",
        expiresAt: "2026-03-27T01:00:00.000Z",
      }),
    });
  });

  test("converts cached entries back to source metadata results", () => {
    const entry = sourceMetadataResultToCacheEntry({
      sourceId: "alpha",
      result: {
        status: "unsupported",
        provider: "github",
        reasonCode: "provider_data_unavailable",
      },
      checkedAt: "2026-03-27T00:00:00.000Z",
      expiresAt: "2026-03-27T01:00:00.000Z",
    });

    expect(sourceMetadataCacheEntryToResult(entry)).toEqual({
      status: "unsupported",
      provider: "github",
      reasonCode: "provider_data_unavailable",
    });
  });

  test("marks expired entries using expiresAt", () => {
    expect(
      isSourceMetadataCacheExpired(
        sourceMetadataResultToCacheEntry({
          sourceId: "alpha",
          result: {
            status: "failed",
            provider: "github",
            reasonCode: "provider_request_failed",
            retryable: true,
          },
          checkedAt: "2026-03-27T00:00:00.000Z",
          expiresAt: "2026-03-27T01:00:00.000Z",
        }),
        new Date("2026-03-27T01:00:00.001Z"),
      ),
    ).toBe(true);
  });
});

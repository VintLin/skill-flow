import { describe, expect, test } from "vitest";
import { getActiveProjectionsV2 } from "./projection-v2.js";
import type { LockFileV2 } from "./types.js";

describe("projection v2", () => {
  test("returns only active projections", () => {
    const lockFile: LockFileV2 = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: {},
      leafInventory: [],
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:one",
          targetPath: "/targets/codex/one",
          targetRootPath: "/targets/codex",
          strategy: "symlink",
          contentHash: "hash-one",
          status: "active",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:two",
          targetPath: "/targets/codex/two",
          targetRootPath: "/targets/codex",
          strategy: "symlink",
          contentHash: "hash-two",
          status: "removed",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    };

    expect(getActiveProjectionsV2(lockFile)).toEqual([lockFile.projections[0]]);
  });
});

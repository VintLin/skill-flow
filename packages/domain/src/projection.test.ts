import { describe, expect, test } from "vitest";
import { getActiveProjections } from "./projection.js";
import type { LockFile } from "./types.js";

describe("projection", () => {
  test("returns only active projections", () => {
    const lockFile: LockFile = {
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
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:three",
          targetPath: "/targets/codex/three",
          targetRootPath: "/targets/codex",
          strategy: "symlink",
          contentHash: "hash-three",
          status: "blocked",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
    };

    expect(getActiveProjections(lockFile)).toEqual([lockFile.projections[0]]);
  });
});

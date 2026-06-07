import { describe, expect, test } from "vitest";
import type { LockFile } from "@skill-flow/domain/types";
import {
  activeProjections,
  bootstrapImportedTargets,
} from "@skill-flow/core-engine/services/projection-ledger";

describe("bootstrap projection rebuild", () => {
  test("keeps active bootstrap projections without mode", () => {
    const lockFile: LockFile = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: {
        repo: {
          sourceId: "repo",
          canonicalLocator: "https://github.com/acme/skills.git",
          revision: {
            provider: "git",
            commit: "abc123",
            capturedAt: "2026-06-07T00:00:00.000Z",
          },
          localPath: "/state/source/git/repo",
          leafIds: ["repo:review"],
          importMode: "bootstrap-detected",
          observedTargets: [
            {
              target: "codex",
              rootPath: "/targets/codex",
              targetPath: "/targets/codex/review",
            },
          ],
          importedFromTargets: ["cursor"],
        },
      },
      leafInventory: [],
      projections: [
        {
          sourceId: "repo",
          leafId: "repo:review",
          target: "codex",
          targetPath: "/targets/codex/review",
          strategy: "symlink",
          contentHash: "hash-review",
          status: "active",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ],
    };
    const sourceLock = lockFile.sources.repo;
    expect(sourceLock).toBeDefined();
    if (!sourceLock) {
      return;
    }

    const active = activeProjections(lockFile);

    expect(active).toHaveLength(1);
    expect(active[0]).toEqual(expect.not.objectContaining({ mode: expect.anything() }));
    expect(bootstrapImportedTargets(lockFile, sourceLock)).toEqual(["codex", "cursor"]);
  });
});

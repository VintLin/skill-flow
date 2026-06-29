import { describe, expect, test } from "vitest";
import type {
  CollectionsFile,
  LockFile,
  ManifestFile,
  PreferencesFile,
} from "@skill-flow/domain/types";
import { WorkflowService } from "../workflow-service.js";

describe("current authority state shape", () => {
  test("uses current v2 authority DTO without v1 view fields", () => {
    const manifest: ManifestFile = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: [
        {
          id: "repo",
          kind: "git",
          locator: "https://github.com/acme/skills.git",
          canonicalLocator: "https://github.com/acme/skills.git",
          displayName: "Skills",
          enabled: true,
          createdAt: "2026-06-07T00:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ],
      bindings: {
        repo: {
          sourceId: "repo",
          selectionMode: "selected",
          selectedLeafIds: ["repo:review"],
          enabledTargets: [],
        },
      },
    };
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
        },
      },
      leafInventory: [
        {
          id: "repo:review",
          sourceId: "repo",
          relativePath: "review",
          linkName: "review",
          title: "Review",
          description: "Review skill.",
          absolutePath: "/state/source/git/repo/review",
          skillFilePath: "/state/source/git/repo/review/SKILL.md",
          displayName: "review",
          contentHash: "hash-review",
          selectors: { aliases: [] },
          valid: true,
          diagnostics: [],
        },
      ],
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
    const preferences: PreferencesFile = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
    };
    const collections: CollectionsFile = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      collections: {},
    };

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.sources[0]?.kind).toBe("git");
    expect(lockFile.sources.repo?.revision.provider).toBe("git");
    expect(Object.values(lockFile.sources).map((source) => source.sourceId)).toEqual(["repo"]);
    expect(lockFile).not.toHaveProperty("deployments");
    expect(lockFile).not.toHaveProperty("projectionViews");
    expect(lockFile.projections).toEqual([
      expect.not.objectContaining({ mode: expect.anything() }),
    ]);
    expect(preferences.schemaVersion).toBe(2);

    const summaries = new WorkflowService().getSummaries(
      manifest,
      lockFile,
      undefined,
      collections,
    );
    expect(summaries[0]?.bindings).toEqual({
      selectedLeafIds: ["repo:review"],
      resolvedSelectedLeafCount: 1,
      targets: {},
    });
    expect(summaries[0]?.activeTargetCount).toBe(0);
  });
});

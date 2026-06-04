import path from "node:path";
import { describe, expect, test } from "vitest";
import type {
  ChannelDetection,
  DeploymentStrategy,
  DeploymentTargetId,
  LeafRecordV2,
  LockFileV2,
  ManifestFileV2,
} from "@skill-flow/domain/types";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import { DeploymentPlannerV2 } from "../services/deployment-planner-v2.js";

describe("deployment planner v2", () => {
  test("plans create and update actions for every source leaf when selectionMode is all", async () => {
    const rootPath = "/targets/codex";
    const manifest = createManifest({
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:two",
          targetPath: path.join(rootPath, "two"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "old-hash-two",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlannerV2([
      createAdapter({ target: "codex", rootPath }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([
      expect.objectContaining({
        kind: "create",
        leafId: "source-a:one",
        sourcePath: "/sources/source-a/one",
        targetPath: path.join(rootPath, "one"),
        targetRootPath: rootPath,
        contentHash: "hash-one",
      }),
      expect.objectContaining({
        kind: "update",
        leafId: "source-a:two",
        sourcePath: "/sources/source-a/two",
        targetPath: path.join(rootPath, "two"),
        targetRootPath: rootPath,
        contentHash: "hash-two",
      }),
    ]);
  });

  test("plans only selected leaf actions when selected mode is enabled for the target", async () => {
    const rootPath = "/targets/codex";
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:two"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile();
    const planner = new DeploymentPlannerV2([
      createAdapter({ target: "codex", rootPath }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([
      expect.objectContaining({
        kind: "create",
        leafId: "source-a:two",
        targetPath: path.join(rootPath, "two"),
      }),
    ]);
  });

  test("plans remove actions for active projections when the target is disabled", async () => {
    const rootPath = "/targets/codex";
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: [],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:one",
          targetPath: path.join(rootPath, "one"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-one",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlannerV2([
      createAdapter({ target: "codex", rootPath }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([
      expect.objectContaining({
        kind: "remove",
        leafId: "source-a:one",
        targetPath: path.join(rootPath, "one"),
        targetRootPath: rootPath,
      }),
    ]);
  });
});

function createManifest(binding: {
  selectionMode: "all" | "selected";
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
}): ManifestFileV2 {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: [
      {
        id: "source-a",
        kind: "git",
        locator: "https://github.com/example/source-a.git",
        canonicalLocator: "github:example/source-a",
        displayName: "Source A",
        enabled: true,
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
    ],
    bindings: {
      "source-a": {
        sourceId: "source-a",
        selectionMode: binding.selectionMode,
        selectedLeafIds: binding.selectedLeafIds,
        enabledTargets: binding.enabledTargets,
      },
    },
  };
}

function createLockFile(options: {
  projections?: LockFileV2["projections"];
} = {}): LockFileV2 {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: {
      "source-a": {
        sourceId: "source-a",
        canonicalLocator: "github:example/source-a",
        revision: {
          provider: "git",
          commit: "abc123",
          capturedAt: "2026-06-04T00:00:00.000Z",
        },
        localPath: "/sources/source-a",
        leafIds: ["source-a:one", "source-a:two"],
      },
    },
    leafInventory: [
      createLeaf("source-a:one", "one", "hash-one"),
      createLeaf("source-a:two", "two", "hash-two"),
    ],
    projections: options.projections ?? [],
  };
}

function createLeaf(id: string, linkName: string, contentHash: string): LeafRecordV2 {
  return {
    id,
    sourceId: "source-a",
    relativePath: linkName,
    linkName,
    title: linkName,
    description: `${linkName} description`,
    absolutePath: `/sources/source-a/${linkName}`,
    skillFilePath: `/sources/source-a/${linkName}/SKILL.md`,
    displayName: linkName,
    contentHash,
    selectors: { legacyAliases: [] },
    valid: true,
    diagnostics: [],
  };
}

function createAdapter(options: {
  target: DeploymentTargetId;
  rootPath: string;
  strategy?: DeploymentStrategy;
}): ChannelAdapter {
  const strategy = options.strategy ?? "symlink";
  return {
    target: options.target,
    strategy,
    async detect(): Promise<ChannelDetection> {
      return {
        target: options.target,
        strategy,
        available: true,
        rootPath: options.rootPath,
      };
    },
    resolveTargetPath(rootPath: string, linkName: string): string {
      return path.join(rootPath, linkName);
    },
  };
}

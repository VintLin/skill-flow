import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type {
  ChannelDetection,
  DeploymentStrategy,
  DeploymentTargetId,
  LeafRecord,
  LockFile,
  ManifestFile,
} from "@skill-flow/domain/types";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import { DeploymentPlanner } from "../services/deployment-planner.js";

describe("deployment planner v2", () => {
  test("keeps active V2 projections without mode", () => {
    const lockFile: LockFile = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: {},
      leafInventory: [],
      projections: [
        {
          sourceId: "repo",
          leafId: "repo:writer",
          target: "codex",
          targetPath: "/targets/codex/writer",
          strategy: "symlink",
          contentHash: "hash-writer",
          status: "active",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ],
    };

    expect(lockFile.projections).toEqual([
      expect.not.objectContaining({ mode: expect.anything() }),
    ]);
    expect(lockFile.projections.filter((projection) => projection.status === "active"))
      .toHaveLength(1);
  });

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
    const planner = new DeploymentPlanner([
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
    const planner = new DeploymentPlanner([
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
    const planner = new DeploymentPlanner([
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

  test("does not plan remove actions for non-active projections when the target is disabled", async () => {
    const rootPath = "/targets/codex";
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: [],
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
          status: "removed",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:two",
          targetPath: path.join(rootPath, "two"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-two",
          status: "blocked",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
      createAdapter({ target: "codex", rootPath }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([]);
  });

  test("uses a deterministic fallback when preferred target contains mismatched foreign content", async () => {
    const rootPath = await createTempRoot();
    await writeSkill(path.join(rootPath, "one"), {
      name: "other",
      description: "Other description.",
    });
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile();
    const planner = new DeploymentPlanner([
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
        targetPath: path.join(rootPath, "Source A-one"),
        targetRootPath: rootPath,
      }),
    ]);
    expect(result.data.blocked).toEqual([]);
  });

  test("relocates external exact matches before deploying to the preferred target", async () => {
    const rootPath = await createTempRoot();
    await writeSkill(path.join(rootPath, "one"), {
      name: "one",
      description: "one description",
    });
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile();
    const planner = new DeploymentPlanner([
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
        targetPath: path.join(rootPath, "one"),
        targetRootPath: rootPath,
        relocateExternalToTargetPath: path.join(rootPath, "one-external"),
      }),
    ]);
  });

  test("records previous target path when an active projection target changes", async () => {
    const rootPath = await createTempRoot();
    const previousTargetPath = path.join(rootPath, "old-one");
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:one",
          targetPath: previousTargetPath,
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-one",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
      createAdapter({ target: "codex", rootPath }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([
      expect.objectContaining({
        kind: "update",
        leafId: "source-a:one",
        targetPath: path.join(rootPath, "one"),
        targetRootPath: rootPath,
        previousTargetPath,
        previousTargetRootPath: rootPath,
      }),
    ]);
  });

  test("ignores removed and blocked projections when planning active desired leafs", async () => {
    const rootPath = await createTempRoot();
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:one",
          targetPath: path.join(rootPath, "old-one"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-one",
          status: "removed",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:two",
          targetPath: path.join(rootPath, "two"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-two",
          status: "blocked",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
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
        targetPath: path.join(rootPath, "one"),
      }),
    ]);
  });

  test("does not claim a target path managed by another active projection", async () => {
    const rootPath = await createTempRoot();
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-b",
          leafId: "source-b:one",
          targetPath: path.join(rootPath, "one"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-other",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
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
        targetPath: path.join(rootPath, "Source A-one"),
      }),
    ]);
  });

  test("does not claim a normalized target path managed by another active projection", async () => {
    const rootPath = await createTempRoot();
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-b",
          leafId: "source-b:one",
          targetPath: `${rootPath}${path.sep}nested${path.sep}..${path.sep}one`,
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-other",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
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
        targetPath: path.join(rootPath, "Source A-one"),
      }),
    ]);
  });

  test("does not claim a target path managed by another active projection on another target", async () => {
    const rootPath = await createTempRoot();
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "cursor",
          sourceId: "source-b",
          leafId: "source-b:one",
          targetPath: path.join(rootPath, "one"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-other",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
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
        targetPath: path.join(rootPath, "Source A-one"),
      }),
    ]);
  });

  test("blocks duplicate active projection owners when no target fallback is available", async () => {
    const rootPath = await createTempRoot();
    const duplicateTargetPath = path.join(rootPath, "shared");
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "cursor",
          sourceId: "source-b",
          leafId: "source-b:one",
          targetPath: duplicateTargetPath,
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-other",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
      createAdapter({
        target: "codex",
        rootPath,
        resolveTargetPath: () => duplicateTargetPath,
      }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.blocked).toEqual([
      expect.objectContaining({
        kind: "blocked",
        leafId: "source-a:one",
        targetPath: duplicateTargetPath,
      }),
    ]);
  });

  test("updates copy projections when target contents cannot be verified against the source", async () => {
    const rootPath = await createTempRoot();
    await writeSkill(path.join(rootPath, "one"), {
      name: "one",
      description: "stale description",
    });
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:one",
          targetPath: path.join(rootPath, "one"),
          targetRootPath: rootPath,
          strategy: "copy",
          contentHash: "hash-one",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
      createAdapter({ target: "codex", rootPath, strategy: "copy" }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([
      expect.objectContaining({
        kind: "update",
        leafId: "source-a:one",
        targetPath: path.join(rootPath, "one"),
      }),
    ]);
  });

  test("plans create for unmanaged exact symlinks so V2 projections are recorded", async () => {
    const rootPath = await createTempRoot();
    const targetPath = path.join(rootPath, "one");
    await fs.symlink("/sources/source-a/one", targetPath, "junction");
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile();
    const planner = new DeploymentPlanner([
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
        targetPath,
      }),
    ]);
  });

  test("relocation candidates reject paths owned by any active projection", async () => {
    const rootPath = await createTempRoot();
    await writeSkill(path.join(rootPath, "one"), {
      name: "one",
      description: "one description",
    });
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile({
      projections: [
        {
          target: "cursor",
          sourceId: "source-b",
          leafId: "source-b:one",
          targetPath: path.join(rootPath, "one-external"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-other",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });
    const planner = new DeploymentPlanner([
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
        targetPath: path.join(rootPath, "one"),
        relocateExternalToTargetPath: path.join(rootPath, "one-external-2"),
      }),
    ]);
  });

  test("blocks adapter candidates that resolve outside the detected target root", async () => {
    const rootPath = await createTempRoot();
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile();
    const planner = new DeploymentPlanner([
      createAdapter({
        target: "codex",
        rootPath,
        resolveTargetPath: (_rootPath, linkName) =>
          path.join(rootPath, "..", "outside", linkName),
      }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([
      expect.objectContaining({
        kind: "blocked",
        leafId: "source-a:one",
        targetPath: path.join(rootPath, "..", "outside", "one"),
      }),
    ]);
  });

  test("blocks desired leafs when the target is unavailable", async () => {
    const rootPath = "/targets/codex";
    const manifest = createManifest({
      selectionMode: "selected",
      selectedLeafIds: ["source-a:one"],
      enabledTargets: ["codex"],
    });
    const lockFile = createLockFile();
    const planner = new DeploymentPlanner([
      createAdapter({
        target: "codex",
        rootPath,
        available: false,
        reason: "Target unavailable.",
      }),
    ]);

    const result = await planner.planForSource("source-a", manifest, lockFile);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.actions).toEqual([
      expect.objectContaining({
        kind: "blocked",
        leafId: "source-a:one",
        targetPath: path.join(rootPath, "one"),
        targetRootPath: rootPath,
        reason: "Target unavailable.",
      }),
    ]);
    expect(result.data.blocked).toEqual(result.data.actions);
  });
});

function createManifest(binding: {
  selectionMode: "all" | "selected";
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
}): ManifestFile {
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
  projections?: LockFile["projections"];
} = {}): LockFile {
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

function createLeaf(id: string, linkName: string, contentHash: string): LeafRecord {
  return {
    id,
    sourceId: "source-a",
    relativePath: linkName,
    linkName,
    title: linkName,
    description: `${linkName} description`,
    absolutePath: `/sources/source-a/${linkName}`,
    skillFilePath: `/sources/source-a/${linkName}/SKILL.md`,
    contentHash,
    selectors: { aliases: [] },
    valid: true,
    diagnostics: [],
  };
}

function createAdapter(options: {
  target: DeploymentTargetId;
  rootPath: string;
  strategy?: DeploymentStrategy;
  available?: boolean;
  reason?: string;
  resolveTargetPath?: (rootPath: string, linkName: string) => string;
}): ChannelAdapter {
  const strategy = options.strategy ?? "symlink";
  return {
    target: options.target,
    strategy,
    async detect(): Promise<ChannelDetection> {
      return {
        target: options.target,
        strategy,
        available: options.available ?? true,
        rootPath: options.rootPath,
        ...(options.reason ? { reason: options.reason } : {}),
      };
    },
    resolveTargetPath(rootPath: string, linkName: string): string {
      if (options.resolveTargetPath) {
        return options.resolveTargetPath(rootPath, linkName);
      }
      return path.join(rootPath, linkName);
    },
  };
}

async function createTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-planner-v2-"));
}

async function writeSkill(
  skillPath: string,
  frontmatter: { name: string; description: string },
): Promise<void> {
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(
    path.join(skillPath, "SKILL.md"),
    `---
name: ${frontmatter.name}
description: ${frontmatter.description}
---
`,
    "utf8",
  );
}

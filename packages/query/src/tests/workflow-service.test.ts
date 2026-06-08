import { describe, expect, test } from "vitest";
import type { CollectionsFile, LockFile, ManifestFile } from "@skill-flow/domain/types";
import { WorkflowService } from "../workflow-service.js";

const addedAt = "2026-06-04T00:00:00.000Z";

const collectionManifest: ManifestFile = {
  schemaVersion: 2,
  migrationGeneration: "mg_test",
  sources: [
    {
      id: "alpha",
      locator: "/repos/alpha",
      canonicalLocator: "/repos/alpha",
      kind: "local",
      displayName: "Alpha Source",
      enabled: true,
      createdAt: addedAt,
      updatedAt: addedAt,
    },
    {
      id: "beta",
      locator: "/repos/beta",
      canonicalLocator: "/repos/beta",
      kind: "local",
      displayName: "Beta Source",
      enabled: true,
      createdAt: addedAt,
      updatedAt: addedAt,
    },
    {
      id: "collection-mixed",
      locator: "collection://mixed",
      canonicalLocator: "collection://mixed",
      kind: "collection",
      displayName: "Stale Manifest Collection",
      enabled: true,
      createdAt: addedAt,
      updatedAt: addedAt,
    },
  ],
  bindings: {
    "collection-mixed": {
      sourceId: "collection-mixed",
      selectionMode: "selected",
      selectedLeafIds: ["collection-mixed:beta", "collection-mixed:alpha"],
      enabledTargets: ["codex"],
    },
  },
};

const collectionLockFile: LockFile = {
  schemaVersion: 2,
  migrationGeneration: "mg_test",
  sources: {
    alpha: {
      sourceId: "alpha",
      canonicalLocator: "/repos/alpha",
      revision: {
        provider: "local",
        capturedAt: addedAt,
      },
      localPath: "/repos/alpha",
      leafIds: ["alpha:one"],
    },
    beta: {
      sourceId: "beta",
      canonicalLocator: "/repos/beta",
      revision: {
        provider: "local",
        capturedAt: addedAt,
      },
      localPath: "/repos/beta",
      leafIds: ["beta:two"],
    },
  },
  leafInventory: [
    {
      id: "collection-mixed:alpha",
      sourceId: "collection-mixed",
      displayName: "alpha-one",
      linkName: "alpha-one",
      title: "Alpha One",
      description: "Alpha skill.",
      relativePath: "alpha-one",
      absolutePath: "/state/source/collection/collection-mixed/alpha-one",
      skillFilePath: "/state/source/collection/collection-mixed/alpha-one/SKILL.md",
      contentHash: "hash-alpha",
      selectors: { aliases: [] },
      diagnostics: [],
      valid: true,
    },
    {
      id: "collection-mixed:beta",
      sourceId: "collection-mixed",
      displayName: "beta-two",
      linkName: "beta-two",
      title: "Beta Two",
      description: "Beta skill.",
      relativePath: "beta-two",
      absolutePath: "/state/source/collection/collection-mixed/beta-two",
      skillFilePath: "/state/source/collection/collection-mixed/beta-two/SKILL.md",
      contentHash: "hash-beta",
      selectors: { aliases: [] },
      diagnostics: [],
      valid: true,
    },
  ],
  projections: [],
};

const collections: CollectionsFile = {
  schemaVersion: 2,
  migrationGeneration: "mg_test",
  collections: {
    "collection-mixed": {
      id: "collection-mixed",
      displayName: "Fresh Collection Name",
      materializedSourceId: "collection-mixed",
      hiddenSourceIds: ["alpha", "beta"],
      restoreSelections: {},
      createdAt: addedAt,
      updatedAt: addedAt,
      members: [
        {
          id: "member-beta",
          origin: {
            sourceId: "beta",
            leafId: "beta:two",
            sourceLocator: "/repos/beta",
            canonicalLocator: "/repos/beta",
            repoPath: "beta-two",
            contentHashAtCapture: "hash-beta",
            capturedAt: addedAt,
          },
          snapshot: {
            leafId: "collection-mixed:beta",
            materializedPath: "/state/source/collection/collection-mixed/beta-two",
            skillFilePath: "/state/source/collection/collection-mixed/beta-two/SKILL.md",
            relativePath: "beta-two",
            contentHash: "hash-beta",
          },
          updatePolicy: "frozen",
        },
        {
          id: "member-alpha",
          origin: {
            sourceId: "alpha",
            leafId: "alpha:one",
            sourceLocator: "/repos/alpha",
            canonicalLocator: "/repos/alpha",
            repoPath: "alpha-one",
            contentHashAtCapture: "hash-alpha",
            capturedAt: addedAt,
          },
          snapshot: {
            leafId: "collection-mixed:alpha",
            materializedPath: "/state/source/collection/collection-mixed/alpha-one",
            skillFilePath: "/state/source/collection/collection-mixed/alpha-one/SKILL.md",
            relativePath: "alpha-one",
            contentHash: "hash-alpha",
          },
          updatePolicy: "frozen",
        },
      ],
    },
  },
};

describe("WorkflowService", () => {
  test("uses collections v2 state for collection summary display names and ordered leafs", () => {
    const summaries = new WorkflowService().getSummaries(
      collectionManifest,
      collectionLockFile,
      undefined,
      collections,
    );

    const collectionSummary = summaries.find((summary) => summary.source.id === "collection-mixed");

    expect(collectionSummary?.source.displayName).toBe("Fresh Collection Name");
    expect(collectionSummary?.leafs.map((leaf) => leaf.id)).toEqual([
      "collection-mixed:beta",
      "collection-mixed:alpha",
    ]);
    expect(collectionSummary?.leafs.map((leaf) => leaf.sourceTitle)).toEqual([
      "Beta Source",
      "Alpha Source",
    ]);
  });

  test("does not block collection sources just because the lock source record is missing", () => {
    const summaries = new WorkflowService().getSummaries(
      collectionManifest,
      collectionLockFile,
      undefined,
      collections,
    );

    const collectionSummary = summaries.find((summary) => summary.source.id === "collection-mixed");

    expect(collectionSummary?.lock).toBeUndefined();
    expect(collectionSummary?.health).toBe("ACTIVE");
  });

  test("ignores legacy targets on v2 bindings without enabledTargets", () => {
    const manifest: ManifestFile = {
      ...collectionManifest,
      sources: [collectionManifest.sources[0]!],
      bindings: {
        alpha: {
          sourceId: "alpha",
          selectionMode: "selected",
          selectedLeafIds: [],
          targets: {
            codex: {
              enabled: true,
              leafIds: ["alpha:one"],
            },
          },
        } as unknown as ManifestFile["bindings"][string],
      },
    };
    const lockFile: LockFile = {
      ...collectionLockFile,
      leafInventory: [
        {
          id: "alpha:one",
          sourceId: "alpha",
          displayName: "one",
          linkName: "one",
          title: "One",
          description: "One skill.",
          relativePath: "one",
          absolutePath: "/repos/alpha/one",
          skillFilePath: "/repos/alpha/one/SKILL.md",
          contentHash: "hash-one",
          selectors: { aliases: [] },
          diagnostics: [],
          valid: true,
        },
      ],
      projections: [],
    };

    const summaries = new WorkflowService().getSummaries(
      manifest,
      lockFile,
      undefined,
      { ...collections, collections: {} },
    );

    expect(summaries[0]?.bindings).toEqual({
      selectedLeafIds: [],
      targets: {},
    });
    expect(summaries[0]?.activeTargetCount).toBe(0);
    expect(summaries[0]?.health).toBe("INACTIVE");
  });

  test("preserves selected leaf ids when v2 binding has no enabled targets", () => {
    const manifest: ManifestFile = {
      ...collectionManifest,
      sources: [collectionManifest.sources[0]!],
      bindings: {
        alpha: {
          sourceId: "alpha",
          selectionMode: "selected",
          selectedLeafIds: ["alpha:one"],
          enabledTargets: [],
        },
      },
    };
    const lockFile: LockFile = {
      ...collectionLockFile,
      sources: {
        alpha: {
          sourceId: "alpha",
          canonicalLocator: "/repos/alpha",
          revision: {
            provider: "local",
            capturedAt: addedAt,
          },
          localPath: "/repos/alpha",
          leafIds: ["alpha:one"],
        },
      },
      leafInventory: [
        {
          id: "alpha:one",
          sourceId: "alpha",
          displayName: "one",
          linkName: "one",
          title: "One",
          description: "One skill.",
          relativePath: "one",
          absolutePath: "/repos/alpha/one",
          skillFilePath: "/repos/alpha/one/SKILL.md",
          contentHash: "hash-one",
          selectors: { aliases: [] },
          diagnostics: [],
          valid: true,
        },
      ],
      projections: [],
    };

    const summaries = new WorkflowService().getSummaries(
      manifest,
      lockFile,
      undefined,
      { ...collections, collections: {} },
    );

    expect(summaries[0]?.bindings).toEqual({
      selectedLeafIds: ["alpha:one"],
      targets: {},
    });
    expect(summaries[0]?.activeTargetCount).toBe(0);
  });

  test("does not emit summary selectionMode when authoritative binding mode is missing", () => {
    const manifest: ManifestFile = {
      ...collectionManifest,
      sources: [collectionManifest.sources[0]!],
      bindings: {
        alpha: {
          sourceId: "alpha",
          selectedLeafIds: ["alpha:one"],
          enabledTargets: ["codex"],
        } as unknown as ManifestFile["bindings"][string],
      },
    };
    const lockFile: LockFile = {
      ...collectionLockFile,
      sources: {
        alpha: {
          sourceId: "alpha",
          canonicalLocator: "/repos/alpha",
          revision: {
            provider: "local",
            capturedAt: addedAt,
          },
          localPath: "/repos/alpha",
          leafIds: ["alpha:one"],
        },
      },
      leafInventory: [
        {
          id: "alpha:one",
          sourceId: "alpha",
          displayName: "one",
          linkName: "one",
          title: "One",
          description: "One skill.",
          relativePath: "one",
          absolutePath: "/repos/alpha/one",
          skillFilePath: "/repos/alpha/one/SKILL.md",
          contentHash: "hash-one",
          selectors: { aliases: [] },
          diagnostics: [],
          valid: true,
        },
      ],
      projections: [],
    };

    const summaries = new WorkflowService().getSummaries(
      manifest,
      lockFile,
      undefined,
      { ...collections, collections: {} },
    );

    expect(summaries[0]?.bindings).toEqual({
      selectedLeafIds: ["alpha:one"],
      targets: {
        codex: {
          enabled: true,
          leafIds: ["alpha:one"],
        },
      },
    });
    expect(summaries[0]?.source.selectionMode).toBeUndefined();
  });

  test("derives summary warnings from current diagnostics only", () => {
    const manifest: ManifestFile = {
      ...collectionManifest,
      sources: [collectionManifest.sources[0]!],
      bindings: {},
    };
    const lockFile: LockFile = {
      ...collectionLockFile,
      sources: {
        alpha: {
          sourceId: "alpha",
          canonicalLocator: "/repos/alpha",
          revision: {
            provider: "local",
            capturedAt: addedAt,
          },
          localPath: "/repos/alpha",
          leafIds: ["alpha:one", "alpha:two"],
        },
      },
      leafInventory: [
        {
          id: "alpha:one",
          sourceId: "alpha",
          displayName: "one",
          linkName: "one",
          title: "One",
          description: "One skill.",
          relativePath: "one",
          absolutePath: "/repos/alpha/one",
          skillFilePath: "/repos/alpha/one/SKILL.md",
          contentHash: "hash-one",
          selectors: { aliases: [] },
          diagnostics: [{ code: "LEAF_METADATA_WARNING", message: "current warning", retryable: false }],
          valid: true,
        },
        {
          id: "alpha:two",
          sourceId: "alpha",
          displayName: "two",
          linkName: "two",
          title: "Two",
          description: "Two skill.",
          relativePath: "two",
          absolutePath: "/repos/alpha/two",
          skillFilePath: "/repos/alpha/two/SKILL.md",
          contentHash: "hash-two",
          selectors: { aliases: [] },
          metadataWarnings: ["legacy warning"],
          valid: true,
        } as unknown as LockFile["leafInventory"][number],
      ],
      projections: [],
    };

    const summaries = new WorkflowService().getSummaries(
      manifest,
      lockFile,
      undefined,
      { ...collections, collections: {} },
    );

    expect(summaries[0]?.leafs.map((leaf) => leaf.metadataWarnings)).toEqual([
      ["current warning"],
      [],
    ]);
  });
});

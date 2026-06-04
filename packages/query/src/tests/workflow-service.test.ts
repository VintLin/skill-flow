import { describe, expect, test } from "vitest";
import type { CollectionsFileV2, LockFile, Manifest } from "@skill-flow/domain/types";
import { WorkflowService } from "../workflow-service.js";

const addedAt = "2026-06-04T00:00:00.000Z";

const collectionManifest: Manifest = {
  schemaVersion: 1,
  sources: [
    {
      id: "alpha",
      locator: "/repos/alpha",
      kind: "local",
      displayName: "Alpha Source",
      originalDisplayName: "Alpha Source",
      addedAt,
    },
    {
      id: "beta",
      locator: "/repos/beta",
      kind: "local",
      displayName: "Beta Source",
      originalDisplayName: "Beta Source",
      addedAt,
    },
    {
      id: "collection-mixed",
      locator: "collection://mixed",
      kind: "virtual",
      displayName: "Stale Manifest Collection",
      originalDisplayName: "Stale Manifest Collection",
      addedAt,
    },
  ],
  bindings: {
    "collection-mixed": {
      targets: {
        codex: {
          enabled: true,
          leafIds: ["collection-mixed:beta", "collection-mixed:alpha"],
        },
      },
    },
  },
};

const collectionLockFile: LockFile = {
  schemaVersion: 1,
  sources: [
    {
      id: "alpha",
      locator: "/repos/alpha",
      kind: "local",
      displayName: "Alpha Source",
      originalDisplayName: "Alpha Source",
      checkoutPath: "/repos/alpha",
      updatedAt: addedAt,
      leafIds: ["alpha:one"],
      invalidLeafs: [],
    },
    {
      id: "beta",
      locator: "/repos/beta",
      kind: "local",
      displayName: "Beta Source",
      originalDisplayName: "Beta Source",
      checkoutPath: "/repos/beta",
      updatedAt: addedAt,
      leafIds: ["beta:two"],
      invalidLeafs: [],
    },
  ],
  leafInventory: [
    {
      id: "collection-mixed:alpha",
      sourceId: "collection-mixed",
      name: "alpha-one",
      linkName: "alpha-one",
      title: "Alpha One",
      description: "Alpha skill.",
      relativePath: "alpha-one",
      absolutePath: "/state/source/collection/collection-mixed/alpha-one",
      skillFilePath: "/state/source/collection/collection-mixed/alpha-one/SKILL.md",
      contentHash: "hash-alpha",
      metadataWarnings: [],
      valid: true,
    },
    {
      id: "collection-mixed:beta",
      sourceId: "collection-mixed",
      name: "beta-two",
      linkName: "beta-two",
      title: "Beta Two",
      description: "Beta skill.",
      relativePath: "beta-two",
      absolutePath: "/state/source/collection/collection-mixed/beta-two",
      skillFilePath: "/state/source/collection/collection-mixed/beta-two/SKILL.md",
      contentHash: "hash-beta",
      metadataWarnings: [],
      valid: true,
    },
  ],
  deployments: [],
};

const collections: CollectionsFileV2 = {
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
});

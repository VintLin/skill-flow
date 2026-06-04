import { describe, expect, test } from "vitest";
import type {
  LockFileV2,
  ManifestFileV2,
  PreferencesFileV2,
  SourceBindingV2,
} from "@skill-flow/domain/types";
import {
  projectLockFileV2ToView,
  projectManifestV2ToView,
  projectPreferencesV2ToView,
  projectSourceBindingV2ToView,
  projectSourceKindV2ToView,
} from "../state-v2-view.js";

describe("state v2 runtime view adapters", () => {
  test("maps all bindings to every source leaf for enabled targets", () => {
    const binding = sourceBinding({
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex", "cursor"],
    });

    expect(projectSourceBindingV2ToView(binding, ["alpha:one", "alpha:two"])).toEqual({
      selectedLeafIds: ["alpha:one", "alpha:two"],
      targets: {
        codex: { enabled: true, leafIds: ["alpha:one", "alpha:two"] },
        cursor: { enabled: true, leafIds: ["alpha:one", "alpha:two"] },
      },
    });
  });

  test("maps selected bindings to the selected leaf ids only", () => {
    const binding = sourceBinding({
      selectionMode: "selected",
      selectedLeafIds: ["alpha:two"],
      enabledTargets: ["codex"],
    });

    expect(projectSourceBindingV2ToView(binding, ["alpha:one", "alpha:two"])).toEqual({
      selectedLeafIds: ["alpha:two"],
      targets: {
        codex: { enabled: true, leafIds: ["alpha:two"] },
      },
    });
  });

  test("centralizes github and collection source kind mapping for manifest views", () => {
    expect(projectSourceKindV2ToView("github")).toBe("git");
    expect(projectSourceKindV2ToView("collection")).toBe("virtual");

    const manifest = projectManifestV2ToView(
      {
        schemaVersion: 2,
        migrationGeneration: "mg_test",
        sources: [
          sourceManifest({ id: "repo", kind: "github", displayName: "Repo" }),
          sourceManifest({ id: "stack", kind: "collection", displayName: "Stack" }),
        ],
        bindings: {
          repo: sourceBinding({ sourceId: "repo", selectionMode: "all", enabledTargets: ["codex"] }),
          stack: sourceBinding({
            sourceId: "stack",
            selectionMode: "selected",
            selectedLeafIds: ["stack:member-1"],
            enabledTargets: [],
          }),
        },
      },
      lockFile({
        sources: {
          repo: lockSource({ sourceId: "repo", provider: "github", leafIds: ["repo:review"] }),
          stack: lockSource({
            sourceId: "stack",
            provider: "collection",
            leafIds: ["stack:member-1"],
          }),
        },
      }),
    );

    expect(manifest.sources.map((source) => ({ id: source.id, kind: source.kind }))).toEqual([
      { id: "repo", kind: "git" },
      { id: "stack", kind: "virtual" },
    ]);
    expect(manifest.bindings.repo?.targets.codex?.leafIds).toEqual(["repo:review"]);
    expect(manifest.bindings.stack?.selectedLeafIds).toEqual(["stack:member-1"]);
  });

  test("projects active v2 projections to deployment views", () => {
    const lockView = projectLockFileV2ToView(
      lockFile({
        sources: {
          repo: lockSource({ sourceId: "repo", provider: "github", leafIds: ["repo:review"] }),
        },
        leafInventory: [
          leaf({ id: "repo:review", sourceId: "repo", relativePath: "skills/review" }),
        ],
        projections: [
          projection({ status: "active", target: "codex", leafId: "repo:review" }),
          projection({ status: "removed", target: "cursor", leafId: "repo:review" }),
          projection({ status: "blocked", target: "claude-code", leafId: "repo:review" }),
        ],
      }),
      manifestFile({
        sources: [sourceManifest({ id: "repo", kind: "github", displayName: "Repo" })],
      }),
    );

    expect(lockView.deployments).toEqual([
      {
        sourceId: "repo",
        leafId: "repo:review",
        target: "codex",
        targetPath: "/targets/codex/review",
        targetRootPath: "/targets/codex",
        strategy: "symlink",
        status: "active",
        contentHash: "hash-repo-review",
        appliedAt: "2026-04-02T00:00:00.000Z",
      },
    ]);
    expect(lockView.projections).toEqual([
      {
        ...lockView.deployments[0],
        mode: "managed",
      },
    ]);
  });

  test("maps projectSourceDrafts to public projectDrafts", () => {
    const preferences = projectPreferencesV2ToView({
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      pinnedSourceIds: ["repo"],
      selectedProjectScope: { kind: "project", projectId: "project-a" },
      recentProjects: [
        {
          projectId: "project-a",
          title: "Project A",
          lastActivityAt: "2026-04-02T00:00:00.000Z",
          tools: ["codex"],
        },
      ],
      projectSourceDrafts: {
        "project-a": {
          repo: {
            sourceId: "repo",
            selectedLeafIds: ["repo:review"],
            enabledTargets: ["codex"],
            updatedAt: "2026-04-03T00:00:00.000Z",
          },
        },
      },
      customTargets: [],
      agentDisplayOrder: ["codex"],
    });

    expect(preferences.projectDrafts).toEqual({
      "project-a": {
        repo: {
          selectedLeafIds: ["repo:review"],
          enabledTargets: ["codex"],
        },
      },
    });
  });
});

function sourceBinding(
  overrides: Partial<SourceBindingV2> = {},
): SourceBindingV2 {
  return {
    sourceId: "alpha",
    selectionMode: "all",
    selectedLeafIds: [],
    enabledTargets: [],
    ...overrides,
  };
}

function sourceManifest(
  overrides: Partial<ManifestFileV2["sources"][number]> = {},
): ManifestFileV2["sources"][number] {
  const id = overrides.id ?? "repo";
  return {
    id,
    kind: "github",
    locator: `github:${id}`,
    canonicalLocator: `https://github.com/acme/${id}`,
    displayName: id,
    enabled: true,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z",
    ...overrides,
  };
}

function manifestFile(overrides: Partial<ManifestFileV2> = {}): ManifestFileV2 {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: [],
    bindings: {},
    ...overrides,
  };
}

function lockFile(overrides: Partial<LockFileV2> = {}): LockFileV2 {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: {},
    leafInventory: [],
    projections: [],
    ...overrides,
  };
}

function lockSource(
  overrides: Partial<LockFileV2["sources"][string]> & {
    sourceId: string;
    provider: LockFileV2["sources"][string]["revision"]["provider"];
  },
): LockFileV2["sources"][string] {
  return {
    sourceId: overrides.sourceId,
    canonicalLocator: `https://example.com/${overrides.sourceId}`,
    revision: {
      provider: overrides.provider,
      commit: "abc123",
      capturedAt: "2026-04-02T00:00:00.000Z",
    },
    localPath: `/state/source/${overrides.sourceId}`,
    leafIds: [],
    ...overrides,
  };
}

function leaf(
  overrides: Partial<LockFileV2["leafInventory"][number]> & {
    id: string;
    sourceId: string;
    relativePath: string;
  },
): LockFileV2["leafInventory"][number] {
  return {
    id: overrides.id,
    sourceId: overrides.sourceId,
    relativePath: overrides.relativePath,
    linkName: overrides.relativePath.split("/").at(-1) ?? overrides.id,
    title: "Review",
    description: "Review code.",
    absolutePath: `/state/source/${overrides.sourceId}/${overrides.relativePath}`,
    skillFilePath: `/state/source/${overrides.sourceId}/${overrides.relativePath}/SKILL.md`,
    displayName: "Review",
    contentHash: "hash-repo-review",
    selectors: { legacyAliases: [] },
    valid: true,
    diagnostics: [],
    ...overrides,
  };
}

function projection(
  overrides: Partial<LockFileV2["projections"][number]> = {},
): LockFileV2["projections"][number] {
  const target = overrides.target ?? "codex";
  return {
    target,
    sourceId: "repo",
    leafId: "repo:review",
    targetPath: `/targets/${target}/review`,
    targetRootPath: `/targets/${target}`,
    strategy: "symlink",
    contentHash: "hash-repo-review",
    status: "active",
    updatedAt: "2026-04-02T00:00:00.000Z",
    ...overrides,
  };
}

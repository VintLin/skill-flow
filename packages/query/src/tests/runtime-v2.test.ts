import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type {
  CollectionsFile,
  LockFile,
  ManifestFile,
  PreferencesFile,
} from "@skill-flow/domain/types";
import { StateStore, StateStoreError } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

describe.sequential("runtime v2 authority reads", () => {
  const sandbox = useSkillFlowSandbox();

  test("inspectSource reads summary leafs binding and active deployments from v2 authority", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox));
    const app = new SkillFlowApp();

    const inspected = await app.inspectSource("repo");

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.source.displayName).toBe("V2 Repo");
    expect(inspected.data.summary.source.displayName).toBe("V2 Repo");
    expect(inspected.data.leafs.map((leaf) => leaf.id)).toEqual(["repo:one", "repo:two"]);
    expect(inspected.data.binding).toEqual({
      selectedLeafIds: ["repo:one"],
      targets: {
        codex: {
          enabled: true,
          leafIds: ["repo:one"],
        },
      },
    });
    expect(inspected.data.deployments).toEqual([
      expect.objectContaining({
        sourceId: "repo",
        leafId: "repo:one",
        target: "codex",
        status: "active",
      }),
    ]);
    expect(inspected.data.deployments).toHaveLength(1);
  });

  test("listWorkflows preserves selectionMode all in summary after updateSources adds a new leaf", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "repo",
      draft: {
        selectedLeafIds: ["repo:skills/one"],
        enabledTargets: ["codex"],
      },
    });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await writeRepoFiles(repoPath, {
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });

    const updated = await app.updateSources(["repo"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated).toEqual([
      expect.objectContaining({
        sourceId: "repo",
        changed: true,
        addedLeafIds: ["repo:skills/two"],
      }),
    ]);

    const listed = await app.listWorkflows();

    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }

    const summary = listed.data.summaries.find((item) => item.source.id === "repo");
    expect(summary).toBeDefined();
    expect(summary?.source).toEqual(expect.objectContaining({
      selectionMode: "all",
    }));
    expect(summary?.leafs.map((leaf) => leaf.id)).toEqual([
      "repo:skills/one",
      "repo:skills/two",
    ]);
  });

  test("inspectSource uses v2 projected project drafts for scoped inspect", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox, {
      preferences: {
        selectedProjectScope: { kind: "project", projectId: "project-a" },
        recentProjects: [
          {
            projectId: "project-a",
            title: "Project A",
            lastActivityAt: "2026-06-04T00:00:00.000Z",
            projectPath: sandbox.sandboxRoot,
          },
        ],
        projectSourceDrafts: {
          "project-a": {
            repo: {
              sourceId: "repo",
              selectedLeafIds: ["repo:two"],
              enabledTargets: ["cursor"],
              updatedAt: "2026-06-04T00:00:00.000Z",
            },
          },
        },
      },
    }));
    const app = new SkillFlowApp();

    const inspected = await app.inspectSource("repo", { kind: "project", projectId: "project-a" });

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.binding).toEqual({
      selectedLeafIds: ["repo:two"],
      targets: {
        cursor: {
          enabled: true,
          leafIds: ["repo:two"],
        },
      },
    });
    expect(inspected.data.deployments).toEqual([]);
  });

  test("previewDraft plans from v2 authority without reading legacy state", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox));
    const app = new SkillFlowApp();

    const preview = await app.previewDraft("repo", {
      selectedLeafIds: ["repo:one", "repo:two"],
      enabledTargets: ["codex"],
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.data.manifest.bindings.repo).toEqual({
      sourceId: "repo",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    expect(preview.data.lockFile.sources.repo?.leafIds).toEqual(["repo:one", "repo:two"]);
    expect(preview.data.plan.actions).toEqual([
      expect.objectContaining({
        kind: "update",
        sourceId: "repo",
        leafId: "repo:one",
        target: "codex",
      }),
      expect.objectContaining({
        kind: "create",
        sourceId: "repo",
        leafId: "repo:two",
        target: "codex",
        targetPath: path.join(sandbox.targetsRoot, "codex", "two"),
      }),
    ]);
  });

  test("applyDraft writes global drafts through v2 authority without legacy state reads", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox));
    await writeSourceLeafFiles(sandbox);
    const app = new SkillFlowApp();

    const applied = await app.applyDraft("repo", {
      selectedLeafIds: ["repo:one", "repo:two"],
      enabledTargets: ["codex"],
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.data.draft).toEqual({
      selectedLeafIds: ["repo:one", "repo:two"],
      enabledTargets: ["codex"],
    });
    expect(applied.data.actions).toEqual([
      expect.objectContaining({
        kind: "update",
        sourceId: "repo",
        leafId: "repo:one",
        target: "codex",
      }),
      expect.objectContaining({
        kind: "create",
        sourceId: "repo",
        leafId: "repo:two",
        target: "codex",
      }),
    ]);

    const state = await new StateStore(sandbox.stateRoot).readState();
    expect(state.manifest.bindings.repo).toEqual({
      sourceId: "repo",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    expect(state.lockFile.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "repo",
          leafId: "repo:one",
          target: "codex",
          status: "active",
        }),
        expect.objectContaining({
          sourceId: "repo",
          leafId: "repo:two",
          target: "codex",
          status: "active",
        }),
      ]),
    );
    await expectRawLockToBeV2Only(sandbox.stateRoot);
  });

  test("applyDraft disables targets by marking v2 projections removed", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox));
    const app = new SkillFlowApp();

    const applied = await app.applyDraft("repo", {
      selectedLeafIds: ["repo:one"],
      enabledTargets: [],
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.data.actions).toEqual([
      expect.objectContaining({
        kind: "remove",
        sourceId: "repo",
        leafId: "repo:one",
        target: "codex",
      }),
    ]);

    const state = await new StateStore(sandbox.stateRoot).readState();
    expect(state.manifest.bindings.repo).toEqual({
      sourceId: "repo",
      selectionMode: "selected",
      selectedLeafIds: ["repo:one"],
      enabledTargets: [],
    });
    expect(state.lockFile.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "repo",
          leafId: "repo:one",
          target: "codex",
          status: "removed",
        }),
      ]),
    );
    expect((state.lockFile as LockFile & { deployments?: unknown }).deployments).toBeUndefined();
    await expectRawLockToBeV2Only(sandbox.stateRoot);
  });

  test("applyDraft records blocked v2 projections for unavailable targets", async () => {
    const missingTargetRoot = path.join(sandbox.targetsRoot, "missing-target");
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox, {
      lockFile: {
        projections: [],
      },
      preferences: {
        customTargets: [
          {
            id: "missing-target",
            name: "Missing Target",
            globalPath: missingTargetRoot,
            projectPathTemplate: "",
            strategy: "symlink",
            createdAt: "2026-06-04T00:00:00.000Z",
            updatedAt: "2026-06-04T00:00:00.000Z",
          },
        ],
        agentDisplayOrder: ["missing-target"],
      },
    }));
    const app = new SkillFlowApp();

    const applied = await app.applyDraft("repo", {
      selectedLeafIds: ["repo:one"],
      enabledTargets: ["missing-target"],
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.data.actions).toEqual([
      expect.objectContaining({
        kind: "blocked",
        sourceId: "repo",
        leafId: "repo:one",
        target: "missing-target",
        targetPath: path.join(missingTargetRoot, "one"),
        targetRootPath: missingTargetRoot,
      }),
    ]);

    const state = await new StateStore(sandbox.stateRoot).readState();
    expect(state.manifest.bindings.repo).toEqual({
      sourceId: "repo",
      selectionMode: "selected",
      selectedLeafIds: ["repo:one"],
      enabledTargets: ["missing-target"],
    });
    expect(state.lockFile.projections).toEqual([
      expect.objectContaining({
        sourceId: "repo",
        leafId: "repo:one",
        target: "missing-target",
        targetPath: path.join(missingTargetRoot, "one"),
        targetRootPath: missingTargetRoot,
        status: "blocked",
      }),
    ]);
    await expectRawLockToBeV2Only(sandbox.stateRoot);
  });

  test("createCollection materializes a v2 collection without legacy state writes", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox));
    await writeSourceLeafFiles(sandbox);
    const app = new SkillFlowApp();

    const created = await app.createCollection({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "repo", leafId: "repo:one" },
        { sourceId: "repo", leafId: "repo:two" },
      ],
      enabledTargets: ["codex"],
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.data.group).toEqual(expect.objectContaining({
      id: "writing-stack",
      displayName: "Writing Stack",
      includedSkills: [
        { sourceId: "repo", leafId: "repo:one" },
        { sourceId: "repo", leafId: "repo:two" },
      ],
      hiddenSourceIds: [],
    }));
    expect(created.data.source).toEqual(expect.objectContaining({
      id: "writing-stack",
      kind: "collection",
      locator: "collection:writing-stack",
      displayName: "Writing Stack",
    }));
    expect(created.data.binding).toEqual({
      selectedLeafIds: ["writing-stack:member-1", "writing-stack:member-2"],
      targets: {
        codex: {
          enabled: true,
          leafIds: ["writing-stack:member-1", "writing-stack:member-2"],
        },
      },
    });

    const state = await new StateStore(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "writing-stack",
          kind: "collection",
          locator: "collection:writing-stack",
          canonicalLocator: "collection:writing-stack",
          displayName: "Writing Stack",
          enabled: true,
        }),
      ]),
    );
    expect(state.manifest.bindings["writing-stack"]).toEqual({
      sourceId: "writing-stack",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    expect(state.collections.collections["writing-stack"]).toEqual(expect.objectContaining({
      id: "writing-stack",
      displayName: "Writing Stack",
      materializedSourceId: "writing-stack",
      hiddenSourceIds: [],
    }));
    expect(state.collections.collections["writing-stack"]?.members.map((member) => ({
      id: member.id,
      origin: {
        sourceId: member.origin.sourceId,
        leafId: member.origin.leafId,
        canonicalLocator: member.origin.canonicalLocator,
        repoPath: member.origin.repoPath,
      },
      snapshot: {
        leafId: member.snapshot.leafId,
        materializedPath: member.snapshot.materializedPath,
        relativePath: member.snapshot.relativePath,
      },
      updatePolicy: member.updatePolicy,
    }))).toEqual([
      {
        id: "member-1",
        origin: {
          sourceId: "repo",
          leafId: "repo:one",
          canonicalLocator: "github:acme/repo",
          repoPath: "one",
        },
        snapshot: {
          leafId: "writing-stack:member-1",
          materializedPath: "member-1",
          relativePath: "member-1",
        },
        updatePolicy: "frozen",
      },
      {
        id: "member-2",
        origin: {
          sourceId: "repo",
          leafId: "repo:two",
          canonicalLocator: "github:acme/repo",
          repoPath: "two",
        },
        snapshot: {
          leafId: "writing-stack:member-2",
          materializedPath: "member-2",
          relativePath: "member-2",
        },
        updatePolicy: "frozen",
      },
    ]);
    expect(state.lockFile.sources["writing-stack"]).toEqual(expect.objectContaining({
      sourceId: "writing-stack",
      canonicalLocator: "collection:writing-stack",
      leafIds: ["writing-stack:member-1", "writing-stack:member-2"],
    }));
    expect(state.lockFile.leafInventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "writing-stack:member-1",
          sourceId: "writing-stack",
          relativePath: "member-1",
          linkName: "member-1",
          valid: true,
        }),
        expect.objectContaining({
          id: "writing-stack:member-2",
          sourceId: "writing-stack",
          relativePath: "member-2",
          linkName: "member-2",
          valid: true,
        }),
      ]),
    );
    expect(state.lockFile.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "writing-stack",
          leafId: "writing-stack:member-1",
          target: "codex",
          targetPath: path.join(sandbox.targetsRoot, "codex", "member-1"),
          status: "active",
        }),
        expect.objectContaining({
          sourceId: "writing-stack",
          leafId: "writing-stack:member-2",
          target: "codex",
          targetPath: path.join(sandbox.targetsRoot, "codex", "member-2"),
          status: "active",
        }),
      ]),
    );
    await expect(pathExists(path.join(
      sandbox.stateRoot,
      "source",
      "collection",
      "writing-stack",
      "member-1",
      "SKILL.md",
    ))).resolves.toBe(true);
    await expect(pathExists(path.join(
      sandbox.stateRoot,
      "source",
      "collection",
      "writing-stack",
      "member-2",
      "SKILL.md",
    ))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.targetsRoot, "codex", "member-1"))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.stateRoot, "virtual-groups.json"))).resolves.toBe(false);
    await expectRawLockToBeV2Only(sandbox.stateRoot);
  });

  test("mergeGroups and restoreCollectionSources use v2 collection state only", async () => {
    await writeAuthorityState(sandbox.stateRoot, createMergeAuthorityState(sandbox));
    await writeMergeSourceLeafFiles(sandbox);
    const app = new SkillFlowApp();

    const merged = await app.mergeGroups({
      displayName: "Writing Stack",
      sourceIds: ["repo", "beta"],
      enabledTargets: ["codex"],
    });

    expect(merged.ok).toBe(true);
    if (!merged.ok) {
      return;
    }
    expect(merged.data.group).toEqual(expect.objectContaining({
      id: "writing-stack",
      hiddenSourceIds: ["repo", "beta"],
      includedSkills: [
        { sourceId: "repo", leafId: "repo:one" },
        { sourceId: "repo", leafId: "repo:two" },
        { sourceId: "beta", leafId: "beta:one" },
      ],
    }));

    const mergedState = await new StateStore(sandbox.stateRoot).readState();
    expect(mergedState.manifest.bindings.repo).toEqual({
      sourceId: "repo",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    });
    expect(mergedState.manifest.bindings.beta).toEqual({
      sourceId: "beta",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    });
    expect(mergedState.collections.collections["writing-stack"]?.restoreSelections).toEqual({
      repo: {
        sourceId: "repo",
        selectedLeafIds: ["repo:one"],
        enabledTargets: ["codex"],
        bestEffort: false,
        diagnostics: [],
      },
      beta: {
        sourceId: "beta",
        selectedLeafIds: ["beta:one"],
        enabledTargets: ["cursor"],
        bestEffort: false,
        diagnostics: [],
      },
    });
    expect(mergedState.lockFile.sources["writing-stack"]?.leafIds).toEqual([
      "writing-stack:member-1",
      "writing-stack:member-2",
      "writing-stack:member-3",
    ]);
    expect(mergedState.lockFile.projections.filter((projection) => projection.status === "active"))
      .toEqual([
        expect.objectContaining({
          sourceId: "writing-stack",
          leafId: "writing-stack:member-1",
          target: "codex",
        }),
        expect.objectContaining({
          sourceId: "writing-stack",
          leafId: "writing-stack:member-2",
          target: "codex",
        }),
        expect.objectContaining({
          sourceId: "writing-stack",
          leafId: "writing-stack:member-3",
          target: "codex",
        }),
      ]);

    const restored = await app.restoreCollectionSources("writing-stack");

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.data).toEqual({
      collectionId: "writing-stack",
      restoredSourceIds: ["repo", "beta"],
      skippedSourceIds: [],
    });

    const restoredState = await new StateStore(sandbox.stateRoot).readState();
    expect(restoredState.manifest.sources.some((source) => source.id === "writing-stack")).toBe(false);
    expect(restoredState.manifest.bindings["writing-stack"]).toBeUndefined();
    expect(restoredState.lockFile.sources["writing-stack"]).toBeUndefined();
    expect(restoredState.lockFile.leafInventory.some((leaf) => leaf.sourceId === "writing-stack")).toBe(false);
    expect(restoredState.collections.collections["writing-stack"]).toBeUndefined();
    expect(restoredState.manifest.bindings.repo).toEqual({
      sourceId: "repo",
      selectionMode: "selected",
      selectedLeafIds: ["repo:one"],
      enabledTargets: ["codex"],
    });
    expect(restoredState.manifest.bindings.beta).toEqual({
      sourceId: "beta",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["cursor"],
    });
    expect(restoredState.lockFile.projections.filter((projection) => projection.status === "active"))
      .toEqual([
        expect.objectContaining({
          sourceId: "repo",
          leafId: "repo:one",
          target: "codex",
        }),
        expect.objectContaining({
          sourceId: "beta",
          leafId: "beta:one",
          target: "cursor",
        }),
      ]);
    await expect(pathExists(path.join(sandbox.stateRoot, "source", "collection", "writing-stack"))).resolves.toBe(false);
    await expect(pathExists(path.join(sandbox.stateRoot, "virtual-groups.json"))).resolves.toBe(false);
    await expectRawLockToBeV2Only(sandbox.stateRoot);
  });

  test("config reads and settings writes use v2 preferences", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox, {
      preferences: {
        pinnedSourceIds: ["repo", "missing"],
        projectSourceDrafts: {
          "project-a": {
            repo: {
              sourceId: "repo",
              selectedLeafIds: ["repo:two"],
              enabledTargets: ["cursor"],
              updatedAt: "2026-06-04T00:00:00.000Z",
            },
            missing: {
              sourceId: "missing",
              selectedLeafIds: ["missing:one"],
              enabledTargets: ["codex"],
              updatedAt: "2026-06-04T00:00:00.000Z",
            },
          },
        },
      },
    }));
    const app = new SkillFlowApp();

    const saved = await app.saveSettings({
      customTargets: [
        {
          id: "team-target",
          name: "Team Target",
          globalPath: path.join(sandbox.targetsRoot, "team-target"),
          projectPathTemplate: ".team/skills",
          strategy: "copy",
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
      agentDisplayOrder: ["team-target", "codex"],
    });
    const listed = await app.listWorkflows();

    expect(saved.ok).toBe(true);
    expect(listed.ok).toBe(true);
    if (!saved.ok || !listed.ok) {
      return;
    }
    expect(saved.data.customTargets.map((target) => target.id)).toEqual(["team-target"]);
    expect(saved.data.agentDisplayOrder).toEqual(["team-target", "codex"]);
    expect(listed.data.summaries.map((summary) => summary.source.id)).toEqual(["repo"]);
    expect(listed.data.pinnedSourceIds).toEqual(["repo"]);
    expect(listed.data.customTargets.map((target) => target.id)).toEqual(["team-target"]);

    const state = await new StateStore(sandbox.stateRoot).readState();
    expect(state.preferences.schemaVersion).toBe(2);
    expect(state.preferences.pinnedSourceIds).toEqual(["repo"]);
    expect(state.preferences.projectSourceDrafts).toEqual({
      "project-a": {
        repo: expect.objectContaining({
          sourceId: "repo",
          selectedLeafIds: ["repo:two"],
          enabledTargets: ["cursor"],
        }),
      },
    });
    expect(state.preferences.customTargets.map((target) => target.id)).toEqual(["team-target"]);
  });

  test("inspectSource fails on v1 authority instead of falling back", async () => {
    await writeV1AuthorityFiles(sandbox.stateRoot);
    const app = new SkillFlowApp();

    await expect(app.inspectSource("repo")).rejects.toBeInstanceOf(StateStoreError);
  });
});

type AuthorityOverrides = {
  lockFile?: Partial<LockFile>;
  preferences?: Partial<PreferencesFile>;
};

function createAuthorityState(
  sandbox: ReturnType<typeof useSkillFlowSandbox>,
  overrides: AuthorityOverrides = {},
): {
  manifest: ManifestFile;
  lockFile: LockFile;
  preferences: PreferencesFile;
  collections: CollectionsFile;
} {
  const migrationGeneration = "mg_runtime_v2";
  const sourceRoot = path.join(sandbox.sandboxRoot, "sources", "repo");
  return {
    manifest: {
      schemaVersion: 2,
      migrationGeneration,
      sources: [
        {
          id: "repo",
          kind: "git",
          locator: "https://github.com/acme/repo",
          canonicalLocator: "github:acme/repo",
          displayName: "V2 Repo",
          enabled: true,
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
      bindings: {
        repo: {
          sourceId: "repo",
          selectionMode: "selected",
          selectedLeafIds: ["repo:one"],
          enabledTargets: ["codex"],
        },
      },
    },
    lockFile: {
      schemaVersion: 2,
      migrationGeneration,
      sources: {
        repo: {
          sourceId: "repo",
          canonicalLocator: "github:acme/repo",
          revision: {
            provider: "git",
            commit: "abc123",
            capturedAt: "2026-06-04T00:00:00.000Z",
          },
          localPath: sourceRoot,
          leafIds: ["repo:one", "repo:two"],
        },
      },
      leafInventory: [
        createLeaf("repo:one", "one", sourceRoot),
        createLeaf("repo:two", "two", sourceRoot),
      ],
      projections: [
        {
          target: "codex",
          sourceId: "repo",
          leafId: "repo:one",
          targetPath: path.join(sandbox.targetsRoot, "codex", "one"),
          targetRootPath: path.join(sandbox.targetsRoot, "codex"),
          strategy: "symlink",
          contentHash: "hash-one",
          status: "active",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
        {
          target: "cursor",
          sourceId: "repo",
          leafId: "repo:one",
          targetPath: path.join(sandbox.targetsRoot, "cursor", "one"),
          targetRootPath: path.join(sandbox.targetsRoot, "cursor"),
          strategy: "symlink",
          contentHash: "hash-one",
          status: "removed",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
        {
          target: "claude-code",
          sourceId: "repo",
          leafId: "repo:two",
          targetPath: path.join(sandbox.targetsRoot, "claude", "two"),
          targetRootPath: path.join(sandbox.targetsRoot, "claude"),
          strategy: "symlink",
          contentHash: "hash-two",
          status: "blocked",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      ],
      ...overrides.lockFile,
    },
    preferences: {
      schemaVersion: 2,
      migrationGeneration,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
      ...overrides.preferences,
    },
    collections: {
      schemaVersion: 2,
      migrationGeneration,
      collections: {},
    },
  };
}

function createMergeAuthorityState(
  sandbox: ReturnType<typeof useSkillFlowSandbox>,
): ReturnType<typeof createAuthorityState> {
  const state = createAuthorityState(sandbox);
  const betaRoot = path.join(sandbox.sandboxRoot, "sources", "beta");
  state.manifest.sources.push({
    id: "beta",
    kind: "git",
    locator: "https://github.com/acme/beta",
    canonicalLocator: "github:acme/beta",
    displayName: "Beta Repo",
    enabled: true,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  });
  state.manifest.bindings.beta = {
    sourceId: "beta",
    selectionMode: "selected",
    selectedLeafIds: ["beta:one"],
    enabledTargets: ["cursor"],
  };
  state.lockFile.sources.beta = {
    sourceId: "beta",
    canonicalLocator: "github:acme/beta",
    revision: {
      provider: "git",
      commit: "def456",
      capturedAt: "2026-06-04T00:00:00.000Z",
    },
    localPath: betaRoot,
    leafIds: ["beta:one"],
  };
  state.lockFile.leafInventory.push(createLeaf("beta:one", "beta-one", betaRoot, "beta"));
  state.lockFile.projections = [
    {
      target: "codex",
      sourceId: "repo",
      leafId: "repo:one",
      targetPath: path.join(sandbox.targetsRoot, "codex", "one"),
      targetRootPath: path.join(sandbox.targetsRoot, "codex"),
      strategy: "symlink",
      contentHash: "hash-one",
      status: "active",
      updatedAt: "2026-06-04T00:00:00.000Z",
    },
    {
      target: "cursor",
      sourceId: "beta",
      leafId: "beta:one",
      targetPath: path.join(sandbox.targetsRoot, "cursor", "beta-one"),
      targetRootPath: path.join(sandbox.targetsRoot, "cursor"),
      strategy: "symlink",
      contentHash: "hash-beta-one",
      status: "active",
      updatedAt: "2026-06-04T00:00:00.000Z",
    },
  ];

  return state;
}

function createLeaf(
  id: string,
  linkName: string,
  sourceRoot: string,
  sourceId = "repo",
): LockFile["leafInventory"][number] {
  return {
    id,
    sourceId,
    relativePath: linkName,
    linkName,
    title: linkName,
    description: `${linkName} skill`,
    absolutePath: path.join(sourceRoot, linkName),
    skillFilePath: path.join(sourceRoot, linkName, "SKILL.md"),
    displayName: linkName,
    contentHash: `hash-${linkName}`,
    selectors: { aliases: [] },
    valid: true,
    diagnostics: [],
  };
}

async function writeAuthorityState(
  stateRoot: string,
  state: {
    manifest: ManifestFile;
    lockFile: LockFile;
    preferences: PreferencesFile;
    collections: CollectionsFile;
  },
): Promise<void> {
  await new StateStore(stateRoot).writeState(state);
}

async function writeSourceLeafFiles(sandbox: ReturnType<typeof useSkillFlowSandbox>): Promise<void> {
  const sourceRoot = path.join(sandbox.sandboxRoot, "sources", "repo");
  await Promise.all([
    writeSkillFile(path.join(sourceRoot, "one"), "one", "one skill"),
    writeSkillFile(path.join(sourceRoot, "two"), "two", "two skill"),
  ]);
}

async function writeMergeSourceLeafFiles(sandbox: ReturnType<typeof useSkillFlowSandbox>): Promise<void> {
  await writeSourceLeafFiles(sandbox);
  const betaRoot = path.join(sandbox.sandboxRoot, "sources", "beta");
  await writeSkillFile(path.join(betaRoot, "beta-one"), "beta-one", "beta one skill");
}

async function writeSkillFile(skillRoot: string, name: string, description: string): Promise<void> {
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`, "utf8");
}

async function expectRawLockToBeV2Only(stateRoot: string): Promise<void> {
  const rawLock = JSON.parse(await fs.readFile(path.join(stateRoot, "lock.json"), "utf8")) as {
    deployments?: unknown;
    projections?: Array<{ mode?: unknown }>;
  };
  expect(rawLock.deployments).toBeUndefined();
  expect(rawLock.projections ?? []).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        mode: expect.anything(),
      }),
    ]),
  );
}

async function writeV1AuthorityFiles(stateRoot: string): Promise<void> {
  await fs.mkdir(stateRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(stateRoot, "manifest.json"), `${JSON.stringify({
      schemaVersion: 1,
      sources: [],
      bindings: {},
    })}\n`, "utf8"),
    fs.writeFile(path.join(stateRoot, "lock.json"), `${JSON.stringify({
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      deployments: [],
    })}\n`, "utf8"),
    fs.writeFile(path.join(stateRoot, "preferences.json"), `${JSON.stringify({
      schemaVersion: 1,
      pinnedSourceIds: [],
      projectDrafts: {},
    })}\n`, "utf8"),
    fs.writeFile(path.join(stateRoot, "collections.json"), `${JSON.stringify({
      schemaVersion: 1,
      collections: {},
    })}\n`, "utf8"),
  ]);
}

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type {
  CollectionsFileV2,
  LockFileV2,
  ManifestFileV2,
  PreferencesFileV2,
} from "@skill-flow/domain/types";
import { StateStoreV2, StateStoreV2Error } from "@skill-flow/storage/state-store-v2";
import { SkillFlowApp } from "../runtime.js";
import { pathExists, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("runtime v2 authority reads", () => {
  const sandbox = useSkillFlowSandbox();

  test("inspectSource reads summary leafs binding and active deployments from v2 authority", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox));
    const app = new SkillFlowApp();
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));

    const inspected = await app.inspectSource("repo");

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
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
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));

    const inspected = await app.inspectSource("repo", { kind: "project", projectId: "project-a" });

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
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
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));

    const preview = await app.previewDraft("repo", {
      selectedLeafIds: ["repo:one", "repo:two"],
      enabledTargets: ["codex"],
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
    expect(preview.data.manifest.bindings.repo).toEqual({
      selectedLeafIds: ["repo:one", "repo:two"],
      targets: {
        codex: {
          enabled: true,
          leafIds: ["repo:one", "repo:two"],
        },
      },
    });
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
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyWriteState = vi.spyOn(app.store, "writeState").mockRejectedValue(new Error("legacy writeState"));
    const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));

    const applied = await app.applyDraft("repo", {
      selectedLeafIds: ["repo:one", "repo:two"],
      enabledTargets: ["codex"],
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyWriteState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
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

    const state = await new StateStoreV2(sandbox.stateRoot).readState();
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
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyWriteState = vi.spyOn(app.store, "writeState").mockRejectedValue(new Error("legacy writeState"));
    const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));

    const applied = await app.applyDraft("repo", {
      selectedLeafIds: ["repo:one"],
      enabledTargets: [],
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyWriteState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
    expect(applied.data.actions).toEqual([
      expect.objectContaining({
        kind: "remove",
        sourceId: "repo",
        leafId: "repo:one",
        target: "codex",
      }),
    ]);

    const state = await new StateStoreV2(sandbox.stateRoot).readState();
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
    expect((state.lockFile as LockFileV2 & { deployments?: unknown }).deployments).toBeUndefined();
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
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyWriteState = vi.spyOn(app.store, "writeState").mockRejectedValue(new Error("legacy writeState"));
    const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));

    const applied = await app.applyDraft("repo", {
      selectedLeafIds: ["repo:one"],
      enabledTargets: ["missing-target"],
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyWriteState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
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

    const state = await new StateStoreV2(sandbox.stateRoot).readState();
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

  test("createVirtualGroup materializes a v2 collection without legacy state writes", async () => {
    await writeAuthorityState(sandbox.stateRoot, createAuthorityState(sandbox));
    await writeSourceLeafFiles(sandbox);
    const app = new SkillFlowApp();
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyWriteState = vi.spyOn(app.store, "writeState").mockRejectedValue(new Error("legacy writeState"));
    const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));
    const legacyReadVirtualGroups = vi.spyOn(app.store, "readVirtualGroups").mockRejectedValue(new Error("legacy readVirtualGroups"));
    const legacyWriteVirtualGroups = vi.spyOn(app.store, "writeVirtualGroups").mockRejectedValue(new Error("legacy writeVirtualGroups"));

    const created = await app.createVirtualGroup({
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
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyWriteState).not.toHaveBeenCalled();
    expect(legacyReadPreferences).not.toHaveBeenCalled();
    expect(legacyReadVirtualGroups).not.toHaveBeenCalled();
    expect(legacyWriteVirtualGroups).not.toHaveBeenCalled();
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
      kind: "virtual",
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

    const state = await new StateStoreV2(sandbox.stateRoot).readState();
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

  test("inspectSource fails on v1 authority instead of falling back", async () => {
    await writeV1AuthorityFiles(sandbox.stateRoot);
    const app = new SkillFlowApp();

    await expect(app.inspectSource("repo")).rejects.toBeInstanceOf(StateStoreV2Error);
  });
});

type AuthorityOverrides = {
  lockFile?: Partial<LockFileV2>;
  preferences?: Partial<PreferencesFileV2>;
};

function createAuthorityState(
  sandbox: ReturnType<typeof useSkillFlowSandbox>,
  overrides: AuthorityOverrides = {},
): {
  manifest: ManifestFileV2;
  lockFile: LockFileV2;
  preferences: PreferencesFileV2;
  collections: CollectionsFileV2;
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
          kind: "github",
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
            provider: "github",
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

function createLeaf(id: string, linkName: string, sourceRoot: string): LockFileV2["leafInventory"][number] {
  return {
    id,
    sourceId: "repo",
    relativePath: linkName,
    linkName,
    title: linkName,
    description: `${linkName} skill`,
    absolutePath: path.join(sourceRoot, linkName),
    skillFilePath: path.join(sourceRoot, linkName, "SKILL.md"),
    displayName: linkName,
    contentHash: `hash-${linkName}`,
    selectors: { legacyAliases: [] },
    valid: true,
    diagnostics: [],
  };
}

async function writeAuthorityState(
  stateRoot: string,
  state: {
    manifest: ManifestFileV2;
    lockFile: LockFileV2;
    preferences: PreferencesFileV2;
    collections: CollectionsFileV2;
  },
): Promise<void> {
  await new StateStoreV2(stateRoot).writeState(state);
}

async function writeSourceLeafFiles(sandbox: ReturnType<typeof useSkillFlowSandbox>): Promise<void> {
  const sourceRoot = path.join(sandbox.sandboxRoot, "sources", "repo");
  await Promise.all([
    writeSkillFile(path.join(sourceRoot, "one"), "one", "one skill"),
    writeSkillFile(path.join(sourceRoot, "two"), "two", "two skill"),
  ]);
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

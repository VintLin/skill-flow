import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { getManagedDeployments } from "@skill-flow/domain/projection-compat";
import { resolveDocumentedProjectSkillPath } from "@skill-flow/integration/utils/constants";
import { SkillFlowApp } from "../runtime.js";
import { projectStateV2ToView } from "../state-v2-view.js";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

const v2 = (app: { store: { rootPath: string } }): StateStoreV2 => new StateStoreV2(app.store.rootPath);
const v2View = async (app: { store: { rootPath: string } }) =>
  projectStateV2ToView(await v2(app).readState());
const collectionMemberLeafIds = (sourceId = "writing-stack") => [
  `${sourceId}:member-1`,
  `${sourceId}:member-2`,
];

describe.sequential("virtual groups", () => {
  const sandbox = useSkillFlowSandbox();

  test("creates a virtual group from leafs across source groups without creating a checkout", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
      "skills/outlining/SKILL.md": skillDoc("outlining", "Outline writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();

    const writing = await app.addSource(writingRepo, { sourceIdOverride: "writing-source" });
    const editing = await app.addSource(editingRepo, { sourceIdOverride: "editing-source" });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }

    const result = await app.createVirtualGroup({
      displayName: " Writing Stack ",
      skills: [
        {
          sourceId: "writing-source",
          leafId: "writing-source:skills/drafting",
        },
        {
          sourceId: "editing-source",
          leafId: "editing-source:skills/revision",
        },
        {
          sourceId: "writing-source",
          leafId: "writing-source:skills/drafting",
        },
      ],
      enabledTargets: ["codex", "codex", "cursor"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.group.id).toBe("writing-stack");
    expect(result.data.group.displayName).toBe("Writing Stack");
    expect(result.data.group.includedSkills).toEqual([
      { sourceId: "writing-source", leafId: "writing-source:skills/drafting" },
      { sourceId: "editing-source", leafId: "editing-source:skills/revision" },
    ]);

    const state = await v2(app).readState();
    const { manifest, lockFile } = state;
    const memberLeafIds = collectionMemberLeafIds();
    expect(manifest.sources).toContainEqual(expect.objectContaining({
      id: "writing-stack",
      locator: "collection:writing-stack",
      canonicalLocator: "collection:writing-stack",
      kind: "collection",
      displayName: "Writing Stack",
      enabled: true,
      createdAt: result.data.group.createdAt,
    }));
    expect(manifest.bindings["writing-stack"]).toEqual({
      sourceId: "writing-stack",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex", "cursor"],
    });
    expect(lockFile.sources["writing-stack"]).toEqual(expect.objectContaining({
      sourceId: "writing-stack",
      canonicalLocator: "collection:writing-stack",
      leafIds: memberLeafIds,
    }));
    expect(await pathExists(app.store.getSourceCheckoutPath("virtual", "writing-stack"))).toBe(false);
    const deployments = lockFile.projections
      .filter((deployment) => deployment.status === "active")
      .filter((deployment) => deployment.sourceId === "writing-stack");
    expect(deployments.map((deployment) => deployment.target).sort()).toEqual([
      "codex",
      "codex",
      "cursor",
      "cursor",
    ]);
    expect(deployments.map((deployment) => deployment.leafId).sort()).toEqual([
      "writing-stack:member-1",
      "writing-stack:member-1",
      "writing-stack:member-2",
      "writing-stack:member-2",
    ]);
    await expect(pathExists(path.join(sandbox.targetsRoot, "codex", "member-1"))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.targetsRoot, "codex", "member-2"))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.targetsRoot, "cursor", "member-1"))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.targetsRoot, "cursor", "member-2"))).resolves.toBe(true);

    const virtualGroups = await v2(app).readCollections();
    expect(virtualGroups.collections["writing-stack"]).toMatchObject({
      id: "writing-stack",
      displayName: "Writing Stack",
      materializedSourceId: "writing-stack",
      hiddenSourceIds: [],
      restoreSelections: {},
      createdAt: result.data.group.createdAt,
      updatedAt: result.data.group.updatedAt,
    });
    expect(virtualGroups.collections["writing-stack"]?.members.map((member) => member.origin)).toEqual([
      expect.objectContaining({ sourceId: "writing-source", leafId: "writing-source:skills/drafting" }),
      expect.objectContaining({ sourceId: "editing-source", leafId: "editing-source:skills/revision" }),
    ]);
  });

  test("keeps virtual group selected leafs after inspect normalizes bindings", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, { sourceIdOverride: "writing-source" });
    const editing = await app.addSource(editingRepo, { sourceIdOverride: "editing-source" });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }
    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];
    const memberLeafIds = collectionMemberLeafIds();

    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: ["codex"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const inspected = await app.inspectSource("writing-stack");

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.binding.selectedLeafIds).toEqual(memberLeafIds);

    const { manifest } = await v2(app).readState();
    expect(manifest.bindings["writing-stack"]).toEqual({
      sourceId: "writing-stack",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    expect((await v2View(app)).manifest.bindings["writing-stack"]?.targets.codex?.leafIds)
      .toEqual(memberLeafIds);
  });

  test("treats virtual group as a source-like group in summaries inspect and preview planning", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, {
      sourceIdOverride: "writing-source",
      project: false,
    });
    const editing = await app.addSource(editingRepo, {
      sourceIdOverride: "editing-source",
      project: false,
    });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }
    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];
    const memberLeafIds = collectionMemberLeafIds();

    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const listed = await app.listWorkflows();
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    const summary = listed.data.summaries.find((item) => item.source.id === "writing-stack");
    expect(summary?.leafs.map((leaf) => leaf.id)).toEqual(memberLeafIds);
    expect(summary?.health).not.toBe("BLOCKED");

    const inspected = await app.inspectSource("writing-stack");
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.leafs.map((leaf) => leaf.id)).toEqual(memberLeafIds);

    const preview = await app.previewDraft("writing-stack", {
      selectedLeafIds: memberLeafIds,
      enabledTargets: ["codex"],
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    const plannedActions = preview.data.plan.actions.filter((action) => action.target === "codex");
    expect(plannedActions).toHaveLength(2);
    expect(plannedActions.map((action) => action.sourceId)).toEqual([
      "writing-stack",
      "writing-stack",
    ]);
    expect(plannedActions.every((action) => action.sourcePath.length > 0)).toBe(true);
    for (const action of plannedActions) {
      expect(action.sourcePath).toContain(action.leafId.split(":")[1]);
    }
    const plannedLeafIds = plannedActions
      .map((action) => action.leafId)
      .sort();
    expect(plannedLeafIds).toEqual([...memberLeafIds].sort());
  });

  test("bootstraps virtual group leafs and display name from virtual group state when manifest is stale", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, {
      sourceIdOverride: "writing-source",
      project: false,
    });
    const editing = await app.addSource(editingRepo, {
      sourceIdOverride: "editing-source",
      project: false,
    });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }

    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];
    const memberLeafIds = collectionMemberLeafIds();
    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const { manifest, lockFile } = await v2(app).readState();
    const source = manifest.sources.find((item) => item.id === "writing-stack");
    expect(source).toBeDefined();
    if (!source) {
      return;
    }
    source.displayName = "virtual:writing-stack";
    manifest.bindings["writing-stack"] = {
      sourceId: "writing-stack",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    await v2(app).writeState({ ...(await v2(app).readState()), manifest: manifest, lockFile: lockFile });

    const bootstrapped = await app.bootstrapWorkspaceState();
    expect(bootstrapped.ok).toBe(true);
    if (!bootstrapped.ok) {
      return;
    }

    const summary = bootstrapped.data.summaries.find((item) => item.source.id === "writing-stack");
    expect(summary?.source.displayName).toBe("Writing Stack");
    expect(summary?.source.originalDisplayName).toBe("Writing Stack");
    expect(summary?.leafs.map((leaf) => leaf.id)).toEqual(memberLeafIds);
  });

  test("keeps disabled virtual group skills visible in summaries and inspect", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, {
      sourceIdOverride: "writing-source",
      project: false,
    });
    const editing = await app.addSource(editingRepo, {
      sourceIdOverride: "editing-source",
      project: false,
    });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }
    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];
    const memberLeafIds = collectionMemberLeafIds();
    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: ["codex"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const applied = await app.applyDraft("writing-stack", {
      selectedLeafIds: [memberLeafIds[0]!],
      enabledTargets: ["codex"],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const listed = await app.listWorkflows();
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    const summary = listed.data.summaries.find((item) => item.source.id === "writing-stack");
    expect(summary?.leafs.map((leaf) => leaf.id)).toEqual(memberLeafIds);
    expect(summary?.bindings.selectedLeafIds).toEqual([memberLeafIds[0]]);

    const inspected = await app.inspectSource("writing-stack");
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.leafs.map((leaf) => leaf.id)).toEqual(memberLeafIds);
    expect(inspected.data.binding.selectedLeafIds).toEqual([memberLeafIds[0]]);
  });

  test("finds virtual group project scoped deployments during inspect", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const projectRepo = await createRepo(sandbox.sandboxRoot, {
      "README.md": "project repo\n",
    });
    const resolvedProjectRepo = await fs.realpath(projectRepo);
    const app = new SkillFlowApp();
    {
      const currentState = await v2(app).readState();
      const currentPreferences = await v2(app).readPreferences();
      await v2(app).writeState({
        ...currentState,
        preferences: {
          ...currentPreferences,
          recentProjects: [{
            projectId: "repo-a",
            title: "Repo A",
            lastActivityAt: "2026-03-30T00:00:00.000Z",
            projectPath: resolvedProjectRepo,
            tools: ["codex"],
          }],
        },
      });
    }
    const writing = await app.addSource(writingRepo, {
      sourceIdOverride: "writing-source",
      project: false,
    });
    const editing = await app.addSource(editingRepo, {
      sourceIdOverride: "editing-source",
      project: false,
    });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }
    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];
    const memberLeafIds = collectionMemberLeafIds();
    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const applied = await app.applyDraft(
      "writing-stack",
      { selectedLeafIds: memberLeafIds, enabledTargets: ["codex"] },
      { kind: "project", projectId: "repo-a" },
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const projectTargetRoot = resolveDocumentedProjectSkillPath("codex", resolvedProjectRepo);
    expect(projectTargetRoot).toBeTruthy();
    if (!projectTargetRoot) {
      return;
    }
    expect(await pathExists(path.join(projectTargetRoot, "member-1"))).toBe(true);
    expect(await pathExists(path.join(projectTargetRoot, "member-2"))).toBe(true);

    const inspected = await app.inspectSource(
      "writing-stack",
      { kind: "project", projectId: "repo-a" },
    );

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.deployments.map((deployment) => deployment.leafId).sort()).toEqual(
      [...memberLeafIds].sort(),
    );
    expect(inspected.data.deployments.map((deployment) => deployment.sourceId)).toEqual([
      "writing-stack",
      "writing-stack",
    ]);
    expect(
      inspected.data.deployments.every(
        (deployment) => path.resolve(deployment.targetPath).startsWith(path.resolve(resolvedProjectRepo)),
      ),
    ).toBe(true);
  });

  test("repairState keeps virtual group managed deployments", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, {
      sourceIdOverride: "writing-source",
      project: false,
    });
    const editing = await app.addSource(editingRepo, {
      sourceIdOverride: "editing-source",
      project: false,
    });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }
    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];
    const memberLeafIds = collectionMemberLeafIds();
    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const applied = await app.applyDraft("writing-stack", {
      selectedLeafIds: memberLeafIds,
      enabledTargets: ["codex"],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const beforeRepair = await v2View(app);
    expect(getManagedDeployments(beforeRepair.lockFile).filter((deployment) => deployment.sourceId === "writing-stack")).toHaveLength(2);

    const repaired = await app.repairState(["writing-stack"]);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }
    expect(repaired.data.removedDeploymentCount).toBe(0);
    const afterRepair = await v2View(app);
    expect(
      getManagedDeployments(afterRepair.lockFile)
        .filter((deployment) => deployment.sourceId === "writing-stack")
        .map((deployment) => deployment.leafId)
        .sort(),
    ).toEqual([...memberLeafIds].sort());
  });

  test("merge groups hides source groups, clears bindings, and stores restore snapshots", async () => {
    const alphaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/alpha/SKILL.md": skillDoc("alpha", "Alpha writing."),
    });
    const betaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/beta/SKILL.md": skillDoc("beta", "Beta writing."),
    });
    const app = new SkillFlowApp();
    const alpha = await app.addSource(alphaRepo, {
      sourceIdOverride: "alpha",
      project: false,
    });
    const beta = await app.addSource(betaRepo, {
      sourceIdOverride: "beta",
      project: false,
    });
    expect(alpha.ok).toBe(true);
    expect(beta.ok).toBe(true);
    if (!alpha.ok || !beta.ok) {
      return;
    }
    const alphaLeafId = "alpha:skills/alpha";
    const betaLeafId = "beta:skills/beta";
    const memberLeafIds = collectionMemberLeafIds();
    const appliedAlpha = await app.applyDraft("alpha", {
      selectedLeafIds: [alphaLeafId],
      enabledTargets: ["codex"],
    });
    const appliedBeta = await app.applyDraft("beta", {
      selectedLeafIds: [betaLeafId],
      enabledTargets: ["cursor"],
    });
    expect(appliedAlpha.ok).toBe(true);
    expect(appliedBeta.ok).toBe(true);
    if (!appliedAlpha.ok || !appliedBeta.ok) {
      return;
    }

    const result = await app.mergeGroups({
      displayName: "Writing Stack",
      sourceIds: ["alpha", "beta"],
      enabledTargets: ["codex"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.group.id).toBe("writing-stack");
    expect(result.data.group.includedSkills).toEqual([
      { sourceId: "alpha", leafId: alphaLeafId },
      { sourceId: "beta", leafId: betaLeafId },
    ]);
    const { manifest } = await v2(app).readState();
    expect(manifest.bindings.alpha).toEqual({
      sourceId: "alpha",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    });
    expect(manifest.bindings.beta).toEqual({
      sourceId: "beta",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    });
    const deployments = (await v2(app).readState()).lockFile.projections
      .filter((deployment) => deployment.status === "active");
    expect(deployments.map((deployment) => deployment.sourceId)).toEqual([
      "writing-stack",
      "writing-stack",
    ]);
    expect(deployments.map((deployment) => deployment.leafId).sort()).toEqual(memberLeafIds);
    expect(deployments.every((deployment) => deployment.target === "codex")).toBe(true);
    for (const deployment of deployments) {
      await expect(pathExists(deployment.targetPath)).resolves.toBe(true);
    }
    await expect(pathExists(path.join(sandbox.targetsRoot, "cursor", "beta"))).resolves.toBe(false);

    const virtualGroups = await v2(app).readCollections();
    expect(virtualGroups.collections["writing-stack"]?.hiddenSourceIds).toEqual(["alpha", "beta"]);
    expect(virtualGroups.collections["writing-stack"]?.restoreSelections).toEqual({
      alpha: {
        sourceId: "alpha",
        selectedLeafIds: [alphaLeafId],
        enabledTargets: ["codex"],
        bestEffort: false,
        diagnostics: [],
      },
      beta: {
        sourceId: "beta",
        selectedLeafIds: [betaLeafId],
        enabledTargets: ["cursor"],
        bestEffort: false,
        diagnostics: [],
      },
    });

    const listed = await app.listWorkflows();
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    expect(listed.data.summaries.map((summary) => summary.source.id)).toEqual(["writing-stack"]);
    const summary = listed.data.summaries[0];
    expect(summary?.leafs.map((leaf) => ({
      id: leaf.id,
      sourceId: leaf.sourceId,
      sourceTitle: leaf.sourceTitle,
    }))).toEqual([
      {
        id: memberLeafIds[0],
        sourceId: "writing-stack",
        sourceTitle: manifest.sources.find((source) => source.id === "alpha")?.displayName,
      },
      {
        id: memberLeafIds[1],
        sourceId: "writing-stack",
        sourceTitle: manifest.sources.find((source) => source.id === "beta")?.displayName,
      },
    ]);
  });

  test("restore merged groups re-shows source groups and deletes the virtual group", async () => {
    const alphaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/alpha/SKILL.md": skillDoc("alpha", "Alpha writing."),
    });
    const betaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/beta/SKILL.md": skillDoc("beta", "Beta writing."),
    });
    const app = new SkillFlowApp();
    const alpha = await app.addSource(alphaRepo, {
      sourceIdOverride: "alpha",
      project: false,
    });
    const beta = await app.addSource(betaRepo, {
      sourceIdOverride: "beta",
      project: false,
    });
    expect(alpha.ok).toBe(true);
    expect(beta.ok).toBe(true);
    if (!alpha.ok || !beta.ok) {
      return;
    }
    const alphaLeafId = "alpha:skills/alpha";
    const betaLeafId = "beta:skills/beta";
    const appliedAlpha = await app.applyDraft("alpha", {
      selectedLeafIds: [alphaLeafId],
      enabledTargets: ["codex"],
    });
    const appliedBeta = await app.applyDraft("beta", {
      selectedLeafIds: [betaLeafId],
      enabledTargets: ["cursor"],
    });
    expect(appliedAlpha.ok).toBe(true);
    expect(appliedBeta.ok).toBe(true);
    if (!appliedAlpha.ok || !appliedBeta.ok) {
      return;
    }
    const merged = await app.mergeGroups({
      displayName: "Writing Stack",
      sourceIds: ["alpha", "beta"],
      enabledTargets: ["codex"],
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) {
      return;
    }

    const restored = await app.restoreMergedGroups("writing-stack");

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.data).toEqual({
      virtualGroupId: "writing-stack",
      restoredSourceIds: ["alpha", "beta"],
      skippedSourceIds: [],
    });
    const { manifest } = await v2(app).readState();
    expect(manifest.sources.some((source) => source.id === "writing-stack")).toBe(false);
    expect(manifest.bindings["writing-stack"]).toBeUndefined();
    expect(manifest.bindings.alpha).toEqual({
      sourceId: "alpha",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    expect(manifest.bindings.beta).toEqual({
      sourceId: "beta",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["cursor"],
    });
    const deployments = (await v2(app).readState()).lockFile.projections
      .filter((deployment) => deployment.status === "active");
    expect(deployments.map((deployment) => deployment.sourceId).sort()).toEqual(["alpha", "beta"]);
    expect(deployments.map((deployment) => deployment.leafId).sort()).toEqual([
      alphaLeafId,
      betaLeafId,
    ]);
    for (const deployment of deployments) {
      await expect(pathExists(deployment.targetPath)).resolves.toBe(true);
    }
    expect(deployments.some((deployment) => deployment.sourceId === "writing-stack")).toBe(false);
    const virtualGroups = await v2(app).readCollections();
    expect(virtualGroups.collections["writing-stack"]).toBeUndefined();
  });

  test("virtual group creation blocks duplicate projected skill names", async () => {
    const alphaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review alpha."),
    });
    const betaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review beta."),
    });
    const app = new SkillFlowApp();
    const alpha = await app.addSource(alphaRepo, {
      sourceIdOverride: "alpha",
      project: false,
    });
    const beta = await app.addSource(betaRepo, {
      sourceIdOverride: "beta",
      project: false,
    });
    expect(alpha.ok).toBe(true);
    expect(beta.ok).toBe(true);
    if (!alpha.ok || !beta.ok) {
      return;
    }

    const result = await app.createVirtualGroup({
      displayName: "Review Stack",
      skills: [
        { sourceId: "alpha", leafId: "alpha:skills/review" },
        { sourceId: "beta", leafId: "beta:skills/review" },
      ],
      enabledTargets: ["codex"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("VIRTUAL_GROUP_SKILL_NAME_CONFLICT");
    expect(result.errors[0]?.message).toContain("review");
    expect(result.errors[0]?.message).toContain("alpha");
    expect(result.errors[0]?.message).toContain("beta");
  });

  test("rejects empty virtual group name", async () => {
    const app = new SkillFlowApp();

    const result = await app.createVirtualGroup({
      displayName: "   ",
      skills: [{ sourceId: "source", leafId: "source:skill" }],
      enabledTargets: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("VIRTUAL_GROUP_NAME_EMPTY");
  });

  test("rejects empty virtual group skills", async () => {
    const app = new SkillFlowApp();

    const result = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [],
      enabledTargets: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("VIRTUAL_GROUP_SKILLS_EMPTY");
  });
});

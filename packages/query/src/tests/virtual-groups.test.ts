import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { getManagedDeployments } from "@skill-flow/domain/projection-compat";
import { resolveDocumentedProjectSkillPath } from "@skill-flow/integration/utils/constants";
import { SkillFlowApp } from "../runtime.js";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

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
    const lockSpy = vi.spyOn(app.store, "withMutationLock");

    const writing = await app.addSource(writingRepo, { sourceIdOverride: "writing-source" });
    const editing = await app.addSource(editingRepo, { sourceIdOverride: "editing-source" });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }

    lockSpy.mockClear();
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
    expect(lockSpy).toHaveBeenCalledTimes(1);
    expect(result.data.group.id).toBe("writing-stack");
    expect(result.data.group.displayName).toBe("Writing Stack");
    expect(result.data.group.includedSkills).toEqual([
      { sourceId: "writing-source", leafId: "writing-source:skills/drafting" },
      { sourceId: "editing-source", leafId: "editing-source:skills/revision" },
    ]);

    const { manifest, lockFile } = await app.store.readState();
    expect(manifest.sources).toContainEqual({
      id: "writing-stack",
      locator: "virtual:writing-stack",
      kind: "virtual",
      displayName: "Writing Stack",
      originalDisplayName: "Writing Stack",
      addedAt: result.data.group.createdAt,
      selectionMode: "all",
    });
    expect(manifest.bindings["writing-stack"]).toEqual({
      selectedLeafIds: [
        "writing-source:skills/drafting",
        "editing-source:skills/revision",
      ],
      targets: {
        codex: {
          enabled: true,
          leafIds: [
            "writing-source:skills/drafting",
            "editing-source:skills/revision",
          ],
        },
        cursor: {
          enabled: true,
          leafIds: [
            "writing-source:skills/drafting",
            "editing-source:skills/revision",
          ],
        },
      },
    });
    expect(lockFile.sources.some((source) => source.id === "writing-stack")).toBe(false);
    expect(await pathExists(app.store.getSourceCheckoutPath("virtual", "writing-stack"))).toBe(false);
    const deployments = getManagedDeployments(lockFile)
      .filter((deployment) => deployment.sourceId === "writing-stack");
    expect(deployments.map((deployment) => deployment.target).sort()).toEqual([
      "codex",
      "codex",
      "cursor",
      "cursor",
    ]);
    await expect(pathExists(path.join(sandbox.targetsRoot, "codex", "drafting"))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.targetsRoot, "codex", "revision"))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.targetsRoot, "cursor", "drafting"))).resolves.toBe(true);
    await expect(pathExists(path.join(sandbox.targetsRoot, "cursor", "revision"))).resolves.toBe(true);

    const virtualGroups = await app.store.readVirtualGroups();
    expect(virtualGroups.groups["writing-stack"]).toEqual({
      id: "writing-stack",
      displayName: "Writing Stack",
      includedSkills: [
        { sourceId: "writing-source", leafId: "writing-source:skills/drafting" },
        { sourceId: "editing-source", leafId: "editing-source:skills/revision" },
      ],
      hiddenSourceIds: [],
      restoreSnapshots: {},
      createdAt: result.data.group.createdAt,
      updatedAt: result.data.group.updatedAt,
    });
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
    expect(inspected.data.binding.selectedLeafIds).toEqual(leafIds);

    const { manifest } = await app.store.readState();
    expect(manifest.bindings["writing-stack"]?.selectedLeafIds).toEqual(leafIds);
    expect(manifest.bindings["writing-stack"]?.targets.codex?.leafIds).toEqual(leafIds);
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
    expect(summary?.leafs.map((leaf) => leaf.id)).toEqual(leafIds);
    expect(summary?.health).not.toBe("BLOCKED");

    const inspected = await app.inspectSource("writing-stack");
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.leafs.map((leaf) => leaf.id)).toEqual(leafIds);

    const preview = await app.previewDraft("writing-stack", {
      selectedLeafIds: leafIds,
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
    expect(plannedLeafIds).toEqual([...leafIds].sort());
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
      selectedLeafIds: [leafIds[0]!],
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
    expect(summary?.leafs.map((leaf) => leaf.id)).toEqual(leafIds);
    expect(summary?.bindings.selectedLeafIds).toEqual([leafIds[0]]);

    const inspected = await app.inspectSource("writing-stack");
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.leafs.map((leaf) => leaf.id)).toEqual(leafIds);
    expect(inspected.data.binding.selectedLeafIds).toEqual([leafIds[0]]);
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
    await app.store.writePreferences({
      ...(await app.store.readPreferences()),
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: resolvedProjectRepo,
        tools: ["codex"],
      }],
    });
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
      { selectedLeafIds: leafIds, enabledTargets: ["codex"] },
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
    expect(await pathExists(path.join(projectTargetRoot, "drafting"))).toBe(true);
    expect(await pathExists(path.join(projectTargetRoot, "revision"))).toBe(true);

    const inspected = await app.inspectSource(
      "writing-stack",
      { kind: "project", projectId: "repo-a" },
    );

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.deployments.map((deployment) => deployment.leafId).sort()).toEqual(
      [...leafIds].sort(),
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
      selectedLeafIds: leafIds,
      enabledTargets: ["codex"],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const beforeRepair = await app.store.readLock();
    expect(getManagedDeployments(beforeRepair).filter((deployment) => deployment.sourceId === "writing-stack")).toHaveLength(2);

    const repaired = await app.repairState(["writing-stack"]);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }
    expect(repaired.data.removedDeploymentCount).toBe(0);
    const afterRepair = await app.store.readLock();
    expect(
      getManagedDeployments(afterRepair)
        .filter((deployment) => deployment.sourceId === "writing-stack")
        .map((deployment) => deployment.leafId)
        .sort(),
    ).toEqual([...leafIds].sort());
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
    const { manifest } = await app.store.readState();
    expect(manifest.bindings.alpha).toEqual({ selectedLeafIds: [], targets: {} });
    expect(manifest.bindings.beta).toEqual({ selectedLeafIds: [], targets: {} });
    const deployments = getManagedDeployments((await app.store.readState()).lockFile);
    expect(deployments.map((deployment) => deployment.sourceId)).toEqual([
      "writing-stack",
      "writing-stack",
    ]);
    expect(deployments.map((deployment) => deployment.leafId).sort()).toEqual([
      alphaLeafId,
      betaLeafId,
    ]);
    expect(deployments.every((deployment) => deployment.target === "codex")).toBe(true);
    for (const deployment of deployments) {
      await expect(pathExists(deployment.targetPath)).resolves.toBe(true);
    }
    await expect(pathExists(path.join(sandbox.targetsRoot, "cursor", "beta"))).resolves.toBe(false);

    const virtualGroups = await app.store.readVirtualGroups();
    expect(virtualGroups.groups["writing-stack"]?.hiddenSourceIds).toEqual(["alpha", "beta"]);
    expect(virtualGroups.groups["writing-stack"]?.restoreSnapshots).toEqual({
      alpha: {
        selectedLeafIds: [alphaLeafId],
        enabledTargets: ["codex"],
      },
      beta: {
        selectedLeafIds: [betaLeafId],
        enabledTargets: ["cursor"],
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
        id: alphaLeafId,
        sourceId: "alpha",
        sourceTitle: manifest.sources.find((source) => source.id === "alpha")?.displayName,
      },
      {
        id: betaLeafId,
        sourceId: "beta",
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
    const { manifest } = await app.store.readState();
    expect(manifest.sources.some((source) => source.id === "writing-stack")).toBe(false);
    expect(manifest.bindings["writing-stack"]).toBeUndefined();
    expect(manifest.bindings.alpha).toEqual({
      selectedLeafIds: [alphaLeafId],
      targets: {
        codex: {
          enabled: true,
          leafIds: [alphaLeafId],
        },
      },
    });
    expect(manifest.bindings.beta).toEqual({
      selectedLeafIds: [betaLeafId],
      targets: {
        cursor: {
          enabled: true,
          leafIds: [betaLeafId],
        },
      },
    });
    const deployments = getManagedDeployments((await app.store.readState()).lockFile);
    expect(deployments.map((deployment) => deployment.sourceId).sort()).toEqual(["alpha", "beta"]);
    expect(deployments.map((deployment) => deployment.leafId).sort()).toEqual([
      alphaLeafId,
      betaLeafId,
    ]);
    for (const deployment of deployments) {
      await expect(pathExists(deployment.targetPath)).resolves.toBe(true);
    }
    expect(deployments.some((deployment) => deployment.sourceId === "writing-stack")).toBe(false);
    const virtualGroups = await app.store.readVirtualGroups();
    expect(virtualGroups.groups["writing-stack"]).toBeUndefined();
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

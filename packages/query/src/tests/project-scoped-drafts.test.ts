import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";
import { RecentProjectService } from "@skill-flow/core-engine/services/recent-project-service";
import type { PreferencesFile } from "@skill-flow/domain/types";
import { resolveDocumentedProjectSkillPath } from "@skill-flow/integration/utils/constants";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, pathExists, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("project scoped drafts", () => {
  const sandbox = useSkillFlowSandbox();

  async function updatePreferences(
    app: SkillFlowApp,
    update: (preferences: PreferencesFile) => PreferencesFile,
  ) {
    const store = new StateStore(app.store.rootPath);
    const state = await store.readState();
    await store.writeState({
      ...state,
      preferences: update(state.preferences),
    });
  }

  test("applyDraft(project) writes v2 projectSourceDrafts without legacy preferences", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "alpha",
      project: false,
    });
    expect(added.ok).toBe(true);
    const store = new StateStore(sandbox.stateRoot);
    const state = await store.readState();
    await store.writeState({
      ...state,
      preferences: {
        ...state.preferences,
        selectedProjectScope: { kind: "project", projectId: "repo-a" },
        recentProjects: [{
          projectId: "repo-a",
          title: "Repo A",
          lastActivityAt: "2026-06-05T00:00:00.000Z",
          projectPath: repoPath,
          tools: ["codex"],
        }],
      },
    });
    const applied = await app.applyDraft(
      "alpha",
      {
        selectedLeafIds: ["alpha:skills/review"],
        enabledTargets: ["codex"],
      },
      { kind: "project", projectId: "repo-a" },
    );

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    const nextState = await store.readState();
    expect(nextState.preferences.projectSourceDrafts["repo-a"]?.alpha).toEqual(
      expect.objectContaining({
        sourceId: "alpha",
        selectedLeafIds: ["alpha:skills/review"],
        enabledTargets: ["codex"],
      }),
    );
  });

  test("bootstrapWorkspaceState returns recent projects and selected scope", async () => {
    const app = new SkillFlowApp();
    await updatePreferences(app, (preferences) => ({
      ...preferences,
      recentProjects: [{
        projectId: "acme/skill-flow",
        title: "Skill Flow",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        tools: ["codex"],
      }],
    }));

    const result = await app.bootstrapWorkspaceState();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.recentProjects[0]?.projectId).toBe("acme/skill-flow");
    expect(result.data.selectedProjectScope).toEqual({ kind: "global" });
    expect(result.data.projectDrafts).toEqual({});
  });

  test("listWorkflows returns recent projects and reconciled selected scope", async () => {
    vi.spyOn(RecentProjectService.prototype, "listRecentProjects").mockResolvedValue([
      {
        projectId: "acme/skill-flow",
        title: "Skill Flow",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        tools: ["codex"],
      },
    ]);

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    await updatePreferences(app, (preferences) => ({
      ...preferences,
      selectedProjectScope: { kind: "project", projectId: "missing-repo" },
    }));

    const added = await app.addSource(`file://${repoPath}`, { sourceIdOverride: "alpha" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const result = await app.listWorkflows();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.recentProjects.map((project) => project.projectId)).toEqual([
      "acme/skill-flow",
    ]);
    expect(result.data.selectedProjectScope).toEqual({ kind: "global" });

    const preferences = (await new StateStore(app.store.rootPath).readState()).preferences;
    expect(preferences.selectedProjectScope).toEqual({ kind: "global" });
    expect(preferences.recentProjects.map((project) => project.projectId)).toEqual([
      "acme/skill-flow",
    ]);
  });

  test("bootstrapWorkspaceState preserves the cached project scope without rescanning observations", async () => {
    const listRecentProjects = vi
      .spyOn(RecentProjectService.prototype, "listRecentProjects")
      .mockResolvedValue([]);

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    await updatePreferences(app, (preferences) => ({
      ...preferences,
      selectedProjectScope: { kind: "project", projectId: "repo-a" },
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      }],
      projectSourceDrafts: {
        ...preferences.projectSourceDrafts,
        "repo-a": {
          alpha: {
            sourceId: "alpha",
            enabledTargets: ["codex"],
            selectedLeafIds: ["alpha:skills/review"],
            updatedAt: "2026-06-05T00:00:00.000Z",
          },
        },
      },
    }));

    const result = await app.bootstrapWorkspaceState();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.selectedProjectScope).toEqual({ kind: "project", projectId: "repo-a" });
    expect(result.data.recentProjects.map((project) => project.projectId)).toEqual(["repo-a"]);
    expect(listRecentProjects).not.toHaveBeenCalled();
  });

  test("applyDraft(project) only updates the project layer", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    vi.spyOn(RecentProjectService.prototype, "listRecentProjects").mockResolvedValue([
      {
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      },
    ]);
    const app = new SkillFlowApp();
    await updatePreferences(app, (preferences) => ({
      ...preferences,
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      }],
    }));

    const added = await app.addSource(repoPath, { sourceIdOverride: "alpha" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const sourceId = added.data.manifest.id;

    const globalBefore = await app.inspectSource(sourceId);
    expect(globalBefore.ok).toBe(true);
    if (!globalBefore.ok) {
      return;
    }

    const projectApplied = await app.applyDraft(
      sourceId,
      { enabledTargets: [], selectedLeafIds: [] },
      { kind: "project", projectId: "repo-a" },
    );
    expect(projectApplied.ok).toBe(true);
    if (!projectApplied.ok) {
      return;
    }

    const globalAfter = await app.inspectSource(sourceId);
    expect(globalAfter.ok).toBe(true);
    if (!globalAfter.ok) {
      return;
    }
    expect(globalAfter.data.binding).toEqual(globalBefore.data.binding);

    const projectInspect = await app.inspectSource(sourceId, {
      kind: "project",
      projectId: "repo-a",
    });
    expect(projectInspect.ok).toBe(true);
    if (!projectInspect.ok) {
      return;
    }

    expect(projectInspect.data.binding.selectedLeafIds).toEqual([]);
    expect(projectInspect.data.binding.targets).toEqual({});

    const preferences = (await new StateStore(app.store.rootPath).readState()).preferences;
    expect(preferences.projectSourceDrafts["repo-a"]?.[sourceId]).toEqual(
      expect.objectContaining({
        sourceId,
        enabledTargets: [],
        selectedLeafIds: [],
      }),
    );
  });

  test("applyDraft returns fresh source state without project scope metadata", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    vi.spyOn(RecentProjectService.prototype, "listRecentProjects").mockResolvedValue([
      {
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      },
    ]);
    const app = new SkillFlowApp();
    await updatePreferences(app, (preferences) => ({
      ...preferences,
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      }],
    }));

    const added = await app.addSource(repoPath, { sourceIdOverride: "alpha" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const applied = await app.applyDraft(
      added.data.manifest.id,
      { enabledTargets: [], selectedLeafIds: [] },
      { kind: "project", projectId: "repo-a" },
    );

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    expect(applied.data.summary).toBeDefined();
    expect(applied.data.inspect).toBeDefined();
    expect(applied.data).not.toHaveProperty("recentProjects");
    expect(applied.data).not.toHaveProperty("selectedProjectScope");
    expect(applied.data).not.toHaveProperty("projectDrafts");
  });

  test("applyDraft(project) mounts enabled targets into the documented project path", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const resolvedRepoPath = await fs.realpath(repoPath);
    vi.spyOn(RecentProjectService.prototype, "listRecentProjects").mockResolvedValue([
      {
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      },
    ]);
    const app = new SkillFlowApp();
    await updatePreferences(app, (preferences) => ({
      ...preferences,
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      }],
    }));

    const added = await app.addSource(repoPath, { sourceIdOverride: "alpha", project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:skills/review`;
    const projectTargetRoot = resolveDocumentedProjectSkillPath("codex", resolvedRepoPath);
    expect(projectTargetRoot).toBeTruthy();
    if (!projectTargetRoot) {
      return;
    }

    const applied = await app.applyDraft(
      sourceId,
      { enabledTargets: ["codex"], selectedLeafIds: [leafId] },
      { kind: "project", projectId: "repo-a" },
    );

    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const expectedTargetPath = path.join(projectTargetRoot, "review");
    expect(await pathExists(expectedTargetPath)).toBe(true);
    expect(await pathExists(path.join(sandbox.targetsRoot, "codex", "review"))).toBe(false);

    const inspected = await app.inspectSource(sourceId, { kind: "project", projectId: "repo-a" });
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }

    expect(inspected.data.deployments).toEqual([
      expect.objectContaining({
        target: "codex",
        targetRootPath: projectTargetRoot,
        targetPath: expectedTargetPath,
      }),
    ]);
  });

  test("applyDraft(project) fails when the selected project has no projectPath", async () => {
    vi.spyOn(RecentProjectService.prototype, "listRecentProjects").mockResolvedValue([
      {
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        tools: ["codex"],
      },
    ]);

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    await updatePreferences(app, (preferences) => ({
      ...preferences,
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        tools: ["codex"],
      }],
    }));

    const added = await app.addSource(repoPath, { sourceIdOverride: "alpha", project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const applied = await app.applyDraft(
      added.data.manifest.id,
      {
        enabledTargets: ["codex"],
        selectedLeafIds: [`${added.data.manifest.id}:skills/review`],
      },
      { kind: "project", projectId: "repo-a" },
    );

    expect(applied.ok).toBe(false);
    if (applied.ok) {
      return;
    }

    expect(applied.errors[0]?.code).toBe("PROJECT_SCOPE_PATH_UNAVAILABLE");
    expect(await pathExists(path.join(sandbox.targetsRoot, "codex", "review"))).toBe(false);
  });

  test("applyDraft(project) does not persist a new project draft when scoped apply fails", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    await updatePreferences(app, (preferences) => ({
      ...preferences,
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      }],
    }));

    const added = await app.addSource(repoPath, { sourceIdOverride: "alpha", project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await updatePreferences(app, (preferences) => ({
      ...preferences,
      projectSourceDrafts: {
        ...preferences.projectSourceDrafts,
        "repo-a": {
          [added.data.manifest.id]: {
            sourceId: added.data.manifest.id,
            enabledTargets: [],
            selectedLeafIds: [],
            updatedAt: "2026-06-05T00:00:00.000Z",
          },
        },
      },
    }));

    vi.spyOn(app as never, "withScopedTargetRoots").mockResolvedValue({
      ok: false,
      warnings: [],
      errors: [{
        code: "TARGET_WRITE_FAILED",
        message: "disk is blocked",
      }],
    });

    const applied = await app.applyDraft(
      added.data.manifest.id,
      {
        enabledTargets: ["codex"],
        selectedLeafIds: [`${added.data.manifest.id}:skills/review`],
      },
      { kind: "project", projectId: "repo-a" },
    );

    expect(applied.ok).toBe(false);
    if (applied.ok) {
      return;
    }

    const preferences = (await new StateStore(app.store.rootPath).readState()).preferences;
    expect(preferences.projectSourceDrafts["repo-a"]?.[added.data.manifest.id]).toEqual(
      expect.objectContaining({
        sourceId: added.data.manifest.id,
        enabledTargets: [],
        selectedLeafIds: [],
      }),
    );
  });

  test("applyDraft(project) removes invalid project scope data when the project path disappears", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    await updatePreferences(app, (preferences) => ({
      ...preferences,
      selectedProjectScope: { kind: "project", projectId: "repo-a" },
      recentProjects: [{
        projectId: "repo-a",
        title: "Repo A",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        projectPath: repoPath,
        tools: ["codex"],
      }],
      projectSourceDrafts: {
        ...preferences.projectSourceDrafts,
        "repo-a": {
          alpha: {
            sourceId: "alpha",
            enabledTargets: ["codex"],
            selectedLeafIds: ["alpha:skills/review"],
            updatedAt: "2026-06-05T00:00:00.000Z",
          },
        },
      },
    }));

    const added = await app.addSource(repoPath, { sourceIdOverride: "alpha", project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await fs.rm(repoPath, { recursive: true, force: true });

    const applied = await app.applyDraft(
      added.data.manifest.id,
      {
        enabledTargets: ["codex"],
        selectedLeafIds: [`${added.data.manifest.id}:skills/review`],
      },
      { kind: "project", projectId: "repo-a" },
    );

    expect(applied.ok).toBe(false);
    if (applied.ok) {
      return;
    }

    const preferences = (await new StateStore(app.store.rootPath).readState()).preferences;
    expect(preferences.selectedProjectScope).toEqual({ kind: "global" });
    expect(preferences.recentProjects).toEqual([]);
    expect(preferences.projectSourceDrafts["repo-a"]).toBeUndefined();
    expect(applied.data?.selectedProjectScope).toEqual({ kind: "global" });
    expect(applied.data?.recentProjects).toEqual([]);
    expect(applied.data?.projectDrafts).toEqual({});
  });
});

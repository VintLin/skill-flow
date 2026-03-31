import { describe, expect, test, vi } from "vitest";
import { RecentProjectService } from "@skill-flow/core-engine/services/recent-project-service";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("project scoped drafts", () => {
  const sandbox = useSkillFlowSandbox();

  test("bootstrapWorkspaceState returns recent projects and selected scope", async () => {
    vi.spyOn(RecentProjectService.prototype, "listRecentProjects").mockResolvedValue([
      {
        projectId: "acme/skill-flow",
        title: "Skill Flow",
        lastActivityAt: "2026-03-30T00:00:00.000Z",
        tools: ["codex"],
      },
    ]);

    const app = new SkillFlowApp();

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

    await app.store.writePreferences({
      ...(await app.store.readPreferences()),
      selectedProjectScope: { kind: "project", projectId: "missing-repo" },
    });

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

    const preferences = await app.store.readPreferences();
    expect(preferences.selectedProjectScope).toEqual({ kind: "global" });
    expect(preferences.recentProjects.map((project) => project.projectId)).toEqual([
      "acme/skill-flow",
    ]);
  });

  test("applyDraft(project) only updates the project layer", async () => {
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

    const added = await app.addSource(repoPath, { sourceIdOverride: "alpha" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(added.data.manifest.id).toBe("alpha");

    const globalBefore = await app.inspectSource(added.data.manifest.id);
    expect(globalBefore.ok).toBe(true);
    if (!globalBefore.ok) {
      return;
    }

    const projectApplied = await app.applyDraft(
      added.data.manifest.id,
      { enabledTargets: [], selectedLeafIds: [] },
      { kind: "project", projectId: "repo-a" },
    );
    expect(projectApplied.ok).toBe(true);
    if (!projectApplied.ok) {
      return;
    }

    const globalAfter = await app.inspectSource(added.data.manifest.id);
    expect(globalAfter.ok).toBe(true);
    if (!globalAfter.ok) {
      return;
    }
    expect(globalAfter.data.binding).toEqual(globalBefore.data.binding);

    const projectInspect = await app.inspectSource(added.data.manifest.id, {
      kind: "project",
      projectId: "repo-a",
    });
    expect(projectInspect.ok).toBe(true);
    if (!projectInspect.ok) {
      return;
    }

    expect(projectInspect.data.binding.selectedLeafIds).toEqual([]);
    expect(projectInspect.data.binding.targets).toEqual({});

    const preferences = await app.store.readPreferences();
    expect(preferences.projectDrafts["repo-a"]?.alpha).toEqual({
      enabledTargets: [],
      selectedLeafIds: [],
    });
  });
});

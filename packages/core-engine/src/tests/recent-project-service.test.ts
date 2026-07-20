import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProjectObservation } from "@skill-flow/integration";
import * as integration from "@skill-flow/integration";
import {
  aggregateRecentProjects,
  RecentProjectService,
} from "../services/recent-project-service.js";

describe("recent project service", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recent-projects-"));
  });

  test("aggregateRecentProjects aggregates by latest activity", () => {
    const observations: ProjectObservation[] = [
      {
        tool: "codex",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        tool: "claude-code",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        tool: "codex",
        projectId: "repo-b",
        title: "repo-b",
        observedAt: "2026-01-15T00:00:00.000Z",
      },
    ];

    const aggregated = aggregateRecentProjects(observations);

    expect(aggregated[0]).toMatchObject({
      projectId: "repo-a",
      title: "repo-a",
      lastActivityAt: "2026-02-01T00:00:00.000Z",
      tools: ["claude-code", "codex"],
    });
  });

  test("aggregateRecentProjects collapses repository and cwd identities for the same project path", () => {
    const observations: ProjectObservation[] = [
      {
        tool: "codex",
        projectId: "acme/todo-flow",
        title: "030_TodoFlow",
        observedAt: "2026-03-02T00:00:00.000Z",
        projectPath: "/Users/test/Repos/030_TodoFlow",
      },
      {
        tool: "claude-code",
        projectId: "/Users/test/Repos/030_TodoFlow",
        title: "030_TodoFlow",
        observedAt: "2026-03-01T00:00:00.000Z",
        projectPath: "/Users/test/Repos/030_TodoFlow/",
      },
    ];

    const aggregated = aggregateRecentProjects(observations);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]).toMatchObject({
      projectId: "acme/todo-flow",
      projectPath: "/Users/test/Repos/030_TodoFlow",
      tools: ["claude-code", "codex"],
    });
  });

  test("aggregateRecentProjects keeps same-name projects at different paths separate", () => {
    const aggregated = aggregateRecentProjects([
      {
        tool: "codex",
        projectId: "/Users/test/client-a/app",
        title: "app",
        observedAt: "2026-03-02T00:00:00.000Z",
        projectPath: "/Users/test/client-a/app",
      },
      {
        tool: "codex",
        projectId: "/Users/test/client-b/app",
        title: "app",
        observedAt: "2026-03-01T00:00:00.000Z",
        projectPath: "/Users/test/client-b/app",
      },
    ]);

    expect(aggregated.map((project) => project.projectId)).toEqual([
      "/Users/test/client-a/app",
      "/Users/test/client-b/app",
    ]);
  });

  test("aggregateRecentProjects truncates to ten projects", () => {
    const observations: ProjectObservation[] = Array.from({ length: 12 }, (_, index) => ({
      tool: "codex",
      projectId: `repo-${index}`,
      title: `repo-${index}`,
      observedAt: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));

    const aggregated = aggregateRecentProjects(observations);

    expect(aggregated).toHaveLength(10);
    expect(aggregated[0]?.projectId).toBe("repo-11");
    expect(aggregated[9]?.projectId).toBe("repo-2");
  });

  test("aggregateRecentProjects preserves an existing projectPath when a newer observation lacks one", () => {
    const observations: ProjectObservation[] = [
      {
        tool: "codex",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-03-01T00:00:00.000Z",
        projectPath: "/Users/test/src/repo-a",
      },
      {
        tool: "claude-code",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-03-02T00:00:00.000Z",
      },
    ];

    const aggregated = aggregateRecentProjects(observations);

    expect(aggregated[0]).toMatchObject({
      projectId: "repo-a",
      lastActivityAt: "2026-03-02T00:00:00.000Z",
      projectPath: "/Users/test/src/repo-a",
      tools: ["claude-code", "codex"],
    });
  });

  test("listRecentProjects drops projects whose only observations lack a valid projectPath", async () => {
    const repoPath = path.join(tempRoot, "repo-a");
    await fs.mkdir(repoPath, { recursive: true });
    const resolvedRepoPath = await fs.realpath(repoPath);
    vi.spyOn(integration, "collectProjectObservations").mockResolvedValue([
      {
        tool: "codex",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-03-01T00:00:00.000Z",
        projectPath: repoPath,
      },
      {
        tool: "claude-code",
        projectId: "repo-b",
        title: "repo-b",
        observedAt: "2026-03-02T00:00:00.000Z",
      },
      {
        tool: "gemini-cli",
        projectId: "repo-c",
        title: "repo-c",
        observedAt: "2026-03-03T00:00:00.000Z",
        projectPath: path.join(tempRoot, "missing-repo"),
      },
    ]);

    const projects = await new RecentProjectService().listRecentProjects();

    expect(projects.map((project) => project.projectId)).toEqual(["repo-a"]);
    expect(projects[0]?.projectPath).toBe(resolvedRepoPath);
  });

  test("listRecentProjects falls back to an older valid path when the newest observed path is invalid", async () => {
    const validRepoPath = path.join(tempRoot, "repo-a");
    await fs.mkdir(validRepoPath, { recursive: true });
    const resolvedRepoPath = await fs.realpath(validRepoPath);
    vi.spyOn(integration, "collectProjectObservations").mockResolvedValue([
      {
        tool: "codex",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-03-01T00:00:00.000Z",
        projectPath: validRepoPath,
      },
      {
        tool: "claude-code",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-03-03T00:00:00.000Z",
        projectPath: path.join(tempRoot, "repo-a-renamed"),
      },
      {
        tool: "gemini-cli",
        projectId: "repo-a",
        title: "repo-a",
        observedAt: "2026-03-02T00:00:00.000Z",
      },
    ]);

    const projects = await new RecentProjectService().listRecentProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      projectId: "repo-a",
      lastActivityAt: "2026-03-02T00:00:00.000Z",
      projectPath: resolvedRepoPath,
      tools: ["codex", "gemini-cli"],
    });
  });
});

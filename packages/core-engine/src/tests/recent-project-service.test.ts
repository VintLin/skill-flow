import { describe, expect, test } from "vitest";
import type { ProjectObservation } from "@skill-flow/integration";
import { aggregateRecentProjects } from "../services/recent-project-service.js";

describe("recent project service", () => {
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
});


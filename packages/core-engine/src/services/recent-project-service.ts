import type { RecentProject } from "@skill-flow/domain";
import {
  collectProjectObservations,
  type ProjectObservation,
} from "@skill-flow/integration";

export function aggregateRecentProjects(
  observations: ProjectObservation[],
): RecentProject[] {
  const merged = new Map<string, RecentProject>();

  for (const observation of observations) {
    const existing = merged.get(observation.projectId);
    if (!existing) {
      merged.set(observation.projectId, {
        projectId: observation.projectId,
        title: observation.title,
        lastActivityAt: observation.observedAt,
        ...(observation.projectPath ? { projectPath: observation.projectPath } : {}),
        tools: [observation.tool],
      });
      continue;
    }

    const latest =
      new Date(existing.lastActivityAt).getTime() >=
      new Date(observation.observedAt).getTime()
        ? existing.lastActivityAt
        : observation.observedAt;

    const tools = new Set(existing.tools ?? []);
    tools.add(observation.tool);

    merged.set(observation.projectId, {
      projectId: existing.projectId,
      title:
        latest === observation.observedAt ? observation.title : existing.title,
      lastActivityAt: latest,
      ...(latest === observation.observedAt
        ? observation.projectPath
          ? { projectPath: observation.projectPath }
          : {}
        : existing.projectPath
          ? { projectPath: existing.projectPath }
          : {}),
      tools: Array.from(tools).sort(),
    });
  }

  return Array.from(merged.values())
    .sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    )
    .slice(0, 10);
}

export class RecentProjectService {
  async listRecentProjects(): Promise<RecentProject[]> {
    const observations = await collectProjectObservations();
    return aggregateRecentProjects(observations);
  }
}

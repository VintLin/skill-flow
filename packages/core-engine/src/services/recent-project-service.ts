import fs from "node:fs/promises";
import path from "node:path";
import type { RecentProject } from "@skill-flow/domain";
import {
  collectProjectObservations,
  type ProjectObservation,
} from "@skill-flow/integration";

export function aggregateRecentProjects(
  observations: ProjectObservation[],
): RecentProject[] {
  const groups = new Set<ProjectObservationGroup>();
  const groupsByIdentity = new Map<string, ProjectObservationGroup>();

  for (const observation of observations) {
    const identityKeys = projectIdentityKeys(observation);
    const matchingGroups = new Set(
      identityKeys.flatMap((key) => {
        const group = groupsByIdentity.get(key);
        return group ? [group] : [];
      }),
    );

    const group = matchingGroups.values().next().value ?? {
      identityKeys: new Set<string>(),
      observations: [],
    } satisfies ProjectObservationGroup;
    groups.add(group);

    for (const duplicateGroup of matchingGroups) {
      if (duplicateGroup === group) {
        continue;
      }
      group.observations.push(...duplicateGroup.observations);
      for (const key of duplicateGroup.identityKeys) {
        group.identityKeys.add(key);
        groupsByIdentity.set(key, group);
      }
      groups.delete(duplicateGroup);
    }

    for (const key of identityKeys) {
      group.identityKeys.add(key);
      groupsByIdentity.set(key, group);
    }
    group.observations.push(observation);
  }

  return Array.from(groups)
    .map((group) => mergeProjectObservationGroup(group.observations))
    .sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    )
    .slice(0, 10);
}

type ProjectObservationGroup = {
  identityKeys: Set<string>;
  observations: ProjectObservation[];
};

function normalizeProjectPathKey(projectPath: string | undefined): string | null {
  const trimmedPath = projectPath?.trim();
  if (!trimmedPath) {
    return null;
  }

  const normalizedPath = path.normalize(trimmedPath);
  if (normalizedPath === path.parse(normalizedPath).root) {
    return normalizedPath;
  }
  return normalizedPath.replace(/[\\/]+$/, "") || null;
}

function projectIdentityKeys(observation: ProjectObservation): string[] {
  const keys = [`id:${observation.projectId.trim()}`];
  const pathKey = normalizeProjectPathKey(observation.projectPath);
  if (pathKey) {
    keys.push(`path:${pathKey}`);
  }
  return keys;
}

function isPathProjectId(projectId: string): boolean {
  return projectId.startsWith("/") || projectId.startsWith("./") || projectId.startsWith("../");
}

function mergeProjectObservationGroup(observations: ProjectObservation[]): RecentProject {
  const first = observations[0]!;
  let projectId = first.projectId;
  let title = first.title;
  let lastActivityAt = first.observedAt;
  let projectPath = first.projectPath;
  const tools = new Set<string>([first.tool]);

  for (const observation of observations.slice(1)) {
    const isNewer = new Date(observation.observedAt).getTime() > new Date(lastActivityAt).getTime();
    if (isNewer) {
      title = observation.title;
      lastActivityAt = observation.observedAt;
    }
    if (observation.projectPath && (!projectPath || isNewer)) {
      projectPath = observation.projectPath;
    }
    if (isPathProjectId(projectId) && !isPathProjectId(observation.projectId)) {
      projectId = observation.projectId;
    }
    tools.add(observation.tool);
  }

  return {
    projectId,
    title,
    lastActivityAt,
    ...(projectPath ? { projectPath } : {}),
    tools: Array.from(tools).sort(),
  };
}

export async function resolveUsableProjectPath(projectPath: string | undefined): Promise<string | null> {
  const trimmedPath = projectPath?.trim();
  if (!trimmedPath) {
    return null;
  }

  try {
    const resolvedPath = await fs.realpath(trimmedPath);
    const stat = await fs.stat(resolvedPath);
    return stat.isDirectory() ? resolvedPath : null;
  } catch {
    return null;
  }
}

export class RecentProjectService {
  async listRecentProjects(): Promise<RecentProject[]> {
    const observations = await collectProjectObservations();
    const validatedObservations = (
      await Promise.all(
        observations.map(async (observation) => {
          if (!observation.projectPath) {
            return observation;
          }

          const resolvedProjectPath = await resolveUsableProjectPath(observation.projectPath);
          if (!resolvedProjectPath) {
            return null;
          }

          return {
            ...observation,
            projectPath: resolvedProjectPath,
          } satisfies ProjectObservation;
        }),
      )
    ).filter((observation): observation is ProjectObservation => observation !== null);

    return aggregateRecentProjects(validatedObservations).filter(
      (project): project is RecentProject & { projectPath: string } => Boolean(project.projectPath),
    );
  }
}

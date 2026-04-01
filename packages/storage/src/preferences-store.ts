import { SCHEMA_VERSION } from "@skill-flow/integration/utils/constants";
import type {
  DraftBinding,
  ProjectScope,
  RecentProject,
  ScopedSourceDrafts,
  SharedPreferences,
} from "@skill-flow/domain/types";

export function createEmptySharedPreferences(): SharedPreferences {
  return {
    schemaVersion: SCHEMA_VERSION,
    pinnedSourceIds: [],
    selectedProjectScope: { kind: "global" },
    recentProjects: [],
    projectDrafts: {},
  };
}

export function normalizeSharedPreferences(value: unknown): SharedPreferences {
  if (!isSharedPreferencesShape(value)) {
    return createEmptySharedPreferences();
  }

  const pinnedSourceIds = normalizePinnedSourceIds(value.pinnedSourceIds);
  const recentProjects = normalizeRecentProjects(value.recentProjects);
  const selectedProjectScope = normalizeSelectedProjectScope(value.selectedProjectScope, recentProjects);
  const projectDrafts = normalizeProjectDrafts(value.projectDrafts);

  return {
    schemaVersion: SCHEMA_VERSION,
    pinnedSourceIds,
    selectedProjectScope,
    recentProjects,
    projectDrafts,
  };
}

function normalizePinnedSourceIds(pinnedSourceIds: unknown): string[] {
  if (!Array.isArray(pinnedSourceIds)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const pinnedSourceId of pinnedSourceIds) {
    if (typeof pinnedSourceId !== "string" || pinnedSourceId.length === 0 || seen.has(pinnedSourceId)) {
      continue;
    }
    seen.add(pinnedSourceId);
    normalized.push(pinnedSourceId);
  }

  return normalized;
}

function normalizeRecentProjects(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: RecentProject[] = [];

  for (const entry of value) {
    if (!isRecentProject(entry)) {
      continue;
    }

    const recentProject: RecentProject = {
      projectId: entry.projectId,
      title: entry.title,
      lastActivityAt: entry.lastActivityAt,
    };

    if (typeof entry.projectPath === "string" && entry.projectPath.length > 0) {
      recentProject.projectPath = entry.projectPath;
    }

    if (isStringArray(entry.tools)) {
      recentProject.tools = entry.tools;
    }

    normalized.push(recentProject);
  }

  return normalized;
}

function normalizeSelectedProjectScope(
  scope: unknown,
  recentProjects: RecentProject[],
): ProjectScope {
  if (isProjectScope(scope)) {
    if (scope.kind === "global") {
      return { kind: "global" };
    }

    if (recentProjects.some((project) => project.projectId === scope.projectId)) {
      return { kind: "project", projectId: scope.projectId };
    }
  }

  return { kind: "global" };
}

function normalizeProjectDrafts(value: unknown): ScopedSourceDrafts {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const normalized: ScopedSourceDrafts = {};

  for (const [projectId, projectDrafts] of Object.entries(value)) {
    if (typeof projectId !== "string" || projectId.length === 0) {
      continue;
    }

    if (typeof projectDrafts !== "object" || projectDrafts === null) {
      continue;
    }

    const projectScope: Record<string, DraftBinding> = {};
    const projectDraftRecord = projectDrafts as Record<string, unknown>;

    for (const [sourceId, draft] of Object.entries(projectDraftRecord)) {
      if (typeof sourceId !== "string" || sourceId.length === 0) {
        continue;
      }

      if (!isDraftBinding(draft)) {
        continue;
      }

      projectScope[sourceId] = {
        enabledTargets: draft.enabledTargets,
        selectedLeafIds: draft.selectedLeafIds,
      };
    }

    if (Object.keys(projectScope).length > 0) {
      normalized[projectId] = projectScope;
    }
  }

  return normalized;
}

function isSharedPreferencesShape(value: unknown): value is SharedPreferences {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === SCHEMA_VERSION &&
    "pinnedSourceIds" in value &&
    Array.isArray(value.pinnedSourceIds)
  );
}

function isRecentProject(value: unknown): value is RecentProject & { tools?: unknown } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<RecentProject> & { tools?: unknown };

  if (typeof candidate.projectId !== "string" || candidate.projectId.length === 0) {
    return false;
  }

  if (typeof candidate.title !== "string") {
    return false;
  }

  if (typeof candidate.lastActivityAt !== "string") {
    return false;
  }

  return true;
}

function isProjectScope(value: unknown): value is ProjectScope {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as ProjectScope;

  if (candidate.kind === "global") {
    return true;
  }

  return typeof candidate.projectId === "string" && candidate.projectId.length > 0;
}

function isDraftBinding(value: unknown): value is DraftBinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    isStringArray((value as DraftBinding).enabledTargets) &&
    isStringArray((value as DraftBinding).selectedLeafIds)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

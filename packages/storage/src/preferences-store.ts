import { SCHEMA_VERSION } from "@skill-flow/integration/utils/constants";
import { TARGET_ORDER } from "@skill-flow/integration/utils/constants";
import path from "node:path";
import type {
  CustomTargetDefinition,
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
    customTargets: [],
    agentDisplayOrder: [...TARGET_ORDER],
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
  const customTargets = normalizeCustomTargets(value.customTargets);
  const agentDisplayOrder = normalizeAgentDisplayOrder(value.agentDisplayOrder, customTargets);

  return {
    schemaVersion: SCHEMA_VERSION,
    pinnedSourceIds,
    selectedProjectScope,
    recentProjects,
    projectDrafts,
    customTargets,
    agentDisplayOrder,
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

function normalizeCustomTargets(value: unknown): CustomTargetDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: CustomTargetDefinition[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const builtinIds = new Set<string>(TARGET_ORDER);

  for (const candidate of value) {
    if (!isCustomTargetDefinition(candidate)) {
      continue;
    }

    const id = candidate.id.trim();
    const name = candidate.name.trim();
    const globalPath = candidate.globalPath.trim();
    const projectPathTemplate = normalizeRelativeProjectPath(candidate.projectPathTemplate);

    if (id.length === 0 || name.length === 0 || globalPath.length === 0 || projectPathTemplate === null) {
      continue;
    }

    const foldedName = name.toLocaleLowerCase();
    if (
      builtinIds.has(id) ||
      seenIds.has(id) ||
      seenNames.has(foldedName) ||
      !isSlugLikeId(id) ||
      !path.isAbsolute(globalPath)
    ) {
      continue;
    }

    seenIds.add(id);
    seenNames.add(foldedName);
    normalized.push({
      id,
      name,
      globalPath,
      projectPathTemplate,
      strategy: candidate.strategy,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    });
  }

  return normalized;
}

function normalizeAgentDisplayOrder(
  value: unknown,
  customTargets: CustomTargetDefinition[],
): string[] {
  const knownIds = new Set<string>([...TARGET_ORDER, ...customTargets.map((target) => target.id)]);
  const normalized: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string" || seen.has(entry) || !knownIds.has(entry)) {
        continue;
      }
      seen.add(entry);
      normalized.push(entry);
    }
  }

  for (const targetId of TARGET_ORDER) {
    if (!seen.has(targetId)) {
      seen.add(targetId);
      normalized.push(targetId);
    }
  }

  for (const target of customTargets) {
    if (!seen.has(target.id)) {
      seen.add(target.id);
      normalized.push(target.id);
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

function isCustomTargetDefinition(value: unknown): value is CustomTargetDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as CustomTargetDefinition;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.globalPath === "string" &&
    typeof candidate.projectPathTemplate === "string" &&
    (candidate.strategy === "symlink" || candidate.strategy === "copy") &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function normalizeRelativeProjectPath(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || path.isAbsolute(trimmed)) {
    return null;
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized === "/" ||
    path.posix.isAbsolute(normalized)
  ) {
    return null;
  }

  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function isSlugLikeId(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

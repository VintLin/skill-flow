import fs from "node:fs/promises";
import path from "node:path";

export type LegacyVirtualGroup = {
  id: string;
  displayName: string;
  includedSkills: Array<{ sourceId: string; leafId: string }>;
  hiddenSourceIds: string[];
  restoreSnapshots: Record<string, { selectedLeafIds: string[]; enabledTargets: string[] }>;
  createdAt: string;
  updatedAt: string;
};

export function legacyVirtualGroupsPath(stateRoot: string): string {
  return path.join(stateRoot, "virtual-groups.json");
}

export async function hasLegacyVirtualGroups(stateRoot: string): Promise<boolean> {
  return pathExists(legacyVirtualGroupsPath(stateRoot));
}

export async function validateLegacyVirtualGroupsJson(
  stateRoot: string,
): Promise<{ ok: true } | { ok: false; path: string; message: string }> {
  const virtualGroupsPath = legacyVirtualGroupsPath(stateRoot);
  if (!(await pathExists(virtualGroupsPath))) {
    return { ok: true };
  }

  try {
    JSON.parse(await fs.readFile(virtualGroupsPath, "utf8")) as unknown;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      path: virtualGroupsPath,
      message: error instanceof Error ? error.message : "Virtual group state is invalid.",
    };
  }
}

export async function readLegacyVirtualGroups(
  stateRoot: string,
): Promise<Record<string, LegacyVirtualGroup>> {
  const virtualGroupsPath = legacyVirtualGroupsPath(stateRoot);
  if (!(await pathExists(virtualGroupsPath))) {
    return {};
  }

  const payload = await readJsonFile<Record<string, unknown>>(virtualGroupsPath, {});
  const groups = isRecord(payload.groups) ? payload.groups : {};
  const parsed: Record<string, LegacyVirtualGroup> = {};
  for (const [id, group] of Object.entries(groups)) {
    if (!isRecord(group)) {
      continue;
    }
    parsed[id] = {
      id,
      displayName: typeof group.displayName === "string" ? group.displayName : id,
      includedSkills: Array.isArray(group.includedSkills)
        ? group.includedSkills.filter(isRecord).flatMap((skill) =>
            typeof skill.sourceId === "string" && typeof skill.leafId === "string"
              ? [{ sourceId: skill.sourceId, leafId: skill.leafId }]
              : [],
          )
        : [],
      hiddenSourceIds: Array.isArray(group.hiddenSourceIds)
        ? group.hiddenSourceIds.filter((value): value is string => typeof value === "string")
        : [],
      restoreSnapshots: readLegacyVirtualGroupRestoreSnapshots(group.restoreSnapshots),
      createdAt: typeof group.createdAt === "string" ? group.createdAt : new Date(0).toISOString(),
      updatedAt: typeof group.updatedAt === "string" ? group.updatedAt : new Date(0).toISOString(),
    };
  }
  return parsed;
}

export function readLegacyVirtualGroupRestoreSnapshots(
  input: unknown,
): LegacyVirtualGroup["restoreSnapshots"] {
  if (!isRecord(input)) {
    return {};
  }

  const snapshots: LegacyVirtualGroup["restoreSnapshots"] = {};
  for (const [sourceId, snapshot] of Object.entries(input)) {
    if (!isRecord(snapshot)) {
      continue;
    }
    snapshots[sourceId] = {
      selectedLeafIds: Array.isArray(snapshot.selectedLeafIds)
        ? snapshot.selectedLeafIds.filter((value): value is string => typeof value === "string")
        : [],
      enabledTargets: Array.isArray(snapshot.enabledTargets)
        ? snapshot.enabledTargets.filter((value): value is string => typeof value === "string")
        : [],
    };
  }
  return snapshots;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

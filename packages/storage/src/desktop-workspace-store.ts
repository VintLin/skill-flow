import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getStateRoot } from "@skill-flow/integration/utils/constants";
import { withFileLock, writeJsonFile } from "@skill-flow/integration/utils/fs";

const DESKTOP_WORKSPACE_SCHEMA_VERSION = 1 as const;
const GROUP_TAG_SCHEMA_VERSION = 3 as const;

export type DesktopTagPreference = {
  title: string;
  accentRawValue: string;
  tagId?: string | null;
};

export type DesktopGroupTags = {
  schemaVersion: typeof GROUP_TAG_SCHEMA_VERSION;
  tagsByGroupKey: Record<string, DesktopTagPreference[]>;
  orderedTagKeys: string[];
  orderingMode: "legacy" | "defaultCount" | "custom";
};

export type DesktopWorkspaceFile = {
  schemaVersion: typeof DESKTOP_WORKSPACE_SCHEMA_VERSION;
  migrationGeneration: string;
  agentDisplayVisibility: Record<string, boolean>;
  groupTags: DesktopGroupTags;
};

export type DesktopWorkspaceLegacyAgentPreference = {
  targetId: string;
  isVisible: boolean;
  sortOrder: number;
};

export type DesktopWorkspaceLegacyCandidate = {
  source: "shared-suite" | "production" | "development";
  priority: number;
  agentDisplayPreferences?: DesktopWorkspaceLegacyAgentPreference[];
  groupTags?: DesktopGroupTags;
};

export class DesktopWorkspaceStoreError extends Error {
  constructor(
    readonly code: "DESKTOP_WORKSPACE_INVALID" | "DESKTOP_WORKSPACE_SCHEMA_UNSUPPORTED",
    message: string,
    readonly filePath: string,
  ) {
    super(message);
    this.name = "DesktopWorkspaceStoreError";
  }
}

export class DesktopWorkspaceStore {
  constructor(private readonly stateRoot = getStateRoot()) {}

  get rootPath(): string {
    return this.stateRoot;
  }

  get filePath(): string {
    return path.join(this.stateRoot, "desktop.json");
  }

  get lockPath(): string {
    return path.join(this.stateRoot, ".desktop-workspace.lock");
  }

  async read(): Promise<DesktopWorkspaceFile | undefined> {
    return this.withLock(async () => this.readExisting());
  }

  async write(file: DesktopWorkspaceFile): Promise<void> {
    validateDesktopWorkspaceFile(file, this.filePath);
    await this.withLock(async () => {
      await writeJsonFile(this.filePath, file);
    });
  }

  async update(
    mutate: (current: DesktopWorkspaceFile) => DesktopWorkspaceFile,
  ): Promise<DesktopWorkspaceFile> {
    return this.withLock(async () => {
      const current = (await this.readExisting()) ?? createEmptyDesktopWorkspaceFile();
      const next = mutate(current);
      validateDesktopWorkspaceFile(next, this.filePath);
      await writeJsonFile(this.filePath, next);
      return next;
    });
  }

  /**
   * Creates the canonical file from read-only UserDefaults snapshots.
   * Existing valid desktop.json always wins and is returned unchanged.
   */
  async ensureMigrated(
    candidates: DesktopWorkspaceLegacyCandidate[],
  ): Promise<DesktopWorkspaceFile> {
    return this.withLock(async () => {
      const existing = await this.readExisting();
      if (existing) return existing;

      const migrated = migrateLegacyCandidates(candidates);
      validateDesktopWorkspaceFile(migrated, this.filePath);
      await writeJsonFile(this.filePath, migrated);
      return migrated;
    });
  }

  private async readExisting(): Promise<DesktopWorkspaceFile | undefined> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch (error) {
      await this.backupInvalidFile();
      throw new DesktopWorkspaceStoreError(
        "DESKTOP_WORKSPACE_INVALID",
        `Desktop workspace file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        this.filePath,
      );
    }

    try {
      validateDesktopWorkspaceFile(parsed, this.filePath);
    } catch (error) {
      await this.backupInvalidFile();
      throw error;
    }
    return parsed;
  }

  private async backupInvalidFile(): Promise<void> {
    const backupPath = `${this.filePath}.invalid-${Date.now()}-${crypto.randomUUID()}.bak`;
    try {
      await fs.rename(this.filePath, backupPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async withLock<T>(task: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.stateRoot, { recursive: true });
    return withFileLock(this.lockPath, task, {
      metadata: {
        command: process.argv.join(" "),
        pid: process.pid,
        startedAt: new Date().toISOString(),
      },
    });
  }
}

function createEmptyDesktopWorkspaceFile(): DesktopWorkspaceFile {
  return {
    schemaVersion: DESKTOP_WORKSPACE_SCHEMA_VERSION,
    migrationGeneration: `mg_${crypto.randomUUID()}`,
    agentDisplayVisibility: {},
    groupTags: {
      schemaVersion: GROUP_TAG_SCHEMA_VERSION,
      tagsByGroupKey: {},
      orderedTagKeys: [],
      orderingMode: "defaultCount",
    },
  };
}

function migrateLegacyCandidates(
  candidates: DesktopWorkspaceLegacyCandidate[],
): DesktopWorkspaceFile {
  const sorted = [...candidates]
    .filter((candidate) => Number.isFinite(candidate.priority))
    .sort((left, right) => right.priority - left.priority);
  const agentDisplayVisibility: Record<string, boolean> = {};
  const tagsByGroupKey: Record<string, DesktopTagPreference[]> = {};
  let orderedTagKeys: string[] = [];
  let orderingMode: DesktopGroupTags["orderingMode"] = "defaultCount";

  for (const candidate of sorted) {
    for (const preference of candidate.agentDisplayPreferences ?? []) {
      if (!preference.targetId || agentDisplayVisibility[preference.targetId] !== undefined) continue;
      agentDisplayVisibility[preference.targetId] = preference.isVisible;
    }

    const groupTags = candidate.groupTags;
    if (!groupTags) continue;
    for (const [groupKey, tags] of Object.entries(groupTags.tagsByGroupKey)) {
      if (tags.length > 0 && tagsByGroupKey[groupKey] === undefined) {
        tagsByGroupKey[groupKey] = tags;
      }
    }
    if (orderedTagKeys.length === 0 && groupTags.orderedTagKeys.length > 0) {
      orderedTagKeys = groupTags.orderedTagKeys;
    }
    if (orderingMode === "defaultCount" && groupTags.orderingMode !== "defaultCount") {
      orderingMode = groupTags.orderingMode;
    }
  }

  return {
    ...createEmptyDesktopWorkspaceFile(),
    agentDisplayVisibility,
    groupTags: {
      schemaVersion: GROUP_TAG_SCHEMA_VERSION,
      tagsByGroupKey,
      orderedTagKeys,
      orderingMode,
    },
  };
}

function validateDesktopWorkspaceFile(
  value: unknown,
  filePath: string,
): asserts value is DesktopWorkspaceFile {
  if (!isRecord(value)) invalid(filePath, "root must be an object");
  if (value.schemaVersion !== DESKTOP_WORKSPACE_SCHEMA_VERSION) {
    throw new DesktopWorkspaceStoreError(
      "DESKTOP_WORKSPACE_SCHEMA_UNSUPPORTED",
      `Unsupported desktop workspace schemaVersion '${String(value.schemaVersion)}'.`,
      filePath,
    );
  }
  if (typeof value.migrationGeneration !== "string" || !value.migrationGeneration.startsWith("mg_")) {
    invalid(filePath, "migrationGeneration must start with 'mg_'");
  }
  if (!isRecord(value.agentDisplayVisibility)) invalid(filePath, "agentDisplayVisibility must be an object");
  for (const [targetId, visible] of Object.entries(value.agentDisplayVisibility)) {
    if (!targetId || typeof visible !== "boolean") invalid(filePath, "agentDisplayVisibility values must be booleans");
  }
  if (!isRecord(value.groupTags)) invalid(filePath, "groupTags must be an object");
  if (value.groupTags.schemaVersion !== GROUP_TAG_SCHEMA_VERSION) {
    invalid(filePath, "groupTags.schemaVersion is unsupported");
  }
  if (!isRecord(value.groupTags.tagsByGroupKey)) invalid(filePath, "groupTags.tagsByGroupKey must be an object");
  if (!Array.isArray(value.groupTags.orderedTagKeys)) invalid(filePath, "groupTags.orderedTagKeys must be an array");
  if (!value.groupTags.orderedTagKeys.every((key) => typeof key === "string")) invalid(filePath, "orderedTagKeys must contain strings");
  if (!(["legacy", "defaultCount", "custom"] as const).includes(value.groupTags.orderingMode as never)) {
    invalid(filePath, "groupTags.orderingMode is unsupported");
  }
  for (const [groupKey, groupTags] of Object.entries(value.groupTags.tagsByGroupKey)) {
    if (!groupKey || !Array.isArray(groupTags)) invalid(filePath, "group tags must be arrays");
    for (const tag of groupTags) {
      if (!isRecord(tag) || typeof tag.title !== "string" || typeof tag.accentRawValue !== "string") {
        invalid(filePath, "group tag entries are invalid");
      }
      if (tag.tagId !== undefined && tag.tagId !== null && typeof tag.tagId !== "string") {
        invalid(filePath, "group tag tagId must be a string or null");
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(filePath: string, detail: string): never {
  throw new DesktopWorkspaceStoreError(
    "DESKTOP_WORKSPACE_INVALID",
    `Invalid desktop workspace file: ${detail}`,
    filePath,
  );
}

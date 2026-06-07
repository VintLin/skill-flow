import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentStrategy,
  Diagnostic,
  LeafRecord,
  ProjectScope,
} from "@skill-flow/domain/types";
import {
  CURRENT_MIGRATION_MARKER_VERSION,
  inspectStateMigrationStatus,
  type StateMigrationStatus,
} from "@skill-flow/storage/state-schema";
import {
  hasLegacyVirtualGroups,
  legacyVirtualGroupsPath,
  type LegacyVirtualGroup,
  readLegacyVirtualGroups,
  validateLegacyVirtualGroupsJson,
} from "./legacy-virtual-group.js";
import { parseSkillFrontmatterScalar } from "./skill-frontmatter.js";
import { materializeSkillCollectionMembers } from "./skill-collection-materializer.js";

const AUTHORITY_FILE_NAMES = ["manifest.json", "lock.json", "preferences.json", "collections.json"] as const;

export type StateMigrationAction =
  | {
      action: "rewrite";
      path: string;
    }
  | {
      action: "materialize-collection";
      path: string;
    }
  | {
      action: "move";
      path: string;
      to: string;
    }
  | {
      action: "prune";
      path: string;
    };

export type StateMigrationResult =
  | {
      status: "current";
      stateRoot: string;
      actions: StateMigrationAction[];
    }
  | {
      status: "dry-run";
      stateRoot: string;
      actions: StateMigrationAction[];
      backup: boolean;
    }
  | {
      status: "migrated";
      stateRoot: string;
      actions: StateMigrationAction[];
      backupPath?: string;
      migrationGeneration: string;
    };

export type StateMigrationOptions = {
  to: 2;
  dryRun?: boolean;
  backup?: boolean;
  tolerateOrphanSources?: boolean;
};

export type StateMigrationServiceOptions = {
  stateRoot: string;
};

export class StateMigrationError extends Error {
  readonly reasonCode: string;
  readonly diagnostics: Diagnostic[];

  constructor(input: {
    reasonCode: string;
    diagnostics: Diagnostic[];
  }) {
    super(input.reasonCode);
    this.name = "StateMigrationError";
    this.reasonCode = input.reasonCode;
    this.diagnostics = input.diagnostics;
  }
}

export class StateMigrationService {
  private readonly stateRoot: string;

  constructor(options: StateMigrationServiceOptions) {
    this.stateRoot = options.stateRoot;
  }

  inspect(): Promise<StateMigrationStatus> {
    return inspectStateMigrationStatus(this.stateRoot);
  }

  async migrate(options: StateMigrationOptions): Promise<StateMigrationResult> {
    const status = await this.inspect();

    if (status.status === "current") {
      return {
        status: "current",
        stateRoot: this.stateRoot,
        actions: [],
      };
    }

    if (status.status === "incomplete" || status.status === "invalid") {
      throw new StateMigrationError({
        reasonCode: status.reasonCode,
        diagnostics: status.diagnostics,
      });
    }

    const actions = await this.planMigrationActions();
    if (options.dryRun) {
      return {
        status: "dry-run",
        stateRoot: this.stateRoot,
        actions,
        backup: options.backup !== false,
      };
    }

    return this.migrateStateRoot(options, actions);
  }

  private async planMigrationActions(): Promise<StateMigrationAction[]> {
    const actions: StateMigrationAction[] = [
      { action: "rewrite", path: path.join(this.stateRoot, "manifest.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "lock.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "preferences.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "collections.json") },
    ];

    if (await hasLegacyVirtualGroups(this.stateRoot)) {
      actions.push({
        action: "materialize-collection",
        path: path.join(this.stateRoot, "source", "collection"),
      });
    }

    if (await pathExists(path.join(this.stateRoot, "source", "github"))) {
      actions.push({
        action: "move",
        path: path.join(this.stateRoot, "source", "github"),
        to: path.join(this.stateRoot, "source", "git"),
      });
    }

    actions.push(
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-data.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "source-metadata.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-preparations.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-preparations") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "git") },
    );

    return actions;
  }

  private async migrateStateRoot(
    options: StateMigrationOptions,
    actions: StateMigrationAction[],
  ): Promise<StateMigrationResult> {
    const migrationGeneration = createMigrationGeneration();
    const startedAt = new Date().toISOString();
    const stagingRoot = `${this.stateRoot}.migration-staging-${process.pid}-${Date.now()}`;
    const markerPath = path.join(this.stateRoot, ".skillflow-migration.json");
    let backupPath: string | undefined;

    try {
      if (options.backup !== false) {
        backupPath = await this.createBackup();
      }

      await writeJsonFile(markerPath, {
        schemaVersion: 2,
        version: CURRENT_MIGRATION_MARKER_VERSION,
        migrationGeneration,
        status: "running",
        startedAt,
        stagingRoot,
        diagnostics: [],
      });

      await validateLegacyMigrationInputs(this.stateRoot);
      await fs.cp(this.stateRoot, stagingRoot, { recursive: true, force: false });
      await fs.rm(path.join(stagingRoot, ".skillflow-migration.json"), { force: true });
      const authorityGeneration = await rewriteAuthorityFiles(stagingRoot, migrationGeneration, {
        tolerateOrphanSources: options.tolerateOrphanSources === true,
      });
      await migrateGithubSourceCheckouts(stagingRoot);
      await requireCurrentState(stagingRoot, "STATE_MIGRATION_VALIDATION_FAILED");

      await replaceMigratedState(this.stateRoot, stagingRoot);
      await fs.rm(markerPath, { force: true });
      await pruneRebuildableCache(this.stateRoot);
      await requireCurrentState(this.stateRoot, "STATE_MIGRATION_VALIDATION_FAILED");

      const result: StateMigrationResult = {
        status: "migrated",
        stateRoot: this.stateRoot,
        actions,
        migrationGeneration: authorityGeneration,
      };
      if (backupPath) {
        result.backupPath = backupPath;
      }
      return result;
    } catch (error) {
      await fs.rm(stagingRoot, { recursive: true, force: true });
      await fs.rm(markerPath, { force: true });
      if (error instanceof StateMigrationError) {
        throw error;
      }
      throw new StateMigrationError({
        reasonCode: "STATE_MIGRATION_VALIDATION_FAILED",
        diagnostics: [
          {
            code: "STATE_MIGRATION_VALIDATION_FAILED",
            message: error instanceof Error ? error.message : "State migration validation failed.",
            path: this.stateRoot,
            retryable: false,
          },
        ],
      });
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    }
  }

  private async createBackup(): Promise<string> {
    const backupPath = `${this.stateRoot}.backup-${formatBackupTimestamp(new Date())}`;
    await fs.cp(this.stateRoot, backupPath, { recursive: true, force: false });
    return backupPath;
  }
}

async function validateLegacyMigrationInputs(stateRoot: string): Promise<void> {
  const virtualGroups = await validateLegacyVirtualGroupsJson(stateRoot);
  if (!virtualGroups.ok) {
    throw new StateMigrationError({
      reasonCode: "STATE_MIGRATION_VALIDATION_FAILED",
      diagnostics: [
        {
          code: "STATE_MIGRATION_VALIDATION_FAILED",
          message: virtualGroups.message,
          path: virtualGroups.path,
          retryable: false,
        },
      ],
    });
  }
}

async function migrateGithubSourceCheckouts(stateRoot: string): Promise<void> {
  const githubRoot = path.join(stateRoot, "source", "github");
  if (!(await pathExists(githubRoot))) {
    return;
  }

  const gitRoot = path.join(stateRoot, "source", "git");
  await fs.mkdir(gitRoot, { recursive: true });
  const entries = await fs.readdir(githubRoot, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(githubRoot, entry.name);
    const to = path.join(gitRoot, entry.name);
    if (await pathExists(to)) {
      throw new StateMigrationError({
        reasonCode: "STATE_MIGRATION_GITHUB_CHECKOUT_CONFLICT",
        diagnostics: [
          {
            code: "STATE_MIGRATION_GITHUB_CHECKOUT_CONFLICT",
            message: `Cannot migrate GitHub checkout because target already exists: ${to}`,
            path: from,
            retryable: false,
          },
        ],
      });
    }
    await fs.rename(from, to);
  }
  await fs.rm(githubRoot, { recursive: true, force: true });
}

async function rewriteAuthorityFiles(
  stateRoot: string,
  migrationGeneration: string,
  options: { tolerateOrphanSources?: boolean } = {},
): Promise<string> {
  const manifest = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "manifest.json"), {});
  const lock = await readJsonFile<Record<string, unknown>>(path.join(stateRoot, "lock.json"), {});
  if (manifest.schemaVersion === 2) {
    return rewriteCurrentAuthorityFiles(stateRoot, manifest, lock);
  }

  const materialized = await materializeLegacyCollections(stateRoot, manifest, lock, migrationGeneration, options);

  await writeJsonFile(path.join(stateRoot, "manifest.json"), {
    schemaVersion: 2,
    migrationGeneration,
    sources: materialized.manifestSources,
    bindings: materialized.bindings,
  });

  await writeJsonFile(path.join(stateRoot, "lock.json"), {
    schemaVersion: 2,
    migrationGeneration,
    sources: materialized.lockSources,
    leafInventory: materialized.leafInventory,
    projections: materialized.projections,
  });

  const preferences = await readJsonFile<Record<string, unknown>>(
    path.join(stateRoot, "preferences.json"),
    {},
  );
  const preferencesPayload: Record<string, unknown> = {
    schemaVersion: 2,
    migrationGeneration,
    pinnedSourceIds: Array.isArray(preferences.pinnedSourceIds) ? preferences.pinnedSourceIds : [],
    selectedProjectScope: readProjectScope(preferences.selectedProjectScope),
    recentProjects: readRecentProjects(preferences.recentProjects),
    projectSourceDrafts: migrateProjectSourceDrafts(preferences),
    customTargets: readCustomTargets(preferences.customTargets),
    agentDisplayOrder: readStringArray(preferences.agentDisplayOrder),
  };
  if (Array.isArray(preferences.localImportChoices)) {
    preferencesPayload.localImportChoices = preferences.localImportChoices;
  }
  if (Array.isArray(preferences.localScanImportChoices)) {
    preferencesPayload.localScanImportChoices = preferences.localScanImportChoices;
  }
  await writeJsonFile(path.join(stateRoot, "preferences.json"), {
    ...preferencesPayload,
  });

  await writeJsonFile(path.join(stateRoot, "collections.json"), {
    schemaVersion: 2,
    migrationGeneration,
    collections: materialized.collections,
  });
  return migrationGeneration;
}

async function rewriteCurrentAuthorityFiles(
  stateRoot: string,
  manifest: Record<string, unknown>,
  lock: Record<string, unknown>,
): Promise<string> {
  const migrationGeneration = typeof manifest.migrationGeneration === "string"
    ? manifest.migrationGeneration
    : createMigrationGeneration();
  const sources = Array.isArray(manifest.sources)
    ? manifest.sources.map((source) => isRecord(source)
        ? {
            ...source,
            ...(source.kind === "github" ? { kind: "git" } : {}),
          }
        : source)
    : [];
  const lockSources = isRecord(lock.sources)
    ? Object.fromEntries(Object.entries(lock.sources).map(([sourceId, source]) => {
        if (!isRecord(source)) {
          return [sourceId, source];
        }
        const revision = isRecord(source.revision)
          ? {
              ...source.revision,
              ...(source.revision.provider === "github" ? { provider: "git" } : {}),
            }
          : source.revision;
        return [sourceId, {
          ...source,
          revision,
          ...(typeof source.localPath === "string"
            ? { localPath: mapCheckoutPath(source.localPath) }
            : {}),
        }];
      }))
    : {};
  const leafInventory = Array.isArray(lock.leafInventory)
    ? lock.leafInventory.map((leaf) => isRecord(leaf)
        ? {
            ...leaf,
            ...(typeof leaf.absolutePath === "string"
              ? { absolutePath: mapCheckoutPath(leaf.absolutePath) }
              : {}),
            ...(typeof leaf.skillFilePath === "string"
              ? { skillFilePath: mapCheckoutPath(leaf.skillFilePath) }
              : {}),
          }
        : leaf)
    : [];

  await writeJsonFile(path.join(stateRoot, "manifest.json"), {
    ...manifest,
    schemaVersion: 2,
    migrationGeneration,
    sources,
  });
  await writeJsonFile(path.join(stateRoot, "lock.json"), {
    ...lock,
    schemaVersion: 2,
    migrationGeneration,
    sources: lockSources,
    leafInventory,
  });

  const preferences = await readJsonFile<Record<string, unknown>>(
    path.join(stateRoot, "preferences.json"),
    {},
  );
  await writeJsonFile(path.join(stateRoot, "preferences.json"), {
    ...preferences,
    schemaVersion: 2,
    migrationGeneration,
  });

  const collections = await readJsonFile<Record<string, unknown>>(
    path.join(stateRoot, "collections.json"),
    {},
  );
  await writeJsonFile(path.join(stateRoot, "collections.json"), {
    ...collections,
    schemaVersion: 2,
    migrationGeneration,
  });

  return migrationGeneration;
}

function migrateProjectSourceDrafts(
  preferences: Record<string, unknown>,
): Record<string, Record<string, Record<string, unknown>>> {
  const source = isRecord(preferences.projectSourceDrafts)
    ? preferences.projectSourceDrafts
    : isRecord(preferences.projectDrafts)
      ? preferences.projectDrafts
      : {};
  const updatedAt = new Date().toISOString();
  const result: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const [projectId, projectDrafts] of Object.entries(source)) {
    if (!isRecord(projectDrafts)) {
      continue;
    }
    const scopedDrafts: Record<string, Record<string, unknown>> = {};
    for (const [sourceId, draft] of Object.entries(projectDrafts)) {
      if (!isRecord(draft)) {
        continue;
      }
      scopedDrafts[sourceId] = {
        sourceId: typeof draft.sourceId === "string" ? draft.sourceId : sourceId,
        selectedLeafIds: Array.isArray(draft.selectedLeafIds)
          ? draft.selectedLeafIds.filter((value): value is string => typeof value === "string")
          : [],
        enabledTargets: Array.isArray(draft.enabledTargets)
          ? draft.enabledTargets.filter((value): value is string => typeof value === "string")
          : [],
        updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : updatedAt,
      };
    }
    result[projectId] = scopedDrafts;
  }

  return result;
}

function readProjectScope(input: unknown): ProjectScope {
  if (!isRecord(input)) {
    return { kind: "global" };
  }
  if (input.kind === "project" && typeof input.projectId === "string") {
    return { kind: "project", projectId: input.projectId };
  }
  return { kind: "global" };
}

function readRecentProjects(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter(isRecord).flatMap((project) => {
    if (
      typeof project.projectId !== "string" ||
      typeof project.title !== "string" ||
      typeof project.lastActivityAt !== "string"
    ) {
      return [];
    }

    const record: Record<string, unknown> = {
      projectId: project.projectId,
      title: project.title,
      lastActivityAt: project.lastActivityAt,
    };
    if (typeof project.projectPath === "string") {
      record.projectPath = project.projectPath;
    }
    if (Array.isArray(project.tools)) {
      record.tools = project.tools.filter((value): value is string => typeof value === "string");
    }
    return [record];
  });
}

function readCustomTargets(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter(isRecord).flatMap((target) => {
    if (
      typeof target.id !== "string" ||
      typeof target.name !== "string" ||
      typeof target.globalPath !== "string" ||
      typeof target.projectPathTemplate !== "string" ||
      typeof target.createdAt !== "string" ||
      typeof target.updatedAt !== "string"
    ) {
      return [];
    }

    return [{
      id: target.id,
      name: target.name,
      globalPath: target.globalPath,
      projectPathTemplate: target.projectPathTemplate,
      strategy: readDeploymentStrategy(target.strategy),
      createdAt: target.createdAt,
      updatedAt: target.updatedAt,
    }];
  });
}

function readStringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((value): value is string => typeof value === "string")
    : [];
}

function readDeploymentStrategy(input: unknown): DeploymentStrategy {
  return input === "copy" ? "copy" : "symlink";
}

type LegacySource = {
  id: string;
  locator: string;
  kind: string;
  displayName: string;
  originalDisplayName: string | undefined;
  addedAt: string | undefined;
};

type LegacyLeaf = {
  id: string;
  sourceId: string;
  name: string | undefined;
  linkName: string | undefined;
  title: string | undefined;
  description: string | undefined;
  relativePath: string;
  absolutePath: string | undefined;
  skillFilePath: string | undefined;
  contentHash: string;
  valid: boolean | undefined;
  metadataWarnings: string[] | undefined;
};

type LegacySourceLock = {
  id: string;
  locator: string;
  kind: string;
  displayName: string;
  checkoutPath: string;
  updatedAt: string | undefined;
  leafIds: string[] | undefined;
  commitSha: string | undefined;
};

type MaterializedCollections = {
  manifestSources: Array<Record<string, unknown>>;
  bindings: Record<string, unknown>;
  lockSources: Record<string, Record<string, unknown>>;
  leafInventory: Array<Record<string, unknown>>;
  projections: Array<Record<string, unknown>>;
  collections: Record<string, Record<string, unknown>>;
};

async function materializeLegacyCollections(
  stateRoot: string,
  manifest: Record<string, unknown>,
  lock: Record<string, unknown>,
  migrationGeneration: string,
  options: { tolerateOrphanSources?: boolean } = {},
): Promise<MaterializedCollections> {
  const legacySources = readLegacySources(manifest.sources);
  const legacyBindings = isRecord(manifest.bindings) ? manifest.bindings : {};
  const legacyLockSources = readLegacyLockSources(lock.sources);
  const legacyLockSourceById = new Map(legacyLockSources.map((source) => [source.id, source]));
  const legacyLeafs = readLegacyLeafs(lock.leafInventory);
  const virtualGroups = await readLegacyVirtualGroups(stateRoot);
  const orphanedVirtualSource = legacySources.find((source) => source.kind === "virtual" && !virtualGroups[source.id]);
  if (orphanedVirtualSource && options.tolerateOrphanSources !== true) {
    throw legacySourceOrphaned(stateRoot, orphanedVirtualSource);
  }
  const memberLeafIdByLegacyRef = new Map<string, string>();
  const collectionLeafs: LeafRecord[] = [];
  const collectionLockSources: Record<string, Record<string, unknown>> = {};
  const collections: Record<string, Record<string, unknown>> = {};
  const now = new Date().toISOString();

  for (const group of Object.values(virtualGroups)) {
    const materialized = await materializeSkillCollectionMembers({
      stateRoot,
      collectionId: group.id,
      refs: group.includedSkills,
      migrationGeneration,
      capturedAt: now,
      resolveOrigin: async (ref, index) => {
        const originLeaf = legacyLeafs.find(
          (leaf) => leaf.id === ref.leafId && leaf.sourceId === ref.sourceId,
        );
        const originSource = legacySources.find((source) => source.id === ref.sourceId);
        const originLock = legacyLockSources.find((source) => source.id === ref.sourceId);
        if (!originLeaf || !originSource || !originLock) {
          throw virtualMemberOriginMissing(stateRoot, ref);
        }

        const sourceSkillPath = await resolveLegacySkillPath(stateRoot, originSource, originLock, originLeaf);
        const label = originLeaf.title ?? originLeaf.name ?? originLeaf.linkName ?? `member-${index + 1}`;
        return {
          sourceId: ref.sourceId,
          leafId: ref.leafId,
          sourceLocator: originSource.locator,
          canonicalLocator: originLock.locator,
          repoPath: originLeaf.relativePath,
          contentHashAtCapture: originLeaf.contentHash,
          sourcePath: sourceSkillPath,
          title: label,
          description: originLeaf.description ?? "",
          displayName: label,
          selectorAliases: [originLeaf.id, originLeaf.relativePath],
        };
      },
      onContentHashMismatch: ({ collectionRoot, expectedHash, actualHash }) => {
        throw collectionHashMismatch(collectionRoot, expectedHash, actualHash);
      },
    });
    for (const [index, ref] of group.includedSkills.entries()) {
      memberLeafIdByLegacyRef.set(
        legacyRefKey(group.id, ref.leafId),
        materialized.leafIds[index] ?? ref.leafId,
      );
    }
    collectionLeafs.push(...materialized.leafs);

    collectionLockSources[group.id] = {
      sourceId: group.id,
      canonicalLocator: `collection:${group.id}`,
      revision: {
        provider: "collection",
        capturedAt: now,
      },
      localPath: materialized.collectionRoot,
      leafIds: materialized.leafIds,
    };
    collections[group.id] = {
      id: group.id,
      displayName: group.displayName,
      materializedSourceId: group.id,
      members: materialized.members,
      hiddenSourceIds: group.hiddenSourceIds,
      restoreSelections: buildRestoreSelections(group, legacyLeafs),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  const manifestSources = legacySources
    .filter((source) => source.kind !== "virtual" || virtualGroups[source.id])
    .map((source) => toManifestSourceV2(source, virtualGroups[source.id]));
  const lockSources = {
    ...Object.fromEntries(
      legacyLockSources.map((source) => [source.id, toLockSourceV2(source)]),
    ),
    ...collectionLockSources,
  };

  return {
    manifestSources,
    bindings: rewriteBindings(legacySources, legacyBindings, virtualGroups, memberLeafIdByLegacyRef),
    lockSources,
    leafInventory: [
      ...legacyLeafs.map((leaf) => toLeafRecord(leaf, legacyLockSourceById.get(leaf.sourceId))),
      ...collectionLeafs,
    ],
    projections: rewriteProjections(lock, memberLeafIdByLegacyRef),
    collections,
  };
}

function readLegacySources(input: unknown): LegacySource[] {
  return Array.isArray(input)
    ? input.filter(isRecord).flatMap((source) => {
        if (
          typeof source.id !== "string" ||
          typeof source.locator !== "string" ||
          typeof source.kind !== "string"
        ) {
          return [];
        }
        return [{
          id: source.id,
          locator: source.locator,
          kind: source.kind,
          displayName: typeof source.displayName === "string" ? source.displayName : source.id,
          originalDisplayName: typeof source.originalDisplayName === "string" ? source.originalDisplayName : undefined,
          addedAt: typeof source.addedAt === "string" ? source.addedAt : undefined,
        }];
      })
    : [];
}

function readLegacyLockSources(input: unknown): LegacySourceLock[] {
  return Array.isArray(input)
    ? input.filter(isRecord).flatMap((source) => {
        if (
          typeof source.id !== "string" ||
          typeof source.locator !== "string" ||
          typeof source.kind !== "string" ||
          typeof source.checkoutPath !== "string"
        ) {
          return [];
        }
        return [{
          id: source.id,
          locator: source.locator,
          kind: source.kind,
          displayName: typeof source.displayName === "string" ? source.displayName : source.id,
          checkoutPath: source.checkoutPath,
          updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined,
          leafIds: Array.isArray(source.leafIds)
            ? source.leafIds.filter((value): value is string => typeof value === "string")
            : undefined,
          commitSha: typeof source.commitSha === "string" ? source.commitSha : undefined,
        }];
      })
    : [];
}

function readLegacyLeafs(input: unknown): LegacyLeaf[] {
  return Array.isArray(input)
    ? input.filter(isRecord).flatMap((leaf) => {
        if (
          typeof leaf.id !== "string" ||
          typeof leaf.sourceId !== "string" ||
          typeof leaf.relativePath !== "string" ||
          typeof leaf.contentHash !== "string"
        ) {
          return [];
        }
        const name = normalizeLegacyMetadataScalar(leaf.name);
        const linkName = normalizeLegacyMetadataScalar(leaf.linkName);
        const title = normalizeLegacyMetadataScalar(leaf.title);
        const description = normalizeLegacyMetadataScalar(leaf.description);
        return [{
          id: leaf.id,
          sourceId: leaf.sourceId,
          name,
          linkName,
          title,
          description,
          relativePath: leaf.relativePath,
          absolutePath: typeof leaf.absolutePath === "string" ? leaf.absolutePath : undefined,
          skillFilePath: typeof leaf.skillFilePath === "string" ? leaf.skillFilePath : undefined,
          contentHash: leaf.contentHash,
          valid: typeof leaf.valid === "boolean" ? leaf.valid : undefined,
          metadataWarnings: Array.isArray(leaf.metadataWarnings)
            ? filterLegacyMetadataWarnings(
                leaf.metadataWarnings.filter((value): value is string => typeof value === "string"),
                { name, linkName, relativePath: leaf.relativePath },
              )
            : undefined,
        }];
      })
    : [];
}

function normalizeLegacyMetadataScalar(value: unknown): string | undefined {
  return typeof value === "string" ? parseSkillFrontmatterScalar(value) : undefined;
}

function filterLegacyMetadataWarnings(
  warnings: string[],
  leaf: { name: string | undefined; linkName: string | undefined; relativePath: string },
): string[] {
  const expectedName = leaf.linkName ?? path.basename(leaf.relativePath);
  if (!leaf.name || leaf.name !== expectedName) {
    return warnings;
  }
  return warnings.filter((warning) => !warning.startsWith("name should match parent directory name "));
}

async function resolveLegacySkillPath(
  stateRoot: string,
  source: LegacySource,
  lock: LegacySourceLock,
  leaf: LegacyLeaf,
): Promise<string> {
  const candidates = [
    path.join(stateRoot, "source", source.kind, source.id, leaf.relativePath),
    path.join(stateRoot, "source", lock.kind, lock.id, leaf.relativePath),
    path.join(lock.checkoutPath, leaf.relativePath),
    leaf.absolutePath,
  ].filter((value): value is string => typeof value === "string");

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw virtualMemberOriginMissing(stateRoot, {
    sourceId: source.id,
    leafId: leaf.id,
  });
}

function toManifestSourceV2(
  source: LegacySource,
  group: LegacyVirtualGroup | undefined,
): Record<string, unknown> {
  if (group) {
    return {
      id: group.id,
      kind: "collection",
      locator: `collection:${group.id}`,
      canonicalLocator: `collection:${group.id}`,
      displayName: group.displayName,
      enabled: true,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  const timestamp = source.addedAt ?? new Date(0).toISOString();
  return {
    id: source.id,
    kind: mapSourceKind(source.kind),
    locator: source.locator,
    canonicalLocator: source.locator,
    displayName: source.displayName,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function toLockSourceV2(source: LegacySourceLock): Record<string, unknown> {
  const sourceKind = mapSourceKind(source.kind);
  const checkoutPath = mapCheckoutPath(source.checkoutPath);
  return {
    sourceId: source.id,
    canonicalLocator: source.locator,
    revision: {
      provider: sourceKind,
      commit: source.commitSha,
      capturedAt: source.updatedAt ?? new Date(0).toISOString(),
    },
    localPath: checkoutPath,
    leafIds: source.leafIds ?? [],
  };
}

function toLeafRecord(
  leaf: LegacyLeaf,
  lockSource: LegacySourceLock | undefined,
): Record<string, unknown> {
  const linkName = leaf.linkName ?? leaf.name ?? path.basename(leaf.relativePath);
  const title = leaf.title ?? leaf.name ?? linkName;
  const checkoutPath = lockSource ? mapCheckoutPath(lockSource.checkoutPath) : undefined;
  const absolutePath = leaf.absolutePath ? mapCheckoutPath(leaf.absolutePath) : (checkoutPath
    ? path.join(checkoutPath, leaf.relativePath)
    : path.resolve(leaf.relativePath));

  return {
    id: leaf.id,
    sourceId: leaf.sourceId,
    relativePath: leaf.relativePath,
    linkName,
    title,
    description: leaf.description ?? "",
    absolutePath,
    skillFilePath: leaf.skillFilePath
      ? mapCheckoutPath(leaf.skillFilePath)
      : path.join(leaf.relativePath, "SKILL.md"),
    displayName: title,
    contentHash: leaf.contentHash,
    selectors: {
      aliases: [leaf.id, leaf.relativePath],
    },
    valid: leaf.valid ?? true,
    diagnostics: (leaf.metadataWarnings ?? []).map((warning) => ({
      code: "LEGACY_METADATA_WARNING",
      message: warning,
      retryable: false,
    })),
  };
}

function mapCheckoutPath(filePath: string): string {
  return filePath.split(`${path.sep}source${path.sep}github${path.sep}`)
    .join(`${path.sep}source${path.sep}git${path.sep}`);
}

function rewriteBindings(
  legacySources: LegacySource[],
  legacyBindings: Record<string, unknown>,
  virtualGroups: Record<string, LegacyVirtualGroup>,
  memberLeafIdByLegacyRef: Map<string, string>,
): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  for (const source of legacySources) {
    const rawBinding = legacyBindings[source.id];
    const binding: Record<string, unknown> = isRecord(rawBinding) ? rawBinding : {};
    const targets = isRecord(binding.targets) ? binding.targets : {};
    const rawSelectedLeafIds = binding.selectedLeafIds;
    const selectedLeafIds = Array.isArray(rawSelectedLeafIds)
      ? rawSelectedLeafIds.filter((value): value is string => typeof value === "string")
      : [];
    bindings[source.id] = {
      sourceId: source.id,
      selectionMode: selectedLeafIds.length > 0 ? "selected" : "all",
      selectedLeafIds: virtualGroups[source.id]
        ? selectedLeafIds.map((leafId) => memberLeafIdByLegacyRef.get(legacyRefKey(source.id, leafId)) ?? leafId)
        : selectedLeafIds,
      enabledTargets: Object.entries(targets)
        .filter(([, value]) => isRecord(value) && value.enabled === true)
        .map(([target]) => target),
    };
  }
  return bindings;
}

function rewriteProjections(
  lock: Record<string, unknown>,
  memberLeafIdByLegacyRef: Map<string, string>,
): Array<Record<string, unknown>> {
  const legacyProjections = Array.isArray(lock.projections)
    ? lock.projections.filter(isRecord)
    : [];
  const managedProjections = legacyProjections.filter((projection) => projection.mode === "managed");
  const projections = managedProjections.length > 0
    ? managedProjections
    : Array.isArray(lock.deployments)
      ? lock.deployments.filter(isRecord)
      : [];

  return projections.map((projection) => {
    const sourceId = typeof projection.sourceId === "string" ? projection.sourceId : "";
    const leafId = typeof projection.leafId === "string" ? projection.leafId : "";
    return {
      target: projection.target,
      sourceId,
      leafId: memberLeafIdByLegacyRef.get(legacyRefKey(sourceId, leafId)) ?? leafId,
      targetPath: projection.targetPath,
      targetRootPath: typeof projection.targetRootPath === "string"
        ? projection.targetRootPath
        : typeof projection.targetPath === "string"
          ? path.dirname(projection.targetPath)
          : undefined,
      strategy: readDeploymentStrategy(projection.strategy),
      contentHash: projection.contentHash,
      status: readProjectionStatus(projection.status),
      updatedAt: typeof projection.appliedAt === "string"
        ? projection.appliedAt
        : typeof projection.updatedAt === "string"
          ? projection.updatedAt
          : new Date(0).toISOString(),
    };
  });
}

function readProjectionStatus(value: unknown): string {
  return value === "active" || value === "removed" || value === "blocked" ? value : "active";
}

function buildRestoreSelections(
  group: LegacyVirtualGroup,
  legacyLeafs: LegacyLeaf[],
): Record<string, Record<string, unknown>> {
  const selections: Record<string, Record<string, unknown>> = {};
  for (const [sourceId, snapshot] of Object.entries(group.restoreSnapshots)) {
    const sourceLeafIds = new Set(
      legacyLeafs.filter((leaf) => leaf.sourceId === sourceId).map((leaf) => leaf.id),
    );
    const selectedLeafIds: string[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const leafId of snapshot.selectedLeafIds) {
      if (sourceLeafIds.has(leafId)) {
        selectedLeafIds.push(leafId);
      } else {
        diagnostics.push({
          code: "RESTORE_SELECTION_LEAF_UNMAPPED",
          message: "Legacy restore selection leaf could not be mapped.",
          retryable: false,
          details: { legacyLeafId: leafId },
        });
      }
    }
    selections[sourceId] = {
      sourceId,
      selectedLeafIds,
      enabledTargets: [...snapshot.enabledTargets],
      bestEffort: diagnostics.length > 0,
      diagnostics,
    };
  }
  return selections;
}

function mapSourceKind(kind: string): string {
  if (kind === "github") {
    return "git";
  }
  if (kind === "git" || kind === "local" || kind === "clawhub" || kind === "collection") {
    return kind;
  }
  return "local";
}

function legacyRefKey(sourceId: string, leafId: string): string {
  return `${sourceId}\0${leafId}`;
}

function virtualMemberOriginMissing(
  stateRoot: string,
  ref: { sourceId: string; leafId: string },
): StateMigrationError {
  return new StateMigrationError({
    reasonCode: "STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING",
    diagnostics: [
      {
        code: "STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING",
        message: "Legacy virtual group member origin could not be resolved.",
        path: legacyVirtualGroupsPath(stateRoot),
        details: ref,
        retryable: false,
      },
    ],
  });
}

function legacySourceOrphaned(
  stateRoot: string,
  source: LegacySource,
): StateMigrationError {
  return new StateMigrationError({
    reasonCode: "STATE_MIGRATION_LEGACY_SOURCE_ORPHANED",
    diagnostics: [
      {
        code: "STATE_MIGRATION_LEGACY_SOURCE_ORPHANED",
        message: "Legacy virtual source has no matching virtual group definition.",
        path: path.join(stateRoot, "manifest.json"),
        details: {
          sourceId: source.id,
          kind: source.kind,
        },
        retryable: false,
      },
    ],
  });
}

function collectionHashMismatch(
  collectionRoot: string,
  expectedHash: string,
  actualHash: string,
): StateMigrationError {
  return new StateMigrationError({
    reasonCode: "STATE_MIGRATION_COLLECTION_HASH_MISMATCH",
    diagnostics: [
      {
        code: "STATE_MIGRATION_COLLECTION_HASH_MISMATCH",
        message: "Copied collection member content hash differs from the v1 lock hash.",
        path: collectionRoot,
        details: {
          expectedHash,
          actualHash,
        },
        retryable: false,
      },
    ],
  });
}

async function replaceMigratedState(stateRoot: string, stagingRoot: string): Promise<void> {
  const rollbackRoot = path.join(stateRoot, `.skillflow-authority-rollback-${process.pid}-${Date.now()}`);
  await backupAuthorityFiles(stateRoot, rollbackRoot);

  try {
    await replaceAuthorityFiles(stateRoot, stagingRoot);
    await migrateGithubSourceCheckouts(stateRoot);
    await replaceCollectionSource(stateRoot, stagingRoot);
  } catch (error) {
    await restoreAuthorityBackup(stateRoot, rollbackRoot);
    throw error;
  } finally {
    await fs.rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function replaceAuthorityFiles(stateRoot: string, stagingRoot: string): Promise<void> {
  const transactionRoot = path.join(stateRoot, `.skillflow-authority-replace-${process.pid}-${Date.now()}`);
  const backupRoot = path.join(transactionRoot, "backup");
  const incomingRoot = path.join(transactionRoot, "incoming");

  await fs.mkdir(backupRoot, { recursive: true });
  await fs.mkdir(incomingRoot, { recursive: true });

  try {
    for (const fileName of AUTHORITY_FILE_NAMES) {
      await fs.copyFile(path.join(stateRoot, fileName), path.join(backupRoot, fileName));
      await fs.copyFile(path.join(stagingRoot, fileName), path.join(incomingRoot, fileName));
    }
    for (const fileName of AUTHORITY_FILE_NAMES) {
      await fs.copyFile(path.join(incomingRoot, fileName), path.join(stateRoot, fileName));
    }
  } catch (error) {
    await restoreAuthorityBackup(stateRoot, backupRoot);
    throw error;
  } finally {
    await fs.rm(transactionRoot, { recursive: true, force: true });
  }
}

async function replaceCollectionSource(stateRoot: string, stagingRoot: string): Promise<void> {
  const stagingCollectionRoot = path.join(stagingRoot, "source", "collection");
  if (!(await pathExists(stagingCollectionRoot))) {
    return;
  }

  const targetCollectionRoot = path.join(stateRoot, "source", "collection");
  await fs.mkdir(path.dirname(targetCollectionRoot), { recursive: true });
  const transactionSuffix = `${process.pid}-${Date.now()}`;
  const incomingRoot = path.join(stateRoot, `.skillflow-collection-replace-${transactionSuffix}`);
  const backupRoot = path.join(stateRoot, `.skillflow-collection-backup-${transactionSuffix}`);

  try {
    await fs.rm(incomingRoot, { recursive: true, force: true });
    await fs.cp(stagingCollectionRoot, incomingRoot, { recursive: true, force: false });
    if (await pathExists(targetCollectionRoot)) {
      await fs.rename(targetCollectionRoot, backupRoot);
    }
    await fs.rename(incomingRoot, targetCollectionRoot);
    await fs.rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(incomingRoot, { recursive: true, force: true });
    if (!(await pathExists(targetCollectionRoot)) && await pathExists(backupRoot)) {
      await fs.rename(backupRoot, targetCollectionRoot);
    }
    throw error;
  } finally {
    await fs.rm(incomingRoot, { recursive: true, force: true });
    await fs.rm(backupRoot, { recursive: true, force: true });
  }
}

async function restoreAuthorityBackup(stateRoot: string, backupRoot: string): Promise<void> {
  for (const fileName of AUTHORITY_FILE_NAMES) {
    const backupPath = path.join(backupRoot, fileName);
    if (await pathExists(backupPath)) {
      await fs.copyFile(backupPath, path.join(stateRoot, fileName));
    }
  }
}

async function backupAuthorityFiles(stateRoot: string, backupRoot: string): Promise<void> {
  await fs.mkdir(backupRoot, { recursive: true });
  for (const fileName of AUTHORITY_FILE_NAMES) {
    await fs.copyFile(path.join(stateRoot, fileName), path.join(backupRoot, fileName));
  }
}

async function pruneRebuildableCache(stateRoot: string): Promise<void> {
  await Promise.all([
    fs.rm(path.join(stateRoot, "catalog", "import-data.json"), { force: true }),
    fs.rm(path.join(stateRoot, "catalog", "source-metadata.json"), { force: true }),
    fs.rm(path.join(stateRoot, "catalog", "import-preparations.json"), { force: true }),
    fs.rm(path.join(stateRoot, "catalog", "import-preparations"), { recursive: true, force: true }),
    fs.rm(path.join(stateRoot, "catalog", "git"), { recursive: true, force: true }),
  ]);
}

async function requireCurrentState(stateRoot: string, reasonCode: string): Promise<void> {
  const status = await inspectStateMigrationStatus(stateRoot);
  if (status.status === "current") {
    return;
  }

  throw new StateMigrationError({
    reasonCode,
    diagnostics: "diagnostics" in status
      ? status.diagnostics
      : [
          {
            code: reasonCode,
            message: "State migration did not produce a current schema v2 state.",
            path: stateRoot,
            retryable: false,
          },
        ],
  });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createMigrationGeneration(): string {
  return `mg_${Date.now().toString(36)}_${process.pid.toString(36)}`;
}

function formatBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

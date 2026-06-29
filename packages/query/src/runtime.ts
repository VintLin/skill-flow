import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChannelAdapters, type ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import type {
  CollectionsFile,
  DeploymentTargetId,
  Diagnostic,
  DraftBinding,
  DeploymentAction,
  DeploymentPlan,
  DeploymentTargetName,
  DeploymentSummaryRecord,
  DoctorIssue,
  DoctorReport,
  ImportDraft,
  ImportDataCache,
  ImportGroupCandidate,
  LocalImportDetectedSkill,
  LocalImportValidationStatus,
  ImportRecommendationFeed,
  ImportRecommendationFeedId,
  ImportSearchHit,
  ImportSearchSnapshot,
  ImportPreviewResult,
  ImportPreparationResult,
  ImportReasonCode,
  ImportSourceResult,
  LeafRecord,
  LockFile,
  LocalImportChoice,
  LocalScanGroup,
  LocalScanGroupStatus,
  LocalScanImportChoice,
  LocalScanSkillVariant,
  LeafSummaryRecord,
  ManifestFile,
  PreferencesFile,
  ProjectScope,
  ProjectionRecord,
  RecentProject,
  Result,
  ScopedSourceDrafts,
  SkillCollectionRecord,
  SkillCandidate,
  SourceBindingSummary,
  SourceLockSummaryRecord,
  SourceManifestRecord,
  SourceMetadataResult,
  SourceSummaryRecord,
  SourceStats,
  SourceBinding,
  SourceUpdateResult,
  SourceUpdateResultItem,
  UnifiedSourceSnapshot,
  UnifiedSourceTrust,
  CollectionViewRecord,
  CollectionSkillRef,
  Warning,
  WorkflowSummary,
} from "@skill-flow/domain/types";
import { RuntimeStore } from "@skill-flow/storage/runtime-store";
import { StateStore } from "@skill-flow/storage/state-store";
import { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import {
  isImportDataCacheExpired,
} from "@skill-flow/storage/import-data-cache";
import {
  isSourceMetadataCacheExpired,
  sourceMetadataCacheEntryToResult,
  sourceMetadataResultToCacheEntry,
} from "@skill-flow/storage/source-metadata-cache";
import {
  ensureDir,
  createSymlink,
  hashDirectory,
  isPathInside,
  pathExists,
  readJsonFile,
  removePath,
  writeJsonFile,
} from "@skill-flow/integration/utils/fs";
import { getBuiltinGitSources } from "@skill-flow/integration/utils/builtin-git-sources";
import { fetchGitHubSkillPaths } from "@skill-flow/integration/utils/github-catalog";
import {
  buildProjectedSkillNameCandidates,
  getHostedGitOwner,
  parseGitHubRepo,
  parseHostedGitRepo,
  resolveProjectedSkillNames,
} from "@skill-flow/integration/utils/naming";
import {
  getTargetScanRoots,
  getMergedTargetDefinitions,
  resolveDocumentedProjectSkillPath,
  TARGET_ORDER,
} from "@skill-flow/integration/utils/constants";
import { fail, ok } from "@skill-flow/integration/utils/result";
import { searchClawHubSkills } from "@skill-flow/integration/utils/clawhub";
import { deriveDisplayName, deriveSourceId } from "@skill-flow/integration/utils/source-id";
import { fetchSourceDetails } from "@skill-flow/integration/utils/source-details";
import {
  buildFailedSourceMetadataResult,
  buildSourceMetadataResult,
  fetchFreshSourceMetadata,
  fetchSkillsDirectorySourceDetails,
  inferSourceMetadataProvider,
  SOURCE_METADATA_CACHE_TTL_MS,
} from "@skill-flow/integration/utils/source-details";
import {
  buildImportGroupCandidate,
  fetchSkillsDirectoryFeedGroups,
  fetchSkillsDirectorySourceSnapshot,
  groupSkillsDirectorySearchHits,
  IMPORT_RECOMMENDATION_CACHE_TTL_MS,
  IMPORT_SEARCH_CACHE_TTL_MS,
  IMPORT_SOURCE_CACHE_TTL_MS,
  normalizeImportCanonicalRepo,
  normalizeImportRepoPathSelector,
  searchSkillsDirectory,
} from "@skill-flow/integration/utils/skills-directory";
import { ConfigCoordinator } from "./config-coordinator.js";
import { DoctorService } from "@skill-flow/core-engine/services/doctor-service";
import { InventoryService } from "@skill-flow/core-engine/services/inventory-service";
import { ImportPreparationService } from "@skill-flow/core-engine/services/import-preparation-service";
import { RecentProjectService } from "@skill-flow/core-engine/services/recent-project-service";
import { SourceAuthorityService } from "@skill-flow/core-engine/services/source-authority-service";
import { SourceCheckoutService } from "@skill-flow/core-engine/services/source-checkout-service";
import {
  StateMigrationService,
  type StateMigrationOptions,
  type StateMigrationResult,
} from "@skill-flow/core-engine/services/state-migration-service";
import { WorkflowService } from "./workflow-service.js";
import type { StateMigrationStatus } from "@skill-flow/storage/state-schema";
import type { StateStoreState } from "@skill-flow/storage/state-store";
import type {
  AddSourceOptions,
  SourcePreview,
} from "@skill-flow/core-engine/services/source-types";
import {
  WorkspaceBootstrapService,
  type BootstrapEvent,
  type LocalSkillScanResult,
} from "@skill-flow/core-engine/services/workspace-bootstrap-service";
import { parseSkillFrontmatter } from "./skill-frontmatter.js";
import type { AgentsOriginReader } from "@skill-flow/core-engine/services/legacy-agents-lock";
import { DeploymentPlanner } from "@skill-flow/core-engine/services/deployment-planner";
import { DeploymentApplier } from "@skill-flow/core-engine/services/deployment-applier";
import {
  SkillCollectionMemberOriginMissingError,
  materializeSkillCollectionMembers,
} from "@skill-flow/core-engine/services/skill-collection-materializer";

const EMPTY_DRAFT: DraftBinding = { enabledTargets: [], selectedLeafIds: [] };
const BUILT_IN_SKILL_SOURCE_ID = "skill-flow";
const BUILT_IN_SKILL_DISPLAY_NAME = "skill-flow";

export type SkillFlowAppOptions = {
  agentsOriginReader?: AgentsOriginReader;
  builtInSkillsRoot?: string;
};

type AddSourceDraftOptions = {
  draft?: DraftBinding;
  skillNames?: string[];
  agentTargets?: DeploymentTargetId[];
  skipTargetDetection?: boolean;
};
type AddSourcePreparation = {
  sourceId: string;
  availableTargets: DeploymentTargetId[];
  draft: DraftBinding;
  leafs: LeafSummaryRecord[];
};
type RuntimeSourceSnapshot = {
  manifest: RuntimeManifestSourceView;
  lock: SourceLockSummaryRecord;
  leafCount: number;
  invalidLeafCount: number;
};
export type RuntimeProgressReporter = (message: string) => void;
type SkillFlowAddOptions = AddSourceOptions &
  AddSourceDraftOptions & {
    project?: boolean;
    onProgress?: RuntimeProgressReporter;
  };

type AddSourceResult = RuntimeSourceSnapshot & AddSourcePreparation & { projected: boolean };
type RuntimeManifestSourceView = SourceSummaryRecord & {
  selectionMode?: "all" | "selected";
};
type RuntimeManifestView = {
  schemaVersion: ManifestFile["schemaVersion"];
  sources: RuntimeManifestSourceView[];
  bindings: Record<string, SourceBindingSummary>;
};
type RuntimeLockView = Omit<LockFile, "sources"> & {
  sources: Record<string, SourceLockSummaryRecord>;
  deployments: DeploymentSummaryRecord[];
};
type RenameSourceResult = {
  sourceId: string;
  displayName: string;
  originalDisplayName: string;
  isResetToOriginal: boolean;
};

type GitHubImportLocator = {
  canonicalRepo: string;
  originalLocator: string;
  locator: string;
  requestedPath?: string;
  skillSelector?: string;
};
export type CreateCollectionOptions = {
  displayName: string;
  skills: CollectionSkillRef[];
  enabledTargets?: DeploymentTargetId[];
};
export type CreateCollectionResult = {
  group: CollectionViewRecord;
  source: RuntimeManifestSourceView;
  binding: SourceBindingSummary;
};
export type MergeGroupsOptions = {
  displayName: string;
  sourceIds: string[];
  enabledTargets: DeploymentTargetId[];
};
export type RestoreMergedGroupsResult = {
  collectionId: string;
  restoredSourceIds: string[];
  skippedSourceIds: string[];
};
type TargetRootOverrides = Partial<Record<DeploymentTargetId, string>>;
type ApplyDraftResult = {
  actions: DeploymentAction[];
  draft: DraftBinding;
  summary?: WorkflowSummary;
  inspect?: {
    summary: WorkflowSummary;
    source: RuntimeManifestSourceView;
    binding: SourceBindingSummary;
    leafs: LeafSummaryRecord[];
    deployments: DeploymentSummaryRecord[];
  };
  recentProjects?: RecentProject[];
  selectedProjectScope?: ProjectScope;
  projectDrafts?: PreferencesFile["projectSourceDrafts"];
};
type SourceTargetUpdateResult = {
  enabledSourceIds: string[];
  disabledSourceIds: string[];
  actions: DeploymentAction[];
  backupPath?: string;
};
export type ImportManifestOptions = {
  sources: Array<{
    source: string;
    skills?: "all" | "none";
    targets?: DeploymentTargetId[];
  }>;
  dryRun?: boolean;
  apply?: boolean;
  skipExisting?: boolean;
  continueOnError?: boolean;
  skipLocalMissing?: boolean;
};
export type ImportManifestResult = {
  imported: number;
  skippedExisting: number;
  skippedLocalMissing: number;
  enabled: number;
  inactive: number;
  failed: number;
  timedOut: number;
  backupPath?: string;
};
type RuntimeAuthoritySnapshot = {
  manifest: ManifestFile;
  lockFile: LockFile;
  preferences: PreferencesFile;
  state: StateStoreState;
  collections: CollectionsFile;
};
type GroupCardEnrichmentSnapshot = {
  sourceMetadata?: SourceMetadataResult;
  sourceSnapshot?: UnifiedSourceSnapshot;
  groupPath?: string;
};
type RuntimeImportSkillSelection = NonNullable<ImportDraft["selectedSkills"]>[number];
type SelectableLeaf = Pick<LeafRecord, "id" | "relativePath" | "linkName" | "title"> & {
  name?: string;
};
type LocalScanResolvedSkill = {
  scan: LocalSkillScanResult;
  detected: LocalImportDetectedSkill;
  canonicalRepo?: string;
  originLocator?: string;
  previewStatus: "ready" | "failed";
};
type ReadyImportPreviewResult = Extract<ImportPreviewResult, { status: "ready" }>;
type ImportPreviewSkillCandidate = ReadyImportPreviewResult["skills"][number];
type AuditMutationName =
  | "add-source"
  | "bootstrap"
  | "import-source"
  | "apply-draft"
  | "update-sources"
  | "doctor"
  | "uninstall";
type AuditEvent = {
  timestamp: string;
  mutation: AuditMutationName;
  caller: string;
  status: "ok" | "error" | "threw";
  details: Record<string, unknown>;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
};
type AuditedMutationResult<T> =
  | Result<T>
  | {
      result: Result<T>;
      auditDetails?: Record<string, unknown>;
    };

async function resolveUsableProjectPath(projectPath: string | undefined): Promise<string | null> {
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

function normalizePreferencesFile(preferences: PreferencesFile): PreferencesFile {
  const recentProjects = normalizeRecentProjects(preferences.recentProjects);
  return {
    ...preferences,
    schemaVersion: 2,
    pinnedSourceIds: uniqueNonEmptyStrings(preferences.pinnedSourceIds),
    selectedProjectScope: normalizeSelectedProjectScope(preferences.selectedProjectScope, recentProjects),
    recentProjects,
    projectSourceDrafts: normalizeProjectSourceDrafts(preferences.projectSourceDrafts),
    customTargets: preferences.customTargets.map((target) => ({ ...target })),
    agentDisplayOrder: [...preferences.agentDisplayOrder],
  };
}

function normalizeRecentProjects(value: PreferencesFile["recentProjects"]): RecentProject[] {
  return value.flatMap((project) => {
    if (
      !project.projectId ||
      typeof project.title !== "string" ||
      typeof project.lastActivityAt !== "string"
    ) {
      return [];
    }
    return [{
      projectId: project.projectId,
      title: project.title,
      lastActivityAt: project.lastActivityAt,
      ...(project.projectPath ? { projectPath: project.projectPath } : {}),
      ...(project.tools ? { tools: uniqueNonEmptyStrings(project.tools) } : {}),
    }];
  });
}

function normalizeSelectedProjectScope(
  scope: PreferencesFile["selectedProjectScope"],
  recentProjects: RecentProject[],
): ProjectScope {
  if (scope.kind === "project" && recentProjects.some((project) => project.projectId === scope.projectId)) {
    return { kind: "project", projectId: scope.projectId };
  }
  return { kind: "global" };
}

function normalizeProjectSourceDrafts(
  projectSourceDrafts: PreferencesFile["projectSourceDrafts"],
): PreferencesFile["projectSourceDrafts"] {
  const normalized: PreferencesFile["projectSourceDrafts"] = {};
  const now = new Date().toISOString();
  for (const [projectId, drafts] of Object.entries(projectSourceDrafts)) {
    if (!projectId) {
      continue;
    }
    const normalizedDrafts = Object.fromEntries(
      Object.entries(drafts).flatMap(([sourceId, draft]) => {
        if (!sourceId) {
          return [];
        }
        return [[sourceId, {
          sourceId,
          enabledTargets: uniqueNonEmptyStrings(draft.enabledTargets),
          selectedLeafIds: uniqueNonEmptyStrings(draft.selectedLeafIds),
          updatedAt: draft.updatedAt || now,
        } satisfies PreferencesFile["projectSourceDrafts"][string][string]]];
      }),
    );
    if (Object.keys(normalizedDrafts).length > 0) {
      normalized[projectId] = normalizedDrafts;
    }
  }
  return normalized;
}

function uniqueNonEmptyStrings<T extends string>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  const normalized: T[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

export class SkillFlowApp {
  private static readonly importGroupResolveConcurrency = 3;
  private static readonly importPreviewPrewarmLimit = 4;

  readonly store: RuntimeStore;
  private readonly stateStore: StateStore;
  private readonly importPreparationCacheStore: ImportPreparationCacheStore;
  adapters: ChannelAdapter[];
  readonly inventoryService: InventoryService;
  readonly sourceCheckoutService: SourceCheckoutService;
  readonly sourceAuthorityService: SourceAuthorityService;
  readonly importPreparationService: ImportPreparationService;
  readonly doctorService: DoctorService;
  readonly workflowService: WorkflowService;
  readonly recentProjectService: RecentProjectService;
  readonly workspaceBootstrapService: WorkspaceBootstrapService;
  readonly configCoordinator: ConfigCoordinator;
  private readonly builtInSkillsRoot: string | undefined;
  private mutationQueue: Promise<void> = Promise.resolve();
  private metadataRefreshesBySourceId = new Map<string, Promise<void>>();
  private importSearchRefreshesByQuery = new Map<string, Promise<ImportSearchSnapshot>>();
  private importSourceRefreshesByKey = new Map<string, Promise<UnifiedSourceSnapshot>>();
  private importRecommendationRefreshesByFeed = new Map<ImportRecommendationFeedId, Promise<ImportRecommendationFeed>>();

  constructor(options: SkillFlowAppOptions = {}) {
    this.builtInSkillsRoot = options.builtInSkillsRoot;
    this.store = new RuntimeStore();
    this.stateStore = new StateStore(this.store.rootPath);
    this.importPreparationCacheStore = new ImportPreparationCacheStore(this.store.rootPath);
    const adapters = createChannelAdapters();
    this.adapters = adapters;
    this.inventoryService = new InventoryService();
    this.sourceCheckoutService = new SourceCheckoutService({
      sourceRoot: path.join(this.stateStore.rootPath, "source"),
      inventoryService: this.inventoryService,
    });
    this.sourceAuthorityService = new SourceAuthorityService({
      stateStore: this.stateStore,
      checkoutService: this.sourceCheckoutService,
    });
    this.importPreparationService = new ImportPreparationService({
      cacheStore: this.importPreparationCacheStore,
      sourceAuthority: this.sourceAuthorityService,
      checkoutService: this.sourceCheckoutService,
    });
    this.doctorService = new DoctorService();
    this.workflowService = new WorkflowService();
    this.recentProjectService = new RecentProjectService();
    this.workspaceBootstrapService = new WorkspaceBootstrapService({
      stateRoot: this.stateStore.rootPath,
      ...(options.agentsOriginReader ? { agentsOriginReader: options.agentsOriginReader } : {}),
    });
    this.configCoordinator = new ConfigCoordinator({
      store: {
        readPreferences: async () => (await this.readRuntimeAuthorityView()).preferences,
        readCollections: () => this.readCollectionsForRuntime(),
        writePreferences: async (preferences) => {
          await this.writePreferences(preferences);
        },
      },
      recentProjectService: this.recentProjectService,
      doctorService: this.doctorService,
      workflowService: this.workflowService,
      getAvailableTargets: () => this.getAvailableTargets(),
      pruneMissingCheckouts: () => this.pruneMissingCheckoutsImpl(),
      ensureBuiltInSources: () => this.ensureBuiltInSourcesImpl(),
      getConfigData: async () => {
        const result = await this.getConfigDataImpl();
        if (!result.ok) {
          return fail(result.errors, result.warnings);
        }
        return result;
      },
    });
  }

  private async ensureBuiltInSourcesImpl(): Promise<Result<{ sourceIds: string[] }>> {
    const resolved = await this.resolveBuiltInSkillFlowPath();
    if (!resolved.path) {
      return ok(
        { sourceIds: [] },
        resolved.explicit
          ? [{
            code: "BUILT_IN_SKILL_SOURCE_MISSING",
            message: "Unable to register the built-in Skill Flow group because the configured built-in skills resource was not found.",
          }]
          : [],
      );
    }

    const state = await this.stateStore.readState();
    const existingSource = state.manifest.sources.find((source) => source.id === BUILT_IN_SKILL_SOURCE_ID);
    if (existingSource) {
      const sourceLock = state.lockFile.sources[BUILT_IN_SKILL_SOURCE_ID];
      if (sourceLock && await pathExists(sourceLock.localPath)) {
        return ok({ sourceIds: [] });
      }
      return ok({ sourceIds: [] }, [{
        code: "BUILT_IN_SKILL_SOURCE_CONFLICT",
        message: "The built-in Skill Flow group id is already registered but its checkout is incomplete.",
      }]);
    }

    const added = await this.sourceAuthorityService.addSource(resolved.path, {
      sourceIdOverride: BUILT_IN_SKILL_SOURCE_ID,
      displayNameOverride: BUILT_IN_SKILL_DISPLAY_NAME,
      originLocator: `builtin:${BUILT_IN_SKILL_SOURCE_ID}`,
      importMode: "bootstrap-detected",
    });
    if (!added.ok) {
      if (added.errors.some((error) => error.code === "SOURCE_EXISTS")) {
        return ok({ sourceIds: [] }, added.warnings);
      }
      return ok({ sourceIds: [] }, [
        ...added.warnings,
        ...added.errors.map((error) => ({
          code: "BUILT_IN_SKILL_SOURCE_REGISTER_FAILED",
          message: error.message,
        })),
      ]);
    }

    return ok({ sourceIds: [BUILT_IN_SKILL_SOURCE_ID] }, added.warnings);
  }

  private async resolveBuiltInSkillFlowPath(): Promise<{ path?: string; explicit: boolean }> {
    const explicitRoot = this.builtInSkillsRoot ?? process.env.SKILL_FLOW_BUILTIN_SKILLS_ROOT;
    const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
    const roots = [
      explicitRoot,
      path.resolve(runtimeDir, "..", "skills"),
    ].filter((value): value is string => Boolean(value));

    for (const root of roots) {
      const skillPath = path.join(root, BUILT_IN_SKILL_SOURCE_ID);
      if (await pathExists(path.join(skillPath, "SKILL.md"))) {
        return { path: skillPath, explicit: root === explicitRoot };
      }
    }

    return { explicit: Boolean(explicitRoot) };
  }

  private readCollectionsForRuntime(): Promise<CollectionsFile> {
    return this.stateStore.readCollections();
  }

  private async readRuntimeAuthorityView(): Promise<RuntimeAuthoritySnapshot> {
    const state = await this.stateStore.readState();

    return {
      manifest: state.manifest,
      lockFile: state.lockFile,
      preferences: state.preferences,
      state,
      collections: state.collections,
    };
  }

  private async writePreferences(preferences: PreferencesFile): Promise<PreferencesFile> {
    const state = await this.stateStore.readState();
    const nextPreferences = normalizePreferencesFile({
      ...preferences,
      migrationGeneration: state.preferences.migrationGeneration,
      ...(state.preferences.localImportChoices ? { localImportChoices: state.preferences.localImportChoices } : {}),
      ...(state.preferences.localScanImportChoices
        ? { localScanImportChoices: state.preferences.localScanImportChoices }
        : {}),
    });
    await this.stateStore.writeState({
      ...state,
      preferences: nextPreferences,
    });
    return nextPreferences;
  }

  private async pruneMissingSourceIds(preferences?: PreferencesFile): Promise<PreferencesFile> {
    const state = await this.stateStore.readState();
    const sourceIds = new Set(state.manifest.sources.map((source) => source.id));
    const currentPreferences = preferences ?? state.preferences;
    const projectIds = new Set(currentPreferences.recentProjects.map((project) => project.projectId));
    const projectSourceDrafts = Object.fromEntries(
      Object.entries(currentPreferences.projectSourceDrafts)
        .map(([projectId, drafts]) => [
          projectId,
          Object.fromEntries(
            Object.entries(drafts).filter(([sourceId]) => sourceIds.has(sourceId)),
          ),
        ]),
    );
    const selectedProjectScope =
      currentPreferences.selectedProjectScope.kind === "project" &&
        !projectIds.has(currentPreferences.selectedProjectScope.projectId)
        ? { kind: "global" as const }
        : currentPreferences.selectedProjectScope;
    const nextPreferences = normalizePreferencesFile({
      ...currentPreferences,
      pinnedSourceIds: currentPreferences.pinnedSourceIds.filter((sourceId) => sourceIds.has(sourceId)),
      selectedProjectScope,
      projectSourceDrafts,
    });
    await this.stateStore.writeState({
      ...state,
      preferences: nextPreferences,
    });
    return nextPreferences;
  }

  private manifestSourceToView(source: ManifestFile["sources"][number]): RuntimeManifestSourceView {
    return {
      id: source.id,
      locator: source.locator,
      kind: source.kind,
      displayName: source.displayName,
      originalDisplayName: source.displayName,
      addedAt: source.createdAt,
      ...(source.requestedPath ? { requestedPath: source.requestedPath } : {}),
      ...(source.originRequestedPath ? { originRequestedPath: source.originRequestedPath } : {}),
      ...(source.canonicalLocator !== source.locator ? { originLocator: source.canonicalLocator } : {}),
    };
  }

  private lockSourceToView(
    source: LockFile["sources"][string],
    manifestSource: ManifestFile["sources"][number] | undefined,
    lockFile: LockFile,
  ): SourceLockSummaryRecord {
    return {
      id: source.sourceId,
      locator: source.canonicalLocator,
      kind: source.revision.provider,
      displayName: manifestSource?.displayName ?? source.sourceId,
      originalDisplayName: manifestSource?.displayName ?? source.sourceId,
      checkoutPath: source.localPath,
      updatedAt: source.revision.capturedAt,
      leafIds: [...source.leafIds],
      invalidLeafs: lockFile.leafInventory
        .filter((leaf) => leaf.sourceId === source.sourceId && !leaf.valid)
        .map((leaf) => ({
          path: leaf.relativePath,
          reason: (leaf.diagnostics ?? []).map((diagnostic) => diagnostic.message).join("; ") || "Leaf is invalid.",
        })),
      ...("commit" in source.revision && source.revision.commit ? { commitSha: source.revision.commit } : {}),
      ...(source.packageSlug ? { packageSlug: source.packageSlug } : {}),
      ...(source.resolvedVersion ? { resolvedVersion: source.resolvedVersion } : {}),
      ...(source.contentHash ? { contentHash: source.contentHash } : {}),
      ...(source.versionMode ? { versionMode: source.versionMode } : {}),
      ...(source.originBranch ? { originBranch: source.originBranch } : {}),
      ...(source.importedFromTargets ? { importedFromTargets: [...source.importedFromTargets] } : {}),
      ...(source.observedTargets ? { observedTargets: source.observedTargets.map((target) => ({ ...target })) } : {}),
      ...(source.importMode ? { importMode: source.importMode } : {}),
    };
  }

  private bindingToSummary(
    binding: ManifestFile["bindings"][string] | undefined,
    leafIds: string[],
  ): SourceBindingSummary {
    if (!binding) {
      return { selectedLeafIds: [], resolvedSelectedLeafCount: 0, targets: {} };
    }
    const resolvedLeafIds = new Set(leafIds);
    const selectedLeafIds = binding.selectionMode === "all" ? [...leafIds] : [...binding.selectedLeafIds];
    const resolvedSelectedLeafIds = selectedLeafIds.filter((leafId) => resolvedLeafIds.has(leafId));
    return {
      selectedLeafIds: binding.selectionMode === "all" ? [] : selectedLeafIds,
      resolvedSelectedLeafCount: resolvedSelectedLeafIds.length,
      targets: Object.fromEntries(
        binding.enabledTargets.map((target) => [
          target,
          { enabled: true, leafIds: [...resolvedSelectedLeafIds] },
        ]),
      ),
    };
  }

  private leafToSummary(leaf: LeafRecord): LeafSummaryRecord {
    return {
      id: leaf.id,
      sourceId: leaf.sourceId,
      name: leaf.title ?? leaf.name ?? leaf.linkName,
      linkName: leaf.linkName,
      title: leaf.title,
      description: leaf.description,
      relativePath: leaf.relativePath,
      absolutePath: leaf.absolutePath,
      skillFilePath: leaf.skillFilePath,
      contentHash: leaf.contentHash,
      metadataWarnings: (leaf.diagnostics ?? []).map((diagnostic) => diagnostic.message),
      valid: true,
    };
  }

  private deploymentSummaryFromProjection(projection: LockFile["projections"][number]): DeploymentSummaryRecord {
    return {
      sourceId: projection.sourceId,
      leafId: projection.leafId,
      target: projection.target,
      targetPath: projection.targetPath,
      ...(projection.targetRootPath ? { targetRootPath: projection.targetRootPath } : {}),
      strategy: projection.strategy,
      status: projection.status,
      contentHash: projection.contentHash,
      appliedAt: projection.updatedAt,
    };
  }

  private createAdaptersForPreferences(
    preferences: Pick<PreferencesFile, "customTargets" | "agentDisplayOrder">,
  ): ChannelAdapter[] {
    return createChannelAdapters(
      getMergedTargetDefinitions(
        preferences.customTargets,
        preferences.agentDisplayOrder,
      ),
    );
  }

  private async refreshAdapters(): Promise<ChannelAdapter[]> {
    const { preferences } = await this.readRuntimeAuthorityView();
    this.adapters = this.createAdaptersForPreferences(preferences);
    return this.adapters;
  }

  async addSource(
    locator: string,
    options?: SkillFlowAddOptions,
  ): Promise<Result<AddSourceResult>> {
    return this.runAuditedMutation(
      "add-source",
      {
        locator,
        project: options?.project !== false,
        requestedPath: options?.path,
        enabledTargets: options?.enabledTargets ?? [],
        sourceIdOverride: options?.sourceIdOverride,
      },
      () => this.addSourceImpl(locator, options),
    );
  }

  async prepareAddSource(
    locator: string,
    options?: SkillFlowAddOptions,
  ): Promise<Result<AddSourceResult>> {
    return this.runSerializedMutation(() => this.prepareAddSourceImpl(locator, options));
  }

  private async addSourceImpl(
    locator: string,
    options?: SkillFlowAddOptions,
  ): Promise<Result<AddSourceResult>> {
    const prepared = await this.prepareAddSourceImpl(locator, options);
    if (!prepared.ok) {
      return prepared;
    }

    const addOptions = options ?? {};
    if (addOptions.project === false) {
      return prepared;
    }

    addOptions.onProgress?.("Applying projections");
    const applied = await this.applyDraftImpl(
      prepared.data.sourceId,
      addOptions.draft ?? prepared.data.draft,
      { kind: "global" },
    );
    if (!applied.ok) {
      return fail(applied.errors, [...prepared.warnings, ...applied.warnings]);
    }

    return ok(
      {
        ...prepared.data,
        draft: applied.data.draft,
        projected: true,
      },
      [...prepared.warnings, ...applied.warnings],
    );
  }

  private async prepareAddSourceImpl(
    locator: string,
    options?: SkillFlowAddOptions,
  ): Promise<Result<AddSourceResult>> {
    const addOptions = options ?? {};
    addOptions.onProgress?.("Preparing source");
    const result = await this.sourceAuthorityService.addSource(locator, addOptions);
    if (!result.ok) {
      return fail(result.errors, result.warnings);
    }
    addOptions.onProgress?.("Source prepared");

    const state = await this.stateStore.readState();
    const { manifest, lockFile } = state;
    const source = manifest.sources.find((item) => item.id === result.data.manifest.id);
    if (!source) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${result.data.manifest.id}' is not registered.`,
      });
    }

    const requestedPath = this.normalizeRequestedPath(addOptions.path);
    const sourceLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id);
    const availableTargets = addOptions.skipTargetDetection
      ? []
      : await this.getAvailableTargets();
    const preparedDraft = this.buildAddDraft(
      sourceLeafs,
      requestedPath,
      availableTargets,
      addOptions,
    );
    if (!preparedDraft.ok) {
      await this.rollbackPreparedSourceInternal(source.id);
      return fail(preparedDraft.errors, [...result.warnings, ...preparedDraft.warnings]);
    }

    const warnings = [...result.warnings];
    if (
      requestedPath &&
      !addOptions.skillNames?.length &&
      !addOptions.draft &&
      preparedDraft.data.selectedLeafIds.length < sourceLeafs.length
    ) {
      warnings.push({
        code: "ADD_SELECTION_PRESELECTED",
        message:
          `Preselected ${preparedDraft.data.selectedLeafIds.length} of ${sourceLeafs.length} ` +
          `skill${sourceLeafs.length === 1 ? "" : "s"} under '${requestedPath}'; ` +
          "the full skills group was imported.",
      });
    }

    const lockSource = lockFile.sources[source.id];
    return ok(
      {
        manifest: this.manifestSourceToView(source),
        lock: lockSource
          ? this.lockSourceToView(lockSource, source, lockFile)
          : {
          id: source.id,
          locator: source.locator,
          kind: source.kind,
          displayName: source.displayName,
          originalDisplayName: source.displayName,
          checkoutPath: result.data.lock.localPath,
          updatedAt: new Date().toISOString(),
          leafIds: result.data.lock.leafIds,
          invalidLeafs: [],
          },
        leafCount: result.data.leafCount,
        invalidLeafCount: result.data.invalidLeafCount,
        sourceId: source.id,
        availableTargets,
        draft: preparedDraft.data,
        leafs: sourceLeafs.filter((leaf) => leaf.valid).map((leaf) => this.leafToSummary(leaf)),
        projected: false,
      },
      warnings,
    );
  }

  async rollbackPreparedSource(sourceId: string): Promise<Result<{ removed: string[] }>> {
    return this.runSerializedMutation(() => this.rollbackPreparedSourceInternal(sourceId));
  }

  async createCollection(
    options: CreateCollectionOptions,
  ): Promise<Result<CreateCollectionResult>> {
    return this.runSerializedMutation(() => this.createCollectionImpl(options));
  }

  async mergeGroups(
    options: MergeGroupsOptions,
  ): Promise<Result<CreateCollectionResult>> {
    return this.runSerializedMutation(() => this.mergeGroupsImpl(options));
  }

  async restoreCollectionSources(
    collectionId: string,
  ): Promise<Result<RestoreMergedGroupsResult>> {
    return this.runSerializedMutation(() => this.restoreCollectionSourcesImpl(collectionId));
  }

  private async createCollectionImpl(
    options: CreateCollectionOptions,
  ): Promise<Result<CreateCollectionResult>> {
    const displayName = options.displayName.trim();
    if (!displayName) {
      return fail({
        code: "COLLECTION_NAME_EMPTY",
        message: "Collection name cannot be empty.",
      });
    }
    if (options.skills.length === 0) {
      return fail({
        code: "COLLECTION_SKILLS_EMPTY",
        message: "Collection must include at least one skill.",
      });
    }

    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const collections: CollectionsFile = {
      ...state.collections,
      collections: { ...state.collections.collections },
    };
    const includedSkills = this.validateCollectionSkillRefs(options.skills, manifest, lockFile);
    if (!includedSkills.ok) {
      return fail(includedSkills.errors, includedSkills.warnings);
    }
    if (includedSkills.data.length === 0) {
      return fail({
        code: "COLLECTION_SKILLS_EMPTY",
        message: "Collection must include at least one skill.",
      });
    }
    const conflict = this.findCollectionSkillNameConflict(includedSkills.data, lockFile);
    if (conflict) {
      return fail(conflict);
    }

    const id = this.uniqueCollectionSourceId(displayName, manifest, collections);
    const now = new Date().toISOString();
    const enabledTargets = [...new Set(options.enabledTargets ?? [])];
    const materialized = await this.materializeCollectionMembers(
      id,
      includedSkills.data,
      manifest,
      lockFile,
      state.manifest.migrationGeneration,
      now,
    );
    if (!materialized.ok) {
      return fail(materialized.errors, materialized.warnings);
    }
    const source: ManifestFile["sources"][number] = {
      id,
      kind: "collection",
      locator: `collection:${id}`,
      canonicalLocator: `collection:${id}`,
      displayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const collection: SkillCollectionRecord = {
      id,
      displayName,
      materializedSourceId: id,
      members: materialized.data.members,
      hiddenSourceIds: [],
      restoreSelections: {},
      createdAt: now,
      updatedAt: now,
    };

    manifest.sources.push(source);
    manifest.bindings[id] = {
      sourceId: id,
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets,
    };
    lockFile.sources[id] = {
      sourceId: id,
      canonicalLocator: `collection:${id}`,
      revision: {
        provider: "collection",
        capturedAt: now,
      },
      localPath: materialized.data.collectionRoot,
      leafIds: materialized.data.leafs.map((leaf) => leaf.id),
    };
    lockFile.leafInventory = [...lockFile.leafInventory, ...materialized.data.leafs];
    collections.collections[id] = collection;

    const preferences = state.preferences;
    const plan = await this.planForSources(manifest, lockFile, [id], preferences);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }
    const applyResult = await new DeploymentApplier(this.createAdaptersForPreferences(preferences))
      .applyPlan(lockFile, plan.data.actions);
    if (!applyResult.ok) {
      return fail(applyResult.errors, [...plan.warnings, ...applyResult.warnings]);
    }

    await this.stateStore.writeState({
      ...state,
      manifest,
      lockFile,
      collections,
    });

    const group: CollectionViewRecord = this.collectionToViewRecord(collection);
    const viewSource = manifest.sources.find((item) => item.id === id) ?? {
      id,
      locator: `collection:${id}`,
      kind: "collection" as const,
      displayName,
      canonicalLocator: `collection:${id}`,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const binding = manifest.bindings[id] ?? {
      sourceId: id,
      selectionMode: "selected" as const,
      selectedLeafIds: [],
      enabledTargets: [],
    };

    return ok({
      group,
      source: this.manifestSourceToView(viewSource),
      binding: this.bindingToSummary(binding, lockFile.sources[id]?.leafIds ?? []),
    }, [...plan.warnings, ...applyResult.warnings]);
  }

  private async mergeGroupsImpl(
    options: MergeGroupsOptions,
  ): Promise<Result<CreateCollectionResult>> {
    const displayName = options.displayName.trim();
    if (!displayName) {
      return fail({
        code: "COLLECTION_NAME_EMPTY",
        message: "Collection name cannot be empty.",
      });
    }

    const sourceIds = [
      ...new Set(options.sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean)),
    ];
    if (sourceIds.length < 2) {
      return fail({
        code: "MERGE_GROUPS_TOO_FEW",
        message: "Merge requires at least two source groups.",
      });
    }

    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const collections: CollectionsFile = {
      ...state.collections,
      collections: { ...state.collections.collections },
    };
    const sources = sourceIds.map((sourceId) =>
      manifest.sources.find((source) => source.id === sourceId),
    );
    const missingSourceId = sourceIds.find((sourceId, index) =>
      !sources[index] || sources[index]?.kind === "collection",
    );
    if (missingSourceId) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${missingSourceId}' is not registered.`,
      });
    }

    const includedSkills = sourceIds.flatMap((sourceId) =>
      (lockFile.sources[sourceId]?.leafIds ?? []).map((leafId) => ({ sourceId, leafId })),
    );
    if (includedSkills.length === 0) {
      return fail({
        code: "COLLECTION_SKILLS_EMPTY",
        message: "Collection must include at least one skill.",
      });
    }
    const validSkills = this.validateCollectionSkillRefs(includedSkills, manifest, lockFile);
    if (!validSkills.ok) {
      return fail(validSkills.errors, validSkills.warnings);
    }
    const conflict = this.findCollectionSkillNameConflict(validSkills.data, lockFile);
    if (conflict) {
      return fail(conflict);
    }

    const id = this.uniqueCollectionSourceId(displayName, manifest, collections);
    const now = new Date().toISOString();
    const enabledTargets = [...new Set(options.enabledTargets)];
    const materialized = await this.materializeCollectionMembers(
      id,
      validSkills.data,
      manifest,
      lockFile,
      state.manifest.migrationGeneration,
      now,
    );
    if (!materialized.ok) {
      return fail(materialized.errors, materialized.warnings);
    }

    const source: ManifestFile["sources"][number] = {
      id,
      kind: "collection",
      locator: `collection:${id}`,
      canonicalLocator: `collection:${id}`,
      displayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const restoreSelections: SkillCollectionRecord["restoreSelections"] = {};
    for (const sourceId of sourceIds) {
      const sourceLock = lockFile.sources[sourceId];
      const binding = manifest.bindings[sourceId];
      if (!sourceLock || !binding) {
        continue;
      }
      restoreSelections[sourceId] = {
        sourceId,
        selectedLeafIds: binding.selectionMode === "all"
          ? [...sourceLock.leafIds]
          : [...binding.selectedLeafIds],
        enabledTargets: [...binding.enabledTargets],
        bestEffort: false,
        diagnostics: [],
      };
    }

    const collection: SkillCollectionRecord = {
      id,
      displayName,
      materializedSourceId: id,
      members: materialized.data.members,
      hiddenSourceIds: sourceIds,
      restoreSelections,
      createdAt: now,
      updatedAt: now,
    };

    manifest.sources.push(source);
    manifest.bindings[id] = {
      sourceId: id,
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets,
    };
    lockFile.sources[id] = {
      sourceId: id,
      canonicalLocator: `collection:${id}`,
      revision: {
        provider: "collection",
        capturedAt: now,
      },
      localPath: materialized.data.collectionRoot,
      leafIds: materialized.data.leafs.map((leaf) => leaf.id),
    };
    lockFile.leafInventory = [...lockFile.leafInventory, ...materialized.data.leafs];
    collections.collections[id] = collection;
    for (const sourceId of sourceIds) {
      manifest.bindings[sourceId] = {
        sourceId,
        selectionMode: "selected",
        selectedLeafIds: [],
        enabledTargets: [],
      };
    }
    const preferences = state.preferences;
    const plan = await this.planForSources(manifest, lockFile, [id, ...sourceIds], preferences);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }
    const applyResult = await new DeploymentApplier(this.createAdaptersForPreferences(preferences))
      .applyPlan(lockFile, plan.data.actions);
    if (!applyResult.ok) {
      return fail(applyResult.errors, [...plan.warnings, ...applyResult.warnings]);
    }

    await this.stateStore.writeState({
      ...state,
      manifest,
      lockFile,
      collections,
    });

    const group = this.collectionToViewRecord(collection);
    const viewSource = manifest.sources.find((item) => item.id === id) ?? {
      id,
      locator: `collection:${id}`,
      kind: "collection" as const,
      displayName,
      canonicalLocator: `collection:${id}`,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const binding = manifest.bindings[id] ?? {
      sourceId: id,
      selectionMode: "selected" as const,
      selectedLeafIds: [],
      enabledTargets: [],
    };

    return ok({
      group,
      source: this.manifestSourceToView(viewSource),
      binding: this.bindingToSummary(binding, lockFile.sources[id]?.leafIds ?? []),
    }, [...plan.warnings, ...applyResult.warnings]);
  }

  private async restoreCollectionSourcesImpl(
    collectionId: string,
  ): Promise<Result<RestoreMergedGroupsResult>> {
    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const collections: CollectionsFile = {
      ...state.collections,
      collections: { ...state.collections.collections },
    };
    const collection = collections.collections[collectionId];
    if (!collection) {
      return fail({
        code: "COLLECTION_NOT_FOUND",
        message: `Collection id '${collectionId}' is not registered.`,
      });
    }
    if (collection.hiddenSourceIds.length === 0) {
      return fail({
        code: "COLLECTION_RESTORE_UNAVAILABLE",
        message: `Collection '${collectionId}' does not have hidden source groups to restore.`,
      });
    }

    const restoredSourceIds: string[] = [];
    const skippedSourceIds: string[] = [];
    for (const sourceId of collection.hiddenSourceIds) {
      const source = manifest.sources.find((item) => item.id === sourceId);
      const sourceLock = lockFile.sources[sourceId];
      const selection = collection.restoreSelections[sourceId];
      if (!source || !sourceLock || !selection) {
        skippedSourceIds.push(sourceId);
        continue;
      }
      manifest.bindings[sourceId] = this.bindingFromRestoreSelection(selection, sourceLock.leafIds);
      restoredSourceIds.push(sourceId);
    }

    manifest.bindings[collectionId] = {
      sourceId: collectionId,
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    const preferences = state.preferences;
    const plan = await this.planForSources(manifest, lockFile, [
      collectionId,
      ...restoredSourceIds,
    ], preferences);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }
    const applyResult = await new DeploymentApplier(this.createAdaptersForPreferences(preferences))
      .applyPlan(lockFile, plan.data.actions);
    if (!applyResult.ok) {
      return fail(applyResult.errors, [...plan.warnings, ...applyResult.warnings]);
    }
    manifest.sources = manifest.sources.filter((source) => source.id !== collectionId);
    delete manifest.bindings[collectionId];
    const collectionSource = lockFile.sources[collectionId];
    delete lockFile.sources[collectionId];
    lockFile.leafInventory = lockFile.leafInventory.filter((leaf) => leaf.sourceId !== collectionId);
    lockFile.projections = lockFile.projections.filter((projection) => projection.sourceId !== collectionId);
    delete collections.collections[collectionId];

    await this.stateStore.writeState({
      ...state,
      manifest,
      lockFile,
      collections,
    });
    if (collectionSource) {
      await removePath(collectionSource.localPath);
    }

    return ok(
      { collectionId, restoredSourceIds, skippedSourceIds },
      [...plan.warnings, ...applyResult.warnings],
    );
  }

  async findSkills(query: string): Promise<Result<{ candidates: SkillCandidate[] }>> {
    const { manifest, lockFile } = await this.readStateConsistently();
    const normalizedQuery = this.normalizeSearchQuery(query);
    const warnings: Warning[] = [];
    const localKeys = new Set<string>();
    const candidates: SkillCandidate[] = [];
    let remoteSearchSucceeded = false;

    for (const candidate of this.buildLocalCandidates(normalizedQuery, manifest, lockFile)) {
      candidates.push(candidate);
      localKeys.add(this.getCandidateKey(candidate));
    }

    const builtinResults = await Promise.all(
      getBuiltinGitSources().map(async (builtin) => {
        try {
          const sourceId = deriveSourceId(builtin.locator);
          const displayName = deriveDisplayName(builtin.locator);
          const search = await this.searchBuiltinGitSource(
            builtin.locator,
            builtin.branch,
            sourceId,
            displayName,
            normalizedQuery,
          );
          return {
            ok: true as const,
            candidates: search.candidates,
            warnings: search.warnings,
          };
        } catch (error) {
          return {
            ok: false as const,
            warning: {
              code: "BUILTIN_SOURCE_UNAVAILABLE",
              message: `Unable to refresh built-in source '${builtin.locator}': ${String(error)}`,
            },
          };
        }
      }),
    );

    for (const result of builtinResults) {
      if (!result.ok) {
        warnings.push(result.warning);
        continue;
      }
      warnings.push(...result.warnings);
      remoteSearchSucceeded = true;
      for (const candidate of result.candidates) {
        if (localKeys.has(this.getCandidateKey(candidate))) {
          continue;
        }
        candidates.push(candidate);
      }
    }

    try {
      const results = await searchClawHubSkills(normalizedQuery, 8);
      remoteSearchSucceeded = true;
      for (const result of results) {
        candidates.push({
          id: `clawhub:${result.slug}`,
          title: result.title,
          description: result.title,
          source: "clawhub",
          sourceLabel: "ClawHub",
          sourceId: deriveSourceId(`clawhub:${result.slug}`),
          sourceKind: "clawhub",
          locator: `clawhub:${result.slug}`,
          installed: manifest.sources.some((source) => source.id === deriveSourceId(`clawhub:${result.slug}`)),
          action: {
            type: "add-clawhub",
            slug: result.slug,
          },
        });
      }
    } catch (error) {
      warnings.push({
        code: "CLAWHUB_SEARCH_FAILED",
        message: `Unable to search ClawHub: ${String(error)}`,
      });
    }

    if (candidates.length === 0 && !remoteSearchSucceeded) {
      return fail(
        {
          code: "FIND_UNAVAILABLE",
          message: "Unable to search built-in sources or ClawHub.",
        },
        warnings,
      );
    }

    candidates.sort((left, right) => this.compareCandidates(left, right, normalizedQuery));

    return ok({ candidates }, warnings);
  }

  async listRecommendedImportGroups(): Promise<Result<{ groups: ImportGroupCandidate[] }>> {
    return this.listRecommendedImportGroupsImpl();
  }

  async scanLocalImportGroups(
    localPath?: string,
  ): Promise<Result<{ groups: ImportGroupCandidate[]; localScanGroups: LocalScanGroup[] }>> {
    return this.scanLocalImportGroupsImpl(localPath);
  }

  async searchImportGroups(
    query: string,
  ): Promise<Result<{ groups: ImportGroupCandidate[]; exact: boolean }>> {
    return this.searchImportGroupsImpl(query);
  }

  async previewImportSource(locator: string): Promise<Result<ImportPreviewResult>> {
    return this.previewImportSourceImpl(locator);
  }

  async prepareImportSource(locator: string): Promise<Result<ImportPreparationResult>> {
    return this.prepareImportSourceImpl(locator);
  }

  async commitPreparedImportSource(
    preparationId: string,
    draft?: ImportDraft,
  ): Promise<Result<ImportSourceResult>> {
    return this.runAuditedMutation(
      "import-source",
      {
        preparationId,
        selectedSkillUiIds: draft?.selectedSkills?.map((skill) => skill.uiId) ?? [],
        enabledTargets: draft?.enabledTargets ?? [],
      },
      () => this.commitPreparedImportSourceImpl(preparationId, draft),
    );
  }

  async importSource(
    locator: string,
    draft?: ImportDraft,
  ): Promise<Result<ImportSourceResult>> {
    return this.runAuditedMutation(
      "import-source",
      {
        locator,
        selectedSkillUiIds: draft?.selectedSkills?.map((skill) => skill.uiId) ?? [],
        enabledTargets: draft?.enabledTargets ?? [],
      },
      () => this.importSourceImpl(locator, draft),
    );
  }

  inspectStateMigration(): Promise<StateMigrationStatus> {
    return new StateMigrationService({ stateRoot: this.store.rootPath }).inspect();
  }

  migrateState(options: StateMigrationOptions): Promise<StateMigrationResult> {
    return this.runSerializedTask(async () => {
      const result = await new StateMigrationService({ stateRoot: this.store.rootPath }).migrate(options);
      if (result.status === "migrated") {
        await this.warmRebuildableCacheAfterMigration();
      }
      return result;
    });
  }

  private async warmRebuildableCacheAfterMigration(): Promise<void> {
    await this.refreshImportRecommendationFeedTracked("seed").catch(() => undefined);
    for (const feedId of ["official", "trending", "hot", "audits"] as const) {
      this.refreshImportRecommendationFeedInBackground(feedId);
    }

    const state = await this.stateStore.readState().catch(() => undefined);
    if (!state) {
      return;
    }
    const summaries = this.workflowService.getSummaries(
      state.manifest,
      state.lockFile,
      undefined,
      state.collections,
    );
    for (const summary of summaries) {
      this.refreshSourceMetadataInBackground(summary.source, summary.lock);
    }
  }

  async listWorkflows(): Promise<
    Result<{
      availableTargets: DeploymentTargetId[];
      summaries: WorkflowSummary[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      customTargets: PreferencesFile["customTargets"];
      agentDisplayOrder: PreferencesFile["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    return this.runSerializedMutation(() => this.listWorkflowsImpl());
  }

  async saveSettings(input: {
    customTargets: PreferencesFile["customTargets"];
    agentDisplayOrder: PreferencesFile["agentDisplayOrder"];
  }): Promise<Result<{
    customTargets: PreferencesFile["customTargets"];
    agentDisplayOrder: PreferencesFile["agentDisplayOrder"];
  }>> {
    return this.runSerializedMutation(async () => {
      const preferences = (await this.readRuntimeAuthorityView()).preferences;
      const saved = await this.writePreferences({
        ...preferences,
        customTargets: input.customTargets,
        agentDisplayOrder: input.agentDisplayOrder,
      });
      this.adapters = this.createAdaptersForPreferences(saved);
      return ok({
        customTargets: saved.customTargets,
        agentDisplayOrder: saved.agentDisplayOrder,
      });
    });
  }

  async inspectSource(
    sourceId: string,
    scope: ProjectScope = { kind: "global" },
  ): Promise<
    Result<{
      summary: WorkflowSummary;
      source: RuntimeManifestSourceView;
      binding: SourceBindingSummary;
      leafs: LeafSummaryRecord[];
      deployments: DeploymentSummaryRecord[];
    }>
  > {
    return this.runSerializedMutation(() => this.inspectSourceImpl(sourceId, scope));
  }

  async inspectSourceEnrichment(
    sourceId: string,
  ): Promise<
    Result<{
      sourceMetadata: SourceMetadataResult;
      sourceSnapshot?: UnifiedSourceSnapshot;
    }>
  > {
    return this.inspectSourceEnrichmentImpl(sourceId);
  }

  async inspectCollection(
    collectionId: string,
  ): Promise<Result<{ collection: SkillCollectionRecord; diagnostics: Diagnostic[] }>> {
    return this.runSerializedMutation(() => this.inspectCollectionImpl(collectionId));
  }

  private async inspectSourceImpl(
    sourceId: string,
    scope: ProjectScope,
  ): Promise<
    Result<{
      summary: WorkflowSummary;
      source: RuntimeManifestSourceView;
      binding: SourceBindingSummary;
      leafs: LeafSummaryRecord[];
      deployments: DeploymentSummaryRecord[];
    }>
  > {
    const runtimeView = await this.readRuntimeAuthorityView();
    const { manifest, lockFile, preferences, collections } = runtimeView;
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (!source) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    const summary = this.workflowService.getSummaries(manifest, lockFile, undefined, collections).find((item) => item.source.id === sourceId);
    if (!summary) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Unable to inspect '${sourceId}' because no summary data was found.`,
      });
    }

    const binding = this.bindingToSummary(manifest.bindings[sourceId], lockFile.sources[sourceId]?.leafIds ?? []);
    const leafs = summary.leafs;
    const deployments = lockFile.projections
      .filter((deployment) => deployment.sourceId === sourceId && deployment.status === "active")
      .map((deployment) => this.deploymentSummaryFromProjection(deployment));

    if (scope.kind === "global") {
      return ok({ summary, source: this.manifestSourceToView(source), binding, leafs, deployments });
    }

    const initialDrafts: Record<string, DraftBinding> = {
      [sourceId]: this.draftFromBinding(sourceId, binding, lockFile),
    };
    const scopedDraft = this.resolveDraftForScope(sourceId, initialDrafts, preferences, scope);

    const scopedManifest = this.cloneAuthorityManifest(manifest);
    const prepared = this.prepareAuthorityManifestForDraft(scopedManifest, lockFile, sourceId, scopedDraft);
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }
    const scopedSource = prepared.data.manifest.sources.find((item) => item.id === sourceId) ?? source;
    const scopedSummary =
      this.workflowService.getSummaries(prepared.data.manifest, lockFile, undefined, collections).find((item) => item.source.id === sourceId)
      ?? summary;
    const scopedBinding = this.bindingToSummary(
      prepared.data.manifest.bindings[sourceId],
      lockFile.sources[sourceId]?.leafIds ?? [],
    );
    const scopedDeployments = scopedDraft.enabledTargets.length === 0
      ? []
      : await this.resolveScopedInspectDeployments(
        prepared.data.manifest,
        lockFile,
        sourceId,
        scope,
        scopedDraft.enabledTargets,
        preferences,
      );

    return ok({
      summary: scopedSummary,
      source: this.manifestSourceToView(scopedSource),
      binding: scopedBinding,
      leafs,
      deployments: scopedDeployments,
    });
  }

  private async inspectSourceEnrichmentImpl(
    sourceId: string,
  ): Promise<
    Result<{
      sourceMetadata: SourceMetadataResult;
      sourceSnapshot?: UnifiedSourceSnapshot;
    }>
  > {
    const localInspect = await this.inspectSource(sourceId);
    if (!localInspect.ok) {
      return fail(localInspect.errors, localInspect.warnings);
    }

    const { source, summary, leafs } = localInspect.data;
    const canonicalRepo = normalizeImportCanonicalRepo(source.locator)
      ?? (source.originLocator ? normalizeImportCanonicalRepo(source.originLocator) : undefined);
    const [sourceMetadata, sourceSnapshot] = await Promise.all([
      this.resolveSourceMetadata(source, summary.lock),
      canonicalRepo
        ? this.resolveImportSourceSnapshot(canonicalRepo, {
            enrichSkillIds: leafs.map((leaf) => leaf.linkName),
          }).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);

    return ok({ sourceMetadata, ...(sourceSnapshot ? { sourceSnapshot } : {}) });
  }

  private async inspectCollectionImpl(
    collectionId: string,
  ): Promise<Result<{ collection: SkillCollectionRecord; diagnostics: Diagnostic[] }>> {
    const state = await this.stateStore.readState();
    const collection = state.collections.collections[collectionId];
    if (!collection) {
      return fail({
        code: "COLLECTION_NOT_FOUND",
        message: `Collection '${collectionId}' is not registered.`,
      });
    }

    const diagnostics: Diagnostic[] = [];
    for (const member of collection.members) {
      const originLeaf = state.lockFile.leafInventory.find((leaf) =>
        leaf.sourceId === member.origin.sourceId && leaf.id === member.origin.leafId
      );
      if (!originLeaf) {
        diagnostics.push({
          code: "COLLECTION_ORIGIN_MISSING",
          message: `Collection origin '${member.origin.sourceId}:${member.origin.leafId}' is missing.`,
          retryable: false,
          details: {
            sourceId: member.origin.sourceId,
            leafId: member.origin.leafId,
            repoPath: member.origin.repoPath,
          },
        });
        continue;
      }

      const currentHash = await hashDirectory(originLeaf.absolutePath).catch(() => undefined);
      if (!currentHash) {
        diagnostics.push({
          code: "COLLECTION_ORIGIN_UNAVAILABLE",
          message: `Collection origin '${member.origin.sourceId}:${member.origin.leafId}' is unavailable.`,
          retryable: true,
          details: {
            sourceId: member.origin.sourceId,
            leafId: member.origin.leafId,
            repoPath: member.origin.repoPath,
          },
        });
        continue;
      }

      if (currentHash !== member.origin.contentHashAtCapture) {
        diagnostics.push({
          code: "COLLECTION_ORIGIN_HASH_CHANGED",
          message: `Collection origin '${member.origin.sourceId}:${member.origin.leafId}' changed after capture.`,
          retryable: false,
          details: {
            sourceId: member.origin.sourceId,
            leafId: member.origin.leafId,
            repoPath: member.origin.repoPath,
            capturedHash: member.origin.contentHashAtCapture,
            currentHash,
          },
        });
      }
    }

    return ok({ collection, diagnostics });
  }

  private async listRecommendedImportGroupsImpl(): Promise<Result<{ groups: ImportGroupCandidate[] }>> {
    const manifest = await this.readManifestConsistently();
    const installedRepos = this.installedCanonicalRepos(manifest);
    const recommendedRepos = await this.resolveRecommendedImportRepos();
    const importCache = await this.store.readImportDataCache();
    const groups = recommendedRepos
      .slice(0, 8)
      .map((canonicalRepo) =>
        this.buildImmediateImportGroupCandidate(importCache, canonicalRepo, {
          installed: installedRepos.has(canonicalRepo),
        }),
      );

    this.prewarmImportPreviewSnapshots(groups, importCache);

    return ok({ groups });
  }

  private async scanLocalImportGroupsImpl(
    localPath?: string,
  ): Promise<Result<{ groups: ImportGroupCandidate[]; localScanGroups: LocalScanGroup[] }>> {
    try {
      const { manifest, lockFile } = await this.readRuntimeAuthorityView();
      const scanned = localPath
        ? await this.scanSingleLocalImportSkill(localPath, manifest, lockFile)
        : await this.workspaceBootstrapService.scanUnmanagedLocalSkills(
          manifest,
          lockFile,
        );
      const installedRepos = this.installedCanonicalRepos(manifest);
      const groupsByKey = new Map<string, LocalSkillScanResult[]>();

      for (const skill of scanned) {
        const canonicalRepo = skill.originLocator
          ? normalizeImportCanonicalRepo(skill.originLocator)
          : undefined;
        const key = canonicalRepo ? `origin:${canonicalRepo}` : `local:${skill.sourceId}`;
        const current = groupsByKey.get(key) ?? [];
        current.push(skill);
        groupsByKey.set(key, current);
      }

      const groupBatches = await this.mapConcurrent(
        [...groupsByKey.entries()],
        SkillFlowApp.importGroupResolveConcurrency,
        async ([key, skills]) => {
          if (key.startsWith("origin:")) {
            return this.buildOriginLocalImportGroups(
              key.slice("origin:".length),
              skills,
              installedRepos,
              manifest,
              lockFile,
            );
          }
          return [this.buildLocalImportFallbackGroup(skills[0]!)];
        },
      );
      const groups = groupBatches.flat();
      const localScanGroups = await this.buildLocalScanGroups(scanned, manifest, lockFile);

      return ok({
        groups: groups.sort((left, right) => left.title.localeCompare(right.title)),
        localScanGroups: localScanGroups.sort((left, right) => left.title.localeCompare(right.title)),
      });
    } catch (error) {
      return fail({
        code: "LOCAL_IMPORT_SCAN_FAILED",
        message: `Unable to scan local import groups: ${String(error)}`,
      });
    }
  }

  private async scanSingleLocalImportSkill(
    localPath: string,
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Promise<LocalSkillScanResult[]> {
    const resolvedPath = await this.resolveLocalImportSkillPath(localPath);
    if (!resolvedPath) {
      throw new Error(`Local skill path must be a directory containing SKILL.md: ${localPath}`);
    }

    const unmanagedSkills = await this.workspaceBootstrapService.scanUnmanagedLocalSkills(
      manifest,
      lockFile,
    );
    const matchedUnmanagedSkill = unmanagedSkills.find((skill) => skill.path === resolvedPath);
    if (matchedUnmanagedSkill) {
      return [matchedUnmanagedSkill];
    }

    const metadata = await this.readLocalImportSkillMetadata(path.join(resolvedPath, "SKILL.md"));
    const displayName = path.basename(resolvedPath);
    const observedTargets = await this.detectLocalImportObservedTargets(resolvedPath);
    return [{
      path: resolvedPath,
      displayName,
      sourceId: deriveSourceId(resolvedPath),
      contentHash: await hashDirectory(resolvedPath),
      importedFromTargets: observedTargets.map((target) => target.target),
      observedTargets,
      title: metadata.title || displayName,
      description: metadata.description,
    }];
  }

  private async resolveLocalImportSkillPath(localPath: string): Promise<string | undefined> {
    const trimmed = this.stripImportLocatorQuotes(localPath.trim());
    if (!trimmed) {
      return undefined;
    }
    const expanded = trimmed.startsWith("~/")
      ? path.join(process.env.HOME ?? os.homedir(), trimmed.slice(2))
      : trimmed;
    const resolvedPath = path.resolve(expanded.startsWith("file://")
      ? decodeURIComponent(new URL(trimmed).pathname)
      : expanded);
    const stats = await fs.stat(resolvedPath).catch(() => undefined);
    if (!stats?.isDirectory()) {
      return undefined;
    }
    if (!(await pathExists(path.join(resolvedPath, "SKILL.md")))) {
      return undefined;
    }
    return await fs.realpath(resolvedPath).catch(() => resolvedPath);
  }

  private async detectLocalImportObservedTargets(skillPath: string): Promise<LocalSkillScanResult["observedTargets"]> {
    const observedTargets: LocalSkillScanResult["observedTargets"] = [];
    for (const target of TARGET_ORDER) {
      for (const rootPath of getTargetScanRoots(target).map((root) => path.resolve(root))) {
        const relative = path.relative(rootPath, skillPath);
        if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
          observedTargets.push({
            target,
            rootPath,
            targetPath: skillPath,
          });
        }
      }
    }
    return observedTargets;
  }

  private async readLocalImportSkillMetadata(
    skillFilePath: string,
  ): Promise<{ title: string; description: string }> {
    const content = (await fs.readFile(skillFilePath, "utf8")).replace(/\r\n?/g, "\n");
    const frontmatter = parseSkillFrontmatter(content);
    const title = frontmatter?.data.name?.trim() ?? "";
    const description = frontmatter?.data.description?.trim() ?? "";
    return { title, description };
  }

  private async buildOriginLocalImportGroups(
    canonicalRepo: string,
    localSkills: LocalSkillScanResult[],
    installedRepos: Set<string>,
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Promise<ImportGroupCandidate[]> {
    const normalizedRepo = normalizeImportCanonicalRepo(canonicalRepo) ?? canonicalRepo;
    const originLocator = `https://github.com/${normalizedRepo}.git`;
    const preview = await this.previewGitHubImportSource(normalizedRepo);
    const readyPreview = preview?.ok && preview.data.status === "ready" ? preview.data : undefined;
    const detectedSkills = readyPreview
      ? localSkills.map((skill) => this.buildValidatedLocalImportSkill(skill, readyPreview.skills))
      : localSkills.map((skill) => this.buildUnavailableLocalImportSkill(skill));
    const validationStatus = this.aggregateLocalImportValidationStatus(detectedSkills);
    const importableOriginSkillIds = detectedSkills.flatMap((detectedSkill, index) => {
      const localSkill = localSkills[index];
      if (
        !localSkill ||
        !detectedSkill.originSkillId ||
        this.isLocalScanOriginAlreadyManaged(localSkill, detectedSkill, normalizedRepo, manifest, lockFile)
      ) {
        return [];
      }
      return [detectedSkill.originSkillId];
    });
    const selectedChoiceId = validationStatus === "matched" && importableOriginSkillIds.length > 0
      ? "origin"
      : "local";
    if (validationStatus !== "matched" && localSkills.length > 1) {
      return localSkills.map((skill, index) =>
        this.buildLocalImportFallbackGroup(skill, detectedSkills[index]),
      );
    }

    const matchedSkills = detectedSkills.map((skill) => ({
      skillId: skill.originSkillId ?? skill.id,
      title: skill.title,
    }));
    const originLocalImportChoices: LocalImportChoice[] = validationStatus === "matched" && importableOriginSkillIds.length > 0
      ? [{
          sourceChoiceId: "origin",
          sourceChoiceAlias: "Origin",
          label: "Origin",
          locator: originLocator,
          detectedSourcePath: localSkills[0]?.path ?? originLocator,
          variant: localSkills.length === 1 ? "single-skill" : "multi-skill",
          selectedSkills: this.importSkillSelectionsForRepoPaths(importableOriginSkillIds),
          enabledTargets: [],
        }]
      : [];
    const installed = originLocalImportChoices.length > 0
      ? false
      : installedRepos.has(normalizedRepo);

    return [{
      id: normalizedRepo,
      provider: "skills",
      locator: normalizedRepo,
      canonicalRepo: normalizedRepo,
      aliases: buildImportGroupCandidate({
        canonicalRepo: normalizedRepo,
        installed,
      }).aliases,
      title: normalizedRepo.split("/")[1] ?? normalizedRepo,
      installed,
      matchedSkillNames: localSkills.map((skill) => skill.title),
      matchedSkills,
      enrichState: { status: readyPreview ? "ready" : "idle" },
      localImport: {
        validationStatus,
        selectedChoiceId,
        choices: [
          ...originLocalImportChoices,
          ...(localSkills.length === 1 ? [this.buildLocalImportChoice(localSkills)] : []),
        ],
        detectedSkills,
      },
    }];
  }

  private localScanSkillGroupKey(item: LocalScanResolvedSkill): string {
    if (item.canonicalRepo && item.detected.originSkillId) {
      return `origin-skill:${item.canonicalRepo}:${item.detected.originSkillId}`;
    }
    const titleKey = (item.scan.title || item.scan.displayName).trim().toLowerCase();
    const dirKey = path.basename(item.scan.path).trim().toLowerCase();
    return `local-skill:${titleKey}:${dirKey}`;
  }

  private localScanGroupStatus(statuses: LocalScanGroupStatus[]): LocalScanGroupStatus {
    if (statuses.every((status) => status === "already-managed")) return "already-managed";
    if (statuses.includes("version-conflict")) return "version-conflict";
    if (statuses.includes("origin-unavailable")) return "origin-unavailable";
    if (statuses.includes("ambiguous")) return "ambiguous";
    if (statuses.includes("changed")) return "changed";
    if (statuses.includes("missing")) return "missing";
    if (statuses.every((status) => status === "matched" || status === "already-managed")) return "matched";
    return "local-only";
  }

  private buildLocalScanGroupFromResolved(
    groupId: string,
    items: LocalScanResolvedSkill[],
    alreadyManagedByPath: Map<string, boolean>,
  ): LocalScanGroup {
    const first = items[0]!;
    const canonicalRepo = first.canonicalRepo;
    const originLocator = canonicalRepo
      ? first.originLocator ?? `https://github.com/${canonicalRepo}.git`
      : undefined;
    const alreadyManaged = items.every((item) => alreadyManagedByPath.get(item.scan.path) ?? false);
    const status = this.resolveLocalScanSkillStatus(items, alreadyManaged);
    const usesOriginSkillId = status === "matched"
      || status === "already-managed"
      || status === "version-conflict";
    const skillId = usesOriginSkillId
      ? first.detected.originSkillId ?? first.detected.id
      : first.detected.id;
    const title = first.detected.title || first.scan.title || first.scan.displayName;
    const variants = this.buildLocalScanSkillVariants(items, status, alreadyManagedByPath, skillId);
    const sourcePathsByKey = new Map<string, ReturnType<typeof this.localScanSourcePath>>();
    for (const item of items) {
      const sourcePath = this.localScanSourcePath(
        item.scan,
        alreadyManagedByPath.get(item.scan.path) ?? false,
      );
      sourcePathsByKey.set(`${sourcePath.path}:${sourcePath.contentHash}`, sourcePath);
    }

    return {
      id: canonicalRepo ? groupId : `local:${first.scan.sourceId}`,
      title: canonicalRepo ? canonicalRepo.split("/")[1] ?? canonicalRepo : title,
      status,
      sourcePaths: [...sourcePathsByKey.values()],
      skills: [{
        id: skillId,
        title,
        status,
        variants,
        selectionRequired: status === "version-conflict" || status === "changed" || status === "ambiguous",
        ...(first.detected.originSkillId ? { originSkillId: first.detected.originSkillId } : {}),
      }],
      importChoices: this.buildLocalScanImportChoices({
        status,
        canonicalRepo,
        originLocator,
        skillIds: [skillId],
        localSkills: items.map((item) => item.scan),
        alreadyManaged,
      }),
      ...(canonicalRepo && originLocator
        ? {
            origin: {
              canonicalRepo,
              locator: originLocator,
              previewStatus: first.previewStatus,
            },
          }
        : {}),
    };
  }

  private resolveLocalScanSkillStatus(
    items: LocalScanResolvedSkill[],
    alreadyManaged: boolean,
  ): LocalScanGroupStatus {
    if (alreadyManaged) {
      return "already-managed";
    }
    const contentHashes = new Set(items.map((item) => item.scan.contentHash));
    if (contentHashes.size > 1) {
      return "version-conflict";
    }
    return this.aggregateLocalImportValidationStatus(
      items.map((item) => item.detected),
    );
  }

  private buildLocalScanSkillVariants(
    items: LocalScanResolvedSkill[],
    status: LocalScanGroupStatus,
    alreadyManagedByPath: Map<string, boolean>,
    skillId: string,
  ): LocalScanSkillVariant[] {
    const variantsByHash = new Map<string, LocalScanSkillVariant>();
    for (const item of items) {
      if (variantsByHash.has(item.scan.contentHash)) {
        continue;
      }
      const alreadyManaged = alreadyManagedByPath.get(item.scan.path) ?? false;
      variantsByHash.set(item.scan.contentHash, {
        id: `${skillId}:${item.scan.contentHash}`,
        path: item.scan.path,
        contentHash: item.scan.contentHash,
        selectedByDefault: false,
        importable: !alreadyManaged,
      });
    }
    const variants = [...variantsByHash.values()];
    if (
      variants.length === 1
      && variants[0]?.importable
      && status !== "version-conflict"
    ) {
      variants[0] = { ...variants[0]!, selectedByDefault: true };
    }
    return variants;
  }

  private buildLocalScanImportChoices(options: {
    status: LocalScanGroupStatus;
    canonicalRepo: string | undefined;
    originLocator: string | undefined;
    skillIds: string[];
    localSkills: LocalSkillScanResult[];
    alreadyManaged: boolean;
  }): LocalScanImportChoice[] {
    if (options.status === "version-conflict" || options.alreadyManaged) {
      return [];
    }
    if (options.status === "matched" && options.canonicalRepo && options.originLocator) {
      const originChoice: LocalScanImportChoice = {
        scanId: options.canonicalRepo,
        sourceChoiceId: "origin",
        rootPath: options.originLocator,
        sourcePath: options.originLocator,
        variant: options.localSkills.length > 1 ? "multi-source" : "single-source",
        detectedSkills: options.localSkills.map((skill) => this.localScanDetectedSkill(skill)),
        selectedSkills: this.importSkillSelectionsForRepoPaths(options.skillIds),
        enabledTargets: [],
      };
      if (options.localSkills.length === 1) {
        const localSkill = options.localSkills[0]!;
        return [{
          scanId: options.canonicalRepo,
          sourceChoiceId: "local",
          rootPath: localSkill.path,
          sourcePath: localSkill.path,
          variant: "single-source",
          detectedSkills: [this.localScanDetectedSkill(localSkill)],
          selectedSkills: this.importSkillSelectionsForRepoPaths([localSkill.displayName]),
          enabledTargets: [],
        }, originChoice];
      }
      return [originChoice];
    }
    const localSkill = options.localSkills[0];
    return [{
      scanId: localSkill?.sourceId ?? "local",
      sourceChoiceId: "local",
      rootPath: localSkill?.path ?? "",
      sourcePath: localSkill?.path ?? "",
      variant: options.localSkills.length > 1 ? "multi-source" : "single-source",
      detectedSkills: options.localSkills.map((skill) => this.localScanDetectedSkill(skill)),
      selectedSkills: this.importSkillSelectionsForRepoPaths(options.localSkills.map((skill) => skill.displayName)),
      enabledTargets: [],
    }];
  }

  private buildMergedLocalScanImportChoices(skillGroups: LocalScanGroup[]): LocalScanImportChoice[] {
    const firstOrigin = skillGroups[0]?.origin;
    const importableSkillIds = skillGroups
      .filter((group) =>
        group.status === "matched" &&
        group.importChoices.some((choice) => choice.sourceChoiceId === "origin"),
      )
      .flatMap((group) => group.skills.map((skill) => skill.originSkillId ?? skill.id));
    if (
      firstOrigin &&
      importableSkillIds.length > 0 &&
      skillGroups.every((group) =>
        group.origin?.canonicalRepo === firstOrigin.canonicalRepo &&
        (
          group.status === "already-managed" ||
          (
            group.status === "matched" &&
            group.importChoices.some((choice) => choice.sourceChoiceId === "origin")
          )
        ),
      )
    ) {
      return [{
        scanId: firstOrigin.canonicalRepo,
        sourceChoiceId: "origin",
        rootPath: firstOrigin.locator,
        sourcePath: firstOrigin.locator,
        variant: "multi-source",
        detectedSkills: skillGroups.flatMap((group) =>
          group.skills.flatMap((skill) =>
            skill.variants.map((variant) => ({
              leafId: skill.originSkillId ?? skill.id,
              sourcePath: variant.path,
              skillFilePath: path.join(variant.path, "SKILL.md"),
              relativePath: skill.originSkillId ?? skill.id,
              displayName: skill.title,
              contentHash: variant.contentHash,
              selector: {
                kind: "repoPath" as const,
                path: skill.originSkillId ?? skill.id,
              },
            })),
          ),
        ),
        selectedSkills: this.importSkillSelectionsForRepoPaths(importableSkillIds),
        enabledTargets: [],
      }];
    }

    return [];
  }

  private async buildLocalScanGroups(
    scanned: LocalSkillScanResult[],
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Promise<LocalScanGroup[]> {
    const resolved = await this.mapConcurrent(
      scanned,
      SkillFlowApp.importGroupResolveConcurrency,
      async (skill) => this.resolveLocalScanSkill(skill),
    );
    const alreadyManagedByPath = new Map(
      resolved.map((item) => [
        item.scan.path,
        this.isLocalScanAlreadyManaged(item, manifest, lockFile),
      ]),
    );
    const groupsByKey = new Map<string, LocalScanResolvedSkill[]>();

    for (const item of resolved) {
      const key = item.canonicalRepo
        ? `origin:${item.canonicalRepo}`
        : this.localScanSkillGroupKey(item);
      const current = groupsByKey.get(key) ?? [];
      current.push(item);
      groupsByKey.set(key, current);
    }

    return [...groupsByKey.entries()].flatMap(([groupId, groupItems]) => {
      const skillGroupsByKey = new Map<string, LocalScanResolvedSkill[]>();
      for (const item of groupItems) {
        const skillGroupKey = this.localScanSkillGroupKey(item);
        const current = skillGroupsByKey.get(skillGroupKey) ?? [];
        current.push(item);
        skillGroupsByKey.set(skillGroupKey, current);
      }

      const skillGroups = [...skillGroupsByKey.entries()].map(([skillGroupId, skillGroupItems]) => {
        const baseGroupId = groupId.startsWith("origin:")
          ? groupId.slice("origin:".length)
          : skillGroupId;
        const localScanGroupId = groupId.startsWith("origin:") && skillGroupsByKey.size > 1
          ? `${baseGroupId}:${skillGroupId}`
          : baseGroupId;
        return this.buildLocalScanGroupFromResolved(
          localScanGroupId,
          skillGroupItems,
          alreadyManagedByPath,
        );
      });
      if (skillGroups.length === 1) {
        return [skillGroups[0]!];
      }

      const importChoices = this.buildMergedLocalScanImportChoices(skillGroups);
      if (importChoices.length === 0) {
        return skillGroups;
      }

      const firstGroup = skillGroups[0]!;
      return [{
        id: groupId.startsWith("origin:") ? groupId.slice("origin:".length) : groupId,
        title: firstGroup.origin?.canonicalRepo.split("/")[1]
          ?? firstGroup.origin?.canonicalRepo
          ?? firstGroup.title,
        status: this.localScanGroupStatus(skillGroups.map((group) => group.status)),
        sourcePaths: skillGroups.flatMap((group) => group.sourcePaths),
        skills: skillGroups.flatMap((group) => group.skills),
        importChoices,
        ...(firstGroup.origin ? { origin: firstGroup.origin } : {}),
      }];
    });
  }

  private async resolveLocalScanSkill(skill: LocalSkillScanResult): Promise<LocalScanResolvedSkill> {
    const canonicalRepo = skill.originLocator
      ? normalizeImportCanonicalRepo(skill.originLocator)
      : undefined;
    if (!canonicalRepo) {
      return {
        scan: skill,
        detected: {
          id: skill.displayName,
          title: skill.title || skill.displayName,
          localPath: skill.path,
          discoveredTargets: skill.importedFromTargets,
          validationStatus: "local-only",
        },
        previewStatus: "failed",
      };
    }

    const preview = await this.previewGitHubImportSource(canonicalRepo);
    const readyPreview = preview?.ok && preview.data.status === "ready" ? preview.data : undefined;
    return {
      scan: skill,
      detected: readyPreview
        ? this.buildValidatedLocalImportSkill(skill, readyPreview.skills)
        : this.buildUnavailableLocalImportSkill(skill),
      canonicalRepo,
      originLocator: skill.originLocator ?? `https://github.com/${canonicalRepo}.git`,
      previewStatus: readyPreview ? "ready" : "failed",
    };
  }

  private isLocalScanAlreadyManaged(
    item: LocalScanResolvedSkill,
    manifest: ManifestFile,
    lockFile: LockFile,
  ): boolean {
    const resolvedSkillPath = path.resolve(item.scan.path);

    return manifest.sources.some((source) => {
      if (source.kind === "local" && path.resolve(source.locator) === resolvedSkillPath) {
        return true;
      }

      const sourceRepo = normalizeImportCanonicalRepo(source.locator)
        ?? normalizeImportCanonicalRepo(source.canonicalLocator);
      if (!sourceRepo || !item.canonicalRepo || sourceRepo !== item.canonicalRepo) {
        return false;
      }

      return this.isLocalScanOriginSkillManaged(
        source.id,
        item.scan,
        item.detected,
        manifest,
        lockFile,
      );
    });
  }

  private isLocalScanOriginAlreadyManaged(
    localSkill: LocalSkillScanResult,
    detectedSkill: LocalImportDetectedSkill,
    canonicalRepo: string,
    manifest: ManifestFile,
    lockFile: LockFile,
  ): boolean {
    return manifest.sources.some((source) => {
      const sourceRepo = normalizeImportCanonicalRepo(source.locator)
        ?? normalizeImportCanonicalRepo(source.canonicalLocator);
      if (!sourceRepo || sourceRepo !== canonicalRepo) {
        return false;
      }
      return this.isLocalScanOriginSkillManaged(
        source.id,
        localSkill,
        detectedSkill,
        manifest,
        lockFile,
      );
    });
  }

  private isLocalScanOriginSkillManaged(
    sourceId: string,
    localSkill: LocalSkillScanResult,
    detectedSkill: LocalImportDetectedSkill,
    manifest: ManifestFile,
    lockFile: LockFile,
  ): boolean {
    const source = manifest.sources.find((record) => record.id === sourceId);
    const sourceLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const binding = manifest.bindings[sourceId];
    const selectedLeafIds = binding?.selectionMode === "all"
      ? lockFile.sources[sourceId]?.leafIds ?? []
      : binding?.selectedLeafIds ?? [];
    if (
      binding?.selectionMode === "all" ||
      (sourceLeafs.length > 0 && selectedLeafIds.length >= sourceLeafs.length)
    ) {
      return true;
    }

    const selectedLeafs = sourceLeafs.filter((leaf) => selectedLeafIds.includes(leaf.id));
    const candidates = this.localScanManagedSkillCandidates(localSkill, detectedSkill);
    return selectedLeafs.some((leaf) =>
      candidates.has(leaf.relativePath) ||
      candidates.has(leaf.title) ||
      candidates.has(leaf.linkName) ||
      candidates.has(path.posix.basename(leaf.relativePath)),
    );
  }

  private localScanManagedSkillCandidates(
    localSkill: LocalSkillScanResult,
    detectedSkill: LocalImportDetectedSkill,
  ): Set<string> {
    return new Set(
      [
        detectedSkill.originSkillId,
        localSkill.originRequestedPath,
        localSkill.displayName,
        path.basename(localSkill.path),
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    );
  }

  private localScanSourceKind(skill: LocalSkillScanResult): "target-agent" | "manual" {
    return skill.observedTargets.length > 0 ? "target-agent" : "manual";
  }

  private localScanSourcePath(skill: LocalSkillScanResult, alreadyManaged: boolean) {
    return {
      path: skill.path,
      kind: this.localScanSourceKind(skill),
      ...(skill.importedFromTargets[0] ? { target: skill.importedFromTargets[0] } : {}),
      contentHash: skill.contentHash,
      alreadyManaged,
    };
  }

  private buildLocalImportFallbackGroup(
    skill: LocalSkillScanResult,
    detectedSkill?: LocalImportDetectedSkill,
  ): ImportGroupCandidate {
    const canonicalRepo = `local:${skill.sourceId}`;
    const fallbackDetectedSkill = detectedSkill ?? {
      id: skill.displayName,
      title: skill.title || skill.displayName,
      localPath: skill.path,
      discoveredTargets: skill.importedFromTargets,
      validationStatus: "local-only" as const,
    };
    return {
      id: canonicalRepo,
      provider: "local",
      locator: skill.path,
      canonicalRepo,
      aliases: [skill.path, `file://${skill.path}`],
      title: skill.title || skill.displayName,
      installed: false,
      ...(skill.description ? { summary: skill.description } : {}),
      matchedSkillNames: [skill.title || skill.displayName],
      matchedSkills: [{ skillId: skill.displayName, title: skill.title || skill.displayName }],
      enrichState: { status: "idle" },
      localImport: {
        validationStatus: fallbackDetectedSkill.validationStatus,
        selectedChoiceId: "local",
        choices: [this.buildLocalImportChoice([skill])],
        detectedSkills: [fallbackDetectedSkill],
      },
    };
  }

  private buildLocalImportChoice(localSkills: LocalSkillScanResult[]): LocalImportChoice {
    const localPath = localSkills[0]?.path ?? "";
    return {
      sourceChoiceId: "local" as const,
      sourceChoiceAlias: "Local",
      label: "Local",
      locator: localPath,
      detectedSourcePath: localPath,
      variant: localSkills.length > 1 ? "multi-skill" : "single-skill",
      selectedSkills: this.importSkillSelectionsForRepoPaths(localSkills.map((skill) => skill.displayName)),
      enabledTargets: [],
    };
  }

  private localScanDetectedSkill(skill: LocalSkillScanResult) {
    return {
      leafId: skill.sourceId,
      sourcePath: skill.path,
      skillFilePath: path.join(skill.path, "SKILL.md"),
      relativePath: skill.displayName,
      displayName: skill.title || skill.displayName,
      contentHash: skill.contentHash,
      selector: {
        kind: "repoPath" as const,
        path: skill.displayName,
      },
    };
  }

  private importSkillSelectionsForRepoPaths(paths: string[]): RuntimeImportSkillSelection[] {
    return [...new Set(paths)].map((path) => ({
      uiId: path,
      selector: {
        kind: "repoPath" as const,
        path,
      },
    }));
  }

  private buildUnavailableLocalImportSkill(skill: LocalSkillScanResult): LocalImportDetectedSkill {
    return {
      id: skill.displayName,
      title: skill.title || skill.displayName,
      localPath: skill.path,
      discoveredTargets: skill.importedFromTargets,
      validationStatus: "origin-unavailable",
    };
  }

  private buildValidatedLocalImportSkill(
    skill: LocalSkillScanResult,
    originSkills: ImportPreviewSkillCandidate[],
  ): LocalImportDetectedSkill {
    const matches = this.matchLocalImportOriginSkills(skill, originSkills);
    if (matches.length === 0) {
      return {
        id: skill.displayName,
        title: skill.title || skill.displayName,
        localPath: skill.path,
        discoveredTargets: skill.importedFromTargets,
        validationStatus: "missing",
      };
    }
    if (matches.length > 1) {
      return {
        id: skill.displayName,
        title: skill.title || skill.displayName,
        localPath: skill.path,
        discoveredTargets: skill.importedFromTargets,
        validationStatus: "ambiguous",
      };
    }

    const match = matches[0]!;
    const validationStatus = this.localImportSkillChanged(skill, match) ? "changed" : "matched";
    return {
      id: skill.displayName,
      title: skill.title || skill.displayName,
      localPath: skill.path,
      discoveredTargets: skill.importedFromTargets,
      validationStatus,
      originSkillId: match.providerSkillId,
    };
  }

  private matchLocalImportOriginSkills(
    skill: LocalSkillScanResult,
    originSkills: ImportPreviewSkillCandidate[],
  ): ImportPreviewSkillCandidate[] {
    const originRequestedPath = skill.originRequestedPath?.trim();
    if (originRequestedPath) {
      const matches = originSkills.filter((originSkill) =>
        originSkill.providerSkillId === originRequestedPath ||
        originSkill.selector.path === originRequestedPath ||
        originSkill.selectorAliases.includes(originRequestedPath)
      );
      if (matches.length > 0) {
        return matches;
      }
    }

    const localDirectoryName = path.basename(skill.path);
    const leafMatches = originSkills.filter((originSkill) => {
      const ids = [
        originSkill.providerSkillId,
        originSkill.selector.path,
        ...originSkill.selectorAliases,
      ];
      return ids.some((id) => id === localDirectoryName || id.endsWith(`/${localDirectoryName}`));
    });
    if (leafMatches.length > 0) {
      return leafMatches;
    }

    const normalizedLocalTitle = skill.title.trim().toLowerCase();
    if (normalizedLocalTitle) {
      const titleMatches = originSkills.filter(
        (originSkill) => originSkill.title.trim().toLowerCase() === normalizedLocalTitle,
      );
      if (titleMatches.length > 0) {
        return titleMatches;
      }
    }

    return originSkills.filter((originSkill) =>
      originSkill.providerSkillId === skill.displayName ||
      originSkill.selector.path === skill.displayName ||
      originSkill.selectorAliases.includes(skill.displayName)
    );
  }

  private localImportSkillChanged(
    skill: LocalSkillScanResult,
    originSkill: ImportPreviewSkillCandidate,
  ): boolean {
    if (originSkill.contentHash && skill.contentHash !== originSkill.contentHash) {
      return true;
    }
    const localTitle = skill.title.trim();
    return Boolean(localTitle && originSkill.title.trim() && localTitle !== originSkill.title.trim());
  }

  private aggregateLocalImportValidationStatus(
    detectedSkills: LocalImportDetectedSkill[],
  ): LocalImportValidationStatus {
    if (detectedSkills.every((skill) => skill.validationStatus === "matched")) {
      return "matched";
    }
    for (const status of ["origin-unavailable", "ambiguous", "changed", "missing"] as const) {
      if (detectedSkills.some((skill) => skill.validationStatus === status)) {
        return status;
      }
    }
    return "local-only";
  }

  private async searchImportGroupsImpl(
    query: string,
  ): Promise<Result<{ groups: ImportGroupCandidate[]; exact: boolean }>> {
    try {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        const recommended = await this.listRecommendedImportGroupsImpl();
        if (!recommended.ok) {
          return fail(recommended.errors, recommended.warnings);
        }
        return ok({ groups: recommended.data.groups, exact: false }, recommended.warnings);
      }

      const manifest = await this.readManifestConsistently();
      const installedRepos = this.installedCanonicalRepos(manifest);
      const importCache = await this.store.readImportDataCache();
      const directCandidate = await this.buildDirectImportGroupCandidate(
        normalizedQuery,
        manifest,
      );
      if (directCandidate) {
        return ok({
          groups: [directCandidate],
          exact: true,
        });
      }
      const exactLocator = this.parseGitHubImportLocator(normalizedQuery);
      const exactRepo = exactLocator?.canonicalRepo;
      if (exactRepo) {
        try {
          const details = await fetchSkillsDirectorySourceDetails(exactRepo);
          const matchedSkillNames = this.importLocatorMatchedSkillNames(exactLocator);
          return ok({
            groups: [
              {
                id: exactRepo,
                provider: "skills",
                locator: exactLocator.originalLocator,
                canonicalRepo: exactRepo,
                aliases: [
                  exactLocator.originalLocator,
                  exactRepo,
                  `https://github.com/${exactRepo}`,
                  `https://github.com/${exactRepo}.git`,
                  `git@github.com:${exactRepo}.git`,
                ].filter((value, index, values) => values.indexOf(value) === index),
                title: details.repoLabel?.split("/")[1] ?? exactRepo.split("/")[1] ?? exactRepo,
                installed: installedRepos.has(exactRepo),
                ...(details.description ? { summary: details.description } : {}),
                ...(details.sourceUrl ? { sourceUrl: details.sourceUrl } : {}),
                ...(details.repoUrl ? { repoUrl: details.repoUrl } : {}),
                ...(details.starCount !== undefined ? { starCount: details.starCount } : {}),
                ...(details.totalInstalls !== undefined ? { totalInstalls: details.totalInstalls } : {}),
                ...(matchedSkillNames.length ? { matchedSkillNames } : {}),
                enrichState: { status: "ready" as const },
              },
            ],
            exact: true,
          });
        } catch (error) {
          const matchedSkillNames = this.importLocatorMatchedSkillNames(exactLocator);
          const exactCandidate = this.buildImmediateImportGroupCandidate(importCache, exactRepo, {
            installed: installedRepos.has(exactRepo),
            ...(matchedSkillNames.length
              ? {
                  matchedSkills: matchedSkillNames.map((skillName) => ({
                    skillId: skillName,
                    title: skillName,
                  })),
                }
              : {}),
          });
          const resolvedExactCandidate = exactLocator.originalLocator !== exactRepo
            ? {
                ...exactCandidate,
                locator: exactLocator.originalLocator,
                aliases: [exactLocator.originalLocator, ...exactCandidate.aliases]
                  .filter((value, index, values) => values.indexOf(value) === index),
              }
            : exactCandidate;

          if (
            resolvedExactCandidate.enrichState.status === "ready" ||
            resolvedExactCandidate.enrichState.status === "failed" &&
              resolvedExactCandidate.enrichState.reasonCode !== "provider_data_unavailable"
          ) {
            return ok({ groups: [resolvedExactCandidate], exact: true });
          }

          return ok({
            groups: [
              {
                ...resolvedExactCandidate,
                enrichState: {
                  status: "failed",
                  reasonCode: this.inferImportReasonCode(error),
                  retryable: this.importFailureRetryable(error),
                },
              },
            ],
            exact: true,
          });
        }
      }

      const searchSnapshot = await this.resolveImportSearchSnapshot(normalizedQuery);
      const grouped = groupSkillsDirectorySearchHits(searchSnapshot.hits).slice(0, 8);
      const groups = grouped.map((group) =>
        this.buildImmediateImportGroupCandidate(importCache, group.canonicalRepo, {
          installed: installedRepos.has(group.canonicalRepo),
          matchedSkills: group.matchedSkills,
        }),
      );

      return ok({
        groups,
        exact: false,
      });
    } catch (error) {
      return fail({
        code: "IMPORT_SEARCH_FAILED",
        message: `Unable to search import groups: ${String(error)}`,
      });
    }
  }

  private async prepareImportSourceImpl(locator: string): Promise<Result<ImportPreparationResult>> {
    const githubLocator = this.parseGitHubImportLocator(locator);
    if (githubLocator) {
      return this.importPreparationService.prepareImportSource(githubLocator.locator, {
        project: false,
        ...(githubLocator.requestedPath ? { path: githubLocator.requestedPath } : {}),
      });
    }

    const directLocator = await this.resolveDirectImportLocator(locator);
    return this.importPreparationService.prepareImportSource(directLocator ?? locator.trim(), {
      project: false,
    });
  }

  private async commitPreparedImportSourceImpl(
    preparationId: string,
    draft?: ImportDraft,
    canonicalRepo?: string,
    localSkillPath?: string,
  ): Promise<Result<ImportSourceResult>> {
    const committed = await this.importPreparationService.commitPreparedImportSource(preparationId);
    if (!committed.ok) {
      return committed;
    }
    if (committed.data.status !== "ready") {
      return ok(committed.data, committed.warnings);
    }
    const committedData = committed.data;

    const { lockFile } = await this.readRuntimeAuthorityView();
    const sourceLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === committedData.sourceId);
    const availableTargets = await this.getAvailableTargets();
    const finalDraft = this.resolveImportDraftForPreparedSource(
      sourceLeafs,
      availableTargets,
      canonicalRepo ?? committedData.canonicalRepo,
      draft,
    );
    if (!finalDraft.ok) {
      await this.rollbackPreparedSourceInternal(committedData.sourceId);
      return ok({
        status: "failed",
        reasonCode: finalDraft.errors[0]?.code ?? "IMPORT_PREVIEW_INVALID",
        retryable: true,
      }, [...committed.warnings, ...finalDraft.warnings]);
    }

    const applied = await this.applyDraftImpl(committedData.sourceId, finalDraft.data, { kind: "global" });
    if (!applied.ok) {
      await this.rollbackPreparedSourceInternal(committedData.sourceId);
      return ok({
        status: "failed",
        reasonCode: applied.errors[0]?.code ?? "IMPORT_APPLY_FAILED",
        retryable: true,
      }, [...committed.warnings, ...finalDraft.warnings, ...applied.warnings]);
    }

    await this.replaceLocalImportWithManagedSymlink(localSkillPath, committedData.sourceId);

    return ok(committedData, [...committed.warnings, ...finalDraft.warnings, ...applied.warnings]);
  }

  private async previewImportSourceImpl(locator: string): Promise<Result<ImportPreviewResult>> {
    await this.stateStore.init();
    const githubLocator = this.parseGitHubImportLocator(locator);
    const canonicalRepo = githubLocator?.canonicalRepo;
    if (!canonicalRepo) {
      const localPreview = await this.previewDirectImportSource(locator);
      if (localPreview) {
        return localPreview;
      }

      return ok({
        status: "failed",
        reasonCode: "provider_not_supported",
        retryable: false,
      });
    }

    if (githubLocator.requestedPath) {
      const githubPreview = await this.previewGitHubImportSource(canonicalRepo, {
        requestedPath: githubLocator.requestedPath,
      });
      if (githubPreview) {
        return githubPreview;
      }
    }

    try {
      const snapshot = await this.resolveImportPreviewSnapshot(canonicalRepo);
      const availableTargets = await this.getAvailableTargets();
      const snapshotSkills = githubLocator.skillSelector
        ? this.filterImportSnapshotSkills(snapshot.skills, githubLocator.skillSelector, canonicalRepo)
        : snapshot.skills;
      if (githubLocator.skillSelector && snapshotSkills.length === 0) {
        const githubPreview = await this.previewGitHubImportSource(canonicalRepo, {
          skillSelector: githubLocator.skillSelector,
        });
        if (githubPreview) {
          return githubPreview;
        }
      }
      const sourceSelectionKey = `${canonicalRepo}#.`;
      const selectedSkills = snapshotSkills.map((skill) => {
        const selector = normalizeImportRepoPathSelector(skill.skillId);
        return {
          uiId: this.importPreviewUiId(sourceSelectionKey, selector.path),
          selector,
        };
      });
      return ok({
        status: "ready",
        version: 2,
        locator: githubLocator.locator,
        canonicalRepo,
        snapshot,
        selectedSkills,
        enabledTargets: [],
        skills: snapshotSkills.map((skill, index) => {
          const selection = selectedSkills[index]!;
          return {
            providerSkillId: skill.skillId,
            uiId: selection.uiId,
            title: skill.title,
            selector: selection.selector,
            origin: {
              provider: "github" as const,
              providerSkillId: skill.skillId,
              repoPath: selection.selector.path,
            },
            diagnostics: [],
            selectorAliases: [...new Set([skill.skillId, selection.selector.path])],
          };
        }),
        targets: availableTargets.map((target) => ({
          id: target,
          selectedByDefault: false,
        })),
      });
    } catch (error) {
      const githubPreview = await this.previewGitHubImportSource(canonicalRepo, {
        ...(githubLocator.skillSelector ? { skillSelector: githubLocator.skillSelector } : {}),
      });
      if (githubPreview) {
        return githubPreview;
      }

      return ok({
        status: "failed",
        reasonCode: this.inferImportReasonCode(error),
        retryable: this.importFailureRetryable(error),
      });
    }
  }

  private async importSourceImpl(
    locator: string,
    draft?: ImportDraft,
  ): Promise<Result<ImportSourceResult>> {
    const githubLocator = this.parseGitHubImportLocator(locator);
    const normalizedLocator = githubLocator?.locator ?? locator.trim();
    const localSkillPath = githubLocator
      ? undefined
      : await this.resolveLocalImportSkillPath(normalizedLocator);
    const preparation = await this.importPreparationService.prepareImportSource(normalizedLocator, {
      project: false,
      ...(githubLocator?.requestedPath ? { path: githubLocator.requestedPath } : {}),
    });
    const importDraft = draft ?? (githubLocator?.skillSelector
      ? {
          selectedSkills: [{
            uiId: this.importPreviewUiId(
              `${githubLocator.canonicalRepo}#${githubLocator.requestedPath ?? "."}`,
              normalizeImportRepoPathSelector(githubLocator.skillSelector).path,
            ),
            selector: normalizeImportRepoPathSelector(githubLocator.skillSelector),
          }],
          enabledTargets: [],
        }
      : undefined);
    const canonicalRepo = githubLocator?.canonicalRepo ?? normalizeImportCanonicalRepo(normalizedLocator);
    if (preparation.ok && preparation.data.status === "ready") {
      return this.commitPreparedImportSourceImpl(
        preparation.data.preparationId,
        importDraft,
        canonicalRepo,
        localSkillPath,
      );
    }

    const prepared = await this.prepareAddSourceImpl(normalizedLocator, {
      project: false,
      ...(githubLocator?.requestedPath ? { path: githubLocator.requestedPath } : {}),
    });
    if (!prepared.ok) {
      return ok({
        status: "failed",
        reasonCode: prepared.errors[0]?.code ?? "IMPORT_PREPARE_FAILED",
        retryable: true,
      });
    }

    const finalDraft = this.resolveImportDraftForPreparedSource(
      prepared.data.leafs,
      prepared.data.availableTargets,
      canonicalRepo,
      importDraft,
    );
    if (!finalDraft.ok) {
      await this.rollbackPreparedSourceInternal(prepared.data.sourceId);
      return ok({
        status: "failed",
        reasonCode: finalDraft.errors[0]?.code ?? "IMPORT_PREVIEW_INVALID",
        retryable: true,
      });
    }

    const applied = await this.applyDraftImpl(prepared.data.sourceId, finalDraft.data, { kind: "global" });
    if (!applied.ok) {
      await this.rollbackPreparedSourceInternal(prepared.data.sourceId);
      return ok({
        status: "failed",
        reasonCode: applied.errors[0]?.code ?? "IMPORT_APPLY_FAILED",
        retryable: true,
      }, [...finalDraft.warnings, ...applied.warnings]);
    }

    if (localSkillPath) {
      await this.replaceLocalImportWithManagedSymlink(localSkillPath, prepared.data.sourceId);
    }

    return ok({
      status: "ready",
      sourceId: prepared.data.sourceId,
      canonicalRepo: canonicalRepo ?? normalizedLocator,
    }, [...finalDraft.warnings, ...applied.warnings]);
  }

  private async replaceLocalImportWithManagedSymlink(
    localSkillPath: string | undefined,
    sourceId: string,
  ): Promise<void> {
    if (!localSkillPath) {
      return;
    }
    const isManagedByTargetRoot = await this.isLocalImportTargetPath(localSkillPath);
    if (!isManagedByTargetRoot) {
      return;
    }
    const { lockFile } = await this.readRuntimeAuthorityView();
    const source = lockFile.sources[sourceId];
    if (source?.localPath) {
      await createSymlink(source.localPath, localSkillPath);
    }
  }

  private async isLocalImportTargetPath(localSkillPath: string): Promise<boolean> {
    for (const target of TARGET_ORDER) {
      for (const root of getTargetScanRoots(target).map((root) => path.resolve(root))) {
        if (isPathInside(root, localSkillPath)) {
          return true;
        }
        const resolvedRoot = await fs.realpath(root).catch(() => root);
        const resolvedLocalSkillPath = await fs.realpath(localSkillPath).catch(() => localSkillPath);
        if (isPathInside(resolvedRoot, resolvedLocalSkillPath)) {
          return true;
        }
      }
    }
    return false;
  }

  private async resolveSourceMetadata(
    source: RuntimeManifestView["sources"][number],
    lock: WorkflowSummary["lock"],
  ): Promise<SourceMetadataResult> {
    const cachedEntry = (await this.store.readSourceMetadataCache())[source.id];
    if (cachedEntry) {
      if (!isSourceMetadataCacheExpired(cachedEntry)) {
        return sourceMetadataCacheEntryToResult(cachedEntry);
      }

      this.refreshSourceMetadataInBackground(source, lock, cachedEntry.provider);
      return sourceMetadataCacheEntryToResult(cachedEntry);
    }

    const metadataSource = this.sourceSummaryToMetadataSource(source);
    return this.refreshSourceMetadata(metadataSource, lock, inferSourceMetadataProvider(metadataSource));
  }

  private refreshSourceMetadataInBackground(
    source: RuntimeManifestView["sources"][number],
    lock: WorkflowSummary["lock"],
    providerHint?: SourceMetadataResult["provider"],
  ): void {
    if (this.metadataRefreshesBySourceId.has(source.id)) {
      return;
    }

    const refresh = this.refreshSourceMetadata(this.sourceSummaryToMetadataSource(source), lock, providerHint)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.metadataRefreshesBySourceId.delete(source.id);
      });

    this.metadataRefreshesBySourceId.set(source.id, refresh);
  }

  private async refreshSourceMetadata(
    source: SourceManifestRecord,
    lock: WorkflowSummary["lock"],
    providerHint?: SourceMetadataResult["provider"],
  ): Promise<SourceMetadataResult> {
    try {
      const sourceMetadata = await fetchFreshSourceMetadata(source, lock, providerHint);
      await this.store.writeSourceMetadataEntry(
        sourceMetadataResultToCacheEntry({
          sourceId: source.id,
          result: sourceMetadata,
          checkedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + SOURCE_METADATA_CACHE_TTL_MS).toISOString(),
        }),
      );
      return sourceMetadata;
    } catch (error) {
      const failedMetadata = buildFailedSourceMetadataResult(providerHint, error);
      await this.store.writeSourceMetadataEntry(
        sourceMetadataResultToCacheEntry({
          sourceId: source.id,
          result: failedMetadata,
          checkedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + SOURCE_METADATA_CACHE_TTL_MS).toISOString(),
        }),
      );
      return failedMetadata;
    }
  }

  private sourceSummaryToMetadataSource(source: SourceSummaryRecord): SourceManifestRecord {
    return {
      id: source.id,
      kind: source.kind,
      locator: source.locator,
      canonicalLocator: source.originLocator ?? source.locator,
      displayName: source.displayName,
      enabled: true,
      createdAt: source.addedAt,
      updatedAt: source.addedAt,
      ...(source.requestedPath ? { requestedPath: source.requestedPath } : {}),
      ...(source.originRequestedPath ? { originRequestedPath: source.originRequestedPath } : {}),
    };
  }

  private importRecommendationSeedRepos(): string[] {
    return [
      "anthropics/skills",
      "garrytan/gstack",
      "vercel-labs/agent-skills",
    ];
  }

  private installedCanonicalRepos(manifest: RuntimeManifestView | ManifestFile): Set<string> {
    return new Set(
      manifest.sources.flatMap((source) => {
        const canonicalRepo = normalizeImportCanonicalRepo(source.locator)
          ?? ("originLocator" in source && source.originLocator
            ? normalizeImportCanonicalRepo(source.originLocator)
            : "canonicalLocator" in source
              ? normalizeImportCanonicalRepo(source.canonicalLocator)
              : undefined);
        return canonicalRepo ? [canonicalRepo] : [];
      }),
    );
  }

  private buildImmediateImportGroupCandidate(
    importCache: ImportDataCache,
    canonicalRepo: string,
    options: {
      installed: boolean;
      matchedSkills?: Array<{
        skillId: string;
        title: string;
        installs?: number;
      }>;
    },
  ): ImportGroupCandidate {
    const normalizedRepo = normalizeImportCanonicalRepo(canonicalRepo) ?? canonicalRepo;
    const cachedRepo = importCache.repos?.[normalizedRepo];
    const cachedSnapshot = cachedRepo?.providers.skills?.snapshot;

    if (cachedSnapshot) {
      return buildImportGroupCandidate({
        canonicalRepo: normalizedRepo,
        installed: options.installed,
        snapshot: cachedSnapshot,
        ...(options.matchedSkills ? { matchedSkills: options.matchedSkills } : {}),
      });
    }

    if (cachedRepo) {
      return {
        id: normalizedRepo,
        provider: "skills",
        locator: normalizedRepo,
        canonicalRepo: normalizedRepo,
        aliases: cachedRepo.identity.aliases,
        title: cachedRepo.resolved.title ?? normalizedRepo.split("/")[1] ?? normalizedRepo,
        installed: options.installed,
        ...(cachedRepo.resolved.summary ? { summary: cachedRepo.resolved.summary } : {}),
        ...(cachedRepo.resolved.sourceUrl ? { sourceUrl: cachedRepo.resolved.sourceUrl } : {}),
        ...(cachedRepo.resolved.githubUrl ? { repoUrl: cachedRepo.resolved.githubUrl } : {}),
        ...(cachedRepo.resolved.starCount !== undefined ? { starCount: cachedRepo.resolved.starCount } : {}),
        ...(cachedRepo.resolved.downloadCount !== undefined ? { totalInstalls: cachedRepo.resolved.downloadCount } : {}),
        ...(cachedRepo.resolved.skillCount !== undefined ? { skillCount: cachedRepo.resolved.skillCount } : {}),
        ...(options.matchedSkills?.length ? { matchedSkillNames: options.matchedSkills.map((skill) => skill.title) } : {}),
        ...(options.matchedSkills?.length ? { matchedSkills: options.matchedSkills } : {}),
        enrichState: { status: "ready" },
      };
    }

    return {
      id: normalizedRepo,
      provider: "skills",
      locator: normalizedRepo,
      canonicalRepo: normalizedRepo,
      aliases: buildImportGroupCandidate({
        canonicalRepo: normalizedRepo,
        installed: options.installed,
      }).aliases,
      title: normalizedRepo.split("/")[1] ?? normalizedRepo,
      installed: options.installed,
      ...(options.matchedSkills?.length ? { matchedSkillNames: options.matchedSkills.map((skill) => skill.title) } : {}),
      ...(options.matchedSkills?.length ? { matchedSkills: options.matchedSkills } : {}),
      enrichState: { status: "loading" },
    };
  }

  private prewarmImportPreviewSnapshots(
    groups: ImportGroupCandidate[],
    importCache: ImportDataCache,
  ): void {
    let started = 0;
    for (const group of groups) {
      if (group.provider !== "skills" || group.installed) {
        continue;
      }
      const normalizedRepo = normalizeImportCanonicalRepo(group.canonicalRepo) ?? group.canonicalRepo;
      const cached = importCache.repos?.[normalizedRepo];
      const cachedSnapshot = cached?.providers.skills?.snapshot;
      if (cached && cachedSnapshot && !isImportDataCacheExpired(cached)) {
        continue;
      }
      this.refreshImportSourceSnapshotInBackground(normalizedRepo);
      started += 1;
      if (started >= SkillFlowApp.importPreviewPrewarmLimit) {
        break;
      }
    }
  }

  private async buildDirectImportGroupCandidate(
    locator: string,
    manifest: ManifestFile,
  ): Promise<ImportGroupCandidate | null> {
    const resolvedLocator = await this.resolveDirectImportLocator(locator);
    if (!resolvedLocator) {
      return null;
    }

    const aliases = [
      locator.trim(),
      resolvedLocator,
      path.isAbsolute(resolvedLocator) ? `file://${resolvedLocator}` : undefined,
    ].filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index);

    return {
      id: resolvedLocator,
      provider: "skills",
      locator: resolvedLocator,
      canonicalRepo: resolvedLocator,
      aliases,
      title: parseHostedGitRepo(resolvedLocator)?.repo ?? deriveDisplayName(resolvedLocator),
      installed: this.isDirectImportLocatorInstalled(manifest, resolvedLocator),
      summary: `Import from ${resolvedLocator}`,
      enrichState: { status: "idle" },
    };
  }

  private isDirectImportLocatorInstalled(manifest: RuntimeManifestView | ManifestFile, locator: string): boolean {
    if (locator.startsWith("clawhub:")) {
      const sourceId = deriveSourceId(locator);
      return manifest.sources.some((source) => source.id === sourceId);
    }

    if (path.isAbsolute(locator)) {
      return manifest.sources.some(
        (source) => source.kind === "local" && path.resolve(source.locator) === locator,
      );
    }

    return manifest.sources.some((source) => source.locator === locator);
  }

  private async resolveRecommendedImportRepos(): Promise<string[]> {
    const [seedGroups, officialGroups, hotGroups, trendingGroups] = await Promise.all([
      this.resolveImportRecommendationFeed("seed"),
      this.resolveImportRecommendationFeed("official"),
      this.resolveImportRecommendationFeed("hot"),
      this.resolveImportRecommendationFeed("trending"),
    ]);

    return [...new Set([
      ...seedGroups,
      ...officialGroups,
      ...hotGroups,
      ...trendingGroups,
    ])];
  }

  private async resolveImportRecommendationFeed(
    feedId: ImportRecommendationFeedId,
  ): Promise<string[]> {
    const cached = (await this.store.readImportDataCache()).recommendations[feedId];
    if (cached) {
      if (!isImportDataCacheExpired(cached)) {
        return cached.groups;
      }

      this.refreshImportRecommendationFeedInBackground(feedId);
      return cached.groups;
    }

    if (feedId === "seed") {
      return (await this.refreshImportRecommendationFeedTracked(feedId)).groups;
    }

    this.refreshImportRecommendationFeedInBackground(feedId);
    return [];
  }

  private refreshImportRecommendationFeedInBackground(feedId: ImportRecommendationFeedId): void {
    if (this.importRecommendationRefreshesByFeed.has(feedId)) {
      return;
    }

    void this.refreshImportRecommendationFeedTracked(feedId).catch(() => undefined);
  }

  private async refreshImportRecommendationFeed(
    feedId: ImportRecommendationFeedId,
  ): Promise<ImportRecommendationFeed> {
    const checkedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + IMPORT_RECOMMENDATION_CACHE_TTL_MS).toISOString();
    const groups = feedId === "seed"
      ? this.importRecommendationSeedRepos()
      : await fetchSkillsDirectoryFeedGroups(feedId);
    const entry: ImportRecommendationFeed = { id: feedId, checkedAt, expiresAt, groups };
    await this.store.writeImportRecommendationFeedEntry(entry);
    return entry;
  }

  private async resolveImportSearchSnapshot(query: string): Promise<ImportSearchSnapshot> {
    const normalizedQuery = query.trim().toLowerCase();
    const cached = (await this.store.readImportDataCache()).searches[normalizedQuery];
    if (cached) {
      if (!isImportDataCacheExpired(cached)) {
        return cached;
      }

      this.refreshImportSearchSnapshotInBackground(query);
      return cached;
    }

    return this.refreshImportSearchSnapshotTracked(normalizedQuery, query);
  }

  private refreshImportSearchSnapshotInBackground(query: string): void {
    const normalizedQuery = query.trim().toLowerCase();
    void this.refreshImportSearchSnapshotTracked(normalizedQuery, query).catch(() => undefined);
  }

  private async refreshImportSearchSnapshot(query: string): Promise<ImportSearchSnapshot> {
    const hits = await searchSkillsDirectory(query, 20);
    const snapshot: ImportSearchSnapshot = {
      query: query.trim(),
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + IMPORT_SEARCH_CACHE_TTL_MS).toISOString(),
      hits,
      groups: [...new Set(hits.map((hit) => hit.canonicalRepo))],
    };
    await this.store.writeImportSearchSnapshotEntry(query.trim().toLowerCase(), snapshot);
    return snapshot;
  }

  private async resolveImportSourceSnapshot(
    canonicalRepo: string,
    options?: {
      enrichSkillIds?: string[];
      includeSkillDetails?: boolean;
      refreshTrustInBackground?: boolean;
    },
  ): Promise<UnifiedSourceSnapshot> {
    const normalizedRepo = normalizeImportCanonicalRepo(canonicalRepo) ?? canonicalRepo;
    const cached = (await this.store.readImportDataCache()).repos?.[normalizedRepo];
    const cachedSnapshot = cached?.providers.skills?.snapshot;
    const requiresSkillRefresh = cachedSnapshot
      ? this.snapshotNeedsSkillRefresh(cachedSnapshot, options?.enrichSkillIds ?? [])
      : false;

    if (cached && cachedSnapshot) {
      if (!isImportDataCacheExpired(cached) && !requiresSkillRefresh) {
        return cachedSnapshot;
      }

      if (!requiresSkillRefresh) {
        this.refreshImportSourceSnapshotInBackground(normalizedRepo);
        return cachedSnapshot;
      }
    }

    try {
      const refreshOptions = {
        ...(options?.enrichSkillIds ? { enrichSkillIds: options.enrichSkillIds } : {}),
        ...(options?.includeSkillDetails !== undefined ? { includeSkillDetails: options.includeSkillDetails } : {}),
        ...(options?.refreshTrustInBackground !== undefined ? { refreshTrustInBackground: options.refreshTrustInBackground } : {}),
        ...(cachedSnapshot ? { cachedSnapshot } : {}),
      };
      return await this.refreshImportSourceSnapshotTracked(normalizedRepo, {
        ...refreshOptions,
      });
    } catch (error) {
      if (cachedSnapshot) {
        return cachedSnapshot;
      }
      throw error;
    }
  }

  private async resolveImportPreviewSnapshot(canonicalRepo: string): Promise<UnifiedSourceSnapshot> {
    const normalizedRepo = normalizeImportCanonicalRepo(canonicalRepo) ?? canonicalRepo;
    const cached = (await this.store.readImportDataCache()).repos?.[normalizedRepo];
    const cachedSnapshot = cached?.providers.skills?.snapshot;

    if (cached && cachedSnapshot && !isImportDataCacheExpired(cached)) {
      return cachedSnapshot;
    }

    try {
      return await this.refreshImportSourceSnapshotTracked(normalizedRepo, {
        includeSkillDetails: false,
        refreshTrustInBackground: false,
        ...(cachedSnapshot ? { cachedSnapshot } : {}),
      });
    } catch (error) {
      if (cachedSnapshot) {
        return cachedSnapshot;
      }
      throw error;
    }
  }

  private async previewDirectImportSource(
    locator: string,
  ): Promise<Result<ImportPreviewResult> | null> {
    const resolvedLocator = await this.resolveDirectImportLocator(locator);
    if (!resolvedLocator) {
      return null;
    }

    const preview = await this.sourceCheckoutService.previewSource(resolvedLocator);
    if (!preview.ok) {
      return ok({
        status: "failed",
        reasonCode: this.inferImportReasonCode(preview.errors[0]),
        retryable: this.importFailureRetryable(preview.errors[0]),
      }, preview.warnings);
    }

    const availableTargets = await this.getAvailableTargets();

    const result = ok(
      this.buildDirectImportPreviewResult(resolvedLocator, preview.data, availableTargets),
      preview.warnings,
    );
    return result;
  }

  private async previewGitHubImportSource(
    canonicalRepo: string,
    options: {
      requestedPath?: string;
      skillSelector?: string;
    } = {},
  ): Promise<Result<ImportPreviewResult> | null> {
    const normalizedRepo = normalizeImportCanonicalRepo(canonicalRepo);
    if (!normalizedRepo) {
      return null;
    }

    const locator = `https://github.com/${normalizedRepo}.git`;
    const preview = await this.sourceCheckoutService.previewSource(
      locator,
      options.requestedPath ? { path: options.requestedPath } : {},
    );
    if (!preview.ok) {
      return ok({
        status: "failed",
        reasonCode: this.inferImportReasonCode(preview.errors[0]),
        retryable: this.importFailureRetryable(preview.errors[0]),
      }, preview.warnings);
    }

    const availableTargets = await this.getAvailableTargets();
    return ok(
      this.buildDirectImportPreviewResult(
        locator,
        preview.data,
        availableTargets,
        normalizedRepo,
        {
          ...(options.requestedPath ? { requestedPath: options.requestedPath } : {}),
          ...(options.skillSelector ? { skillSelectors: [options.skillSelector] } : {}),
        },
      ),
      preview.warnings,
    );
  }

  private buildDirectImportPreviewResult(
    locator: string,
    preview: SourcePreview,
    availableTargets: DeploymentTargetId[],
    canonicalRepo = locator,
    options: {
      requestedPath?: string;
      skillSelectors?: string[];
    } = {},
  ): ImportPreviewResult {
    const leafs = this.filterPreviewLeafs(preview.leafs, canonicalRepo, options);
    if (!leafs) {
      return {
        status: "failed",
        reasonCode: "provider_data_unavailable",
        retryable: false,
      };
    }

    const sourceSelectionKey = `${canonicalRepo}#${options.requestedPath ?? "."}`;
    const provider = this.importPreviewOriginProvider(locator, canonicalRepo);
    const skills = leafs.map((leaf) => {
      const id = leaf.relativePath === "." ? leaf.name ?? leaf.linkName : leaf.relativePath;
      const selector = normalizeImportRepoPathSelector(leaf.relativePath);
      const selectorPath = selector.path;
      return {
        providerSkillId: id,
        uiId: this.importPreviewUiId(sourceSelectionKey, selectorPath),
        title: leaf.title,
        ...(leaf.contentHash ? { contentHash: leaf.contentHash } : {}),
        selector,
        origin: {
          provider,
          providerSkillId: id,
          repoPath: selectorPath,
        },
        diagnostics: [],
        selectorAliases: [...new Set([id, leaf.name, leaf.relativePath].filter((value): value is string => Boolean(value)))],
      };
    });

    return {
      status: "ready",
      version: 2,
      locator,
      canonicalRepo,
      selectedSkills: skills.map((skill) => ({
        uiId: skill.uiId,
        selector: skill.selector,
      })),
      enabledTargets: [],
      skills,
      targets: availableTargets.map((target) => ({
        id: target,
        selectedByDefault: false,
      })),
    };
  }

  private importPreviewUiId(sourceSelectionKey: string, selectorPath: string): string {
    const digest = crypto
      .createHash("sha256")
      .update(`${sourceSelectionKey}\0repoPath\0${selectorPath}`)
      .digest("base64url")
      .slice(0, 16);
    return `skill_${digest}`;
  }

  private importPreviewOriginProvider(
    locator: string,
    canonicalRepo: string,
  ): "github" | "git" | "local" | "archive" {
    if (path.isAbsolute(locator) || locator.startsWith(".")) {
      return "local";
    }
    if (
      /^https:\/\/github\.com\//i.test(locator) ||
      /^[^:/\s]+\/[^:/\s]+$/.test(canonicalRepo)
    ) {
      return "github";
    }
    return "git";
  }

  private parseGitHubImportLocator(locator: string): GitHubImportLocator | undefined {
    const trimmed = this.stripImportLocatorQuotes(locator.trim()).replace(/\/+$/, "");
    const selectorLocator = this.parseGitHubImportSelectorLocator(trimmed);
    if (selectorLocator) {
      return selectorLocator;
    }

    const treeLocator = this.parseGitHubImportTreeLocator(trimmed);
    if (treeLocator) {
      return treeLocator;
    }

    const subpathLocator = this.parseGitHubImportShorthandSubpath(trimmed);
    if (subpathLocator) {
      return subpathLocator;
    }

    const canonicalRepo = normalizeImportCanonicalRepo(trimmed);
    if (!canonicalRepo) {
      return undefined;
    }

    return {
      canonicalRepo,
      originalLocator: canonicalRepo,
      locator: canonicalRepo,
    };
  }

  private parseGitHubImportSelectorLocator(locator: string): GitHubImportLocator | undefined {
    const match = locator.match(/^([^/\s:@]+)\/([^/@\s]+)@(.+)$/);
    const owner = match?.[1];
    const rawRepo = match?.[2];
    const skillSelector = match?.[3]?.trim().replace(/^\/+|\/+$/g, "");
    if (!owner || !rawRepo || !skillSelector || skillSelector.includes("@")) {
      return undefined;
    }

    return this.githubImportLocator(owner, rawRepo, locator, { skillSelector });
  }

  private parseGitHubImportTreeLocator(locator: string): GitHubImportLocator | undefined {
    try {
      const url = new URL(locator);
      if (url.hostname !== "github.com") {
        return undefined;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2 || parts[2] && parts[2] !== "tree") {
        return undefined;
      }

      const requestedPath = parts.length >= 5
        ? parts.slice(4).join("/")
        : undefined;
      return this.githubImportLocator(parts[0], parts[1], locator, {
        ...(requestedPath ? { requestedPath } : {}),
      });
    } catch {
      return undefined;
    }
  }

  private parseGitHubImportShorthandSubpath(locator: string): GitHubImportLocator | undefined {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(locator) || locator.startsWith("git@")) {
      return undefined;
    }

    const parts = locator.split("/");
    if (parts.length < 3) {
      return undefined;
    }

    const requestedPath = parts.slice(2).join("/");
    if (!requestedPath) {
      return undefined;
    }

    return this.githubImportLocator(parts[0], parts[1], locator, { requestedPath });
  }

  private githubImportLocator(
    owner: string | undefined,
    rawRepo: string | undefined,
    originalLocator: string,
    options: {
      requestedPath?: string;
      skillSelector?: string;
    } = {},
  ): GitHubImportLocator | undefined {
    if (!owner || !rawRepo) {
      return undefined;
    }
    const repo = rawRepo.replace(/\.git$/i, "");
    const canonicalRepo = normalizeImportCanonicalRepo(`${owner}/${repo}`);
    if (!canonicalRepo) {
      return undefined;
    }

    return {
      canonicalRepo,
      originalLocator,
      locator: `https://github.com/${canonicalRepo}.git`,
      ...(options.requestedPath ? { requestedPath: options.requestedPath } : {}),
      ...(options.skillSelector ? { skillSelector: options.skillSelector } : {}),
    };
  }

  private importLocatorMatchedSkillNames(locator: GitHubImportLocator): string[] {
    if (locator.skillSelector) {
      return [locator.skillSelector];
    }

    const basename = locator.requestedPath
      ?.split("/")
      .filter(Boolean)
      .at(-1);
    return basename ? [basename] : [];
  }

  private filterImportSnapshotSkills(
    skills: UnifiedSourceSnapshot["skills"],
    selector: string,
    canonicalRepo: string,
  ): UnifiedSourceSnapshot["skills"] {
    const selectorVariants = this.buildImportSkillSelectorVariants(selector, canonicalRepo);
    return skills.filter((skill) => {
      const skillVariants = new Set([
        ...this.buildImportSkillSelectorVariants(skill.skillId, canonicalRepo),
        ...this.buildImportSkillSelectorVariants(skill.title, canonicalRepo),
      ]);
      return selectorVariants.some((variant) => skillVariants.has(variant));
    });
  }

  private filterPreviewLeafs<T extends SelectableLeaf>(
    leafs: T[],
    canonicalRepo: string,
    options: {
      requestedPath?: string;
      skillSelectors?: string[];
    } = {},
  ): T[] | undefined {
    let filteredLeafs = leafs;
    const requestedPath = this.normalizeRequestedPath(options.requestedPath);
    if (requestedPath) {
      filteredLeafs = filteredLeafs.filter(
        (leaf) => leaf.relativePath === requestedPath || leaf.relativePath.startsWith(`${requestedPath}/`),
      );
      if (filteredLeafs.length === 0) {
        return undefined;
      }
    }

    if (!options.skillSelectors?.length) {
      return filteredLeafs;
    }

    const selectedLeafIds = this.resolveSelectedLeafIds(
      filteredLeafs,
      undefined,
      options.skillSelectors,
      canonicalRepo,
    );
    if (!selectedLeafIds.ok) {
      return undefined;
    }

    const selected = new Set(selectedLeafIds.data);
    return filteredLeafs.filter((leaf) => selected.has(leaf.id));
  }

  private async resolveDirectImportLocator(locator: string): Promise<string | undefined> {
    const trimmed = this.stripImportLocatorQuotes(locator.trim());
    if (!trimmed || normalizeImportCanonicalRepo(trimmed)) {
      return undefined;
    }

    if (/^clawhub:[^@\s]+(?:@.+)?$/i.test(trimmed)) {
      return trimmed;
    }

    const hostedRepo = parseHostedGitRepo(trimmed);
    if (hostedRepo?.host.includes("gitlab")) {
      return trimmed;
    }

    const localLocator = trimmed.startsWith("~/")
      ? path.join(process.env.HOME ?? os.homedir(), trimmed.slice(2))
      : trimmed;
    const resolvedPath = path.resolve(localLocator.startsWith("file://")
      ? decodeURIComponent(new URL(trimmed).pathname)
      : localLocator);
    if (await pathExists(resolvedPath)) {
      return resolvedPath;
    }

    return undefined;
  }

  private stripImportLocatorQuotes(locator: string): string {
    if (locator.length < 2) {
      return locator;
    }

    const first = locator[0];
    const last = locator[locator.length - 1];
    if ((first === "'" && last === "'") || (first === "\"" && last === "\"")) {
      return locator.slice(1, -1).trim();
    }

    return locator;
  }

  private refreshImportSourceSnapshotInBackground(canonicalRepo: string): void {
    const refreshKey = this.importSourceRefreshKey(canonicalRepo);
    if (this.importSourceRefreshesByKey.has(refreshKey)) {
      return;
    }

    void this.refreshImportSourceSnapshotTracked(canonicalRepo).catch(() => undefined);
  }

  private refreshImportRecommendationFeedTracked(
    feedId: ImportRecommendationFeedId,
  ): Promise<ImportRecommendationFeed> {
    const inFlight = this.importRecommendationRefreshesByFeed.get(feedId);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.refreshImportRecommendationFeed(feedId).finally(() => {
      this.importRecommendationRefreshesByFeed.delete(feedId);
    });
    this.importRecommendationRefreshesByFeed.set(feedId, refresh);
    return refresh;
  }

  private refreshImportSearchSnapshotTracked(
    normalizedQuery: string,
    query: string,
  ): Promise<ImportSearchSnapshot> {
    const inFlight = this.importSearchRefreshesByQuery.get(normalizedQuery);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.refreshImportSearchSnapshot(query).finally(() => {
      this.importSearchRefreshesByQuery.delete(normalizedQuery);
    });
    this.importSearchRefreshesByQuery.set(normalizedQuery, refresh);
    return refresh;
  }

  private refreshImportSourceSnapshotTracked(
    canonicalRepo: string,
    options?: {
      enrichSkillIds?: string[];
      includeSkillDetails?: boolean;
      refreshTrustInBackground?: boolean;
      cachedSnapshot?: UnifiedSourceSnapshot;
    },
  ): Promise<UnifiedSourceSnapshot> {
    const refreshKey = this.importSourceRefreshKey(canonicalRepo, options?.enrichSkillIds);
    const inFlight = this.importSourceRefreshesByKey.get(refreshKey);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.refreshImportSourceSnapshot(canonicalRepo, options).finally(() => {
      this.importSourceRefreshesByKey.delete(refreshKey);
    });
    this.importSourceRefreshesByKey.set(refreshKey, refresh);
    return refresh;
  }

  private async refreshImportSourceSnapshot(
    canonicalRepo: string,
    options?: {
      enrichSkillIds?: string[];
      includeSkillDetails?: boolean;
      refreshTrustInBackground?: boolean;
      cachedSnapshot?: UnifiedSourceSnapshot;
    },
  ): Promise<UnifiedSourceSnapshot> {
    const includeSkillDetails = options?.includeSkillDetails !== undefined
      ? options.includeSkillDetails
      : (options?.enrichSkillIds?.length ?? 0) > 0;
    const trust = await this.resolveCachedImportSourceTrust(canonicalRepo, {
      refreshInBackground: options?.refreshTrustInBackground ?? includeSkillDetails,
    });

    const snapshot = await fetchSkillsDirectorySourceSnapshot(canonicalRepo, {
      includeSkillDetails,
      ...(options?.enrichSkillIds ? { enrichSkillIds: options.enrichSkillIds } : {}),
      ...(this.hasUnifiedSourceTrust(trust) ? { trust } : {}),
    });
    const mergedSnapshot = options?.cachedSnapshot
      ? this.mergeSourceSnapshots(options.cachedSnapshot, snapshot)
      : snapshot;
    await this.store.writeImportSourceSnapshotEntry({
      canonicalRepo,
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + IMPORT_SOURCE_CACHE_TTL_MS).toISOString(),
      data: mergedSnapshot,
    });
    return mergedSnapshot;
  }

  private async resolveCachedImportSourceTrust(
    canonicalRepo: string,
    options?: { refreshInBackground?: boolean },
  ): Promise<UnifiedSourceTrust> {
    const recommendations = (await this.store.readImportDataCache()).recommendations;
    const trust: UnifiedSourceTrust = {};

    for (const feedId of ["official", "trending", "hot", "audits"] as const) {
      const cachedFeed = recommendations[feedId];
      if (cachedFeed && !isImportDataCacheExpired(cachedFeed)) {
        if (cachedFeed.groups.includes(canonicalRepo)) {
          if (feedId === "official") {
            trust.official = true;
          } else if (feedId === "trending") {
            trust.trending = true;
          } else if (feedId === "hot") {
            trust.hot = true;
          } else if (feedId === "audits") {
            trust.audited = true;
          }
        }
        continue;
      }

      if (options?.refreshInBackground !== false) {
        this.refreshImportRecommendationFeedInBackground(feedId);
      }
    }

    return trust;
  }

  private snapshotNeedsSkillRefresh(
    snapshot: UnifiedSourceSnapshot,
    skillIds: string[],
  ): boolean {
    if (skillIds.length === 0) {
      return false;
    }

    return skillIds.some((skillId) => {
      const skill = snapshot.skills.find((item) => item.skillId === skillId);
      if (!skill) {
        return true;
      }
      return !skill.summary &&
        skill.weeklyInstalls === undefined &&
        !skill.firstSeen &&
        !skill.installedOn?.length &&
        !skill.audits;
    });
  }

  private mergeSourceSnapshots(
    previous: UnifiedSourceSnapshot,
    next: UnifiedSourceSnapshot,
  ): UnifiedSourceSnapshot {
    const previousSkillsById = new Map(previous.skills.map((skill) => [skill.skillId, skill]));
    const mergedSkills = next.skills.map((skill) => {
      const previousSkill = previousSkillsById.get(skill.skillId);
      return previousSkill
        ? {
            ...previousSkill,
            ...skill,
            ...(skill.installedOn?.length ? { installedOn: skill.installedOn } : previousSkill.installedOn ? { installedOn: previousSkill.installedOn } : {}),
            ...(skill.audits ? { audits: skill.audits } : previousSkill.audits ? { audits: previousSkill.audits } : {}),
          }
        : skill;
    });

    return {
      ...previous,
      ...next,
      owner: {
        ...previous.owner,
        ...next.owner,
      },
      skills: mergedSkills,
      trust: {
        ...(previous.trust ?? {}),
        ...(next.trust ?? {}),
      },
    };
  }

  private buildImportSkillSelectorVariants(
    value: string,
    canonicalRepo: string,
  ): string[] {
    const normalized = this.normalizeImportSkillSelector(value);
    if (!normalized) {
      return [];
    }

    const repo = parseGitHubRepo(canonicalRepo);
    const variants = new Set<string>([normalized]);
    const prefixes = new Set<string>();
    const pathSegments = value
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (pathSegments.length > 1) {
      for (let index = 1; index < pathSegments.length; index += 1) {
        const suffix = this.normalizeImportSkillSelector(pathSegments.slice(index).join("/"));
        if (suffix) {
          variants.add(suffix);
        }
      }
    }

    if (repo) {
      const normalizedOwner = this.normalizeImportSkillSelector(repo.owner);
      const ownerHead = this.normalizeImportSkillSelector(repo.owner.split(/[^a-z0-9]+/i)[0] ?? "");
      const normalizedRepo = this.normalizeImportSkillSelector(repo.repo);

      if (normalizedOwner) {
        prefixes.add(normalizedOwner);
      }
      if (ownerHead) {
        prefixes.add(ownerHead);
      }
      if (normalizedRepo) {
        prefixes.add(normalizedRepo);
      }
    }

    for (const prefix of prefixes) {
      if (normalized.startsWith(`${prefix}-`)) {
        variants.add(normalized.slice(prefix.length + 1));
      }
    }

    return [...variants];
  }

  private normalizeImportSkillSelector(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
  }

  private getImportLeafSelectorRank(relativePath: string): number {
    if (relativePath === ".") {
      return 0;
    }
    if (/^skills\/[^/]+$/.test(relativePath)) {
      return 1;
    }
    if (/^skills\/\.(curated|experimental|system)\/[^/]+$/.test(relativePath)) {
      return 2;
    }
    return 3;
  }

  private pickPreferredImportLeafMatch<T extends SelectableLeaf>(matches: T[]): T | undefined {
    if (matches.length === 0) {
      return undefined;
    }

    const ranked = matches.map((leaf) => ({
      leaf,
      rank: this.getImportLeafSelectorRank(leaf.relativePath),
    }));
    const bestRank = Math.min(...ranked.map((entry) => entry.rank));
    const bestMatches = ranked
      .filter((entry) => entry.rank === bestRank)
      .map((entry) => entry.leaf);

    return bestMatches.length === 1 ? bestMatches[0] : undefined;
  }

  private importSourceRefreshKey(canonicalRepo: string, enrichSkillIds?: string[]): string {
    const normalizedSkillIds = [...new Set((enrichSkillIds ?? []).filter(Boolean))].sort();
    if (normalizedSkillIds.length === 0) {
      return canonicalRepo;
    }
    return `${canonicalRepo}::${normalizedSkillIds.join(",")}`;
  }

  private hasUnifiedSourceTrust(trust: UnifiedSourceTrust): boolean {
    return trust.official === true ||
      trust.trending === true ||
      trust.hot === true ||
      trust.audited === true;
  }

  private async mapConcurrent<T, R>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }

    const limit = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    await Promise.all(
      Array.from({ length: limit }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
        }
      }),
    );

    return results;
  }

  private inferImportReasonCode(error: unknown): ImportReasonCode {
    if (
      this.hasErrorCode(error, "SKILLS_SEARCH_RATE_LIMITED") ||
      this.hasErrorCode(error, "SKILLS_SOURCE_RATE_LIMITED") ||
      this.hasErrorCode(error, "SKILLS_FEED_RATE_LIMITED") ||
      this.hasErrorCode(error, "GITHUB_RATE_LIMITED")
    ) {
      return "provider_rate_limited";
    }

    if (
      this.hasErrorCode(error, "SKILLS_SEARCH_RESPONSE_INVALID") ||
      this.hasErrorCode(error, "SKILLS_SOURCE_PARSE_FAILED")
    ) {
      return "provider_response_invalid";
    }

    if (
      this.hasErrorCode(error, "SKILLS_SOURCE_NOT_SUPPORTED") ||
      this.hasErrorCode(error, "SKILLS_SOURCE_NOT_FOUND") ||
      this.hasErrorCode(error, "SKILLS_PAGE_NOT_FOUND")
    ) {
      return "provider_data_unavailable";
    }

    return "provider_request_failed";
  }

  private importFailureRetryable(error: unknown): boolean {
    return this.inferImportReasonCode(error) !== "provider_response_invalid";
  }

  private hasErrorCode(error: unknown, code: string): error is Error & { code: string } {
    return typeof error === "object" && error !== null && "code" in error && error.code === code;
  }

  private async listWorkflowsImpl(): Promise<
    Result<{
      availableTargets: DeploymentTargetId[];
      summaries: WorkflowSummary[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      customTargets: PreferencesFile["customTargets"];
      agentDisplayOrder: PreferencesFile["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    const runtimeView = await this.readRuntimeAuthorityView();
    const { manifest, lockFile, collections } = runtimeView;
    const recentProjects = await this.recentProjectService.listRecentProjects().catch(() => []);
    const reconciledPreferences = await this.pruneMissingSourceIds({
      ...runtimeView.preferences,
      recentProjects,
    });
    const availableTargets = await this.getAvailableTargets();
    const groupCardEnrichmentBySourceId = await this.readCachedGroupCardEnrichmentBySourceId(
      manifest,
      lockFile,
    );
    const hiddenSourceIds = this.hiddenSourceIdsFromCollections(collections);
    return ok(
      {
        availableTargets,
        summaries: this.workflowService.getSummaries(manifest, lockFile, undefined, collections)
          .filter((summary) => !hiddenSourceIds.has(summary.source.id)),
        pinnedSourceIds: reconciledPreferences.pinnedSourceIds,
        recentProjects: reconciledPreferences.recentProjects,
        selectedProjectScope: reconciledPreferences.selectedProjectScope,
        customTargets: reconciledPreferences.customTargets,
        agentDisplayOrder: reconciledPreferences.agentDisplayOrder,
        groupCardEnrichmentBySourceId,
      },
      [],
    );
  }

  async getConfigData(): Promise<
    Result<{ manifest: ManifestFile; lockFile: LockFile; summaries: WorkflowSummary[] }>
  > {
    return this.runSerializedMutation(() => this.getConfigDataImpl());
  }

  private async getConfigDataImpl(): Promise<
    Result<{ manifest: ManifestFile; lockFile: LockFile; summaries: WorkflowSummary[] }>
  > {
    const { manifest, lockFile, collections } = await this.readRuntimeAuthorityView();
    return ok(
      {
        manifest,
        lockFile,
        summaries: this.workflowService.getSummaries(manifest, lockFile, undefined, collections),
      },
      [],
    );
  }

  async bootstrapWorkspaceState(
    onEvent?: (event: BootstrapEvent) => void,
  ): Promise<
    Result<{
      availableTargets: DeploymentTargetId[];
      manifest: ManifestFile;
      lockFile: LockFile;
      summaries: WorkflowSummary[];
      initialDrafts: Record<string, DraftBinding>;
      audit: DoctorReport;
      importedSourceIds: string[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      projectDrafts: ScopedSourceDrafts;
      customTargets: PreferencesFile["customTargets"];
      agentDisplayOrder: PreferencesFile["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
      capabilities: { importDraftV2: true };
    }>
  > {
    return this.runAuditedMutation(
      "bootstrap",
      {},
      () => this.bootstrapWorkspaceStateImpl(onEvent),
    );
  }

  private async bootstrapWorkspaceStateImpl(
    onEvent?: (event: BootstrapEvent) => void,
  ): Promise<
    Result<{
      availableTargets: DeploymentTargetId[];
      manifest: ManifestFile;
      lockFile: LockFile;
      summaries: WorkflowSummary[];
      initialDrafts: Record<string, DraftBinding>;
      audit: DoctorReport;
      importedSourceIds: string[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      projectDrafts: ScopedSourceDrafts;
      customTargets: PreferencesFile["customTargets"];
      agentDisplayOrder: PreferencesFile["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
      capabilities: { importDraftV2: true };
    }>
  > {
    const boot = await this.configCoordinator.bootstrapWorkspaceState(onEvent);
    if (!boot.ok) {
      return fail(boot.errors, boot.warnings);
    }
    const preferences = await this.pruneMissingSourceIds();
    const groupCardEnrichmentBySourceId = await this.readCachedGroupCardEnrichmentBySourceId(
      boot.data.manifest,
      boot.data.lockFile,
    );

    return ok({
      availableTargets: boot.data.availableTargets,
      manifest: boot.data.manifest,
      lockFile: boot.data.lockFile,
      summaries: boot.data.summaries,
      initialDrafts: boot.data.initialDrafts,
      audit: boot.data.audit,
      importedSourceIds: [],
      pinnedSourceIds: preferences.pinnedSourceIds,
      recentProjects: preferences.recentProjects,
      selectedProjectScope: preferences.selectedProjectScope,
      projectDrafts: this.projectDraftsForPreferences(preferences),
      customTargets: preferences.customTargets,
      agentDisplayOrder: preferences.agentDisplayOrder,
      groupCardEnrichmentBySourceId,
      capabilities: { importDraftV2: true },
    });
  }

  private async readCachedGroupCardEnrichmentBySourceId(
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Promise<Record<string, GroupCardEnrichmentSnapshot>> {
    const [sourceMetadataCache, importDataCache] = await Promise.all([
      this.store.readSourceMetadataCache(),
      this.store.readImportDataCache(),
    ]);
    const entries: Record<string, GroupCardEnrichmentSnapshot> = {};

    for (const source of manifest.sources) {
      const entry: GroupCardEnrichmentSnapshot = {};
      const sourceLock = lockFile.sources[source.id];
      const cachedMetadata = sourceMetadataCache[source.id];
      if (cachedMetadata) {
        entry.sourceMetadata = sourceMetadataCacheEntryToResult(cachedMetadata);
      }

      const canonicalRepo = [
        source.locator,
        source.canonicalLocator,
      ].reduce<string | undefined>((resolved, locator) => {
        if (resolved || typeof locator !== "string") {
          return resolved;
        }
        return normalizeImportCanonicalRepo(locator);
      }, undefined);
      const cachedSnapshot = canonicalRepo
        ? importDataCache.repos?.[canonicalRepo]?.providers.skills?.snapshot
        : undefined;
      if (cachedSnapshot) {
        entry.sourceSnapshot = cachedSnapshot;
      }

      if (sourceLock?.localPath) {
        entry.groupPath = sourceLock.localPath;
      }

      if (entry.sourceMetadata || entry.sourceSnapshot || entry.groupPath) {
        entries[source.id] = entry;
      }
    }

    return entries;
  }

  async togglePinnedSource(sourceId: string): Promise<Result<{ pinnedSourceIds: string[] }>> {
    return this.runSerializedMutation(() => this.togglePinnedSourceImpl(sourceId));
  }

  async renameSource(
    sourceId: string,
    displayName: string,
  ): Promise<Result<RenameSourceResult>> {
    return this.runSerializedMutation(() => this.renameSourceImpl(sourceId, displayName));
  }

  private async togglePinnedSourceImpl(
    sourceId: string,
  ): Promise<Result<{ pinnedSourceIds: string[] }>> {
    const state = await this.stateStore.readState();
    if (!state.manifest.sources.some((source) => source.id === sourceId)) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    const pinnedSourceIds = state.preferences.pinnedSourceIds.includes(sourceId)
      ? state.preferences.pinnedSourceIds.filter((pinnedSourceId) => pinnedSourceId !== sourceId)
      : [...state.preferences.pinnedSourceIds, sourceId];
    await this.stateStore.writeState({
      ...state,
      preferences: {
        ...state.preferences,
        pinnedSourceIds,
      },
    });
    return ok({ pinnedSourceIds });
  }

  private async renameSourceImpl(
    sourceId: string,
    displayName: string,
  ): Promise<Result<RenameSourceResult>> {
    const trimmedDisplayName = displayName.trim();
    const state = await this.stateStore.readState();
    const manifestSource = state.manifest.sources.find((source) => source.id === sourceId);
    const lockSource = state.lockFile.sources[sourceId];

    if (!manifestSource || !lockSource) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    const originalDisplayName = deriveDisplayName(manifestSource.locator);
    const isResetToOriginal = trimmedDisplayName === "";
    const nextDisplayName = isResetToOriginal ? originalDisplayName : trimmedDisplayName;
    await this.stateStore.writeState({
      ...state,
      manifest: {
        ...state.manifest,
        sources: state.manifest.sources.map((source) =>
          source.id === sourceId
            ? { ...source, displayName: nextDisplayName, updatedAt: new Date().toISOString() }
            : source,
        ),
      },
    });
    return ok({
      sourceId,
      displayName: nextDisplayName,
      originalDisplayName,
      isResetToOriginal,
    });
  }

  async getAvailableTargets(): Promise<DeploymentTargetId[]> {
    const adapters = await this.refreshAdapters();
    const availableTargets: DeploymentTargetId[] = [];

    for (const adapter of adapters) {
      const detection = await adapter.detect();
      if (detection.available) {
        availableTargets.push(adapter.target);
      }
    }

    return availableTargets;
  }

  async importManifest(options: ImportManifestOptions): Promise<Result<ImportManifestResult>> {
    const result: ImportManifestResult = {
      imported: 0,
      skippedExisting: 0,
      skippedLocalMissing: 0,
      enabled: 0,
      inactive: 0,
      failed: 0,
      timedOut: 0,
    };
    const apply = options.apply === true && options.dryRun !== true;
    const knownTargets = await this.importManifestTargetIds();

    for (const entry of options.sources) {
      if (options.skipExisting && await this.importSourceExists(entry.source)) {
        result.skippedExisting += 1;
        continue;
      }
      if (options.skipLocalMissing && !(await this.importLocalSourceExists(entry.source))) {
        result.skippedLocalMissing += 1;
        continue;
      }

      const targets = [...new Set(entry.targets ?? [])];
      const unknownTargets = targets.filter((target) => !knownTargets.has(target));
      if (unknownTargets.length > 0) {
        result.failed += 1;
        const error = {
          code: "TARGET_NOT_FOUND",
          message: `Unknown target id(s): ${unknownTargets.join(", ")}.`,
        };
        if (options.continueOnError) {
          continue;
        }
        return fail(error);
      }
      if (!apply) {
        if (entry.skills === "none" || targets.length === 0) {
          result.inactive += 1;
        } else {
          result.enabled += 1;
        }
        continue;
      }

      const added = await this.addSource(entry.source, { project: false });
      if (!added.ok) {
        result.failed += 1;
        if (options.continueOnError) {
          continue;
        }
        return fail(added.errors, added.warnings);
      }

      const selectedLeafIds = entry.skills === "none"
        ? []
        : added.data.leafs.map((leaf) => leaf.id);
      let applied: Awaited<ReturnType<SkillFlowApp["applyDraft"]>>;
      try {
        applied = await this.applyDraft(added.data.sourceId, {
          selectedLeafIds,
          enabledTargets: targets,
        });
      } catch (error) {
        await this.rollbackPreparedSourceInternal(added.data.sourceId);
        result.failed += 1;
        if (options.continueOnError) {
          continue;
        }
        return fail({
          code: "IMPORT_MANIFEST_APPLY_FAILED",
          message: error instanceof Error ? error.message : String(error),
        }, added.warnings);
      }
      if (!applied.ok) {
        await this.rollbackPreparedSourceInternal(added.data.sourceId);
        result.failed += 1;
        if (options.continueOnError) {
          continue;
        }
        return fail(applied.errors, [...added.warnings, ...applied.warnings]);
      }

      result.imported += 1;
      if (targets.length === 0) {
        result.inactive += 1;
      } else {
        result.enabled += 1;
      }
    }

    return ok(result);
  }

  private async importManifestTargetIds(): Promise<Set<DeploymentTargetId>> {
    const { preferences } = await this.readRuntimeAuthorityView();
    return new Set(
      getMergedTargetDefinitions(
        preferences.customTargets,
        preferences.agentDisplayOrder,
      ).map((target) => target.id),
    );
  }

  private async importSourceExists(locator: string): Promise<boolean> {
    const { manifest } = await this.readRuntimeAuthorityView();
    const localPath = this.importLocalPath(locator);
    const sourceId = deriveSourceId(locator);
    return manifest.sources.some((source) =>
      source.locator === locator ||
      source.canonicalLocator === locator ||
      (localPath ? this.sourceMatchesLocalImport(source, localPath) : source.id === sourceId)
    );
  }

  private sourceMatchesLocalImport(source: ManifestFile["sources"][number], localPath: string): boolean {
    return [source.locator, source.canonicalLocator].some((locator) => {
      const sourcePath = this.importLocalPath(locator);
      return sourcePath ? sourcePath === localPath : false;
    });
  }

  private async importLocalSourceExists(locator: string): Promise<boolean> {
    const localPath = this.importLocalPath(locator);
    return localPath ? pathExists(localPath) : true;
  }

  private importLocalPath(locator: string): string | undefined {
    if (locator.startsWith("file://")) {
      return fileURLToPath(locator);
    }
    if (path.isAbsolute(locator) || locator.startsWith(".")) {
      return path.resolve(locator);
    }
    return undefined;
  }

  async enableSources(
    sourceIds: string[],
    targets?: DeploymentTargetId[],
  ): Promise<Result<SourceTargetUpdateResult>> {
    return this.runSerializedMutation(() => this.updateSourceTargets("enable", sourceIds, targets));
  }

  async disableSources(sourceIds: string[]): Promise<Result<SourceTargetUpdateResult>> {
    return this.runSerializedMutation(() => this.updateSourceTargets("disable", sourceIds));
  }

  async onlySources(
    sourceIds: string[],
    targets?: DeploymentTargetId[],
  ): Promise<Result<SourceTargetUpdateResult>> {
    return this.runSerializedMutation(() => this.updateSourceTargets("only", sourceIds, targets));
  }

  async previewDraft(
    sourceId: string,
    draft: DraftBinding,
  ): Promise<Result<{ plan: DeploymentPlan; manifest: ManifestFile; lockFile: LockFile }>> {
    // config TUI state flow:
    //   draft -> previewDraft() -> plan only
    //   draft -> applyDraft()   -> plan + filesystem + manifest/lock writes
    const runtimeView = await this.readRuntimeAuthorityView();
    const prepared = this.prepareAuthorityManifestForDraft(
      this.cloneAuthorityManifest(runtimeView.state.manifest),
      runtimeView.state.lockFile,
      sourceId,
      draft,
    );
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }

    const plan = await this.planForAffectedSources(
      prepared.data.manifest,
      runtimeView.state.lockFile,
      sourceId,
      runtimeView.preferences,
    );
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }
    return ok(
      { plan: plan.data, manifest: prepared.data.manifest, lockFile: runtimeView.state.lockFile },
      [...prepared.warnings, ...plan.warnings],
    );
  }

  async applyDraft(
    sourceId: string,
    draft: DraftBinding,
    scope: ProjectScope = { kind: "global" },
  ): Promise<Result<ApplyDraftResult>> {
    return this.runAuditedMutation(
      "apply-draft",
      {
        sourceId,
        selectedLeafIds: draft.selectedLeafIds,
        enabledTargets: draft.enabledTargets,
        scope,
      },
      () => this.applyDraftAuditedImpl(sourceId, draft, scope),
    );
  }

  private async applyDraftAuditedImpl(
    sourceId: string,
    draft: DraftBinding,
    scope: ProjectScope,
  ): Promise<AuditedMutationResult<ApplyDraftResult>> {
    if (scope.kind === "global") {
      const beforeView = await this.readRuntimeAuthorityView();
      const before = await this.captureSourceAuditSnapshot(beforeView.manifest, beforeView.lockFile, sourceId);
      const result = await this.applyDraftImpl(sourceId, draft, scope);
      const afterView = await this.readRuntimeAuthorityView();
      const after = await this.captureSourceAuditSnapshot(afterView.manifest, afterView.lockFile, sourceId);

      return {
        result,
        auditDetails: {
          stateTransition: {
            before,
            after,
          },
          actionSummary: this.summarizeDeploymentActions(result.ok ? result.data.actions : []),
        },
      };
    }

    const beforeView = await this.readRuntimeAuthorityView();
    const before = await this.captureSourceAuditSnapshot(beforeView.manifest, beforeView.lockFile, sourceId);
    const result = await this.applyDraftImpl(sourceId, draft, scope);
    const afterView = await this.readRuntimeAuthorityView();
    const after = await this.captureSourceAuditSnapshot(afterView.manifest, afterView.lockFile, sourceId);

    return {
      result,
      auditDetails: {
        stateTransition: {
          before,
          after,
        },
        actionSummary: this.summarizeDeploymentActions(result.ok ? result.data.actions : []),
      },
    };
  }

  private async applyDraftImpl(
    sourceId: string,
    draft: DraftBinding,
    scope: ProjectScope,
  ): Promise<Result<ApplyDraftResult>> {
    if (scope.kind === "project") {
      const runtimeView = await this.readRuntimeAuthorityView();
      const { state, manifest: authorityManifest, lockFile: authorityLockFile, preferences } = runtimeView;
      const manifest = this.cloneAuthorityManifest(state.manifest);
      const lockFile = this.cloneLockFile(state.lockFile);
      if (!manifest.sources.some((source) => source.id === sourceId)) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }

      const initialDrafts: Record<string, DraftBinding> = {
        [sourceId]: this.draftFromBinding(
          sourceId,
          this.bindingToSummary(
            authorityManifest.bindings[sourceId],
            authorityLockFile.sources[sourceId]?.leafIds ?? [],
          ),
          authorityLockFile,
        ),
      };
      const previousDraft = this.resolveDraftForScope(sourceId, initialDrafts, preferences, scope);
      const previousPrepared = this.prepareAuthorityManifestForDraft(
        this.cloneAuthorityManifest(state.manifest),
        lockFile,
        sourceId,
        previousDraft,
      );
      if (!previousPrepared.ok) {
        return fail(previousPrepared.errors, previousPrepared.warnings);
      }
      const prepared = this.prepareAuthorityManifestForDraft(manifest, lockFile, sourceId, draft);
      if (!prepared.ok) {
        return fail(prepared.errors, prepared.warnings);
      }
      const scopedTargets = [...new Set([
        ...previousDraft.enabledTargets,
        ...prepared.data.draft.enabledTargets,
      ])];
      const targetRootOverrides = scopedTargets.length === 0
        ? ok({} as TargetRootOverrides)
        : await this.resolveProjectTargetRoots(scope, scopedTargets);
      if (!targetRootOverrides.ok) {
        const preferencesAfterFailure = (await this.readRuntimeAuthorityView()).preferences;
        return {
          ok: false,
          data: {
            actions: [],
            draft: prepared.data.draft,
            recentProjects: preferencesAfterFailure.recentProjects,
            selectedProjectScope: preferencesAfterFailure.selectedProjectScope,
            projectDrafts: preferencesAfterFailure.projectSourceDrafts,
          },
          warnings: [...prepared.warnings, ...targetRootOverrides.warnings],
          errors: targetRootOverrides.errors,
        };
      }
      const scopedDeployments = scopedTargets.length === 0
        ? []
        : await this.findScopedDeploymentsOnDisk(
          previousPrepared.data.manifest,
          lockFile,
          sourceId,
          targetRootOverrides.data,
          this.createAdaptersForPreferences(preferences),
        );
      const nextPreferences: PreferencesFile = {
        ...preferences,
        projectSourceDrafts: {
          ...preferences.projectSourceDrafts,
          [scope.projectId]: {
            ...(preferences.projectSourceDrafts[scope.projectId] ?? {}),
            [sourceId]: {
              sourceId,
              selectedLeafIds: [...prepared.data.draft.selectedLeafIds],
              enabledTargets: [...prepared.data.draft.enabledTargets],
              updatedAt: new Date().toISOString(),
            },
          },
        },
      };

      if (scopedTargets.length > 0) {
        const scopedLockFile = this.cloneLockFileForScopedDeployments(lockFile, scopedDeployments);
        const scopedApply = await this.withScopedTargetRoots<Result<{ actions: DeploymentAction[] }>>(
          targetRootOverrides.data,
          async () => {
          const scopedAdapters = this.adapters;
          const plan = await this.planForSources(
            prepared.data.manifest,
            scopedLockFile,
            [sourceId],
            nextPreferences,
            scopedAdapters,
          );
          if (!plan.ok) {
            return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
          }

          const applyResult = await new DeploymentApplier({
            adapters: scopedAdapters,
            trustedTargetRoots: targetRootOverrides.data,
          }).applyPlan(scopedLockFile, plan.data.actions);
          if (!applyResult.ok) {
            return fail(
              applyResult.errors,
              [...prepared.warnings, ...plan.warnings, ...applyResult.warnings],
            );
          }

          return ok(
            { actions: plan.data.actions },
            [...prepared.warnings, ...plan.warnings, ...applyResult.warnings],
          );
          },
        );
        if (!scopedApply.ok) {
          return fail(scopedApply.errors, scopedApply.warnings);
        }

        await this.writePreferences(nextPreferences);
        const freshState = await this.buildApplyDraftFreshState(sourceId, scope);
        return ok(
          {
            actions: scopedApply.data.actions,
            draft: prepared.data.draft,
            ...(freshState.summary ? { summary: freshState.summary } : {}),
            ...(freshState.inspect ? { inspect: freshState.inspect } : {}),
          },
          scopedApply.warnings,
        );
      }

      await this.writePreferences(nextPreferences);
      const freshState = await this.buildApplyDraftFreshState(sourceId, scope);
      return ok(
        {
          actions: [],
          draft: prepared.data.draft,
          ...(freshState.summary ? { summary: freshState.summary } : {}),
          ...(freshState.inspect ? { inspect: freshState.inspect } : {}),
        },
        prepared.warnings,
      );
    }

    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const prepared = this.prepareAuthorityManifestForDraft(manifest, lockFile, sourceId, draft);
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }

    const preferences = state.preferences;
    const plan = await this.planForAffectedSources(prepared.data.manifest, lockFile, sourceId, preferences);
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }

    const applier = new DeploymentApplier(this.createAdaptersForPreferences(preferences));
    const applyResult = await applier.applyPlan(lockFile, plan.data.actions);

    if (!applyResult.ok) {
      return fail(
        applyResult.errors,
        [...prepared.warnings, ...plan.warnings, ...applyResult.warnings],
      );
    }
    const cleanupWarnings: Warning[] = [];
    const importedTargets = lockFile.sources[sourceId]?.importedFromTargets ?? [];
    const disabledImportedTargets = importedTargets.filter(
      (target) => !prepared.data.draft.enabledTargets.includes(target),
    );
    if (disabledImportedTargets.length > 0) {
      cleanupWarnings.push(
        ...await this.cleanupImportedTargetPaths(
          prepared.data.manifest,
          lockFile,
          [sourceId],
          disabledImportedTargets,
        ),
      );
    }
    cleanupWarnings.push(
      ...await this.cleanupDetachedTargetSymlinksForSources(lockFile, [sourceId]),
    );

    await this.stateStore.writeState({
      ...state,
      manifest: prepared.data.manifest,
      lockFile,
    });

    const freshState = await this.buildApplyDraftFreshState(sourceId, scope);
    return ok(
      {
        actions: plan.data.actions,
        draft: prepared.data.draft,
        ...(freshState.summary ? { summary: freshState.summary } : {}),
        ...(freshState.inspect ? { inspect: freshState.inspect } : {}),
      },
      [
        ...prepared.warnings,
        ...plan.warnings,
        ...applyResult.warnings,
        ...cleanupWarnings,
      ],
    );
  }

  private async buildApplyDraftFreshState(
    sourceId: string,
    scope: ProjectScope,
  ): Promise<Pick<ApplyDraftResult, "summary" | "inspect">> {
    const inspected = await this.inspectSourceImpl(sourceId, scope);
    if (!inspected.ok) {
      return {};
    }

    return {
      summary: inspected.data.summary,
      inspect: inspected.data,
    };
  }

  private async updateSourceTargets(
    mode: "enable" | "disable" | "only",
    sourceIds: string[],
    targets?: DeploymentTargetId[],
  ): Promise<Result<SourceTargetUpdateResult>> {
    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const preferences = state.preferences;
    const requestedSourceIds = uniqueNonEmptyStrings(sourceIds);
    const requestedSourceIdSet = new Set(requestedSourceIds);
    const allSourceIds = manifest.sources.map((source) => source.id);

    for (const sourceId of requestedSourceIds) {
      if (!manifest.sources.some((source) => source.id === sourceId)) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }
    }

    const requestedTargets = targets?.length ? uniqueNonEmptyStrings(targets) : undefined;
    if (requestedTargets) {
      const knownTargetIds = new Set(
        getMergedTargetDefinitions(
          preferences.customTargets,
          preferences.agentDisplayOrder,
        ).map((target) => target.id),
      );
      const unknownTargets = requestedTargets.filter((target) => !knownTargetIds.has(target));
      if (unknownTargets.length > 0) {
        return fail({
          code: "TARGET_NOT_FOUND",
          message: `Unknown target id(s): ${unknownTargets.join(", ")}.`,
        });
      }
    }

    const enabledSourceIds = mode === "disable" ? [] : requestedSourceIds;
    const disabledSourceIds = mode === "only"
      ? allSourceIds.filter((sourceId) => !requestedSourceIdSet.has(sourceId))
      : mode === "disable"
        ? requestedSourceIds
        : [];
    const affectedSourceIds = [...new Set([...enabledSourceIds, ...disabledSourceIds])];
    const previousEnabledTargetsBySourceId = new Map(
      allSourceIds.map((sourceId) => [
        sourceId,
        this.getEnabledTargetsForSource(state.manifest, sourceId),
      ]),
    );
    const prepareWarnings: Warning[] = [];

    const currentDraftForSource = (sourceId: string): Result<DraftBinding> => {
      const sourceLock = lockFile.sources[sourceId];
      if (!sourceLock) {
        return fail({
          code: "SOURCE_LOCK_MISSING",
          message: `${sourceId} is missing from authority lock sources.`,
        });
      }

      const binding = manifest.bindings[sourceId];
      if (binding) {
        return ok(this.draftFromBinding(
          sourceId,
          this.bindingToSummary(binding, sourceLock.leafIds),
          lockFile,
        ));
      }

      return ok({
        selectedLeafIds: [...sourceLock.leafIds],
        enabledTargets: [],
      });
    };

    for (const sourceId of disabledSourceIds) {
      const currentDraft = currentDraftForSource(sourceId);
      if (!currentDraft.ok) {
        return fail(currentDraft.errors, currentDraft.warnings);
      }

      const prepared = this.prepareAuthorityManifestForDraft(manifest, lockFile, sourceId, {
        selectedLeafIds: currentDraft.data.selectedLeafIds,
        enabledTargets: [],
      });
      if (!prepared.ok) {
        return fail(prepared.errors, [...currentDraft.warnings, ...prepared.warnings]);
      }
      prepareWarnings.push(...currentDraft.warnings, ...prepared.warnings);
    }

    for (const sourceId of enabledSourceIds) {
      const currentDraft = currentDraftForSource(sourceId);
      if (!currentDraft.ok) {
        return fail(currentDraft.errors, currentDraft.warnings);
      }

      const enabledTargets = requestedTargets
        ? [...requestedTargets]
        : previousEnabledTargetsBySourceId.get(sourceId) ?? [];
      if (enabledTargets.length === 0) {
        return fail({
          code: "TARGETS_REQUIRED",
          message: `Source ${sourceId} has no existing targets. Pass --targets codex,cline.`,
        });
      }

      const prepared = this.prepareAuthorityManifestForDraft(manifest, lockFile, sourceId, {
        selectedLeafIds: currentDraft.data.selectedLeafIds,
        enabledTargets,
      });
      if (!prepared.ok) {
        return fail(prepared.errors, [...currentDraft.warnings, ...prepared.warnings]);
      }
      prepareWarnings.push(...currentDraft.warnings, ...prepared.warnings);
    }

    const previouslyProjectedSourceIds = lockFile.projections
      .filter((projection) => projection.status === "active")
      .map((projection) => projection.sourceId);
    const planSourceIds = allSourceIds.filter((sourceId) =>
      affectedSourceIds.includes(sourceId) ||
      this.hasActiveTargets(manifest, sourceId) ||
      previouslyProjectedSourceIds.includes(sourceId)
    );
    const planned = await this.planForSources(manifest, lockFile, planSourceIds, preferences);
    if (!planned.ok) {
      return fail(planned.errors, [...prepareWarnings, ...planned.warnings]);
    }

    const applier = new DeploymentApplier(this.createAdaptersForPreferences(preferences));
    const applied = await applier.applyPlan(lockFile, planned.data.actions);
    if (!applied.ok) {
      return fail(applied.errors, [...prepareWarnings, ...planned.warnings, ...applied.warnings]);
    }

    const cleanupWarnings: Warning[] = [];
    for (const sourceId of affectedSourceIds) {
      const importedTargets = lockFile.sources[sourceId]?.importedFromTargets ?? [];
      const nextTargets = this.getEnabledTargetsForSource(manifest, sourceId);
      const disabledImportedTargets = importedTargets.filter((target) =>
        !nextTargets.includes(target)
      );
      if (disabledImportedTargets.length > 0) {
        cleanupWarnings.push(
          ...await this.cleanupImportedTargetPaths(
            manifest,
            lockFile,
            [sourceId],
            disabledImportedTargets,
          ),
        );
      }
    }
    cleanupWarnings.push(
      ...await this.cleanupDetachedTargetSymlinksForSources(lockFile, affectedSourceIds),
    );

    await this.stateStore.writeState({
      ...state,
      manifest,
      lockFile,
    });

    return ok(
      {
        enabledSourceIds,
        disabledSourceIds,
        actions: planned.data.actions,
      },
      [...prepareWarnings, ...planned.warnings, ...applied.warnings, ...cleanupWarnings],
    );
  }

  async updateSources(sourceIds?: string[]): Promise<
    Result<SourceUpdateResult>
  > {
    return this.runAuditedMutation(
      "update-sources",
      { sourceIds: sourceIds ?? [] },
      () => this.updateSourcesImpl(sourceIds),
    );
  }

  private async updateSourcesImpl(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    const updated = await this.sourceAuthorityService.updateSources(sourceIds);
    if (!updated.ok) {
      return updated;
    }

    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const preferences = state.preferences;
    const updatedSourceIds = new Set(updated.data.updated.map((item) => item.sourceId));
    const projectedSourceIds = new Set(
      lockFile.projections
        .filter((projection) => projection.status === "active")
        .map((projection) => projection.sourceId),
    );
    const planSourceIds = manifest.sources
      .map((source) => source.id)
      .filter((id) =>
        updatedSourceIds.has(id) ||
        this.hasActiveTargets(manifest, id) ||
        projectedSourceIds.has(id),
      );
    const planned = await this.planForSources(manifest, lockFile, planSourceIds, preferences);
    if (!planned.ok) {
      return fail(planned.errors, [...updated.warnings, ...planned.warnings]);
    }
    const applier = new DeploymentApplier(this.createAdaptersForPreferences(preferences));
    const applied = await applier.applyPlan(lockFile, planned.data.actions);
    if (!applied.ok) {
      return fail(applied.errors, [...updated.warnings, ...planned.warnings, ...applied.warnings]);
    }
    await this.stateStore.writeState({
      ...state,
      manifest,
      lockFile,
    });
    return ok(updated.data, [...updated.warnings, ...planned.warnings, ...applied.warnings]);
  }

  async doctor(): Promise<Result<DoctorReport>> {
    return this.runAuditedMutation(
      "doctor",
      {},
      () => this.doctorImpl(),
    );
  }

  private async doctorImpl(): Promise<Result<DoctorReport>> {
    const pruned = await this.pruneMissingCheckoutsImpl();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }
    const preReconcileState = await this.stateStore.readState();
    const preReconcileBrokenSymlinks = await this.detectBrokenSymlinkIssues(preReconcileState);
    const reconciled = await this.sourceAuthorityService.reconcileInventory();
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    const state = await this.stateStore.readState();
    const orphanWarnings = await this.cleanupOrphanTargetSymlinks(state.manifest, state.lockFile);
    const doctor = await this.doctorService.run(
      state.manifest,
      state.lockFile,
      state.preferences,
    );
    if (!doctor.ok) {
      return doctor;
    }
    return ok(
      {
        ...doctor.data,
        issues: [...preReconcileBrokenSymlinks, ...doctor.data.issues],
      },
      [...pruned.warnings, ...reconciled.warnings, ...orphanWarnings, ...doctor.warnings],
    );
  }

  private async detectBrokenSymlinkIssues(state: {
    manifest: ManifestFile;
    lockFile: LockFile;
  }): Promise<DoctorIssue[]> {
    const issues: DoctorIssue[] = [];
    for (const projection of state.lockFile.projections) {
      if (projection.status !== "active" || projection.strategy !== "symlink") {
        continue;
      }
      const stats = await fs.lstat(projection.targetPath).catch(() => undefined);
      if (!stats?.isSymbolicLink()) {
        continue;
      }
      const broken = await fs.stat(projection.targetPath).then(
        () => false,
        () => true,
      );
      if (!broken) {
        continue;
      }
      const source = state.manifest.sources.find((item) => item.id === projection.sourceId);
      const leaf = state.lockFile.leafInventory.find((item) => item.id === projection.leafId);
      issues.push({
        severity: "error",
        sourceId: projection.sourceId,
        ...(source ? { sourceLabel: source.displayName } : {}),
        target: projection.target,
        leafId: projection.leafId,
        ...(leaf ? { leafLabel: leaf.linkName } : {}),
        code: "BROKEN_SYMLINK",
        message: "Projected symlink is broken.",
      });
    }
    return issues;
  }

  async repairTargets(sourceIds?: string[]): Promise<Result<{ actions: DeploymentAction[] }>> {
    return this.runSerializedMutation(() => this.repairTargetsImpl(sourceIds));
  }

  async applyTargets(sourceIds?: string[]): Promise<Result<{ actions: DeploymentAction[] }>> {
    return this.runSerializedMutation(() => this.repairTargetsImpl(sourceIds));
  }

  async inspectTargetStatus(sourceIds?: string[]): Promise<Result<{ diagnostics: Diagnostic[] }>> {
    return this.runSerializedMutation(() => this.inspectTargetStatusImpl(sourceIds));
  }

  private async repairTargetsImpl(
    sourceIds?: string[],
  ): Promise<Result<{ actions: DeploymentAction[] }>> {
    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const preferences = state.preferences;
    const adapters = this.createAdaptersForPreferences(preferences);
    const warnings: Warning[] = [];

    const requestedIds = sourceIds?.length
      ? sourceIds
      : manifest.sources.map((source) => source.id);
    for (const sourceId of requestedIds) {
      if (!manifest.sources.some((source) => source.id === sourceId)) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }
    }
    for (const sourceId of requestedIds) {
      const sourceLock = lockFile.sources[sourceId];
      if (
        sourceLock?.importMode === "bootstrap-detected" &&
        !this.hasActiveTargets(manifest, sourceId) &&
        !lockFile.projections.some((projection) =>
          projection.sourceId === sourceId && projection.status === "active"
        )
      ) {
        warnings.push({
          code: "REPAIR_TARGETS_SKIPPED_BOOTSTRAP_IMPORTED",
          message: `Skipped imported-only bootstrap source '${sourceId}' because it has no managed projection to repair.`,
        });
      }
    }
    const unknownTargetActions = this.blockUnknownTargetProjections(lockFile, requestedIds, adapters);
    const unknownTargetKeys = new Set(
      unknownTargetActions.map((action) =>
        this.projectionKey(action.sourceId, action.leafId, action.target)
      ),
    );
    lockFile.projections = lockFile.projections.map((projection) =>
      unknownTargetKeys.has(this.projectionKey(projection.sourceId, projection.leafId, projection.target))
        ? {
            ...projection,
            status: "blocked" as const,
            updatedAt: new Date().toISOString(),
          }
        : projection,
    );

    const planSourceIds = requestedIds.filter(
      (sourceId) =>
        this.hasActiveTargets(manifest, sourceId) ||
        lockFile.projections.some((projection) =>
          projection.sourceId === sourceId &&
          projection.status === "active" &&
          !unknownTargetKeys.has(this.projectionKey(projection.sourceId, projection.leafId, projection.target))
        ),
    );
    const planned = await this.planForSources(manifest, lockFile, planSourceIds, preferences, adapters);
    if (!planned.ok) {
      return fail(planned.errors, [...warnings, ...planned.warnings]);
    }
    const applier = new DeploymentApplier(adapters);
    const applied = await applier.applyPlan(lockFile, planned.data.actions);
    if (!applied.ok) {
      return fail(applied.errors, [...warnings, ...planned.warnings, ...applied.warnings]);
    }

    await this.stateStore.writeState({
      ...state,
      manifest,
      lockFile,
    });
    return ok(
      { actions: [...planned.data.actions, ...unknownTargetActions] },
      [...warnings, ...planned.warnings, ...applied.warnings],
    );
  }

  private async inspectTargetStatusImpl(
    sourceIds?: string[],
  ): Promise<Result<{ diagnostics: Diagnostic[] }>> {
    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const preferences = state.preferences;
    const adapters = this.createAdaptersForPreferences(preferences);
    const requestedIds = sourceIds?.length
      ? sourceIds
      : manifest.sources.map((source) => source.id);
    for (const sourceId of requestedIds) {
      if (!manifest.sources.some((source) => source.id === sourceId)) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }
    }

    const unknownTargetActions = this.blockUnknownTargetProjections(lockFile, requestedIds, adapters);
    const planSourceIds = requestedIds.filter((sourceId) =>
      this.hasActiveTargets(manifest, sourceId) ||
      lockFile.projections.some((projection) =>
        projection.sourceId === sourceId && projection.status === "active"
      )
    );
    const planned = await this.planForSources(manifest, lockFile, planSourceIds, preferences, adapters);
    if (!planned.ok) {
      return fail(planned.errors, planned.warnings);
    }

    const diagnostics: Diagnostic[] = [
      ...this.deploymentActionDiagnostics(unknownTargetActions),
      ...planned.data.actions
        .filter((action) => action.kind !== "noop")
        .map((action) => ({
          code: "TARGET_PROJECTION_DRIFT",
          message: `Projection for '${action.sourceId}:${action.leafId}' on '${action.target}' needs ${action.kind}.`,
          retryable: true,
          details: {
            sourceId: action.sourceId,
            leafId: action.leafId,
            target: action.target,
            action: action.kind,
            targetPath: action.targetPath,
            ...(action.previousTargetPath ? { previousTargetPath: action.previousTargetPath } : {}),
          },
        })),
    ];
    return ok({ diagnostics }, planned.warnings);
  }

  private blockUnknownTargetProjections(
    lockFile: LockFile,
    sourceIds: string[],
    adapters: ChannelAdapter[],
  ): DeploymentAction[] {
    const knownTargets = new Set(adapters.map((adapter) => adapter.target));
    const requested = new Set(sourceIds);
    return lockFile.projections
      .filter((projection) =>
        projection.status === "active" &&
        requested.has(projection.sourceId) &&
        !knownTargets.has(projection.target)
      )
      .map((projection) => {
        const leaf = lockFile.leafInventory.find((item) => item.id === projection.leafId);
        return {
          kind: "blocked" as const,
          sourceId: projection.sourceId,
          leafId: projection.leafId,
          target: projection.target,
          strategy: projection.strategy,
          sourcePath: leaf?.absolutePath ?? "",
          targetPath: projection.targetPath,
          ...(projection.targetRootPath ? { targetRootPath: projection.targetRootPath } : {}),
          reason: `Target '${projection.target}' is not configured.`,
          contentHash: leaf?.contentHash ?? projection.contentHash,
          diagnostics: [{
            code: "TARGET_UNKNOWN",
            message: `Target '${projection.target}' is not configured.`,
            retryable: false,
            details: {
              sourceId: projection.sourceId,
              leafId: projection.leafId,
              target: projection.target,
              targetPath: projection.targetPath,
            },
          }],
        };
      });
  }

  private deploymentActionDiagnostics(actions: DeploymentAction[]): Diagnostic[] {
    return actions.flatMap((action) => {
      const diagnostics = (action as DeploymentAction & { diagnostics?: Diagnostic[] }).diagnostics;
      return diagnostics ?? [];
    });
  }

  private projectionKey(sourceId: string, leafId: string, target: DeploymentTargetId): string {
    return `${sourceId}\0${leafId}\0${target}`;
  }

  async repairSource(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    return this.runSerializedMutation(() => this.repairSourceImpl(sourceIds));
  }

  private async repairSourceImpl(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    return this.sourceAuthorityService.updateSources(sourceIds);
  }

  async repairState(
    sourceIds?: string[],
  ): Promise<Result<{ repairedSourceIds: string[]; removedDeploymentCount: number }>> {
    return this.runSerializedMutation(() => this.repairStateImpl(sourceIds));
  }

  private async repairStateImpl(
    sourceIds?: string[],
  ): Promise<Result<{ repairedSourceIds: string[]; removedDeploymentCount: number }>> {
    const pruned = await this.pruneMissingCheckoutsImpl();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }

    const requestedIds = sourceIds?.filter(
      (sourceId) => !pruned.data.removedSourceIds.includes(sourceId),
    );
    if (sourceIds?.length && requestedIds?.length === 0) {
      return ok(
        { repairedSourceIds: [], removedDeploymentCount: 0 },
        pruned.warnings,
      );
    }

    const reconciled = await this.sourceAuthorityService.reconcileInventory(requestedIds, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, [...pruned.warnings, ...reconciled.warnings]);
    }

    const state = await this.stateStore.readState();
    const manifest = this.cloneAuthorityManifest(state.manifest);
    const lockFile = this.cloneLockFile(state.lockFile);
    const preferences = state.preferences;
    const planSourceIds = requestedIds?.length
      ? requestedIds
      : manifest.sources.map((source) => source.id);
    const requestedSet = new Set(planSourceIds);
    const previousActiveProjectionCount = lockFile.projections.filter((projection) =>
      projection.status === "active" && requestedSet.has(projection.sourceId)
    ).length;

    const planned = await this.planForSources(manifest, lockFile, planSourceIds, preferences);
    if (!planned.ok) {
      return fail(planned.errors, [
        ...pruned.warnings,
        ...reconciled.warnings,
        ...planned.warnings,
      ]);
    }
    const applier = new DeploymentApplier(this.createAdaptersForPreferences(preferences));
    const applied = await applier.applyPlan(lockFile, planned.data.actions);
    if (!applied.ok) {
      return fail(applied.errors, [
        ...pruned.warnings,
        ...reconciled.warnings,
        ...planned.warnings,
        ...applied.warnings,
      ]);
    }

    const nextActiveProjectionCount = lockFile.projections.filter((projection) =>
      projection.status === "active" && requestedSet.has(projection.sourceId)
    ).length;
    await this.stateStore.writeState({
      ...state,
      manifest,
      lockFile,
    });
    const removedDeploymentCount = Math.max(
      0,
      previousActiveProjectionCount - nextActiveProjectionCount,
    );

    return ok(
      {
        repairedSourceIds: reconciled.data.updatedSourceIds,
        removedDeploymentCount,
      },
      [...pruned.warnings, ...reconciled.warnings, ...planned.warnings, ...applied.warnings],
    );
  }

  async uninstall(sourceIds: string[]): Promise<
    Result<{
      removed: string[];
      removedRefs: Array<{ id: string; locator: string; displayName: string }>;
      warnings: string[];
    }>
  > {
    return this.runAuditedMutation(
      "uninstall",
      { sourceIds },
      () => this.uninstallImpl(sourceIds),
    );
  }

  private async uninstallImpl(sourceIds: string[]): Promise<
    Result<{
      removed: string[];
      removedRefs: Array<{ id: string; locator: string; displayName: string }>;
      warnings: string[];
    }>
  > {
    const state = await this.stateStore.readState();
    const warnings: string[] = [];
    const removedRefs = sourceIds
      .map((sourceId) => state.manifest.sources.find((source) => source.id === sourceId))
      .filter((source): source is ManifestFile["sources"][number] => Boolean(source))
      .map((source) => ({
        id: source.id,
        locator: source.locator,
        displayName: source.displayName,
      }));
    const importedCleanupWarnings = await this.cleanupImportedTargetPaths(
      state.manifest,
      state.lockFile,
      sourceIds,
    );

    for (const sourceId of sourceIds) {
      const projections = state.lockFile.projections.filter(
        (projection) => projection.sourceId === sourceId,
      );

      for (const projection of projections) {
        if (!(await pathExists(projection.targetPath))) {
          continue;
        }
        if (
          !projection.targetRootPath ||
          !isPathInside(projection.targetRootPath, projection.targetPath)
        ) {
          warnings.push(`Refusing to remove unmanaged target path ${projection.targetPath}.`);
          continue;
        }
        try {
          const hasPersistentOwner = state.lockFile.projections.some((candidate) =>
            candidate.targetPath === projection.targetPath &&
            !(
              candidate.sourceId === projection.sourceId &&
              candidate.leafId === projection.leafId &&
              candidate.target === projection.target
            )
          );
          if (!hasPersistentOwner) {
            await removePath(projection.targetPath);
          }
        } catch (error) {
          warnings.push(`Unable to remove ${projection.targetPath}: ${String(error)}`);
        }
      }
    }

    if (warnings.length > 0) {
      return fail(
        {
          code: "GROUP_DELETE_INCOMPLETE",
          message: `Unable to fully delete ${warnings.length} managed path${warnings.length === 1 ? "" : "s"}.`,
        },
        warnings.map((message) => ({
          code: "GROUP_DELETE_PATH_FAILED",
          message,
        })),
      );
    }

    let removed;
    try {
      removed = await this.sourceAuthorityService.removeSource(sourceIds);
    } catch (error) {
      return fail({
        code: "GROUP_DELETE_INCOMPLETE",
        message: `Unable to fully delete selected skills groups: ${String(error)}`,
      });
    }
    if (!removed.ok) {
      return fail(removed.errors, removed.warnings);
    }

    return ok(
      { removed: removed.data.removed, removedRefs, warnings },
      [...importedCleanupWarnings, ...removed.warnings],
    );
  }

  bindingFromDraft(draft: DraftBinding): SourceBindingSummary {
    const targets: SourceBindingSummary["targets"] = {};
    for (const target of draft.enabledTargets) {
      targets[target] = {
        enabled: true,
        leafIds: [...draft.selectedLeafIds],
      };
    }
    return {
      selectedLeafIds: [...draft.selectedLeafIds],
      resolvedSelectedLeafCount: draft.selectedLeafIds.length,
      targets,
    };
  }

  private uniqueCollectionSourceId(
    displayName: string,
    manifest: ManifestFile,
    collections: CollectionsFile,
  ): string {
    const baseId = deriveSourceId(displayName) || "skill-collection";
    const usedIds = new Set([
      ...manifest.sources.map((source) => source.id),
      ...Object.keys(manifest.bindings),
      ...Object.keys(collections.collections),
    ]);
    let candidate = baseId;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private validateCollectionSkillRefs(
    skills: CollectionSkillRef[],
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Result<CollectionSkillRef[]> {
    const includedSkills: CollectionSkillRef[] = [];
    const seen = new Set<string>();

    for (const skill of skills) {
      const sourceId = skill.sourceId.trim();
      const leafId = skill.leafId.trim();
      const source = manifest.sources.find((item) => item.id === sourceId);
      if (!source) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }

      const sourceLock = lockFile.sources[sourceId];
      if (!sourceLock) {
        return fail({
          code: "SOURCE_LOCK_MISSING",
          message: `${sourceId} is missing from authority lock sources.`,
        });
      }

      const leaf = lockFile.leafInventory.find((item) => item.id === leafId);
      if (!leaf || leaf.sourceId !== sourceId || !sourceLock.leafIds.includes(leafId)) {
        return fail({
          code: "LEAF_NOT_FOUND",
          message: `Skill leaf '${leafId}' is not registered in skills group '${sourceId}'.`,
        });
      }

      const key = `${sourceId}\0${leafId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      includedSkills.push({ sourceId, leafId });
    }

    return ok(includedSkills);
  }

  private findCollectionSkillNameConflict(
    skills: CollectionSkillRef[],
    lockFile: LockFile,
  ): { code: string; message: string } | undefined {
    const refsByName = new Map<string, Array<{ sourceId: string; leaf: LeafRecord }>>();

    for (const skill of skills) {
      const leaf = lockFile.leafInventory.find((item) => item.id === skill.leafId);
      if (!leaf) {
        continue;
      }
      const projectedName = leaf.linkName.trim();
      if (!projectedName) {
        continue;
      }
      refsByName.set(projectedName, [
        ...(refsByName.get(projectedName) ?? []),
        { sourceId: skill.sourceId, leaf },
      ]);
    }

    const duplicates = [...refsByName.entries()].filter(([, refs]) => refs.length > 1);
    if (duplicates.length === 0) {
      return undefined;
    }

    return {
      code: "COLLECTION_SKILL_NAME_CONFLICT",
      message: `Collection contains duplicate projected skill names: ${
        duplicates
          .map(([name, refs]) =>
            `${name} (${refs.map((ref) => `${ref.sourceId}:${ref.leaf.relativePath}`).join(", ")})`
          )
          .join("; ")
      }.`,
    };
  }

  private async materializeCollectionMembers(
    collectionId: string,
    skills: CollectionSkillRef[],
    manifest: ManifestFile,
    lockFile: LockFile,
    migrationGeneration: ManifestFile["migrationGeneration"],
    now: string,
  ): Promise<Result<{
    collectionRoot: string;
    members: SkillCollectionRecord["members"];
    leafs: LeafRecord[];
  }>> {
    try {
      const materialized = await materializeSkillCollectionMembers({
        stateRoot: this.stateStore.rootPath,
        collectionId,
        refs: skills,
        migrationGeneration,
        capturedAt: now,
        resolveOrigin: async (ref, index) => {
          const originSource = manifest.sources.find((source) => source.id === ref.sourceId);
          const originLock = lockFile.sources[ref.sourceId];
          const originLeaf = lockFile.leafInventory.find(
            (leaf) => leaf.id === ref.leafId && leaf.sourceId === ref.sourceId,
          );
          if (!originSource || !originLock || !originLeaf) {
            throw new SkillCollectionMemberOriginMissingError(collectionId, ref);
          }

          const label = originLeaf.title || originLeaf.linkName || `member-${index + 1}`;
          return {
            sourceId: ref.sourceId,
            leafId: ref.leafId,
            sourceLocator: originSource.locator,
            canonicalLocator: originLock.canonicalLocator,
            repoPath: originLeaf.relativePath,
            contentHashAtCapture: originLeaf.contentHash,
            sourcePath: originLeaf.absolutePath,
            title: label,
            description: originLeaf.description ?? "",
            selectorAliases: [originLeaf.id, originLeaf.relativePath],
          };
        },
      });

      return ok({
        collectionRoot: materialized.collectionRoot,
        members: materialized.members,
        leafs: materialized.leafs,
      });
    } catch (error) {
      if (error instanceof SkillCollectionMemberOriginMissingError) {
        return fail({
          code: "COLLECTION_MEMBER_ORIGIN_MISSING",
          message: `Skill leaf '${error.ref.leafId}' is not available for collection '${collectionId}'.`,
        });
      }
      return fail({
        code: "COLLECTION_MATERIALIZATION_FAILED",
        message: `Unable to materialize collection '${collectionId}': ${String(error)}`,
      });
    }
  }

  private collectionToViewRecord(collection: SkillCollectionRecord): CollectionViewRecord {
    return {
      id: collection.id,
      displayName: collection.displayName,
      includedSkills: collection.members.map((member) => ({
        sourceId: member.origin.sourceId,
        leafId: member.origin.leafId,
      })),
      hiddenSourceIds: [...collection.hiddenSourceIds],
      restoreSnapshots: Object.fromEntries(
        Object.entries(collection.restoreSelections).map(([sourceId, selection]) => [
          sourceId,
          {
            selectedLeafIds: [...selection.selectedLeafIds],
            enabledTargets: [...selection.enabledTargets],
          },
        ]),
      ),
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  private bindingFromRestoreSelection(
    selection: SkillCollectionRecord["restoreSelections"][string],
    sourceLeafIds: string[],
  ): ManifestFile["bindings"][string] {
    const sourceLeafIdSet = new Set(sourceLeafIds);
    const selectedLeafIds = [...new Set(selection.selectedLeafIds)]
      .filter((leafId) => sourceLeafIdSet.has(leafId));
    const selectedLeafIdSet = new Set(selectedLeafIds);
    const selectsEveryCurrentLeaf =
      sourceLeafIds.length > 0 &&
      sourceLeafIds.every((leafId) => selectedLeafIdSet.has(leafId));

    return {
      sourceId: selection.sourceId,
      selectionMode: selectsEveryCurrentLeaf ? "all" : "selected",
      selectedLeafIds: selectsEveryCurrentLeaf ? [] : selectedLeafIds,
      enabledTargets: [...new Set(selection.enabledTargets)],
    };
  }

  private hiddenSourceIdsFromCollections(collections: CollectionsFile): Set<string> {
    return new Set(
      Object.values(collections.collections).flatMap((collection) => collection.hiddenSourceIds),
    );
  }

  private resolveDraftForScope(
    sourceId: string,
    initialDrafts: Record<string, DraftBinding>,
    preferences: PreferencesFile,
    scope: ProjectScope,
  ): DraftBinding {
    if (scope.kind === "global") {
      return initialDrafts[sourceId] ?? EMPTY_DRAFT;
    }

    return (
      this.projectDraftsForPreferences(preferences)[scope.projectId]?.[sourceId] ??
      initialDrafts[sourceId] ??
      EMPTY_DRAFT
    );
  }

  private projectDraftsForPreferences(
    preferences: PreferencesFile,
  ): ScopedSourceDrafts {
    return Object.fromEntries(
      Object.entries(preferences.projectSourceDrafts).map(([projectId, drafts]) => [
        projectId,
        Object.fromEntries(
          Object.entries(drafts).map(([sourceId, draft]) => [
            sourceId,
            {
              selectedLeafIds: [...draft.selectedLeafIds],
              enabledTargets: [...draft.enabledTargets],
            },
          ]),
        ),
      ]),
    );
  }

  private cloneManifest(manifest: RuntimeManifestView): RuntimeManifestView {
    const bindings: Record<string, SourceBindingSummary> = {};

    for (const [sourceId, binding] of Object.entries(manifest.bindings)) {
      const targets: SourceBindingSummary["targets"] = {};
      for (const [target, targetBinding] of Object.entries(binding.targets)) {
        if (!targetBinding) {
          continue;
        }
        targets[target as DeploymentTargetName] = {
          enabled: targetBinding.enabled,
          leafIds: [...targetBinding.leafIds],
        };
      }

      bindings[sourceId] = {
        selectedLeafIds: [...binding.selectedLeafIds],
        resolvedSelectedLeafCount: binding.resolvedSelectedLeafCount ?? binding.selectedLeafIds.length,
        targets,
      };
    }

    return {
      schemaVersion: manifest.schemaVersion,
      sources: manifest.sources.map((source) => ({ ...source })),
      bindings,
    };
  }

  private cloneAuthorityManifest(manifest: ManifestFile): ManifestFile {
    return {
      schemaVersion: manifest.schemaVersion,
      migrationGeneration: manifest.migrationGeneration,
      sources: manifest.sources.map((source) => ({ ...source })),
      bindings: Object.fromEntries(
        Object.entries(manifest.bindings).map(([sourceId, binding]) => [
          sourceId,
          {
            sourceId: binding.sourceId,
            selectionMode: binding.selectionMode,
            selectedLeafIds: [...binding.selectedLeafIds],
            enabledTargets: [...binding.enabledTargets],
          },
        ]),
      ),
    };
  }

  private cloneLockFile(lockFile: LockFile): LockFile {
    return {
      schemaVersion: lockFile.schemaVersion,
      migrationGeneration: lockFile.migrationGeneration,
      sources: Object.fromEntries(
        Object.entries(lockFile.sources).map(([sourceId, source]) => [
          sourceId,
          {
            sourceId: source.sourceId,
            canonicalLocator: source.canonicalLocator,
            revision: { ...source.revision },
            localPath: source.localPath,
            leafIds: [...source.leafIds],
            ...(source.packageSlug ? { packageSlug: source.packageSlug } : {}),
            ...(source.resolvedVersion ? { resolvedVersion: source.resolvedVersion } : {}),
            ...(source.contentHash ? { contentHash: source.contentHash } : {}),
            ...(source.versionMode ? { versionMode: source.versionMode } : {}),
            ...(source.originBranch ? { originBranch: source.originBranch } : {}),
            ...(source.importedFromTargets ? { importedFromTargets: [...source.importedFromTargets] } : {}),
            ...(source.observedTargets
              ? { observedTargets: source.observedTargets.map((target) => ({ ...target })) }
              : {}),
            ...(source.importMode ? { importMode: source.importMode } : {}),
          },
        ]),
      ),
      leafInventory: lockFile.leafInventory.map((leaf) => ({
        ...leaf,
        ...(leaf.selectors ? { selectors: {
          ...leaf.selectors,
          aliases: [...leaf.selectors.aliases],
        } } : {}),
        ...(leaf.diagnostics ? { diagnostics: leaf.diagnostics.map((diagnostic) => ({ ...diagnostic })) } : {}),
      })),
      projections: lockFile.projections.map((projection) => ({ ...projection })),
    };
  }

  private async pruneMissingCheckoutsImpl(): Promise<Result<{ removedSourceIds: string[] }>> {
    const state = await this.stateStore.readState();
    const removedSourceIds: string[] = [];
    const warnings: Warning[] = [];

    for (const source of state.manifest.sources) {
      const lock = state.lockFile.sources[source.id];
      if (!lock || await pathExists(lock.localPath)) {
        continue;
      }

      removedSourceIds.push(source.id);
      warnings.push({
        code: "SOURCE_CHECKOUT_MISSING",
        message: `Removed ${source.displayName} because checkout is missing at ${lock.localPath}.`,
      });
      warnings.push(
        ...await this.cleanupImportedTargetPaths(
          state.manifest,
          state.lockFile,
          [source.id],
        ),
      );

      const projections = state.lockFile.projections.filter(
        (projection) => projection.sourceId === source.id,
      );
      for (const projection of projections) {
        if (!(await pathExists(projection.targetPath))) {
          continue;
        }
        if (
          !projection.targetRootPath ||
          !isPathInside(projection.targetRootPath, projection.targetPath)
        ) {
          warnings.push({
            code: "SOURCE_CHECKOUT_PRUNE_SKIPPED",
            message: `Skipped unmanaged deployment path ${projection.targetPath} while pruning ${source.displayName}.`,
          });
          continue;
        }
        try {
          const hasPersistentOwner = state.lockFile.projections.some((candidate) =>
            candidate.targetPath === projection.targetPath &&
            !(
              candidate.sourceId === projection.sourceId &&
              candidate.leafId === projection.leafId &&
              candidate.target === projection.target
            )
          );
          if (!hasPersistentOwner) {
            await removePath(projection.targetPath);
          }
        } catch (error) {
          return fail({
            code: "SOURCE_CHECKOUT_PRUNE_FAILED",
            message: `Unable to clean deployment ${projection.targetPath}: ${String(error)}`,
          }, warnings);
        }
      }
    }

    if (removedSourceIds.length === 0) {
      return ok({ removedSourceIds: [] });
    }

    const nextBindings = { ...state.manifest.bindings };
    for (const sourceId of removedSourceIds) {
      delete nextBindings[sourceId];
    }
    const nextLockSources = { ...state.lockFile.sources };
    for (const sourceId of removedSourceIds) {
      delete nextLockSources[sourceId];
    }

    await this.stateStore.writeState({
      ...state,
      manifest: {
        ...state.manifest,
        sources: state.manifest.sources.filter((source) => !removedSourceIds.includes(source.id)),
        bindings: nextBindings,
      },
      lockFile: {
        ...state.lockFile,
        sources: nextLockSources,
        leafInventory: state.lockFile.leafInventory.filter(
      (leaf) => !removedSourceIds.includes(leaf.sourceId),
        ),
        projections: state.lockFile.projections.filter(
      (projection) => !removedSourceIds.includes(projection.sourceId),
        ),
      },
    });

    return ok({ removedSourceIds }, warnings);
  }

  private async cleanupOrphanTargetSymlinks(
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Promise<Warning[]> {
    const warnings: Warning[] = [];
    const managedStateRoot = await fs.realpath(this.store.rootPath).catch(() =>
      path.resolve(this.store.rootPath),
    );
    const adapters = await this.refreshAdapters();

    for (const adapter of adapters) {
      const detection = await adapter.detect();
      if (!detection.available || !(await pathExists(detection.rootPath))) {
        continue;
      }

      const entries = await fs.readdir(detection.rootPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const targetPath = path.join(detection.rootPath, entry.name);
        const resolvedTargetPath = path.resolve(targetPath);
        const realTargetPath = await fs.realpath(targetPath).catch(() => undefined);
        const linkTarget = realTargetPath
          ? realTargetPath
          : await fs.readlink(targetPath)
              .then((value) => path.resolve(path.dirname(targetPath), value))
              .catch(() => undefined);
        if (!linkTarget) {
          continue;
        }

        const resolvedLinkTarget = path.resolve(linkTarget);
        if (
          !isPathInside(managedStateRoot, resolvedLinkTarget) &&
          resolvedLinkTarget !== managedStateRoot
        ) {
          continue;
        }

        const matchingProjections = lockFile.projections.filter(
          (projection) => path.resolve(projection.targetPath) === resolvedTargetPath,
        );
        const hasResolvableProjection = matchingProjections.some((projection) =>
          this.isProjectionStillResolvable(manifest, lockFile, projection),
        );
        if (hasResolvableProjection) {
          continue;
        }

        await removePath(targetPath);
        lockFile.projections = lockFile.projections.filter(
          (projection) => path.resolve(projection.targetPath) !== resolvedTargetPath,
        );
        warnings.push({
          code: "ORPHAN_TARGET_SYMLINK_REMOVED",
          message: `Removed orphan target symlink ${targetPath} because it points into managed state without a matching projection.`,
        });
      }
    }

    return warnings;
  }

  private async cleanupDetachedTargetSymlinksForSources(
    lockFile: LockFile,
    sourceIds: string[],
  ): Promise<Warning[]> {
    const warnings: Warning[] = [];
    const adapters = await this.refreshAdapters();
    const checkoutRoots = new Map<string, string>();
    for (const source of Object.values(lockFile.sources).filter((item) => sourceIds.includes(item.sourceId))) {
      const resolvedCheckoutPath = await fs.realpath(source.localPath).catch(() =>
        path.resolve(source.localPath),
      );
      checkoutRoots.set(source.sourceId, resolvedCheckoutPath);
    }
    if (checkoutRoots.size === 0) {
      return warnings;
    }

    for (const adapter of adapters) {
      const detection = await adapter.detect();
      if (!detection.available || !(await pathExists(detection.rootPath))) {
        continue;
      }

      const entries = await fs.readdir(detection.rootPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const targetPath = path.join(detection.rootPath, entry.name);
        const resolvedTargetPath = path.resolve(targetPath);
        const realTargetPath = await fs.realpath(targetPath).catch(() => undefined);
        const linkTarget = realTargetPath
          ? realTargetPath
          : await fs.readlink(targetPath)
              .then((value) => path.resolve(path.dirname(targetPath), value))
              .catch(() => undefined);
        if (!linkTarget) {
          continue;
        }

        const resolvedLinkTarget = path.resolve(linkTarget);
        const ownerSourceId = [...checkoutRoots.entries()].find(([, checkoutPath]) =>
          resolvedLinkTarget === checkoutPath || isPathInside(checkoutPath, resolvedLinkTarget),
        )?.[0];
        if (!ownerSourceId) {
          continue;
        }

        const matchingProjection = (lockFile.projections ?? []).some(
          (projection) =>
            projection.sourceId === ownerSourceId &&
            path.resolve(projection.targetPath) === resolvedTargetPath,
        );
        if (matchingProjection) {
          continue;
        }

        await removePath(targetPath);
        warnings.push({
          code: "DETACHED_TARGET_SYMLINK_REMOVED",
          message: `Removed detached target symlink ${targetPath} because it points to source '${ownerSourceId}' without a matching projection.`,
        });
      }
    }

    return warnings;
  }

  private isProjectionStillResolvable(
    manifest: ManifestFile,
    lockFile: LockFile,
    projection: LockFile["projections"][number],
  ): boolean {
    const source = manifest.sources.find((item) => item.id === projection.sourceId);
    if (!source) {
      return false;
    }

    const sourceLock = lockFile.sources[projection.sourceId];
    if (sourceLock?.importMode === "bootstrap-detected") {
      return projection.status === "active";
    }

    const binding = manifest.bindings[source.id];
    if (!binding) {
      return false;
    }
    const selectedLeafIds = binding.selectionMode === "all"
      ? sourceLock?.leafIds ?? []
      : binding.selectedLeafIds;
    return selectedLeafIds.includes(projection.leafId);
  }

  private async getTargetRootMap(): Promise<Map<DeploymentTargetId, string>> {
    const adapters = await this.refreshAdapters();
    return new Map(
      await Promise.all(
        adapters.map(async (adapter) => {
          const detection = await adapter.detect();
          return [adapter.target, detection.rootPath] as const;
        }),
      ),
    );
  }

  private getEnabledTargetsForSource(
    manifest: RuntimeManifestView | ManifestFile,
    sourceId: string,
  ): DeploymentTargetId[] {
    const binding = manifest.bindings[sourceId];
    if (!binding) {
      return [];
    }
    if ("enabledTargets" in binding) {
      return [...binding.enabledTargets];
    }

    return Object.entries(binding.targets)
      .filter(([, targetBinding]) => targetBinding?.enabled)
      .map(([target]) => target as DeploymentTargetId);
  }

  private isPathInsideManagedTargetRoot(
    target: DeploymentTargetId,
    targetPath: string,
    targetRoots: Map<DeploymentTargetId, string>,
    explicitRootPath?: string,
  ): boolean {
    return [explicitRootPath, targetRoots.get(target)]
      .filter((value): value is string => Boolean(value))
      .some((rootPath) => isPathInside(rootPath, targetPath));
  }

  private async cleanupImportedTargetPaths(
    manifest: ManifestFile,
    lockFile: LockFile,
    sourceIds: string[],
    restrictedTargets?: DeploymentTargetId[],
  ): Promise<Warning[]> {
    const warnings: Warning[] = [];
    await this.ensureProjectionLedger(manifest, lockFile);
    const projections = lockFile.projections.filter(
      (projection) =>
        projection.status === "active" &&
        lockFile.sources[projection.sourceId]?.importMode === "bootstrap-detected" &&
        sourceIds.includes(projection.sourceId) &&
        (restrictedTargets ? restrictedTargets.includes(projection.target) : true),
    );

    for (const projection of projections) {
      if (
        await pathExists(projection.targetPath) &&
        !this.isProjectionPathManaged(lockFile, projection)
      ) {
        warnings.push({
          code: "IMPORTED_TARGET_PATH_INVALID",
          message: `Refusing to remove unmanaged imported target path ${projection.targetPath}.`,
        });
        continue;
      }

      if (await pathExists(projection.targetPath)) {
        try {
          if (!this.hasPersistentProjectionOwnerForPath(lockFile, projection)) {
            await removePath(projection.targetPath);
          }
        } catch (error) {
          warnings.push({
            code: "IMPORTED_TARGET_PATH_REMOVE_FAILED",
            message: `Unable to remove imported target path ${projection.targetPath}: ${String(error)}`,
          });
          continue;
        }
      }

      lockFile.projections = lockFile.projections.filter(
        (candidate) =>
          !(
            candidate.sourceId === projection.sourceId &&
            candidate.leafId === projection.leafId &&
            candidate.target === projection.target &&
            candidate.targetPath === projection.targetPath
          ),
      );
    }

    return warnings;
  }

  private buildImportedTargetPathsForSource(
    manifest: RuntimeManifestView,
    lockFile: LockFile,
    sourceId: string,
    target: DeploymentTargetId,
    rootPath: string,
    projectedLinkNames: Map<string, string>,
  ): Set<string> {
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (!source) {
      return new Set();
    }

    const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const groupAuthor =
      getHostedGitOwner(source.locator)
      ?? (source.originLocator ? getHostedGitOwner(source.originLocator) : undefined);
    const candidatePaths = new Set<string>();

    for (const leaf of leafs) {
      const projectedLinkName = projectedLinkNames.get(leaf.id) ?? leaf.linkName;
      for (const name of buildProjectedSkillNameCandidates({
        preferredName: projectedLinkName,
        groupId: source.id,
        groupName: source.displayName,
        groupAuthor,
        skillName: leaf.linkName,
      })) {
        candidatePaths.add(path.join(rootPath, name));
      }
    }
    return candidatePaths;
  }

  private async ensureProjectionLedger(
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Promise<void> {
    const targetRoots = await this.getTargetRootMap();
    const projectedNameCache = new Map<DeploymentTargetId, Map<string, string>>();
    const managed = this.activeRuntimeProjections(lockFile)
      .filter((projection) => lockFile.sources[projection.sourceId]?.importMode !== "bootstrap-detected");
    const previousBootstrap = this.activeRuntimeProjections(lockFile).filter(
      (projection) =>
        lockFile.sources[projection.sourceId]?.importMode === "bootstrap-detected",
    );
    const bootstrap: LockFile["projections"] = [];

    for (const sourceLock of Object.values(lockFile.sources)) {
      const bootstrapTargets = this.bootstrapImportedTargets(lockFile, sourceLock);
      if (sourceLock.importMode !== "bootstrap-detected" || bootstrapTargets.length === 0) {
        continue;
      }

      const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceLock.sourceId && leaf.valid);
      const observedByTarget = new Map<DeploymentTargetId, {
        target: DeploymentTargetId;
        rootPath: string;
        targetPath: string;
      }>();
      for (const observed of sourceLock.observedTargets ?? []) {
        observedByTarget.set(observed.target, observed);
      }
      const targetEntries = [
        ...observedByTarget.values(),
        ...bootstrapTargets
          .filter((target) => !observedByTarget.has(target))
          .map((target) => ({ target, rootPath: targetRoots.get(target) ?? "", targetPath: "" })),
      ];

      for (const { target, rootPath: observedRootPath, targetPath: observedTargetPath } of targetEntries) {
        const rootPath = targetRoots.get(target);
        if (!rootPath) {
          continue;
        }

        let projectedLinkNames = projectedNameCache.get(target);
        if (!projectedLinkNames) {
          projectedLinkNames = this.buildProjectedLinkNameMaps(manifest, lockFile).get(target) ?? new Map();
          projectedNameCache.set(target, projectedLinkNames);
        }

        for (const leaf of leafs) {
          const previous = previousBootstrap.find(
            (projection) =>
              projection.sourceId === sourceLock.sourceId &&
              projection.leafId === leaf.id &&
              projection.target === target,
          );
          const targetPath = await this.resolveBootstrapProjectionTargetPath(
            manifest,
            lockFile,
            sourceLock,
            leaf,
            rootPath,
            projectedLinkNames,
            observedRootPath === rootPath ? observedTargetPath : undefined,
            previous?.targetPath,
          );
          if (!targetPath) {
            continue;
          }
          bootstrap.push({
            sourceId: sourceLock.sourceId,
            leafId: leaf.id,
            target,
            targetPath,
            targetRootPath: rootPath,
            strategy: "symlink",
            status: "active",
            contentHash: leaf.contentHash,
            updatedAt: sourceLock.revision.capturedAt,
          });
        }
      }
    }

    lockFile.projections = [...managed, ...bootstrap];
  }

  private activeRuntimeProjections(lockFile: LockFile): LockFile["projections"] {
    return lockFile.projections.filter((projection) => projection.status === "active");
  }

  private bootstrapImportedTargets(
    lockFile: LockFile,
    sourceLock: LockFile["sources"][string],
  ): DeploymentTargetId[] {
    return [
      ...new Set([
        ...this.activeRuntimeProjections(lockFile)
          .filter((projection) => projection.sourceId === sourceLock.sourceId)
          .map((projection) => projection.target),
        ...(sourceLock.observedTargets?.map((item) => item.target) ?? []),
        ...(sourceLock.importedFromTargets ?? []),
      ]),
    ];
  }

  private async resolveBootstrapProjectionTargetPath(
    manifest: ManifestFile,
    _lockFile: LockFile,
    sourceLock: LockFile["sources"][string],
    leaf: LeafRecord,
    rootPath: string,
    projectedLinkNames: Map<string, string>,
    observedTargetPath?: string,
    previousTargetPath?: string,
  ): Promise<string | undefined> {
    if (previousTargetPath && isPathInside(rootPath, previousTargetPath)) {
      return previousTargetPath;
    }

    if (observedTargetPath && isPathInside(rootPath, observedTargetPath)) {
      return observedTargetPath;
    }

    const scannedObservedTargetPath = await this.findObservedBootstrapTargetPath(
      sourceLock,
      rootPath,
    );
    if (scannedObservedTargetPath) {
      return scannedObservedTargetPath;
    }

    const source = manifest.sources.find((item) => item.id === sourceLock.sourceId);
    const groupAuthor =
      getHostedGitOwner(source?.locator ?? "")
      ?? (source?.canonicalLocator ? getHostedGitOwner(source.canonicalLocator) : undefined);
    const projectedLinkName = projectedLinkNames.get(leaf.id) ?? leaf.linkName;
    const candidates = buildProjectedSkillNameCandidates({
      preferredName: projectedLinkName,
      groupId: sourceLock.sourceId,
      groupName: source?.displayName ?? sourceLock.sourceId,
      groupAuthor,
      skillName: leaf.linkName,
    }).map((name) => path.join(rootPath, name));

    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private async findObservedBootstrapTargetPath(
    sourceLock: LockFile["sources"][string],
    rootPath: string,
  ): Promise<string | undefined> {
    if (!(await pathExists(rootPath))) {
      return undefined;
    }

    const observedRealpaths = new Set(
      [sourceLock.canonicalLocator, sourceLock.localPath]
        .filter((value): value is string => Boolean(value))
        .map((value) => path.resolve(value)),
    );
    const entries = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const candidatePath = path.join(rootPath, entry.name);
      const isDirectoryLike =
        entry.isDirectory() ||
        (entry.isSymbolicLink() &&
          (await fs.stat(candidatePath).then((stats) => stats.isDirectory()).catch(() => false)));
      if (!isDirectoryLike) {
        continue;
      }
      if (!(await pathExists(path.join(candidatePath, "SKILL.md")))) {
        continue;
      }
      const resolvedPath = await fs.realpath(candidatePath).catch(() => path.resolve(candidatePath));
      if (observedRealpaths.has(resolvedPath)) {
        return candidatePath;
      }
    }

    return undefined;
  }

  private isProjectionPathManaged(
    _lockFile: LockFile,
    projection: LockFile["projections"][number],
  ): boolean {
    return Boolean(
      projection.targetRootPath &&
      isPathInside(projection.targetRootPath, projection.targetPath),
    );
  }

  private hasPersistentProjectionOwnerForPath(
    lockFile: LockFile,
    projection: LockFile["projections"][number],
  ): boolean {
    return lockFile.projections.some(
      (candidate) =>
        candidate.targetPath === projection.targetPath &&
        !(
          candidate.sourceId === projection.sourceId &&
          candidate.leafId === projection.leafId &&
          candidate.target === projection.target &&
          candidate.targetPath === projection.targetPath
        ),
    );
  }

  private async readManifestConsistently(): Promise<ManifestFile> {
    return this.runSerializedMutation(async () => (await this.readRuntimeAuthorityView()).manifest);
  }

  private async readStateConsistently(): Promise<{ manifest: ManifestFile; lockFile: LockFile }> {
    return this.runSerializedMutation(async () => {
      const view = await this.readRuntimeAuthorityView();
      return { manifest: view.manifest, lockFile: view.lockFile };
    });
  }

  private async captureSourceAuditSnapshot(
    manifest: ManifestFile,
    lockFile: LockFile,
    sourceId: string,
  ): Promise<Record<string, unknown>> {
    const source = manifest.sources.find((item) => item.id === sourceId);
    const sourceLock = lockFile.sources[sourceId];
    const binding = manifest.bindings[sourceId];
    const projections = lockFile.projections.filter(
      (projection) => projection.sourceId === sourceId,
    );

    return {
      sourcePresent: Boolean(source),
      checkoutPath: sourceLock?.localPath,
      checkoutExists: sourceLock ? await pathExists(sourceLock.localPath) : false,
      selectedLeafIds: binding?.selectionMode === "all" ? sourceLock?.leafIds ?? [] : binding?.selectedLeafIds ?? [],
      enabledTargets: this.getEnabledTargetsForSource(manifest, sourceId),
      projectionCount: projections.length,
      projections: await Promise.all(
        projections.map(async (projection) => ({
          status: projection.status,
          target: projection.target,
          leafId: projection.leafId,
          targetPath: projection.targetPath,
          targetPathExists: await pathExists(projection.targetPath),
        })),
      ),
    };
  }

  private summarizeDeploymentActions(actions: DeploymentAction[]): Record<string, unknown> {
    return {
      total: actions.length,
      create: actions.filter((action) => action.kind === "create").length,
      update: actions.filter((action) => action.kind === "update").length,
      remove: actions.filter((action) => action.kind === "remove").length,
      noop: actions.filter((action) => action.kind === "noop").length,
      blocked: actions.filter((action) => action.kind === "blocked").length,
    };
  }

  private async runSerializedMutation<T>(task: () => Promise<T>): Promise<T> {
    return this.runSerializedTask(() => this.stateStore.withMutationLock(task));
  }

  private async runSerializedTask<T>(task: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(task, task);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runAuditedMutation<T>(
    mutation: AuditMutationName,
    details: Record<string, unknown>,
    task: () => Promise<AuditedMutationResult<T>>,
  ): Promise<Result<T>> {
    try {
      const taskResult = await this.runSerializedMutation(task);
      const normalized = this.normalizeAuditedMutationResult(taskResult);
      const result = normalized.result;
      await this.writeAuditEvent({
        timestamp: new Date().toISOString(),
        mutation,
        caller: this.currentAuditCaller(),
        status: result.ok ? "ok" : "error",
        details: {
          ...details,
          ...(normalized.auditDetails ?? {}),
        },
        warnings: result.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
        })),
        errors: result.ok
          ? []
          : result.errors.map((error) => ({
            code: error.code,
            message: error.message,
          })),
      });
      return result;
    } catch (error) {
      await this.writeAuditEvent({
        timestamp: new Date().toISOString(),
        mutation,
        caller: this.currentAuditCaller(),
        status: "threw",
        details,
        warnings: [],
        errors: [{
          code: "UNCAUGHT_EXCEPTION",
          message: error instanceof Error ? error.message : String(error),
        }],
      });
      throw error;
    }
  }

  private normalizeAuditedMutationResult<T>(
    taskResult: AuditedMutationResult<T>,
  ): { result: Result<T>; auditDetails?: Record<string, unknown> } {
    if ("ok" in taskResult) {
      return { result: taskResult };
    }

    return taskResult;
  }

  private currentAuditCaller(): string {
    return process.env.SKILL_FLOW_CALLER?.trim()
      ?? "unknown";
  }

  private async writeAuditEvent(event: AuditEvent): Promise<void> {
    try {
      await this.store.appendAuditEvent(event);
    } catch {
      // Audit logging must never block the mutation itself.
    }
  }

  private normalizeBindings(
    manifest: RuntimeManifestView,
    lockFile: LockFile,
    collections?: CollectionsFile,
  ): boolean {
    let changed = false;

    for (const source of manifest.sources) {
      const currentBinding = manifest.bindings[source.id] ?? {
        selectedLeafIds: [],
        resolvedSelectedLeafCount: 0,
        targets: {},
      };
      const normalizedDraft = this.draftFromSourceBinding(source, currentBinding, lockFile, collections);
      const normalizedBinding = this.bindingFromDraft(normalizedDraft);

      if (JSON.stringify(currentBinding) === JSON.stringify(normalizedBinding)) {
        continue;
      }

      manifest.bindings[source.id] = normalizedBinding;
      changed = true;
    }

    return changed;
  }

  private draftFromSourceBinding(
    source: RuntimeManifestView["sources"][number],
    binding: SourceBindingSummary,
    lockFile: LockFile,
    collections?: CollectionsFile,
  ): DraftBinding {
    const leafIds = source.kind === "collection"
      ? this.getCollectionSourceAllowedLeafIds(source.id, binding, lockFile, collections)
      : new Set(
          lockFile.leafInventory
            .filter((leaf) => leaf.sourceId === source.id)
            .map((leaf) => leaf.id),
        );

    return this.draftFromBindingAllowedLeafIds(binding, leafIds);
  }

  private draftFromBinding(
    sourceId: string,
    binding: SourceBindingSummary,
    lockFile: Pick<LockFile, "leafInventory">,
  ): DraftBinding {
    const leafIds = new Set(
      lockFile.leafInventory
        .filter((leaf) => leaf.sourceId === sourceId)
        .map((leaf) => leaf.id),
    );
    return this.draftFromBindingAllowedLeafIds(binding, leafIds);
  }

  private draftFromBindingAllowedLeafIds(
    binding: SourceBindingSummary,
    leafIds: Set<string>,
  ): DraftBinding {
    const enabledTargets = Object.entries(binding.targets)
      .filter(([, targetBinding]) => targetBinding?.enabled)
      .map(([target]) => target) as DeploymentTargetName[];
    const targetLeafIds = enabledTargets.flatMap((target) => binding.targets[target]?.leafIds ?? []);
    const selectedLeafIds = [
      ...new Set(
        (binding.selectedLeafIds && binding.selectedLeafIds.length > 0
          ? binding.selectedLeafIds
          : targetLeafIds.length > 0
            ? targetLeafIds
            : binding.resolvedSelectedLeafCount > 0
              ? [...leafIds]
              : []),
      ),
    ].filter((leafId) => leafIds.has(leafId));

    return {
      enabledTargets,
      selectedLeafIds,
    };
  }

  private getCollectionSourceAllowedLeafIds(
    sourceId: string,
    binding: SourceBindingSummary,
    lockFile: LockFile,
    collections?: CollectionsFile,
  ): Set<string> {
    const existingLeafIds = new Set(lockFile.leafInventory.map((leaf) => leaf.id));
    const collectionLeafIds = collections?.collections[sourceId]?.members
      .map((member) => member.snapshot.leafId)
      .filter((leafId) => existingLeafIds.has(leafId));

    if (collectionLeafIds) {
      return new Set(collectionLeafIds);
    }

    return new Set(
      [
        ...(binding.selectedLeafIds ?? []),
        ...Object.values(binding.targets).flatMap((targetBinding) => targetBinding?.leafIds ?? []),
      ].filter((leafId) => existingLeafIds.has(leafId)),
    );
  }

  private getSourceLeafsForBinding(
    source: RuntimeManifestView["sources"][number],
    binding: SourceBindingSummary,
    lockFile: LockFile,
    collections?: CollectionsFile,
  ): LeafRecord[] {
    if (source.kind !== "collection") {
      return lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id);
    }

    const leafsById = new Map(lockFile.leafInventory.map((leaf) => [leaf.id, leaf]));
    const collection = collections?.collections[source.id];
    if (collection) {
      return collection.members
        .map((member) => leafsById.get(member.snapshot.leafId))
        .filter((leaf): leaf is LeafRecord => Boolean(leaf));
    }

    return ([
      ...new Set([
        ...(binding.selectedLeafIds ?? []),
        ...Object.values(binding.targets).flatMap((targetBinding) => targetBinding?.leafIds ?? []),
      ]),
    ])
      .map((leafId) => leafsById.get(leafId))
      .filter((leaf): leaf is LeafRecord => Boolean(leaf));
  }

  private findLeafForSourceBinding(
    source: RuntimeManifestView["sources"][number],
    binding: SourceBindingSummary,
    lockFile: LockFile,
    leafId: string,
  ): LeafRecord | undefined {
    if (source.kind !== "collection") {
      return lockFile.leafInventory.find((leaf) => leaf.sourceId === source.id && leaf.id === leafId);
    }

    return this.getSourceLeafsForBinding(source, binding, lockFile).find((leaf) => leaf.id === leafId);
  }

  private selectLeafIdsForRequestedPath(
    leafs: SelectableLeaf[],
    requestedPath?: string,
  ): string[] {
    const normalizedPath = this.normalizeRequestedPath(requestedPath);
    if (!normalizedPath) {
      return leafs.map((leaf) => leaf.id);
    }

    return leafs
      .filter(
        (leaf) =>
          leaf.relativePath === normalizedPath ||
          leaf.relativePath.startsWith(`${normalizedPath}/`),
      )
      .map((leaf) => leaf.id);
  }

  private buildAddDraft(
    sourceLeafs: SelectableLeaf[],
    requestedPath: string | undefined,
    availableTargets: DeploymentTargetId[],
    options: SkillFlowAddOptions,
  ): Result<DraftBinding> {
    if (options.draft) {
      return ok({
        enabledTargets: [...new Set(options.draft.enabledTargets)],
        selectedLeafIds: [...new Set(options.draft.selectedLeafIds)],
      });
    }

    const selectedLeafIdsResult = this.resolveSelectedLeafIds(
      sourceLeafs,
      requestedPath,
      options.skillNames,
    );
    if (!selectedLeafIdsResult.ok) {
      return fail(selectedLeafIdsResult.errors, selectedLeafIdsResult.warnings);
    }

    const enabledTargetsResult = this.resolveRequestedTargets(
      availableTargets,
      options.agentTargets ?? options.enabledTargets,
    );
    if (!enabledTargetsResult.ok) {
      return fail(enabledTargetsResult.errors, enabledTargetsResult.warnings);
    }

    return ok({
      enabledTargets: enabledTargetsResult.data,
      selectedLeafIds: selectedLeafIdsResult.data,
    });
  }

  private resolveImportDraftForPreparedSource(
    sourceLeafs: SelectableLeaf[],
    availableTargets: DeploymentTargetId[],
    canonicalRepo: string | undefined,
    draft?: ImportDraft,
  ): Result<DraftBinding> {
    if (!draft) {
      return ok({
        selectedLeafIds: sourceLeafs.map((leaf) => leaf.id),
        enabledTargets: [],
      });
    }

    const available = new Set(availableTargets);
    const enabledTargets = [...new Set(draft.enabledTargets)];
    const unsupported = enabledTargets.filter((target) => !available.has(target));
    if (unsupported.length > 0) {
      return fail({
        code: "ADD_AGENT_NOT_AVAILABLE",
        message: `Unknown or unavailable agent(s): ${unsupported.join(", ")}.`,
      });
    }

    if (draft.skillSelectionMode === "all") {
      return ok({
        selectedLeafIds: sourceLeafs.map((leaf) => leaf.id),
        enabledTargets,
      });
    }

    if (!draft.selectedSkills) {
      return fail({
        code: "IMPORT_DRAFT_SELECTED_SKILLS_REQUIRED",
        message: "Import draft must use selectedSkills selectors.",
      });
    }

    const selectedLeafIdsResult = this.resolveImportLeafIdsForSelectors(
      sourceLeafs,
      draft.selectedSkills,
      canonicalRepo,
    );
    if (!selectedLeafIdsResult.ok) {
      return fail(selectedLeafIdsResult.errors, selectedLeafIdsResult.warnings);
    }

    return ok({
      selectedLeafIds: selectedLeafIdsResult.data,
      enabledTargets,
    }, selectedLeafIdsResult.warnings);
  }

  private resolveImportLeafIdsForSelectors(
    sourceLeafs: SelectableLeaf[],
    selectedSkills: NonNullable<ImportDraft["selectedSkills"]>,
    canonicalRepo?: string,
  ): Result<string[]> {
    const matchedLeafIds: string[] = [];
    const warnings: Warning[] = [];

    for (const selected of selectedSkills) {
      if (selected.selector.kind !== "repoPath") {
        return fail({
          code: "IMPORT_SELECTOR_INVALID",
          message: `Unsupported import selector kind '${selected.selector.kind}'.`,
        });
      }

      let selectorPath: string;
      try {
        selectorPath = normalizeImportRepoPathSelector(selected.selector.path).path;
      } catch {
        return fail({
          code: "IMPORT_SELECTOR_INVALID",
          message: `Import selector '${selected.selector.path}' is invalid.`,
        });
      }

      const matches = sourceLeafs.filter((leaf) => leaf.relativePath === selectorPath);
      if (matches.length === 1) {
        matchedLeafIds.push(matches[0]!.id);
        continue;
      }
      if (matches.length > 1) {
        return fail({
          code: "IMPORT_SELECTOR_AMBIGUOUS",
          message: `Import selector '${selectorPath}' matched multiple skills.`,
        });
      }

      const fallbackMatches = this.findImportSelectorFallbackMatches(
        sourceLeafs,
        selectorPath,
        canonicalRepo,
      );
      if (fallbackMatches.length === 1) {
        matchedLeafIds.push(fallbackMatches[0]!.id);
        continue;
      }
      if (fallbackMatches.length > 1) {
        if (canonicalRepo) {
          const preferred = this.pickPreferredImportLeafMatch(fallbackMatches);
          if (preferred) {
            matchedLeafIds.push(preferred.id);
            continue;
          }
        }

        warnings.push({
          code: "IMPORT_SELECTOR_AMBIGUOUS",
          message:
            `Import selector '${selectorPath}' matched multiple skills. ` +
            `Use a relative path such as '${fallbackMatches[0]!.relativePath}'.`,
        });
        continue;
      }

      warnings.push({
        code: "IMPORT_SELECTOR_NOT_FOUND",
        message: `Import selector '${selectorPath}' was not found in the prepared source.`,
      });
    }

    const selectedLeafIds = [...new Set(matchedLeafIds)];
    if (selectedLeafIds.length === 0 && selectedSkills.length > 0 && sourceLeafs.length > 0) {
      return ok(
        sourceLeafs.map((leaf) => leaf.id),
        [
          ...warnings,
          {
            code: "IMPORT_SELECTORS_UNRESOLVED_USED_ALL",
            message: "No selected import selectors matched the downloaded group, so all downloaded skills were selected.",
          },
        ],
      );
    }

    return ok(selectedLeafIds, warnings);
  }

  private findImportSelectorFallbackMatches(
    sourceLeafs: SelectableLeaf[],
    selectorPath: string,
    canonicalRepo: string | undefined,
  ): SelectableLeaf[] {
    return sourceLeafs.filter((leaf) => {
      if (leaf.linkName === selectorPath || leaf.title === selectorPath || leaf.name === selectorPath) {
        return true;
      }

      if (!canonicalRepo) {
        return false;
      }

      const selectorVariants = this.buildImportSkillSelectorVariants(selectorPath, canonicalRepo);
      const leafVariants = new Set([
        ...this.buildImportSkillSelectorVariants(leaf.linkName, canonicalRepo),
        ...this.buildImportSkillSelectorVariants(leaf.title, canonicalRepo),
        ...(leaf.name ? this.buildImportSkillSelectorVariants(leaf.name, canonicalRepo) : []),
        ...this.buildImportSkillSelectorVariants(path.posix.basename(leaf.relativePath), canonicalRepo),
      ]);

      return selectorVariants.some((variant) => leafVariants.has(variant));
    });
  }

  private resolveSelectedLeafIds(
    sourceLeafs: SelectableLeaf[],
    requestedPath: string | undefined,
    skillNames?: string[],
    canonicalRepo?: string,
  ): Result<string[]> {
    if (!skillNames || skillNames.length === 0) {
      return ok(this.selectLeafIdsForRequestedPath(sourceLeafs, requestedPath));
    }

    const requested = [...new Set(skillNames.map((skillName) => skillName.trim()).filter(Boolean))];
    const matchedLeafIds: string[] = [];

    for (const selector of requested) {
      const relativePathMatches = sourceLeafs.filter((leaf) => leaf.relativePath === selector);
      if (relativePathMatches.length === 1) {
        matchedLeafIds.push(relativePathMatches[0]!.id);
        continue;
      }
      if (relativePathMatches.length > 1) {
        return fail({
          code: "ADD_SKILL_SELECTOR_AMBIGUOUS",
          message: `Skill selector '${selector}' is ambiguous. Use a unique relative path.`,
        });
      }

      const fallbackMatches = sourceLeafs.filter((leaf) => {
        if (leaf.linkName === selector || leaf.title === selector || leaf.name === selector) {
          return true;
        }

        if (!canonicalRepo) {
          return false;
        }

        // skills.sh can prefix repo skill ids, for example `vercel-react-best-practices`,
        // while the GitHub checkout still uses the real directory name `react-best-practices`.
        // Keep the preview data unchanged for the UI, but accept those prefixed ids here so
        // the actual import still resolves against the GitHub checkout.
        const selectorVariants = this.buildImportSkillSelectorVariants(selector, canonicalRepo);
        const leafVariants = new Set([
          ...this.buildImportSkillSelectorVariants(leaf.linkName, canonicalRepo),
          ...this.buildImportSkillSelectorVariants(leaf.title, canonicalRepo),
          ...(leaf.name ? this.buildImportSkillSelectorVariants(leaf.name, canonicalRepo) : []),
          ...this.buildImportSkillSelectorVariants(path.posix.basename(leaf.relativePath), canonicalRepo),
        ]);

        return selectorVariants.some((variant) => leafVariants.has(variant));
      });
      if (fallbackMatches.length === 1) {
        matchedLeafIds.push(fallbackMatches[0]!.id);
        continue;
      }
      if (fallbackMatches.length > 1) {
        if (canonicalRepo) {
          const preferred = this.pickPreferredImportLeafMatch(fallbackMatches);
          if (preferred) {
            matchedLeafIds.push(preferred.id);
            continue;
          }
        }

        return fail({
          code: "ADD_SKILL_SELECTOR_AMBIGUOUS",
          message:
            `Skill selector '${selector}' is ambiguous. ` +
            `Use a relative path such as '${fallbackMatches[0]!.relativePath}'.`,
        });
      }

      return fail({
        code: "ADD_SKILL_NOT_FOUND",
        message: `Unable to preselect skill(s): ${selector}.`,
      });
    }

    return ok([...new Set(matchedLeafIds)]);
  }

  private resolveRequestedTargets(
    availableTargets: DeploymentTargetId[],
    requestedTargets?: DeploymentTargetId[],
  ): Result<DeploymentTargetId[]> {
    if (!requestedTargets?.length) {
      return ok([...availableTargets]);
    }

    const available = new Set(availableTargets);
    const unsupported = [...new Set(requestedTargets)].filter((target) => !available.has(target));
    if (unsupported.length > 0) {
      return fail({
        code: "ADD_AGENT_NOT_AVAILABLE",
        message: `Unknown or unavailable agent(s): ${unsupported.join(", ")}.`,
      });
    }

    return ok([...new Set(requestedTargets)]);
  }

  private normalizeRequestedPath(requestedPath?: string): string | undefined {
    if (!requestedPath) {
      return undefined;
    }

    const normalized = requestedPath.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
    return normalized.length > 0 && normalized !== "." ? normalized : undefined;
  }

  private async rollbackPreparedSourceInternal(
    sourceId: string,
  ): Promise<Result<{ removed: string[] }>> {
    const state = await this.stateStore.readState();
    if (!state.manifest.sources.some((source) => source.id === sourceId)) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    if (state.lockFile.projections.some((projection) =>
      projection.sourceId === sourceId && projection.status === "active"
    )) {
      return fail({
        code: "ADD_ROLLBACK_HAS_DEPLOYMENTS",
        message: `Unable to roll back skills group id '${sourceId}' because deployments already exist.`,
      });
    }

    return this.sourceAuthorityService.removeSource([sourceId]);
  }

  private prepareManifestForDraft(
    manifest: RuntimeManifestView,
    lockFile: LockFile,
    sourceId: string,
    draft: DraftBinding,
  ): { manifest: RuntimeManifestView; draft: DraftBinding; warnings: Warning[] } {
    manifest.bindings[sourceId] = this.bindingFromDraft(draft);
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (source) {
      const sourceLeafCount = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId).length;
      source.selectionMode =
        draft.selectedLeafIds.length >= sourceLeafCount && sourceLeafCount > 0
          ? "all"
          : "selected";
    }

    const conflictingLeafIds = this.findExactDuplicateLeafSelections(
      manifest,
      lockFile,
      sourceId,
      draft.enabledTargets,
    );
    const normalizedDraft: DraftBinding = {
      enabledTargets: [...draft.enabledTargets],
      selectedLeafIds: draft.selectedLeafIds.filter((leafId) => !conflictingLeafIds.has(leafId)),
    };
    manifest.bindings[sourceId] = this.bindingFromDraft(normalizedDraft);

    const warnings = [...conflictingLeafIds].map((leafId) => ({
      code: "DUPLICATE_LEAF_SELECTION_SKIPPED",
      message: `${lockFile.leafInventory.find((leaf) => leaf.id === leafId)?.linkName ?? leafId} skipped because an identical skill is already selected in another skills group.`,
    }));

    return {
      manifest,
      draft: normalizedDraft,
      warnings,
    };
  }

  private prepareAuthorityManifestForDraft(
    manifest: ManifestFile,
    lockFile: LockFile,
    sourceId: string,
    draft: DraftBinding,
  ): Result<{ manifest: ManifestFile; draft: DraftBinding; warnings: Warning[] }> {
    if (!manifest.sources.some((source) => source.id === sourceId)) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    const sourceLock = lockFile.sources[sourceId];
    if (!sourceLock) {
      return fail({
        code: "SOURCE_LOCK_MISSING",
        message: `${sourceId} is missing from authority lock sources.`,
      });
    }

    const enabledTargets = [...new Set(draft.enabledTargets)];
    const requestedLeafIds = [...new Set(draft.selectedLeafIds)];
    const conflictingLeafIds = this.findExactDuplicateAuthorityLeafSelections(
      manifest,
      lockFile,
      sourceId,
      requestedLeafIds,
      enabledTargets,
    );
    const selectedLeafIds = requestedLeafIds.filter((leafId) => !conflictingLeafIds.has(leafId));
    const normalizedDraft: DraftBinding = {
      enabledTargets,
      selectedLeafIds,
    };
    const selectedLeafIdSet = new Set(selectedLeafIds);
    const selectsEveryCurrentLeaf =
      sourceLock.leafIds.length > 0 &&
      sourceLock.leafIds.every((leafId) => selectedLeafIdSet.has(leafId));
    manifest.bindings[sourceId] = {
      sourceId,
      selectionMode: selectsEveryCurrentLeaf ? "all" : "selected",
      selectedLeafIds: selectsEveryCurrentLeaf ? [] : selectedLeafIds,
      enabledTargets,
    };

    const warnings = [...conflictingLeafIds].map((leafId) => ({
      code: "DUPLICATE_LEAF_SELECTION_SKIPPED",
      message: `${lockFile.leafInventory.find((leaf) => leaf.id === leafId)?.linkName ?? leafId} skipped because an identical skill is already selected in another skills group.`,
    }));

    return ok({ manifest, draft: normalizedDraft, warnings });
  }

  private findExactDuplicateAuthorityLeafSelections(
    manifest: ManifestFile,
    lockFile: LockFile,
    currentSourceId: string,
    requestedLeafIds: string[],
    enabledTargets: DeploymentTargetId[],
  ): Set<string> {
    const conflictingKeys = new Set<string>();

    for (const source of manifest.sources) {
      if (source.id === currentSourceId) {
        continue;
      }
      const binding = manifest.bindings[source.id];
      const sourceLock = lockFile.sources[source.id];
      if (!binding || !sourceLock) {
        continue;
      }
      const leafIds = binding.selectionMode === "all"
        ? sourceLock.leafIds
        : binding.selectedLeafIds;
      for (const target of enabledTargets) {
        if (!binding.enabledTargets.includes(target)) {
          continue;
        }
        for (const leafId of leafIds) {
          const leaf = lockFile.leafInventory.find((item) => item.id === leafId);
          if (leaf) {
            conflictingKeys.add(this.getExactDuplicateKey(leaf));
          }
        }
      }
    }

    const conflicts = new Set<string>();
    for (const leafId of requestedLeafIds) {
      const leaf = lockFile.leafInventory.find((item) => item.id === leafId);
      if (leaf && conflictingKeys.has(this.getExactDuplicateKey(leaf))) {
        conflicts.add(leafId);
      }
    }
    return conflicts;
  }

  private findExactDuplicateLeafSelections(
    manifest: RuntimeManifestView,
    lockFile: LockFile,
    currentSourceId: string,
    enabledTargets: DeploymentTargetId[],
  ): Set<string> {
    const conflictingKeys = new Set<string>();

    for (const source of manifest.sources) {
      if (source.id === currentSourceId) {
        continue;
      }

      const binding = manifest.bindings[source.id];
      if (!binding) {
        continue;
      }

      for (const target of enabledTargets) {
        const targetBinding = binding.targets[target];
        if (!targetBinding?.enabled) {
          continue;
        }

        for (const leafId of targetBinding.leafIds) {
          const leaf = lockFile.leafInventory.find((item) => item.id === leafId);
          if (!leaf) {
            continue;
          }
          conflictingKeys.add(this.getExactDuplicateKey(leaf));
        }
      }
    }

    const currentLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === currentSourceId);
    return new Set(
      currentLeafs
        .filter((leaf) => conflictingKeys.has(this.getExactDuplicateKey(leaf)))
        .map((leaf) => leaf.id),
    );
  }

  private getExactDuplicateKey(leaf: LeafRecord | LeafRecord): string {
    const name = "name" in leaf ? leaf.name : leaf.title;
    return `${leaf.linkName}\n${name}\n${leaf.description}`;
  }

  private async planForAffectedSources(
    manifest: ManifestFile,
    lockFile: LockFile,
    primarySourceId: string,
    preferences: Pick<PreferencesFile, "customTargets" | "agentDisplayOrder">,
  ): Promise<Result<DeploymentPlan>> {
    const sourceIds = manifest.sources
      .map((source) => source.id)
      .filter((sourceId) => sourceId === primarySourceId || this.hasActiveTargets(manifest, sourceId));

    return this.planForSources(manifest, lockFile, sourceIds, preferences);
  }

  private async planForSources(
    manifest: ManifestFile,
    lockFile: LockFile,
    sourceIds: string[],
    preferences: Pick<PreferencesFile, "customTargets" | "agentDisplayOrder">,
    adapters?: ChannelAdapter[],
  ): Promise<Result<DeploymentPlan>> {
    const uniqueSourceIds = [...new Set(sourceIds)];
    const planner = new DeploymentPlanner(
      adapters ?? this.createAdaptersForPreferences(preferences),
      this.buildProjectedLinkNameMaps(manifest, lockFile),
    );

    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];

    for (const sourceId of uniqueSourceIds) {
      const plan = await planner.planForSource(sourceId, manifest, lockFile);
      if (!plan.ok) {
        return fail(plan.errors, [...warnings, ...plan.warnings]);
      }

      actions.push(...plan.data.actions);
      warnings.push(...plan.warnings);
    }

    return ok({
      actions,
      warnings,
      blocked: actions.filter((action) => action.kind === "blocked"),
    }, warnings);
  }

  private buildProjectedLinkNameMaps(
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Map<DeploymentTargetId, Map<string, string>> {
    const maps = new Map<DeploymentTargetId, Map<string, string>>();
    const targets = new Set<DeploymentTargetId>(
      Object.values(manifest.bindings).flatMap((binding) => binding.enabledTargets),
    );

    for (const target of targets) {
      maps.set(
        target,
        resolveProjectedSkillNames(
          manifest.sources.flatMap((source) => {
            const binding = manifest.bindings[source.id];
            const sourceLock = lockFile.sources[source.id];
            if (!binding?.enabledTargets.includes(target) || !sourceLock) {
              return [];
            }
            const leafIds = binding.selectionMode === "all"
              ? sourceLock.leafIds
              : binding.selectedLeafIds;
            return leafIds
              .map((leafId) => lockFile.leafInventory.find((leaf) => leaf.id === leafId))
              .filter((leaf): leaf is LeafRecord => Boolean(leaf))
              .map((leaf) => ({
                leafId: leaf.id,
                groupId: source.id,
                groupName: source.displayName,
                groupAuthor: getHostedGitOwner(source.locator),
                skillName: leaf.linkName,
              }));
          }),
        ),
      );
    }

    return maps;
  }

  // Project-local path application happens here: scope resolves to concrete target roots
  // before planner/applier mutate the filesystem.
  private async resolveProjectTargetRoots(
    scope: Extract<ProjectScope, { kind: "project" }>,
    targets: DeploymentTargetId[],
  ): Promise<Result<TargetRootOverrides>> {
    const { preferences } = await this.readRuntimeAuthorityView();
    const resolved = await this.resolveProjectTargetRootOverrides(scope, targets, preferences);
    if (!resolved.ok && resolved.errors.some((error) => error.code === "PROJECT_SCOPE_PATH_UNAVAILABLE")) {
      await this.removeUnavailableProjectScope(scope.projectId, preferences);
    }

    return resolved;
  }

  private async resolveProjectTargetRootOverrides(
    scope: Extract<ProjectScope, { kind: "project" }>,
    targets: DeploymentTargetId[],
    preferences: Pick<PreferencesFile, "recentProjects" | "customTargets" | "agentDisplayOrder">,
  ): Promise<Result<TargetRootOverrides>> {
    const projectPath = await resolveUsableProjectPath(preferences.recentProjects.find(
      (project) => project.projectId === scope.projectId,
    )?.projectPath);
    if (!projectPath) {
      return fail({
        code: "PROJECT_SCOPE_PATH_UNAVAILABLE",
        message: `Project scope '${scope.projectId}' is unavailable because its projectPath is missing or invalid, so project-local skills cannot be mounted.`,
      });
    }

    const overrides: TargetRootOverrides = {};
    const mergedTargets = getMergedTargetDefinitions(
      preferences.customTargets,
      preferences.agentDisplayOrder,
    );
    for (const target of [...new Set(targets)]) {
      const mergedTarget = mergedTargets.find((candidate) => candidate.id === target);
      const resolvedPath = mergedTarget?.kind === "builtin"
        ? resolveDocumentedProjectSkillPath(target as DeploymentTargetName, projectPath)
        : mergedTarget?.projectPathTemplate
          ? path.join(projectPath, mergedTarget.projectPathTemplate)
          : null;
      if (!resolvedPath) {
        return fail({
          code: "PROJECT_SCOPE_PATH_UNAVAILABLE",
          message: `Target '${target}' does not expose a documented project-local skill path for project '${scope.projectId}'.`,
        });
      }
      overrides[target] = resolvedPath;
    }

    return ok(overrides);
  }

  private async removeUnavailableProjectScope(
    projectId: string,
    preferences?: PreferencesFile,
  ): Promise<void> {
    const currentPreferences = preferences ?? (await this.readRuntimeAuthorityView()).preferences;
    if (
      !currentPreferences.recentProjects.some((project) => project.projectId === projectId) &&
      !(projectId in currentPreferences.projectSourceDrafts) &&
      !(
        currentPreferences.selectedProjectScope.kind === "project" &&
        currentPreferences.selectedProjectScope.projectId === projectId
      )
    ) {
      return;
    }

    const { [projectId]: _removedDrafts, ...remainingProjectDrafts } = currentPreferences.projectSourceDrafts;
    await this.writePreferences({
      ...currentPreferences,
      selectedProjectScope:
        currentPreferences.selectedProjectScope.kind === "project" &&
          currentPreferences.selectedProjectScope.projectId === projectId
          ? { kind: "global" }
          : currentPreferences.selectedProjectScope,
      recentProjects: currentPreferences.recentProjects.filter(
        (project) => project.projectId !== projectId,
      ),
      projectSourceDrafts: remainingProjectDrafts,
    });
  }

  private cloneLockFileForScopedDeployments(
    lockFile: LockFile,
    deployments: DeploymentSummaryRecord[],
  ): LockFile {
    return {
      ...lockFile,
      sources: Object.fromEntries(
        Object.entries(lockFile.sources).map(([sourceId, source]) => [
          sourceId,
          {
            sourceId: source.sourceId,
            canonicalLocator: source.canonicalLocator,
            revision: { ...source.revision },
            localPath: source.localPath,
            leafIds: [...source.leafIds],
          },
        ]),
      ),
      leafInventory: lockFile.leafInventory.map((leaf) => ({ ...leaf })),
      projections: deployments.map((deployment) => ({
        target: deployment.target,
        sourceId: deployment.sourceId,
        leafId: deployment.leafId,
        targetPath: deployment.targetPath,
        ...(deployment.targetRootPath ? { targetRootPath: deployment.targetRootPath } : {}),
        strategy: deployment.strategy,
        contentHash: deployment.contentHash,
        status: "active" as const,
        updatedAt: deployment.appliedAt,
      })),
    };
  }

  private async resolveScopedInspectDeployments(
    manifest: ManifestFile,
    lockFile: LockFile,
    sourceId: string,
    scope: Extract<ProjectScope, { kind: "project" }>,
    targets: DeploymentTargetId[],
    preferences?: PreferencesFile,
  ): Promise<DeploymentSummaryRecord[]> {
    const targetRootOverrides = preferences
      ? await this.resolveProjectTargetRootOverrides(scope, targets, preferences)
      : await this.resolveProjectTargetRoots(scope, targets);
    if (!targetRootOverrides.ok) {
      return [];
    }

    return this.findScopedDeploymentsOnDisk(
      manifest,
      lockFile,
      sourceId,
      targetRootOverrides.data,
      preferences ? this.createAdaptersForPreferences(preferences) : undefined,
    );
  }

  private async findScopedDeploymentsOnDisk(
    manifest: ManifestFile,
    lockFile: LockFile,
    sourceId: string,
    targetRootOverrides: TargetRootOverrides,
    adaptersOverride?: ChannelAdapter[],
  ): Promise<DeploymentSummaryRecord[]> {
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (!source) {
      return [];
    }

    const binding = manifest.bindings[sourceId];
    const scopedDeployments: DeploymentSummaryRecord[] = [];
    const adapters = adaptersOverride ?? await this.refreshAdapters();
    const projectedLinkNameMaps = this.buildProjectedLinkNameMaps(manifest, lockFile);

    for (const [target, rootPath] of Object.entries(targetRootOverrides) as Array<[DeploymentTargetId, string]>) {
      if (!binding?.enabledTargets.includes(target)) {
        continue;
      }

      const adapter = adapters.find((candidate) => candidate.target === target);
      if (!adapter) {
        continue;
      }

      const projectedLinkNames = projectedLinkNameMaps.get(target) ?? new Map();
      const sourceLock = lockFile.sources[sourceId];
      const leafIds = binding.selectionMode === "all" ? sourceLock?.leafIds ?? [] : binding.selectedLeafIds;
      for (const leafId of leafIds) {
        const leaf = lockFile.leafInventory.find((item) => item.id === leafId && item.valid);
        if (!leaf) {
          continue;
        }

        const deployment = await this.findManagedDeploymentOnDisk(
          source,
          leaf,
          target,
          adapter.strategy,
          rootPath,
          projectedLinkNames,
        );
        if (deployment) {
          scopedDeployments.push(deployment);
        }
      }
    }

    return scopedDeployments;
  }

  private async withScopedTargetRoots<T>(
    targetRootOverrides: TargetRootOverrides,
    operation: () => Promise<T>,
  ): Promise<T> {
    const adapters = await this.refreshAdapters();
    const restores = adapters.map((adapter) => {
      const overrideRootPath = targetRootOverrides[adapter.target]?.trim();
      if (!overrideRootPath) {
        return () => {};
      }

      const originalDetect = adapter.detect.bind(adapter);
      adapter.detect = async () => {
        const detection = await originalDetect();
        return {
          ...detection,
          available: true,
          rootPath: overrideRootPath,
        };
      };

      return () => {
        adapter.detect = originalDetect;
      };
    });

    try {
      return await operation();
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  }

  private buildProjectedLinkNameMap(
    manifest: RuntimeManifestView,
    lockFile: LockFile,
    target: DeploymentTargetId,
  ): Map<string, string> {
    return resolveProjectedSkillNames(
      manifest.sources.flatMap((source) => {
        const targetBinding = manifest.bindings[source.id]?.targets[target];
        if (!targetBinding?.enabled) {
          return [];
        }

        return targetBinding.leafIds
          .map((leafId) => lockFile.leafInventory.find((leaf) => leaf.id === leafId))
          .filter((leaf): leaf is LeafRecord => Boolean(leaf))
          .map((leaf) => ({
            leafId: leaf.id,
            groupId: source.id,
            groupName: source.displayName,
            groupAuthor: getHostedGitOwner(source.locator),
            skillName: leaf.linkName,
          }));
      }),
    );
  }

  private async findManagedDeploymentOnDisk(
    source: RuntimeManifestView["sources"][number] | ManifestFile["sources"][number],
    leaf: LeafRecord | LeafRecord,
    target: DeploymentTargetId,
    strategy: "symlink" | "copy",
    rootPath: string,
    projectedLinkNames: Map<string, string>,
    existing?: DeploymentSummaryRecord[][number],
  ): Promise<DeploymentSummaryRecord[][number] | undefined> {
    const projectedLinkName = projectedLinkNames.get(leaf.id) ?? leaf.linkName;
    const candidatePaths = buildProjectedSkillNameCandidates({
      preferredName: projectedLinkName,
      groupId: source.id,
      groupName: source.displayName,
      groupAuthor: getHostedGitOwner(source.locator),
      skillName: leaf.linkName,
    }).map((name) => path.join(rootPath, name));

    if (existing?.targetPath && !candidatePaths.includes(existing.targetPath)) {
      candidatePaths.unshift(existing.targetPath);
    }

    for (const targetPath of candidatePaths) {
      const matches = await this.matchesManagedProjection(strategy, targetPath, leaf);
      if (!matches) {
        continue;
      }

      return {
        sourceId: source.id,
        leafId: leaf.id,
        target,
        targetPath,
        targetRootPath:
          targetPath === existing?.targetPath && existing.targetRootPath
            ? existing.targetRootPath
            : rootPath,
        strategy,
        status: "active",
        contentHash: leaf.contentHash,
        appliedAt: existing?.appliedAt ?? new Date().toISOString(),
      };
    }

    return undefined;
  }

  private async matchesManagedProjection(
    strategy: "symlink" | "copy",
    targetPath: string,
    leaf: Pick<LeafRecord, "absolutePath" | "contentHash">,
  ): Promise<boolean> {
    try {
      const stats = await fs.lstat(targetPath);
      if (strategy === "symlink") {
        if (!stats.isSymbolicLink()) {
          return false;
        }
        const linked = await fs.readlink(targetPath);
        const resolved = path.resolve(path.dirname(targetPath), linked);
        return resolved === leaf.absolutePath;
      }

      if (!stats.isDirectory()) {
        return false;
      }
      const onDiskHash = await hashDirectory(targetPath);
      return onDiskHash === leaf.contentHash;
    } catch {
      return false;
    }
  }

  private hasActiveTargets(manifest: ManifestFile, sourceId: string): boolean {
    return (manifest.bindings[sourceId]?.enabledTargets.length ?? 0) > 0;
  }

  private buildLocalCandidates(
    query: string,
    manifest: ManifestFile,
    lockFile: LockFile,
  ): SkillCandidate[] {
    return lockFile.leafInventory
      .filter((leaf) => {
        const source = manifest.sources.find((item) => item.id === leaf.sourceId);
        return this.matchesQuery(query, [
          leaf.title ?? leaf.name ?? leaf.linkName,
          leaf.title,
          leaf.relativePath.split("/").pop() ?? "",
        ]);
      })
      .map((leaf) => {
        const source = manifest.sources.find((item) => item.id === leaf.sourceId);
        return {
          id: `local:${leaf.id}`,
          title: this.getCandidateTitle(leaf),
          description: leaf.description,
          source: "local",
          sourceLabel: source
            ? this.formatSourceLabel(source.locator, source.displayName)
            : leaf.sourceId,
          sourceId: leaf.sourceId,
          sourceKind: source?.kind ?? "git",
          locator: source?.locator ?? leaf.sourceId,
          relativePath: leaf.relativePath,
          installed: true,
          action: { type: "none" },
        } satisfies SkillCandidate;
      });
  }

  private async searchBuiltinGitSource(
    locator: string,
    branch: string,
    sourceId: string,
    displayName: string,
    query: string,
  ): Promise<{ candidates: SkillCandidate[]; warnings: Warning[] }> {
    const checkoutPath = this.store.getCatalogCheckoutPath(sourceId);
    if (await pathExists(checkoutPath)) {
      const scanned = await this.inventoryService.scanSource(sourceId, checkoutPath, displayName);
      return {
        candidates: scanned.leafs
        .filter((leaf) =>
          this.matchesQuery(query, [
            leaf.name ?? leaf.linkName,
            leaf.relativePath.split("/").pop() ?? "",
          ]),
        )
        .map((leaf) => ({
          id: `builtin-git:${leaf.id}`,
          title: leaf.relativePath === "." ? displayName : leaf.relativePath.split("/").pop() ?? displayName,
          description: leaf.relativePath,
          source: "builtin-git",
          sourceLabel: this.formatSourceLabel(locator, displayName),
          sourceId,
          sourceKind: "git",
          locator,
          relativePath: leaf.relativePath,
          installed: false,
          action: {
            type: "add-git",
            locator,
            requestedPath: leaf.relativePath,
          },
        })),
        warnings: [],
      };
    }

    const builtinCatalog = await this.getBuiltinCatalogSkillPaths(locator, branch, sourceId);
    const skillPaths = builtinCatalog.skillPaths;
    const matchedPaths = skillPaths
      .filter((skillFilePath) =>
        this.matchesQuery(query, [
          skillFilePath.replace(/\/SKILL\.md$/, "").split("/").pop() ?? "",
        ]),
      )
      .slice(0, 5);

    return {
      candidates: matchedPaths.map((skillFilePath) => {
        const relativePath = skillFilePath.replace(/\/SKILL\.md$/, "").replace(/^SKILL\.md$/, ".");
        const title =
          relativePath === "." ? displayName : relativePath.split("/").pop() ?? displayName;

        return {
          id: `builtin-git:${sourceId}:${relativePath}`,
          title,
          description: relativePath,
          source: "builtin-git",
          sourceLabel: this.formatSourceLabel(locator, displayName),
          sourceId,
          sourceKind: "git",
          locator,
          relativePath,
          installed: false,
          action: {
            type: "add-git",
            locator,
            requestedPath: relativePath,
          },
        };
      }),
      warnings: builtinCatalog.warnings,
    };
  }

  private async getBuiltinCatalogSkillPaths(
    locator: string,
    branch: string,
    sourceId: string,
  ): Promise<{ skillPaths: string[]; warnings: Warning[] }> {
    const indexPath = this.store.getCatalogIndexPath(sourceId);
    const cached = await readJsonFile<{ skillPaths?: string[]; updatedAt?: string }>(indexPath, {});
    const cachedSkillPaths = cached.skillPaths ?? [];
    const cachedUpdatedAt = cached.updatedAt ? Date.parse(cached.updatedAt) : Number.NaN;
    const cacheFresh =
      cachedSkillPaths.length > 0 &&
      Number.isFinite(cachedUpdatedAt) &&
      Date.now() - cachedUpdatedAt < 1000 * 60 * 60 * 6;

    if (cacheFresh) {
      return { skillPaths: cachedSkillPaths, warnings: [] };
    }

    try {
      const skillPaths = await fetchGitHubSkillPaths(locator, branch);
      await ensureDir(this.store.catalogRoot);
      await writeJsonFile(indexPath, {
        locator,
        branch,
        skillPaths,
        updatedAt: new Date().toISOString(),
      });
      return { skillPaths, warnings: [] };
    } catch (error) {
      if (cachedSkillPaths.length > 0) {
        return {
          skillPaths: cachedSkillPaths,
          warnings: [
            {
              code: "BUILTIN_SOURCE_STALE_CACHE_USED",
              message: `Unable to refresh built-in source '${locator}', using stale cached catalog: ${String(error)}`,
            },
          ],
        };
      }
      throw error;
    }
  }

  private matchesQuery(query: string, fields: string[]): boolean {
    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return true;
    }

    const haystack = this.normalizeSearchQuery(fields.join("\n"));
    return tokens.every((token) => haystack.includes(token));
  }

  private compareCandidates(
    left: SkillCandidate,
    right: SkillCandidate,
    query: string,
  ): number {
    const sourceRank = this.getSourceRank(left.source) - this.getSourceRank(right.source);
    if (sourceRank !== 0) {
      return sourceRank;
    }

    const leftScore = this.getQueryScore(left, query);
    const rightScore = this.getQueryScore(right, query);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const leftPath = left.relativePath ?? "";
    const rightPath = right.relativePath ?? "";
    return (
      left.title.localeCompare(right.title) ||
      left.sourceLabel.localeCompare(right.sourceLabel) ||
      leftPath.localeCompare(rightPath)
    );
  }

  private getSourceRank(source: SkillCandidate["source"]): number {
    if (source === "local") {
      return 0;
    }
    if (source === "builtin-git") {
      return 1;
    }
    return 2;
  }

  private getQueryScore(candidate: SkillCandidate, query: string): number {
    const tokens = query.split(/\s+/).filter(Boolean);
    const titleField = this.normalizeSearchQuery(candidate.title);
    const pathTail = this.normalizeSearchQuery(
      (candidate.relativePath ?? "").split("/").pop() ?? "",
    );
    const fields = [
      titleField,
      pathTail,
    ];

    let score = 0;
    for (const token of tokens) {
      if (titleField === token || pathTail === token) {
        score += 12;
      } else if (titleField.startsWith(token) || pathTail.startsWith(token)) {
        score += 8;
      } else if (titleField.includes(token) || pathTail.includes(token)) {
        score += 4;
      }

      score += fields.filter((field) => field.includes(token)).length;
    }

    return score;
  }

  private getCandidateKey(candidate: SkillCandidate): string {
    if (candidate.sourceKind === "git") {
      return `${candidate.sourceId}:${candidate.relativePath ?? "."}`;
    }

    return candidate.locator;
  }

  private getCandidateTitle(leaf: LeafRecord | LeafRecord): string {
    const title = leaf.title.trim();
    if (title.length === 0 || /^\{[^}]+\}$/.test(title)) {
      return leaf.linkName || leaf.name || leaf.id;
    }
    return title;
  }

  private normalizeSearchQuery(value: string): string {
    return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  }

  private formatSourceLabel(locator: string, displayName: string): string {
    if (locator.startsWith("clawhub:")) {
      return `${displayName}@clawhub`;
    }

    if (path.isAbsolute(locator)) {
      return `${displayName}@local`;
    }

    const repo = parseGitHubRepo(locator);
    if (!repo) {
      return displayName;
    }
    return `${displayName}@${repo.owner}`;
  }

  private applySourceUpdateResults(
    manifest: RuntimeManifestView,
    lockFile: LockFile,
    updates: SourceUpdateResultItem[],
  ) {
    for (const update of updates) {
      if (!update.changed) {
        continue;
      }
      const source = manifest.sources.find((item) => item.id === update.sourceId);
      const binding = manifest.bindings[update.sourceId];
      if (!source || !binding) {
        continue;
      }

      for (const diff of update.diffs) {
        if (diff.kind !== "moved" || !diff.previousLeafId) {
          continue;
        }
        for (const targetBinding of Object.values(binding.targets)) {
          if (!targetBinding?.enabled || !targetBinding.leafIds.includes(diff.previousLeafId)) {
            continue;
          }
          targetBinding.leafIds = targetBinding.leafIds.map((leafId) =>
            leafId === diff.previousLeafId ? diff.leafId : leafId,
          );
        }
      }

      if ((update.selectionMode ?? source.selectionMode) !== "all") {
        continue;
      }

      const addedLeafIds = update.diffs
        .filter((diff) => diff.kind === "added")
        .map((diff) => diff.leafId);
      if (addedLeafIds.length === 0) {
        continue;
      }

      for (const targetBinding of Object.values(binding.targets)) {
        if (!targetBinding?.enabled) {
          continue;
        }
        const merged = new Set([...targetBinding.leafIds, ...addedLeafIds]);
        targetBinding.leafIds = [...merged].filter((leafId) =>
          lockFile.leafInventory.some((leaf) => leaf.id === leafId && leaf.sourceId === update.sourceId),
        );
      }
    }
  }
}

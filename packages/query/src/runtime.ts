import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createChannelAdapters, type ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import type {
  AddSourceDraftOptions,
  AddSourcePreparation,
  CollectionsFileV2,
  DeploymentTargetId,
  DraftBinding,
  DeploymentAction,
  DeploymentPlan,
  DeploymentTargetName,
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
  LeafRecordV2,
  LeafRecord,
  LockFile,
  LocalImportChoice,
  Manifest,
  LocalScanGroup,
  LocalScanGroupStatus,
  LocalScanImportChoice,
  LocalScanSkillVariant,
  LockFileV2,
  ManifestFileV2,
  PreferencesFileV2,
  ProjectScope,
  ProjectionRecord,
  RecentProject,
  Result,
  SharedPreferences,
  SkillCollectionMemberV2,
  SkillCollectionRecordV2,
  SkillCandidate,
  SourceMetadataResult,
  SourceStats,
  SourceBinding,
  SourceUpdateResult,
  SourceUpdateResultItem,
  TargetBinding,
  UnifiedSourceSnapshot,
  UnifiedSourceTrust,
  VirtualGroupRecord,
  VirtualGroupSkillRef,
  VirtualGroupsState,
  Warning,
  WorkflowSummary,
} from "@skill-flow/domain/types";
import { getBootstrapImportedTargets, getManagedDeployments } from "@skill-flow/domain/projection-compat";
import { StateStore } from "@skill-flow/storage/store";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
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
  searchSkillsDirectory,
} from "@skill-flow/integration/utils/skills-directory";
import { DeploymentApplier } from "@skill-flow/core-engine/services/deployment-applier";
import { ConfigCoordinator } from "./config-coordinator.js";
import { DeploymentPlanner } from "@skill-flow/core-engine/services/deployment-planner";
import { DoctorService } from "@skill-flow/core-engine/services/doctor-service";
import { InventoryService } from "@skill-flow/core-engine/services/inventory-service";
import { ImportPreparationService } from "@skill-flow/core-engine/services/import-preparation-service";
import { ImportPreparationServiceV2 } from "@skill-flow/core-engine/services/import-preparation-service-v2";
import { RecentProjectService } from "@skill-flow/core-engine/services/recent-project-service";
import { SourceAuthorityServiceV2 } from "@skill-flow/core-engine/services/source-authority-service-v2";
import { SourceCheckoutService } from "@skill-flow/core-engine/services/source-checkout-service";
import { SourceService } from "@skill-flow/core-engine/services/source-service";
import {
  StateMigrationService,
  type StateMigrationOptions,
  type StateMigrationResult,
} from "@skill-flow/core-engine/services/state-migration-service";
import { WorkflowService } from "./workflow-service.js";
import type { StateMigrationStatus } from "@skill-flow/storage/state-schema-v2";
import type { StateStoreV2State } from "@skill-flow/storage/state-store-v2";
import { projectStateV2ToView, type StateV2AuthorityView } from "./state-v2-view.js";
import type {
  AddSourceOptions,
  SourcePreview,
  SourceSnapshot,
} from "@skill-flow/core-engine/services/source-service";
import {
  WorkspaceBootstrapService,
  type BootstrapEvent,
  type LocalSkillScanResult,
} from "@skill-flow/core-engine/services/workspace-bootstrap-service";
import { DeploymentPlannerV2 } from "@skill-flow/core-engine/services/deployment-planner-v2";
import { DeploymentApplierV2 } from "@skill-flow/core-engine/services/deployment-applier-v2";

const EMPTY_DRAFT: DraftBinding = { enabledTargets: [], selectedLeafIds: [] };

type SkillFlowAddOptions = AddSourceOptions &
  AddSourceDraftOptions & {
    project?: boolean;
  };

type AddSourceResult = SourceSnapshot & AddSourcePreparation & { projected: boolean };
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
export type CreateVirtualGroupOptions = {
  displayName: string;
  skills: VirtualGroupSkillRef[];
  enabledTargets?: DeploymentTargetId[];
};
export type CreateVirtualGroupResult = {
  group: VirtualGroupRecord;
  source: Manifest["sources"][number];
  binding: SourceBinding;
};
export type MergeGroupsOptions = {
  displayName: string;
  sourceIds: string[];
  enabledTargets: DeploymentTargetId[];
};
export type RestoreMergedGroupsResult = {
  virtualGroupId: string;
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
    source: Manifest["sources"][number];
    binding: SourceBinding;
    leafs: LeafRecord[];
    deployments: LockFile["deployments"];
  };
  recentProjects?: RecentProject[];
  selectedProjectScope?: ProjectScope;
  projectDrafts?: SharedPreferences["projectDrafts"];
};
type RuntimeAuthoritySnapshot = StateV2AuthorityView & {
  state: StateStoreV2State;
  collections: CollectionsFileV2;
};
type GroupCardEnrichmentSnapshot = {
  sourceMetadata?: SourceMetadataResult;
  sourceSnapshot?: UnifiedSourceSnapshot;
  groupPath?: string;
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

export class SkillFlowApp {
  private static readonly importGroupResolveConcurrency = 3;
  private static readonly importPreviewPrewarmLimit = 4;

  readonly store: StateStore;
  private readonly stateStoreV2: StateStoreV2;
  private readonly importPreparationCacheStore: ImportPreparationCacheStore;
  adapters: ChannelAdapter[];
  readonly inventoryService: InventoryService;
  readonly sourceService: SourceService;
  readonly sourceCheckoutService: SourceCheckoutService;
  readonly sourceAuthorityServiceV2: SourceAuthorityServiceV2;
  readonly importPreparationService: ImportPreparationService;
  readonly importPreparationServiceV2: ImportPreparationServiceV2;
  planner: DeploymentPlanner;
  applier: DeploymentApplier;
  readonly doctorService: DoctorService;
  readonly workflowService: WorkflowService;
  readonly recentProjectService: RecentProjectService;
  readonly workspaceBootstrapService: WorkspaceBootstrapService;
  readonly configCoordinator: ConfigCoordinator;
  private mutationQueue: Promise<void> = Promise.resolve();
  private metadataRefreshesBySourceId = new Map<string, Promise<void>>();
  private importSearchRefreshesByQuery = new Map<string, Promise<ImportSearchSnapshot>>();
  private importSourceRefreshesByKey = new Map<string, Promise<UnifiedSourceSnapshot>>();
  private importRecommendationRefreshesByFeed = new Map<ImportRecommendationFeedId, Promise<ImportRecommendationFeed>>();

  constructor() {
    this.store = new StateStore();
    this.stateStoreV2 = new StateStoreV2(this.store.rootPath);
    this.importPreparationCacheStore = new ImportPreparationCacheStore(this.store.rootPath);
    const adapters = createChannelAdapters();
    this.adapters = adapters;
    this.inventoryService = new InventoryService();
    this.sourceService = new SourceService(this.store, this.inventoryService);
    this.sourceCheckoutService = new SourceCheckoutService({
      sourceRoot: path.join(this.stateStoreV2.rootPath, "source"),
      inventoryService: this.inventoryService,
    });
    this.sourceAuthorityServiceV2 = new SourceAuthorityServiceV2({
      stateStore: this.stateStoreV2,
      checkoutService: this.sourceCheckoutService,
    });
    this.importPreparationService = new ImportPreparationService(this.store, this.sourceService);
    this.importPreparationServiceV2 = new ImportPreparationServiceV2({
      cacheStore: this.importPreparationCacheStore,
      sourceAuthority: this.sourceAuthorityServiceV2,
      checkoutService: this.sourceCheckoutService,
    });
    this.planner = new DeploymentPlanner(adapters);
    this.applier = new DeploymentApplier(adapters);
    this.doctorService = new DoctorService(this.store);
    this.workflowService = new WorkflowService();
    this.recentProjectService = new RecentProjectService();
    this.workspaceBootstrapService = new WorkspaceBootstrapService(this.store);
    this.configCoordinator = new ConfigCoordinator({
      store: {
        init: () => this.store.init(),
        readManifest: async () => (await this.readRuntimeAuthorityView()).manifest,
        readPreferences: async () => (await this.readRuntimeAuthorityView()).preferences,
        readCollections: () => this.readCollectionsForRuntime(),
        writePreferences: async (preferences) => {
          await this.writePreferencesV2FromView(preferences);
        },
      },
      recentProjectService: this.recentProjectService,
      doctorService: this.doctorService,
      workflowService: this.workflowService,
      getAvailableTargets: () => this.getAvailableTargets(),
      pruneMissingCheckouts: () => this.pruneMissingCheckoutsImpl(),
      getConfigData: () => this.getConfigDataImpl(),
    });
  }

  private readCollectionsForRuntime(): Promise<CollectionsFileV2> {
    return this.stateStoreV2.readCollections();
  }

  private async readRuntimeAuthorityView(): Promise<RuntimeAuthoritySnapshot> {
    const state = await this.stateStoreV2.readState();
    const view = projectStateV2ToView(state);

    return {
      ...view,
      state,
      collections: state.collections,
    };
  }

  private async writePreferencesV2FromView(preferences: SharedPreferences): Promise<SharedPreferences> {
    const state = await this.stateStoreV2.readState();
    const nextPreferences = this.preferencesV2FromView(preferences, state.preferences);
    await this.stateStoreV2.writeState({
      ...state,
      preferences: nextPreferences,
    });
    return projectStateV2ToView({
      ...state,
      preferences: nextPreferences,
    }).preferences;
  }

  private async pruneMissingSourceIdsV2(preferences?: SharedPreferences): Promise<SharedPreferences> {
    const state = await this.stateStoreV2.readState();
    const sourceIds = new Set(state.manifest.sources.map((source) => source.id));
    const currentPreferences = preferences ?? projectStateV2ToView(state).preferences;
    const projectDrafts = Object.fromEntries(
      Object.entries(currentPreferences.projectDrafts).map(([projectId, drafts]) => [
        projectId,
        Object.fromEntries(
          Object.entries(drafts).filter(([sourceId]) => sourceIds.has(sourceId)),
        ),
      ]),
    );
    const nextPreferences = this.preferencesV2FromView({
      ...currentPreferences,
      pinnedSourceIds: currentPreferences.pinnedSourceIds.filter((sourceId) => sourceIds.has(sourceId)),
      projectDrafts,
    }, state.preferences);
    await this.stateStoreV2.writeState({
      ...state,
      preferences: nextPreferences,
    });
    return projectStateV2ToView({
      ...state,
      preferences: nextPreferences,
    }).preferences;
  }

  private preferencesV2FromView(
    preferences: SharedPreferences,
    previous: PreferencesFileV2,
  ): PreferencesFileV2 {
    return {
      schemaVersion: 2,
      migrationGeneration: previous.migrationGeneration,
      pinnedSourceIds: [...preferences.pinnedSourceIds],
      selectedProjectScope: { ...preferences.selectedProjectScope },
      recentProjects: preferences.recentProjects.map((project) => ({
        ...project,
        ...(project.tools ? { tools: [...project.tools] } : {}),
      })),
      projectSourceDrafts: this.projectSourceDraftsV2FromView(preferences.projectDrafts),
      customTargets: preferences.customTargets.map((target) => ({ ...target })),
      agentDisplayOrder: [...preferences.agentDisplayOrder],
      ...(previous.localImportChoices ? { localImportChoices: previous.localImportChoices.map((choice) => ({
        ...choice,
        selectedSkills: choice.selectedSkills.map((skill) => ({
          ...skill,
          selector: { ...skill.selector },
        })),
        enabledTargets: [...choice.enabledTargets],
      })) } : {}),
      ...(previous.localScanImportChoices ? { localScanImportChoices: previous.localScanImportChoices.map((choice) => ({
        ...choice,
        detectedSkills: choice.detectedSkills.map((skill) => ({
          ...skill,
          selector: { ...skill.selector },
          diagnostics: skill.diagnostics.map((diagnostic) => ({ ...diagnostic })),
        })),
        selectedSkills: choice.selectedSkills.map((skill) => ({
          ...skill,
          selector: { ...skill.selector },
        })),
        enabledTargets: [...choice.enabledTargets],
      })) } : {}),
    };
  }

  private projectSourceDraftsV2FromView(
    projectDrafts: SharedPreferences["projectDrafts"],
  ): PreferencesFileV2["projectSourceDrafts"] {
    const updatedAt = new Date().toISOString();
    return Object.fromEntries(
      Object.entries(projectDrafts).map(([projectId, drafts]) => [
        projectId,
        Object.fromEntries(
          Object.entries(drafts).map(([sourceId, draft]) => [
            sourceId,
            {
              sourceId,
              selectedLeafIds: [...draft.selectedLeafIds],
              enabledTargets: [...draft.enabledTargets],
              updatedAt,
            },
          ]),
        ),
      ]),
    );
  }

  private createAdaptersForPreferences(preferences: SharedPreferences): ChannelAdapter[] {
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
    this.planner = new DeploymentPlanner(this.adapters);
    this.applier = new DeploymentApplier(this.adapters);
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
    const result = await this.sourceAuthorityServiceV2.addSource(locator, addOptions);
    if (!result.ok) {
      return fail(result.errors, result.warnings);
    }

    const state = await this.stateStoreV2.readState();
    const view = projectStateV2ToView(state);
    const { manifest, lockFile } = view;
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

    return ok(
      {
        manifest: source,
        lock: lockFile.sources.find((item) => item.id === source.id) ?? {
          id: source.id,
          locator: source.locator,
          kind: source.kind,
          displayName: source.displayName,
          originalDisplayName: source.originalDisplayName,
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
        leafs: sourceLeafs,
        projected: false,
      },
      warnings,
    );
  }

  async rollbackPreparedSource(sourceId: string): Promise<Result<{ removed: string[] }>> {
    return this.runSerializedMutation(() => this.rollbackPreparedSourceInternal(sourceId));
  }

  async createVirtualGroup(
    options: CreateVirtualGroupOptions,
  ): Promise<Result<CreateVirtualGroupResult>> {
    return this.runSerializedMutation(() => this.createVirtualGroupImpl(options));
  }

  async mergeGroups(
    options: MergeGroupsOptions,
  ): Promise<Result<CreateVirtualGroupResult>> {
    return this.runSerializedMutation(() => this.mergeGroupsImpl(options));
  }

  async restoreMergedGroups(
    virtualGroupId: string,
  ): Promise<Result<RestoreMergedGroupsResult>> {
    return this.runSerializedMutation(() => this.restoreMergedGroupsImpl(virtualGroupId));
  }

  private async createVirtualGroupImpl(
    options: CreateVirtualGroupOptions,
  ): Promise<Result<CreateVirtualGroupResult>> {
    const displayName = options.displayName.trim();
    if (!displayName) {
      return fail({
        code: "VIRTUAL_GROUP_NAME_EMPTY",
        message: "Virtual group name cannot be empty.",
      });
    }
    if (options.skills.length === 0) {
      return fail({
        code: "VIRTUAL_GROUP_SKILLS_EMPTY",
        message: "Virtual group must include at least one skill.",
      });
    }

    const state = await this.stateStoreV2.readState();
    const manifest = this.cloneManifestV2(state.manifest);
    const lockFile = this.cloneLockFileV2(state.lockFile);
    const collections: CollectionsFileV2 = {
      ...state.collections,
      collections: { ...state.collections.collections },
    };
    const includedSkills = this.validateCollectionSkillRefs(options.skills, manifest, lockFile);
    if (!includedSkills.ok) {
      return fail(includedSkills.errors, includedSkills.warnings);
    }
    if (includedSkills.data.length === 0) {
      return fail({
        code: "VIRTUAL_GROUP_SKILLS_EMPTY",
        message: "Virtual group must include at least one skill.",
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
    const source: ManifestFileV2["sources"][number] = {
      id,
      kind: "collection",
      locator: `collection:${id}`,
      canonicalLocator: `collection:${id}`,
      displayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const collection: SkillCollectionRecordV2 = {
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

    const preferences = projectStateV2ToView({ ...state, manifest, lockFile }).preferences;
    const plan = await this.planForSourcesV2(manifest, lockFile, [id], preferences);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }
    const applyResult = await new DeploymentApplierV2(this.createAdaptersForPreferences(preferences))
      .applyPlan(lockFile, plan.data.actions);
    if (!applyResult.ok) {
      return fail(applyResult.errors, [...plan.warnings, ...applyResult.warnings]);
    }

    await this.stateStoreV2.writeState({
      ...state,
      manifest,
      lockFile,
      collections,
    });

    const view = projectStateV2ToView({ ...state, manifest, lockFile });
    const group: VirtualGroupRecord = this.collectionToVirtualGroupView(collection);
    const viewSource = view.manifest.sources.find((item) => item.id === id) ?? {
      id,
      locator: `collection:${id}`,
      kind: "virtual" as const,
      displayName,
      originalDisplayName: displayName,
      addedAt: now,
    };
    const binding = view.manifest.bindings[id] ?? { selectedLeafIds: [], targets: {} };

    return ok({ group, source: viewSource, binding }, [...plan.warnings, ...applyResult.warnings]);
  }

  private async mergeGroupsImpl(
    options: MergeGroupsOptions,
  ): Promise<Result<CreateVirtualGroupResult>> {
    const displayName = options.displayName.trim();
    if (!displayName) {
      return fail({
        code: "VIRTUAL_GROUP_NAME_EMPTY",
        message: "Virtual group name cannot be empty.",
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

    const state = await this.stateStoreV2.readState();
    const manifest = this.cloneManifestV2(state.manifest);
    const lockFile = this.cloneLockFileV2(state.lockFile);
    const collections: CollectionsFileV2 = {
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
        code: "VIRTUAL_GROUP_SKILLS_EMPTY",
        message: "Virtual group must include at least one skill.",
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

    const source: ManifestFileV2["sources"][number] = {
      id,
      kind: "collection",
      locator: `collection:${id}`,
      canonicalLocator: `collection:${id}`,
      displayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const restoreSelections: SkillCollectionRecordV2["restoreSelections"] = {};
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

    const collection: SkillCollectionRecordV2 = {
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
    const preferences = projectStateV2ToView({ ...state, manifest, lockFile }).preferences;
    const plan = await this.planForSourcesV2(manifest, lockFile, [id, ...sourceIds], preferences);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }
    const applyResult = await new DeploymentApplierV2(this.createAdaptersForPreferences(preferences))
      .applyPlan(lockFile, plan.data.actions);
    if (!applyResult.ok) {
      return fail(applyResult.errors, [...plan.warnings, ...applyResult.warnings]);
    }

    await this.stateStoreV2.writeState({
      ...state,
      manifest,
      lockFile,
      collections,
    });

    const view = projectStateV2ToView({ ...state, manifest, lockFile });
    const group = this.collectionToVirtualGroupView(collection);
    const viewSource = view.manifest.sources.find((item) => item.id === id) ?? {
      id,
      locator: `collection:${id}`,
      kind: "virtual" as const,
      displayName,
      originalDisplayName: displayName,
      addedAt: now,
    };
    const binding = view.manifest.bindings[id] ?? { selectedLeafIds: [], targets: {} };

    return ok({ group, source: viewSource, binding }, [...plan.warnings, ...applyResult.warnings]);
  }

  private async restoreMergedGroupsImpl(
    virtualGroupId: string,
  ): Promise<Result<RestoreMergedGroupsResult>> {
    const state = await this.stateStoreV2.readState();
    const manifest = this.cloneManifestV2(state.manifest);
    const lockFile = this.cloneLockFileV2(state.lockFile);
    const collections: CollectionsFileV2 = {
      ...state.collections,
      collections: { ...state.collections.collections },
    };
    const collection = collections.collections[virtualGroupId];
    if (!collection) {
      return fail({
        code: "VIRTUAL_GROUP_NOT_FOUND",
        message: `Virtual group id '${virtualGroupId}' is not registered.`,
      });
    }
    if (collection.hiddenSourceIds.length === 0) {
      return fail({
        code: "VIRTUAL_GROUP_RESTORE_UNAVAILABLE",
        message: `Virtual group '${virtualGroupId}' does not have hidden source groups to restore.`,
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
      manifest.bindings[sourceId] = this.bindingV2FromRestoreSelection(selection, sourceLock.leafIds);
      restoredSourceIds.push(sourceId);
    }

    manifest.bindings[virtualGroupId] = {
      sourceId: virtualGroupId,
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    const preferences = projectStateV2ToView({ ...state, manifest, lockFile }).preferences;
    const plan = await this.planForSourcesV2(manifest, lockFile, [
      virtualGroupId,
      ...restoredSourceIds,
    ], preferences);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }
    const applyResult = await new DeploymentApplierV2(this.createAdaptersForPreferences(preferences))
      .applyPlan(lockFile, plan.data.actions);
    if (!applyResult.ok) {
      return fail(applyResult.errors, [...plan.warnings, ...applyResult.warnings]);
    }
    manifest.sources = manifest.sources.filter((source) => source.id !== virtualGroupId);
    delete manifest.bindings[virtualGroupId];
    const collectionSource = lockFile.sources[virtualGroupId];
    delete lockFile.sources[virtualGroupId];
    lockFile.leafInventory = lockFile.leafInventory.filter((leaf) => leaf.sourceId !== virtualGroupId);
    lockFile.projections = lockFile.projections.filter((projection) => projection.sourceId !== virtualGroupId);
    delete collections.collections[virtualGroupId];

    await this.stateStoreV2.writeState({
      ...state,
      manifest,
      lockFile,
      collections,
    });
    if (collectionSource) {
      await removePath(collectionSource.localPath);
    }

    return ok(
      { virtualGroupId, restoredSourceIds, skippedSourceIds },
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
        selectedSkillIds: draft?.selectedSkillIds ?? [],
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
        selectedSkillIds: draft?.selectedSkillIds ?? [],
        enabledTargets: draft?.enabledTargets ?? [],
      },
      () => this.importSourceImpl(locator, draft),
    );
  }

  inspectStateMigration(): Promise<StateMigrationStatus> {
    return new StateMigrationService({ stateRoot: this.store.rootPath }).inspect();
  }

  migrateState(options: StateMigrationOptions): Promise<StateMigrationResult> {
    return this.runSerializedMutation(() =>
      new StateMigrationService({ stateRoot: this.store.rootPath }).migrate(options),
    );
  }

  async listWorkflows(): Promise<
    Result<{
      summaries: WorkflowSummary[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      customTargets: SharedPreferences["customTargets"];
      agentDisplayOrder: SharedPreferences["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    return this.runSerializedMutation(() => this.listWorkflowsImpl());
  }

  async saveSettings(input: {
    customTargets: SharedPreferences["customTargets"];
    agentDisplayOrder: SharedPreferences["agentDisplayOrder"];
  }): Promise<Result<{
    customTargets: SharedPreferences["customTargets"];
    agentDisplayOrder: SharedPreferences["agentDisplayOrder"];
  }>> {
    return this.runSerializedMutation(async () => {
      const preferences = (await this.readRuntimeAuthorityView()).preferences;
      const saved = await this.writePreferencesV2FromView({
        ...preferences,
        customTargets: input.customTargets,
        agentDisplayOrder: input.agentDisplayOrder,
      });
      this.adapters = this.createAdaptersForPreferences(saved);
      this.planner = new DeploymentPlanner(this.adapters);
      this.applier = new DeploymentApplier(this.adapters);
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
      source: Manifest["sources"][number];
      binding: SourceBinding;
      leafs: LeafRecord[];
      deployments: LockFile["deployments"];
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

  private async inspectSourceImpl(
    sourceId: string,
    scope: ProjectScope,
  ): Promise<
    Result<{
      summary: WorkflowSummary;
      source: Manifest["sources"][number];
      binding: SourceBinding;
      leafs: LeafRecord[];
      deployments: LockFile["deployments"];
    }>
  > {
    const runtimeView = await this.readRuntimeAuthorityView();
    const { manifest, lockFile, preferences, collections } = runtimeView;
    this.normalizeBindings(manifest, lockFile, collections);
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

    const binding = manifest.bindings[sourceId] ?? { selectedLeafIds: [], targets: {} };
    const leafs = this.getSourceLeafsForBinding(source, binding, lockFile, collections);
    const deployments = lockFile.deployments.filter(
      (deployment) => deployment.sourceId === sourceId,
    );

    if (scope.kind === "global") {
      return ok({ summary, source, binding, leafs, deployments });
    }

    const initialDrafts: Record<string, DraftBinding> = {
      [sourceId]: this.draftFromSourceBinding(source, binding, lockFile, collections),
    };
    const scopedDraft = this.resolveDraftForScope(sourceId, initialDrafts, preferences, scope);

    const scopedManifest = this.cloneManifest(manifest);
    this.normalizeBindings(scopedManifest, lockFile, collections);
    const prepared = this.prepareManifestForDraft(scopedManifest, lockFile, sourceId, scopedDraft);
    const scopedSource = prepared.manifest.sources.find((item) => item.id === sourceId) ?? source;
    const scopedSummary =
      this.workflowService.getSummaries(prepared.manifest, lockFile, undefined, collections).find((item) => item.source.id === sourceId)
      ?? summary;
    const scopedBinding = prepared.manifest.bindings[sourceId] ?? binding;
    const scopedDeployments = scopedDraft.enabledTargets.length === 0
      ? []
      : await this.resolveScopedInspectDeployments(
        prepared.manifest,
        lockFile,
        sourceId,
        scope,
        scopedDraft.enabledTargets,
        preferences,
      );

    return ok({
      summary: scopedSummary,
      source: scopedSource,
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
        : await this.workspaceBootstrapService.scanUnmanagedLocalSkills(manifest, lockFile);
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
    manifest: Manifest,
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
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    const body = frontmatter?.[1] ?? "";
    const nameMatch = body.match(/^name:\s*(.+)$/m);
    const descriptionBlock = body.match(/^description:\s*\|\s*\n((?:\s+.+\n?)*)/m);
    const descriptionLine = body.match(/^description:\s*(.+)$/m);
    const title = nameMatch?.[1]?.trim() ?? "";
    const description = descriptionBlock?.[1]
      ? descriptionBlock[1].split("\n").map((line) => line.trim()).filter(Boolean).join(" ")
      : descriptionLine?.[1]?.trim() ?? "";
    return { title, description };
  }

  private async buildOriginLocalImportGroups(
    canonicalRepo: string,
    localSkills: LocalSkillScanResult[],
    installedRepos: Set<string>,
    manifest: Manifest,
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
          id: "origin",
          label: "Origin",
          locator: originLocator,
          selectedSkillIds: importableOriginSkillIds,
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
      previewState: readyPreview
        ? { status: "ready" }
        : { status: "failed", reasonCode: "provider_data_unavailable", retryable: true },
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
      return [{
        id: "origin",
        label: "Origin",
        locator: options.originLocator,
        selectedSkillIds: options.skillIds,
        enabled: true,
      }];
    }
    const localSkill = options.localSkills[0];
    return [{
      id: "local",
      label: "Local",
      locator: localSkill?.path ?? "",
      selectedSkillIds: options.localSkills.map((skill) => skill.displayName),
      enabled: true,
    }];
  }

  private buildMergedLocalScanImportChoices(skillGroups: LocalScanGroup[]): LocalScanImportChoice[] {
    const firstOrigin = skillGroups[0]?.origin;
    const importableSkillIds = skillGroups
      .filter((group) =>
        group.status === "matched" &&
        group.importChoices.some((choice) => choice.id === "origin" && choice.enabled),
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
            group.importChoices.some((choice) => choice.id === "origin" && choice.enabled)
          )
        ),
      )
    ) {
      return [{
        id: "origin",
        label: "Origin",
        locator: firstOrigin.locator,
        selectedSkillIds: importableSkillIds,
        enabled: true,
      }];
    }

    return [];
  }

  private async buildLocalScanGroups(
    scanned: LocalSkillScanResult[],
    manifest: Manifest,
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
    manifest: Manifest,
    lockFile: LockFile,
  ): boolean {
    const resolvedSkillPath = path.resolve(item.scan.path);

    return manifest.sources.some((source) => {
      if (source.kind === "local" && path.resolve(source.locator) === resolvedSkillPath) {
        return true;
      }

      const sourceRepo = normalizeImportCanonicalRepo(source.locator)
        ?? (source.originLocator ? normalizeImportCanonicalRepo(source.originLocator) : undefined);
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
    manifest: Manifest,
    lockFile: LockFile,
  ): boolean {
    return manifest.sources.some((source) => {
      const sourceRepo = normalizeImportCanonicalRepo(source.locator)
        ?? (source.originLocator ? normalizeImportCanonicalRepo(source.originLocator) : undefined);
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
    manifest: Manifest,
    lockFile: LockFile,
  ): boolean {
    const source = manifest.sources.find((record) => record.id === sourceId);
    const sourceLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const selectedLeafIds = manifest.bindings[sourceId]?.selectedLeafIds ?? [];
    if (
      source?.selectionMode === "all" ||
      (sourceLeafs.length > 0 && selectedLeafIds.length >= sourceLeafs.length)
    ) {
      return true;
    }

    const selectedLeafs = sourceLeafs.filter((leaf) => selectedLeafIds.includes(leaf.id));
    const candidates = this.localScanManagedSkillCandidates(localSkill, detectedSkill);
    return selectedLeafs.some((leaf) =>
      candidates.has(leaf.relativePath) ||
      candidates.has(leaf.name) ||
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
      previewState: { status: "idle" },
      localImport: {
        validationStatus: fallbackDetectedSkill.validationStatus,
        selectedChoiceId: "local",
        choices: [this.buildLocalImportChoice([skill])],
        detectedSkills: [fallbackDetectedSkill],
      },
    };
  }

  private buildLocalImportChoice(localSkills: LocalSkillScanResult[]) {
    return {
      id: "local" as const,
      label: "Local",
      locator: localSkills[0]?.path ?? "",
      selectedSkillIds: localSkills.map((skill) => skill.displayName),
    };
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
      originSkillId: match.id,
    };
  }

  private matchLocalImportOriginSkills(
    skill: LocalSkillScanResult,
    originSkills: ImportPreviewSkillCandidate[],
  ): ImportPreviewSkillCandidate[] {
    const originRequestedPath = skill.originRequestedPath?.trim();
    if (originRequestedPath) {
      const matches = originSkills.filter((originSkill) => originSkill.id === originRequestedPath);
      if (matches.length > 0) {
        return matches;
      }
    }

    const localDirectoryName = path.basename(skill.path);
    const leafMatches = originSkills.filter((originSkill) => {
      const id = originSkill.id;
      return id === localDirectoryName || id.endsWith(`/${localDirectoryName}`);
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

    return originSkills.filter((originSkill) => originSkill.id === skill.displayName);
  }

  private localImportSkillChanged(
    skill: LocalSkillScanResult,
    originSkill: ImportPreviewSkillCandidate,
  ): boolean {
    const localDescription = skill.description.trim();
    const originSummary = originSkill.summary.trim();
    return Boolean(localDescription && originSummary && localDescription !== originSummary);
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
                previewState: { status: "idle" as const },
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
      return this.importPreparationServiceV2.prepareImportSource(githubLocator.locator, {
        project: false,
        ...(githubLocator.requestedPath ? { path: githubLocator.requestedPath } : {}),
      });
    }

    const directLocator = await this.resolveDirectImportLocator(locator);
    return this.importPreparationServiceV2.prepareImportSource(directLocator ?? locator.trim(), {
      project: false,
    });
  }

  private async commitPreparedImportSourceImpl(
    preparationId: string,
    draft?: ImportDraft,
    canonicalRepo?: string,
  ): Promise<Result<ImportSourceResult>> {
    const committed = await this.importPreparationServiceV2.commitPreparedImportSource(preparationId);
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

    return ok(committedData, [...committed.warnings, ...finalDraft.warnings, ...applied.warnings]);
  }

  private async previewImportSourceImpl(locator: string): Promise<Result<ImportPreviewResult>> {
    await this.stateStoreV2.init();
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
      return ok({
        status: "ready",
        locator: githubLocator.locator,
        canonicalRepo,
        snapshot,
        selectedSkillIds: snapshotSkills.map((skill) => skill.skillId),
        enabledTargets: [],
        skills: snapshotSkills.map((skill) => ({
          id: skill.skillId,
          title: skill.title,
          summary: skill.summary ?? "",
          selectedByDefault: true,
        })),
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
    const preparation = await this.importPreparationServiceV2.prepareImportSource(normalizedLocator, {
      project: false,
      ...(githubLocator?.requestedPath ? { path: githubLocator.requestedPath } : {}),
    });
    const importDraft = draft ?? (githubLocator?.skillSelector
      ? { selectedSkillIds: [githubLocator.skillSelector], enabledTargets: [] }
      : undefined);
    const canonicalRepo = githubLocator?.canonicalRepo ?? normalizeImportCanonicalRepo(normalizedLocator);
    if (preparation.ok && preparation.data.status === "ready") {
      return this.commitPreparedImportSourceImpl(
        preparation.data.preparationId,
        importDraft,
        canonicalRepo,
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

    return ok({
      status: "ready",
      sourceId: prepared.data.sourceId,
      canonicalRepo: canonicalRepo ?? normalizedLocator,
    }, [...finalDraft.warnings, ...applied.warnings]);
  }

  private withImportPreparation(
    preview: Result<ImportPreviewResult>,
    preparation: Result<ImportPreparationResult>,
  ): Result<ImportPreviewResult> {
    if (!preview.ok || preview.data.status !== "ready") {
      return preview;
    }

    return ok({
      ...preview.data,
      ...this.importPreparationPreviewFields(preparation),
    }, preview.warnings);
  }

  private importPreparationPreviewFields(
    preparation: Result<ImportPreparationResult>,
  ): Partial<Extract<ImportPreviewResult, { status: "ready" }>> {
    if (!preparation.ok) {
      return {};
    }

    if (preparation.data.status === "failed") {
      return {
        ...(preparation.data.preparationId ? { preparationId: preparation.data.preparationId } : {}),
        preparationStatus: "failed",
      };
    }

    return {
      preparationId: preparation.data.preparationId,
      preparationStatus: preparation.data.status,
      ...(preparation.data.preparedAt ? { preparedAt: preparation.data.preparedAt } : {}),
      ...(preparation.data.expiresAt ? { expiresAt: preparation.data.expiresAt } : {}),
    };
  }

  private async resolveSourceMetadata(
    source: Manifest["sources"][number],
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

    return this.refreshSourceMetadata(source, lock, inferSourceMetadataProvider(source));
  }

  private refreshSourceMetadataInBackground(
    source: Manifest["sources"][number],
    lock: WorkflowSummary["lock"],
    providerHint?: SourceMetadataResult["provider"],
  ): void {
    if (this.metadataRefreshesBySourceId.has(source.id)) {
      return;
    }

    const refresh = this.refreshSourceMetadata(source, lock, providerHint)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.metadataRefreshesBySourceId.delete(source.id);
      });

    this.metadataRefreshesBySourceId.set(source.id, refresh);
  }

  private async refreshSourceMetadata(
    source: Manifest["sources"][number],
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

  private importRecommendationSeedRepos(): string[] {
    return [
      "anthropics/skills",
      "garrytan/gstack",
      "vercel-labs/agent-skills",
    ];
  }

  private installedCanonicalRepos(manifest: Manifest): Set<string> {
    return new Set(
      manifest.sources.flatMap((source) => {
        const canonicalRepo = normalizeImportCanonicalRepo(source.locator)
          ?? (source.originLocator ? normalizeImportCanonicalRepo(source.originLocator) : undefined);
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
        previewState: { status: "idle" },
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
      previewState: { status: "idle" },
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
    manifest: Manifest,
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
      previewState: { status: "idle" },
    };
  }

  private isDirectImportLocatorInstalled(manifest: Manifest, locator: string): boolean {
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

    const preparation = await pathExists(resolvedLocator)
      ? await this.importPreparationServiceV2.prepareImportSource(resolvedLocator, {
          project: false,
        })
      : undefined;
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
    return preparation ? this.withImportPreparation(result, preparation) : result;
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
    const preview = await this.sourceService.previewSource(
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

    const skills = leafs.map((leaf) => {
      const id = leaf.relativePath === "." ? leaf.name : leaf.relativePath;
      return {
        id,
        title: leaf.title,
        summary: leaf.description,
        selectedByDefault: true,
      };
    });

    return {
      status: "ready",
      locator,
      canonicalRepo,
      selectedSkillIds: skills.map((skill) => skill.id),
      enabledTargets: [],
      skills,
      targets: availableTargets.map((target) => ({
        id: target,
        selectedByDefault: false,
      })),
    };
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

  private filterPreviewLeafs(
    leafs: LeafRecord[],
    canonicalRepo: string,
    options: {
      requestedPath?: string;
      skillSelectors?: string[];
    } = {},
  ): LeafRecord[] | undefined {
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

  private pickPreferredImportLeafMatch(matches: LeafRecord[]): LeafRecord | undefined {
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
      summaries: WorkflowSummary[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      customTargets: SharedPreferences["customTargets"];
      agentDisplayOrder: SharedPreferences["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    const runtimeView = await this.readRuntimeAuthorityView();
    const { manifest, lockFile, collections } = runtimeView;
    const recentProjects = await this.recentProjectService.listRecentProjects().catch(() => []);
    const reconciledPreferences = await this.pruneMissingSourceIdsV2({
      ...runtimeView.preferences,
      recentProjects,
    });
    const groupCardEnrichmentBySourceId = await this.readCachedGroupCardEnrichmentBySourceId(
      manifest,
      lockFile,
    );
    const hiddenSourceIds = this.hiddenSourceIdsFromCollections(collections);
    return ok(
      {
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
    Result<{ manifest: Manifest; lockFile: LockFile; summaries: WorkflowSummary[] }>
  > {
    return this.runSerializedMutation(() => this.getConfigDataImpl());
  }

  private async getConfigDataImpl(): Promise<
    Result<{ manifest: Manifest; lockFile: LockFile; summaries: WorkflowSummary[] }>
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
      manifest: Manifest;
      lockFile: LockFile;
      summaries: WorkflowSummary[];
      initialDrafts: Record<string, DraftBinding>;
      audit: DoctorReport;
      importedSourceIds: string[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      projectDrafts: SharedPreferences["projectDrafts"];
      customTargets: SharedPreferences["customTargets"];
      agentDisplayOrder: SharedPreferences["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
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
      manifest: Manifest;
      lockFile: LockFile;
      summaries: WorkflowSummary[];
      initialDrafts: Record<string, DraftBinding>;
      audit: DoctorReport;
      importedSourceIds: string[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      projectDrafts: SharedPreferences["projectDrafts"];
      customTargets: SharedPreferences["customTargets"];
      agentDisplayOrder: SharedPreferences["agentDisplayOrder"];
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    const boot = await this.configCoordinator.bootstrapWorkspaceState(onEvent);
    if (!boot.ok) {
      return fail(boot.errors, boot.warnings);
    }
    const preferences = await this.pruneMissingSourceIdsV2();
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
      projectDrafts: preferences.projectDrafts,
      customTargets: preferences.customTargets,
      agentDisplayOrder: preferences.agentDisplayOrder,
      groupCardEnrichmentBySourceId,
    });
  }

  private async readCachedGroupCardEnrichmentBySourceId(
    manifest: Manifest,
    lockFile: LockFile,
  ): Promise<Record<string, GroupCardEnrichmentSnapshot>> {
    const [sourceMetadataCache, importDataCache] = await Promise.all([
      this.store.readSourceMetadataCache(),
      this.store.readImportDataCache(),
    ]);
    const entries: Record<string, GroupCardEnrichmentSnapshot> = {};

    for (const source of manifest.sources) {
      const entry: GroupCardEnrichmentSnapshot = {};
      const sourceLock = lockFile.sources.find((item) => item.id === source.id);
      const cachedMetadata = sourceMetadataCache[source.id];
      if (cachedMetadata) {
        entry.sourceMetadata = sourceMetadataCacheEntryToResult(cachedMetadata);
      }

      const canonicalRepo = normalizeImportCanonicalRepo(source.locator)
        ?? (source.originLocator ? normalizeImportCanonicalRepo(source.originLocator) : undefined);
      const cachedSnapshot = canonicalRepo
        ? importDataCache.repos?.[canonicalRepo]?.providers.skills?.snapshot
        : undefined;
      if (cachedSnapshot) {
        entry.sourceSnapshot = cachedSnapshot;
      }

      if (sourceLock?.checkoutPath) {
        entry.groupPath = sourceLock.checkoutPath;
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
    const manifest = await this.store.readManifest();
    if (!manifest.sources.some((source) => source.id === sourceId)) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    const preferences = await this.store.togglePinnedSource(sourceId);
    return ok({ pinnedSourceIds: preferences.pinnedSourceIds });
  }

  private async renameSourceImpl(
    sourceId: string,
    displayName: string,
  ): Promise<Result<RenameSourceResult>> {
    const trimmedDisplayName = displayName.trim();
    const state = await this.stateStoreV2.readState();
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
    await this.stateStoreV2.writeState({
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

  async previewDraft(
    sourceId: string,
    draft: DraftBinding,
  ): Promise<Result<{ plan: DeploymentPlan; manifest: Manifest; lockFile: LockFile }>> {
    // config TUI state flow:
    //   draft -> previewDraft() -> plan only
    //   draft -> applyDraft()   -> plan + filesystem + manifest/lock writes
    const runtimeView = await this.readRuntimeAuthorityView();
    const prepared = this.prepareManifestV2ForDraft(
      this.cloneManifestV2(runtimeView.state.manifest),
      runtimeView.state.lockFile,
      sourceId,
      draft,
    );
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }

    const plan = await this.planForAffectedSourcesV2(
      prepared.data.manifest,
      runtimeView.state.lockFile,
      sourceId,
      runtimeView.preferences,
    );
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }
    const projected = projectStateV2ToView({
      ...runtimeView.state,
      manifest: prepared.data.manifest,
    });

    return ok(
      { plan: plan.data, manifest: projected.manifest, lockFile: projected.lockFile },
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
      const { manifest, lockFile, preferences } = runtimeView;
      if (!manifest.sources.some((source) => source.id === sourceId)) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }

      this.normalizeBindings(manifest, lockFile);
      const initialDrafts: Record<string, DraftBinding> = {
        [sourceId]: this.draftFromBinding(
          sourceId,
          manifest.bindings[sourceId] ?? { targets: {} },
          lockFile,
        ),
      };
      const previousDraft = this.resolveDraftForScope(sourceId, initialDrafts, preferences, scope);
      const previousScopedManifest = this.cloneManifest(manifest);
      this.normalizeBindings(previousScopedManifest, lockFile);
      const previousPrepared = this.prepareManifestForDraft(
        previousScopedManifest,
        lockFile,
        sourceId,
        previousDraft,
      );
      const scopedManifest = this.cloneManifest(manifest);
      this.normalizeBindings(scopedManifest, lockFile);
      const prepared = this.prepareManifestForDraft(scopedManifest, lockFile, sourceId, draft);
      const scopedTargets = [...new Set([
        ...previousDraft.enabledTargets,
        ...prepared.draft.enabledTargets,
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
            draft: prepared.draft,
            recentProjects: preferencesAfterFailure.recentProjects,
            selectedProjectScope: preferencesAfterFailure.selectedProjectScope,
            projectDrafts: preferencesAfterFailure.projectDrafts,
          },
          warnings: [...prepared.warnings, ...targetRootOverrides.warnings],
          errors: targetRootOverrides.errors,
        };
      }
      const scopedDeployments = scopedTargets.length === 0
        ? []
        : await this.findScopedDeploymentsOnDisk(
          previousPrepared.manifest,
          lockFile,
          sourceId,
          targetRootOverrides.data,
        );
      const nextPreferences: SharedPreferences = {
        ...preferences,
        projectDrafts: {
          ...preferences.projectDrafts,
          [scope.projectId]: {
            ...(preferences.projectDrafts[scope.projectId] ?? {}),
            [sourceId]: prepared.draft,
          },
        },
      };

      if (scopedTargets.length > 0) {
        const scopedLockFile = this.cloneLockFileForScopedDeployments(lockFile, scopedDeployments);
        const scopedApply = await this.withScopedTargetRoots<Result<{ actions: DeploymentAction[] }>>(
          targetRootOverrides.data,
          async () => {
          const plan = await this.planForSources(
            prepared.manifest,
            scopedLockFile,
            [sourceId],
          );
          if (!plan.ok) {
            return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
          }

          const applyResult = await this.applier.applyPlan(scopedLockFile, plan.data.actions);
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

        await this.writePreferencesV2FromView(nextPreferences);
        const freshState = await this.buildApplyDraftFreshState(sourceId, scope);
        return ok(
          {
            actions: scopedApply.data.actions,
            draft: prepared.draft,
            ...(freshState.summary ? { summary: freshState.summary } : {}),
            ...(freshState.inspect ? { inspect: freshState.inspect } : {}),
          },
          scopedApply.warnings,
        );
      }

      await this.writePreferencesV2FromView(nextPreferences);
      const freshState = await this.buildApplyDraftFreshState(sourceId, scope);
      return ok(
        {
          actions: [],
          draft: prepared.draft,
          ...(freshState.summary ? { summary: freshState.summary } : {}),
          ...(freshState.inspect ? { inspect: freshState.inspect } : {}),
        },
        prepared.warnings,
      );
    }

    const state = await this.stateStoreV2.readState();
    const manifest = this.cloneManifestV2(state.manifest);
    const lockFile = this.cloneLockFileV2(state.lockFile);
    const prepared = this.prepareManifestV2ForDraft(manifest, lockFile, sourceId, draft);
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }

    const preferences = projectStateV2ToView(state).preferences;
    const plan = await this.planForAffectedSourcesV2(prepared.data.manifest, lockFile, sourceId, preferences);
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }

    const applier = new DeploymentApplierV2(this.createAdaptersForPreferences(preferences));
    const applyResult = await applier.applyPlan(lockFile, plan.data.actions);

    if (!applyResult.ok) {
      return fail(
        applyResult.errors,
        [...prepared.warnings, ...plan.warnings, ...applyResult.warnings],
      );
    }

    await this.stateStoreV2.writeState({
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
    const updated = await this.sourceAuthorityServiceV2.updateSources(sourceIds);
    if (!updated.ok) {
      return updated;
    }

    const state = await this.stateStoreV2.readState();
    const manifest = this.cloneManifestV2(state.manifest);
    const lockFile = this.cloneLockFileV2(state.lockFile);
    const preferences = projectStateV2ToView(state).preferences;
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
        this.hasActiveTargetsV2(manifest, id) ||
        projectedSourceIds.has(id),
      );
    const planned = await this.planForSourcesV2(manifest, lockFile, planSourceIds, preferences);
    if (!planned.ok) {
      return fail(planned.errors, [...updated.warnings, ...planned.warnings]);
    }
    const applier = new DeploymentApplierV2(this.createAdaptersForPreferences(preferences));
    const applied = await applier.applyPlan(lockFile, planned.data.actions);
    if (!applied.ok) {
      return fail(applied.errors, [...updated.warnings, ...planned.warnings, ...applied.warnings]);
    }
    await this.stateStoreV2.writeState({
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
    const reconciled = await this.sourceService.reconcileInventory();
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    const { manifest, lockFile } = await this.store.readState();
    await this.ensureProjectionLedger(manifest, lockFile);
    await this.persistNormalizedBindings(manifest, lockFile);
    const doctor = await this.doctorService.run(manifest, lockFile);
    if (!doctor.ok) {
      return doctor;
    }
    return ok(doctor.data, [...pruned.warnings, ...doctor.warnings]);
  }

  async repairTargets(sourceIds?: string[]): Promise<Result<{ actions: DeploymentAction[] }>> {
    return this.runSerializedMutation(() => this.repairTargetsImpl(sourceIds));
  }

  private async repairTargetsImpl(
    sourceIds?: string[],
  ): Promise<Result<{ actions: DeploymentAction[] }>> {
    const state = await this.stateStoreV2.readState();
    const manifest = this.cloneManifestV2(state.manifest);
    const lockFile = this.cloneLockFileV2(state.lockFile);
    const preferences = projectStateV2ToView(state).preferences;
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

    const planSourceIds = requestedIds.filter(
      (sourceId) =>
        this.hasActiveTargetsV2(manifest, sourceId) ||
        lockFile.projections.some((projection) =>
          projection.sourceId === sourceId && projection.status === "active"
        ),
    );
    const planned = await this.planForSourcesV2(manifest, lockFile, planSourceIds, preferences);
    if (!planned.ok) {
      return fail(planned.errors, [...warnings, ...planned.warnings]);
    }
    const applier = new DeploymentApplierV2(this.createAdaptersForPreferences(preferences));
    const applied = await applier.applyPlan(lockFile, planned.data.actions);
    if (!applied.ok) {
      return fail(applied.errors, [...warnings, ...planned.warnings, ...applied.warnings]);
    }

    await this.stateStoreV2.writeState({
      ...state,
      manifest,
      lockFile,
    });
    return ok({ actions: planned.data.actions }, [...warnings, ...planned.warnings, ...applied.warnings]);
  }

  async repairSource(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    return this.runSerializedMutation(() => this.repairSourceImpl(sourceIds));
  }

  private async repairSourceImpl(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    return this.sourceAuthorityServiceV2.updateSources(sourceIds);
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

    const reconciled = await this.sourceService.reconcileInventory(requestedIds, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, [...pruned.warnings, ...reconciled.warnings]);
    }

    const { manifest, lockFile } = await this.store.readState();
    await this.persistNormalizedBindings(manifest, lockFile);
    const removedDeploymentCount = await this.rebuildDeploymentState(
      manifest,
      lockFile,
      requestedIds,
    );
    await this.store.writeState(manifest, lockFile);

    return ok(
      {
        repairedSourceIds: reconciled.data.updatedSourceIds,
        removedDeploymentCount,
      },
      [...pruned.warnings, ...reconciled.warnings],
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
    const state = await this.stateStoreV2.readState();
    const warnings: string[] = [];
    const removedRefs = sourceIds
      .map((sourceId) => state.manifest.sources.find((source) => source.id === sourceId))
      .filter((source): source is ManifestFileV2["sources"][number] => Boolean(source))
      .map((source) => ({
        id: source.id,
        locator: source.locator,
        displayName: source.displayName,
      }));

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
      removed = await this.sourceAuthorityServiceV2.removeSource(sourceIds);
    } catch (error) {
      return fail({
        code: "GROUP_DELETE_INCOMPLETE",
        message: `Unable to fully delete selected skills groups: ${String(error)}`,
      });
    }
    if (!removed.ok) {
      return fail(removed.errors, removed.warnings);
    }

    return ok({ removed: removed.data.removed, removedRefs, warnings });
  }

  bindingFromDraft(draft: DraftBinding): SourceBinding {
    const targets: Partial<Record<DeploymentTargetId, TargetBinding>> = {};
    for (const target of draft.enabledTargets) {
      targets[target] = {
        enabled: true,
        leafIds: [...draft.selectedLeafIds],
      };
    }
    return {
      selectedLeafIds: [...draft.selectedLeafIds],
      targets,
    };
  }

  private uniqueVirtualSourceId(
    displayName: string,
    manifest: Manifest,
    virtualGroups: VirtualGroupsState,
  ): string {
    const baseId = deriveSourceId(displayName) || "virtual-group";
    const usedIds = new Set([
      ...manifest.sources.map((source) => source.id),
      ...Object.keys(virtualGroups.groups),
    ]);
    let candidate = baseId;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private validateVirtualSkillRefs(
    skills: VirtualGroupSkillRef[],
    manifest: Manifest,
    lockFile: LockFile,
  ): Result<VirtualGroupSkillRef[]> {
    const includedSkills: VirtualGroupSkillRef[] = [];
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

      const leaf = lockFile.leafInventory.find((item) => item.id === leafId);
      if (!leaf || leaf.sourceId !== sourceId) {
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

  private findVirtualSkillNameConflict(
    skills: VirtualGroupSkillRef[],
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
      code: "VIRTUAL_GROUP_SKILL_NAME_CONFLICT",
      message: `Virtual group contains duplicate projected skill names: ${
        duplicates
          .map(([name, refs]) =>
            `${name} (${refs.map((ref) => `${ref.sourceId}:${ref.leaf.relativePath}`).join(", ")})`
          )
          .join("; ")
      }.`,
    };
  }

  private uniqueCollectionSourceId(
    displayName: string,
    manifest: ManifestFileV2,
    collections: CollectionsFileV2,
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
    skills: VirtualGroupSkillRef[],
    manifest: ManifestFileV2,
    lockFile: LockFileV2,
  ): Result<VirtualGroupSkillRef[]> {
    const includedSkills: VirtualGroupSkillRef[] = [];
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
          message: `${sourceId} is missing from V2 lock sources.`,
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
    skills: VirtualGroupSkillRef[],
    lockFile: LockFileV2,
  ): { code: string; message: string } | undefined {
    const refsByName = new Map<string, Array<{ sourceId: string; leaf: LeafRecordV2 }>>();

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
      code: "VIRTUAL_GROUP_SKILL_NAME_CONFLICT",
      message: `Virtual group contains duplicate projected skill names: ${
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
    skills: VirtualGroupSkillRef[],
    manifest: ManifestFileV2,
    lockFile: LockFileV2,
    migrationGeneration: ManifestFileV2["migrationGeneration"],
    now: string,
  ): Promise<Result<{
    collectionRoot: string;
    members: SkillCollectionMemberV2[];
    leafs: LeafRecordV2[];
  }>> {
    const collectionRoot = path.join(this.stateStoreV2.rootPath, "source", "collection", collectionId);

    try {
      await fs.rm(collectionRoot, { recursive: true, force: true });
      await fs.mkdir(collectionRoot, { recursive: true });

      const members: SkillCollectionMemberV2[] = [];
      const leafs: LeafRecordV2[] = [];

      for (const [index, ref] of skills.entries()) {
        const originSource = manifest.sources.find((source) => source.id === ref.sourceId);
        const originLock = lockFile.sources[ref.sourceId];
        const originLeaf = lockFile.leafInventory.find(
          (leaf) => leaf.id === ref.leafId && leaf.sourceId === ref.sourceId,
        );
        if (!originSource || !originLock || !originLeaf) {
          return fail({
            code: "COLLECTION_MEMBER_ORIGIN_MISSING",
            message: `Skill leaf '${ref.leafId}' is not available for collection '${collectionId}'.`,
          });
        }

        const memberId = `member-${index + 1}`;
        const leafId = `${collectionId}:${memberId}`;
        const memberPath = path.join(collectionRoot, memberId);
        await fs.cp(originLeaf.absolutePath, memberPath, { recursive: true, force: true });
        const actualHash = await hashDirectory(memberPath);
        const skillFilePath = path.join(memberPath, "SKILL.md");

        leafs.push({
          id: leafId,
          sourceId: collectionId,
          relativePath: memberId,
          linkName: memberId,
          title: originLeaf.title || originLeaf.displayName || originLeaf.linkName || memberId,
          description: originLeaf.description ?? "",
          absolutePath: memberPath,
          skillFilePath,
          displayName: originLeaf.displayName || originLeaf.title || originLeaf.linkName || memberId,
          contentHash: actualHash,
          selectors: {
            legacyAliases: [originLeaf.id, originLeaf.relativePath],
          },
          valid: true,
          diagnostics: [],
        });
        members.push({
          id: memberId,
          origin: {
            sourceId: ref.sourceId,
            leafId: ref.leafId,
            sourceLocator: originSource.locator,
            canonicalLocator: originLock.canonicalLocator,
            repoPath: originLeaf.relativePath,
            contentHashAtCapture: originLeaf.contentHash,
            capturedAt: now,
          },
          snapshot: {
            leafId,
            materializedPath: memberId,
            skillFilePath: path.join(memberId, "SKILL.md"),
            relativePath: memberId,
            contentHash: actualHash,
          },
          updatePolicy: "frozen",
        });
      }

      await writeJsonFile(path.join(collectionRoot, ".skillflow-generation.json"), {
        schemaVersion: 2,
        migrationGeneration,
        collectionId,
        createdAt: now,
        diagnostics: [],
      });

      return ok({ collectionRoot, members, leafs });
    } catch (error) {
      await fs.rm(collectionRoot, { recursive: true, force: true });
      return fail({
        code: "COLLECTION_MATERIALIZATION_FAILED",
        message: `Unable to materialize collection '${collectionId}': ${String(error)}`,
      });
    }
  }

  private collectionToVirtualGroupView(collection: SkillCollectionRecordV2): VirtualGroupRecord {
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

  private bindingV2FromRestoreSelection(
    selection: SkillCollectionRecordV2["restoreSelections"][string],
    sourceLeafIds: string[],
  ): ManifestFileV2["bindings"][string] {
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

  private hiddenSourceIdsFromCollections(collections: CollectionsFileV2): Set<string> {
    return new Set(
      Object.values(collections.collections).flatMap((collection) => collection.hiddenSourceIds),
    );
  }

  private resolveDraftForScope(
    sourceId: string,
    initialDrafts: Record<string, DraftBinding>,
    preferences: SharedPreferences,
    scope: ProjectScope,
  ): DraftBinding {
    if (scope.kind === "global") {
      return initialDrafts[sourceId] ?? EMPTY_DRAFT;
    }

    return (
      preferences.projectDrafts[scope.projectId]?.[sourceId] ??
      initialDrafts[sourceId] ??
      EMPTY_DRAFT
    );
  }

  private cloneManifest(manifest: Manifest): Manifest {
    const bindings: Record<string, SourceBinding> = {};

    for (const [sourceId, binding] of Object.entries(manifest.bindings)) {
      const targets: SourceBinding["targets"] = {};
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
        ...(binding.selectedLeafIds ? { selectedLeafIds: [...binding.selectedLeafIds] } : {}),
        targets,
      };
    }

    return {
      schemaVersion: manifest.schemaVersion,
      sources: manifest.sources.map((source) => ({ ...source })),
      bindings,
    };
  }

  private cloneManifestV2(manifest: ManifestFileV2): ManifestFileV2 {
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

  private cloneLockFileV2(lockFile: LockFileV2): LockFileV2 {
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
          },
        ]),
      ),
      leafInventory: lockFile.leafInventory.map((leaf) => ({
        ...leaf,
        selectors: {
          legacyAliases: [...leaf.selectors.legacyAliases],
        },
        diagnostics: leaf.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      })),
      projections: lockFile.projections.map((projection) => ({ ...projection })),
    };
  }

  private async pruneMissingCheckoutsImpl(): Promise<Result<{ removedSourceIds: string[] }>> {
    const state = await this.stateStoreV2.readState();
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

    await this.stateStoreV2.writeState({
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
    manifest: Manifest,
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

        const matchingProjections = (lockFile.projections ?? []).filter(
          (projection) => path.resolve(projection.targetPath) === resolvedTargetPath,
        );
        const hasResolvableProjection = matchingProjections.some((projection) =>
          this.isProjectionStillResolvable(manifest, lockFile, projection),
        );
        if (hasResolvableProjection) {
          continue;
        }

        await removePath(targetPath);
        lockFile.projections = (lockFile.projections ?? []).filter(
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
    for (const source of lockFile.sources.filter((item) => sourceIds.includes(item.id))) {
      const resolvedCheckoutPath = await fs.realpath(source.checkoutPath).catch(() =>
        path.resolve(source.checkoutPath),
      );
      checkoutRoots.set(source.id, resolvedCheckoutPath);
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
    manifest: Manifest,
    lockFile: LockFile,
    projection: ProjectionRecord,
  ): boolean {
    const source = manifest.sources.find((item) => item.id === projection.sourceId);
    if (!source) {
      return false;
    }

    if (projection.mode === "managed") {
      const binding = manifest.bindings[source.id] ?? { targets: {} };
      return Boolean(this.findLeafForSourceBinding(source, binding, lockFile, projection.leafId));
    }

    return true;
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
    manifest: Manifest,
    sourceId: string,
  ): DeploymentTargetId[] {
    const binding = manifest.bindings[sourceId];
    if (!binding) {
      return [];
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
    manifest: Manifest,
    lockFile: LockFile,
    sourceIds: string[],
    restrictedTargets?: DeploymentTargetId[],
  ): Promise<Warning[]> {
    const warnings: Warning[] = [];
    await this.ensureProjectionLedger(manifest, lockFile);
    const projections = (lockFile.projections ?? []).filter(
      (projection) =>
        projection.mode === "bootstrap-imported" &&
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

      lockFile.projections = (lockFile.projections ?? []).filter(
        (candidate) =>
          !(
            candidate.mode === "bootstrap-imported" &&
            candidate.sourceId === projection.sourceId &&
            candidate.leafId === projection.leafId &&
            candidate.target === projection.target
          ),
      );
    }

    return warnings;
  }

  private buildImportedTargetPathsForSource(
    manifest: Manifest,
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
    manifest: Manifest,
    lockFile: LockFile,
  ): Promise<void> {
    const targetRoots = await this.getTargetRootMap();
    const projectedNameCache = new Map<DeploymentTargetId, Map<string, string>>();
    const managed: ProjectionRecord[] = getManagedDeployments(lockFile).map((deployment) => ({
      ...deployment,
      mode: "managed",
    }));
    const previousBootstrap = (lockFile.projections ?? []).filter(
      (projection) => projection.mode === "bootstrap-imported",
    );
    const bootstrap: ProjectionRecord[] = [];

    for (const sourceLock of lockFile.sources) {
      const bootstrapTargets = getBootstrapImportedTargets(lockFile, sourceLock);
      if (sourceLock.importMode !== "bootstrap-detected" || bootstrapTargets.length === 0) {
        continue;
      }

      const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceLock.id);
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
          projectedLinkNames = this.buildProjectedLinkNameMap(manifest, lockFile, target);
          projectedNameCache.set(target, projectedLinkNames);
        }

        for (const leaf of leafs) {
          const previous = previousBootstrap.find(
            (projection) =>
              projection.sourceId === sourceLock.id &&
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
            sourceId: sourceLock.id,
            leafId: leaf.id,
            target,
            targetPath,
            targetRootPath: rootPath,
            strategy: "symlink",
            status: "active",
            contentHash: leaf.contentHash,
            appliedAt: sourceLock.updatedAt,
            mode: "bootstrap-imported",
          });
        }
      }
    }

    lockFile.projections = [...managed, ...bootstrap];
  }

  private async resolveBootstrapProjectionTargetPath(
    manifest: Manifest,
    _lockFile: LockFile,
    sourceLock: LockFile["sources"][number],
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

    const source = manifest.sources.find((item) => item.id === sourceLock.id);
    const groupAuthor =
      getHostedGitOwner(source?.locator ?? "")
      ?? (source?.originLocator ? getHostedGitOwner(source.originLocator) : undefined);
    const projectedLinkName = projectedLinkNames.get(leaf.id) ?? leaf.linkName;
    const candidates = buildProjectedSkillNameCandidates({
      preferredName: projectedLinkName,
      groupId: sourceLock.id,
      groupName: source?.displayName ?? sourceLock.id,
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
    sourceLock: LockFile["sources"][number],
    rootPath: string,
  ): Promise<string | undefined> {
    if (!(await pathExists(rootPath))) {
      return undefined;
    }

    const displayNamePath = path.join(rootPath, sourceLock.displayName);
    if (await pathExists(displayNamePath)) {
      return displayNamePath;
    }

    const observedRealpaths = new Set(
      [sourceLock.locator, sourceLock.checkoutPath]
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
    lockFile: LockFile,
    projection: ProjectionRecord,
  ): boolean {
    return Boolean(
      projection.targetRootPath &&
      isPathInside(projection.targetRootPath, projection.targetPath),
    );
  }

  private hasPersistentProjectionOwnerForPath(
    lockFile: LockFile,
    projection: ProjectionRecord,
  ): boolean {
    return (lockFile.projections ?? []).some(
      (candidate) =>
        candidate.targetPath === projection.targetPath &&
        !(
          candidate.mode === projection.mode &&
          candidate.sourceId === projection.sourceId &&
          candidate.leafId === projection.leafId &&
          candidate.target === projection.target
        ),
    );
  }

  private async persistNormalizedBindings(
    manifest: Manifest,
    lockFile: LockFile,
  ): Promise<void> {
    if (!this.normalizeBindings(manifest, lockFile)) {
      return;
    }

    await this.store.writeState(manifest, lockFile);
  }

  private async readManifestConsistently(): Promise<Manifest> {
    return this.runSerializedMutation(async () => (await this.readRuntimeAuthorityView()).manifest);
  }

  private async readStateConsistently(): Promise<{ manifest: Manifest; lockFile: LockFile }> {
    return this.runSerializedMutation(async () => {
      const view = await this.readRuntimeAuthorityView();
      return { manifest: view.manifest, lockFile: view.lockFile };
    });
  }

  private async captureSourceAuditSnapshot(
    manifest: Manifest,
    lockFile: LockFile,
    sourceId: string,
  ): Promise<Record<string, unknown>> {
    const source = manifest.sources.find((item) => item.id === sourceId);
    const sourceLock = lockFile.sources.find((item) => item.id === sourceId);
    const binding = manifest.bindings[sourceId];
    const projections = (lockFile.projections ?? []).filter(
      (projection) => projection.sourceId === sourceId,
    );

    return {
      sourcePresent: Boolean(source),
      checkoutPath: sourceLock?.checkoutPath,
      checkoutExists: sourceLock ? await pathExists(sourceLock.checkoutPath) : false,
      selectedLeafIds: binding?.selectedLeafIds ?? [],
      enabledTargets: this.getEnabledTargetsForSource(manifest, sourceId),
      projectionCount: projections.length,
      projections: await Promise.all(
        projections.map(async (projection) => ({
          mode: projection.mode,
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
    const run = this.mutationQueue.then(
      () => this.stateStoreV2.withMutationLock(task),
      () => this.stateStoreV2.withMutationLock(task),
    );
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
      const store = this.store as StateStore & {
        appendAuditEvent?: (entry: AuditEvent) => Promise<void>;
      };
      await store.appendAuditEvent?.(event);
    } catch {
      // Audit logging must never block the mutation itself.
    }
  }

  private normalizeBindings(
    manifest: Manifest,
    lockFile: LockFile,
    collections?: CollectionsFileV2,
  ): boolean {
    let changed = false;

    for (const source of manifest.sources) {
      const currentBinding = manifest.bindings[source.id] ?? { targets: {} };
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
    source: Manifest["sources"][number],
    binding: SourceBinding,
    lockFile: LockFile,
    collections?: CollectionsFileV2,
  ): DraftBinding {
    const leafIds = source.kind === "virtual"
      ? this.getVirtualSourceAllowedLeafIds(source.id, binding, lockFile, collections)
      : new Set(
          lockFile.leafInventory
            .filter((leaf) => leaf.sourceId === source.id)
            .map((leaf) => leaf.id),
        );

    return this.draftFromBindingAllowedLeafIds(binding, leafIds);
  }

  private draftFromBinding(
    sourceId: string,
    binding: SourceBinding,
    lockFile: LockFile,
  ): DraftBinding {
    const leafIds = new Set(
      lockFile.leafInventory
        .filter((leaf) => leaf.sourceId === sourceId)
        .map((leaf) => leaf.id),
    );
    return this.draftFromBindingAllowedLeafIds(binding, leafIds);
  }

  private draftFromBindingAllowedLeafIds(
    binding: SourceBinding,
    leafIds: Set<string>,
  ): DraftBinding {
    const enabledTargets = Object.entries(binding.targets)
      .filter(([, targetBinding]) => targetBinding?.enabled)
      .map(([target]) => target) as DeploymentTargetName[];
    const selectedLeafIds = [
      ...new Set(
        (binding.selectedLeafIds && binding.selectedLeafIds.length > 0
          ? binding.selectedLeafIds
          : enabledTargets.flatMap((target) => binding.targets[target]?.leafIds ?? [])),
      ),
    ].filter((leafId) => leafIds.has(leafId));

    return {
      enabledTargets,
      selectedLeafIds,
    };
  }

  private getVirtualSourceAllowedLeafIds(
    sourceId: string,
    binding: SourceBinding,
    lockFile: LockFile,
    collections?: CollectionsFileV2,
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
    source: Manifest["sources"][number],
    binding: SourceBinding,
    lockFile: LockFile,
    collections?: CollectionsFileV2,
  ): LeafRecord[] {
    if (source.kind !== "virtual") {
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
    source: Manifest["sources"][number],
    binding: SourceBinding,
    lockFile: LockFile,
    leafId: string,
  ): LeafRecord | undefined {
    if (source.kind !== "virtual") {
      return lockFile.leafInventory.find((leaf) => leaf.sourceId === source.id && leaf.id === leafId);
    }

    return this.getSourceLeafsForBinding(source, binding, lockFile).find((leaf) => leaf.id === leafId);
  }

  private selectLeafIdsForRequestedPath(
    leafs: LeafRecord[],
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
    sourceLeafs: LeafRecord[],
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
    sourceLeafs: LeafRecord[],
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

    const selectedLeafIdsResult = canonicalRepo
      ? this.resolveImportLeafIdsForGitHubSource(
          sourceLeafs,
          draft.selectedSkillIds,
          canonicalRepo,
        )
      : this.resolveSelectedLeafIds(
          sourceLeafs,
          undefined,
          draft.selectedSkillIds,
          canonicalRepo,
        );
    if (!selectedLeafIdsResult.ok) {
      return fail(selectedLeafIdsResult.errors, selectedLeafIdsResult.warnings);
    }

    const available = new Set(availableTargets);
    const unsupported = [...new Set(draft.enabledTargets)].filter((target) => !available.has(target));
    if (unsupported.length > 0) {
      return fail({
        code: "ADD_AGENT_NOT_AVAILABLE",
        message: `Unknown or unavailable agent(s): ${unsupported.join(", ")}.`,
      });
    }

    return ok({
      selectedLeafIds: selectedLeafIdsResult.data,
      enabledTargets: [...new Set(draft.enabledTargets)],
    }, selectedLeafIdsResult.warnings);
  }

  private resolveImportLeafIdsForGitHubSource(
    sourceLeafs: LeafRecord[],
    skillNames: string[],
    canonicalRepo: string,
  ): Result<string[]> {
    const requested = [...new Set(skillNames.map((skillName) => skillName.trim()).filter(Boolean))];
    const matchedLeafIds: string[] = [];
    const skippedSkillIds: string[] = [];
    const warnings: Warning[] = [];

    for (const selector of requested) {
      const selectedLeafIdsResult = this.resolveSelectedLeafIds(
        sourceLeafs,
        undefined,
        [selector],
        canonicalRepo,
      );

      if (selectedLeafIdsResult.ok) {
        matchedLeafIds.push(...selectedLeafIdsResult.data);
        continue;
      }

      const firstError = selectedLeafIdsResult.errors[0];
      if (firstError?.code !== "ADD_SKILL_NOT_FOUND") {
        return fail(selectedLeafIdsResult.errors, selectedLeafIdsResult.warnings);
      }

      skippedSkillIds.push(selector);
    }

    if (matchedLeafIds.length === 0 && requested.length > 0) {
      return fail({
        code: "ADD_SKILL_NOT_FOUND",
        message: `Unable to preselect skill(s): ${requested.join(", ")}.`,
      });
    }

    if (skippedSkillIds.length > 0) {
      warnings.push({
        code: "IMPORT_SKILL_SKIPPED",
        message:
          `Ignored ${skippedSkillIds.length} skill selector` +
          `${skippedSkillIds.length === 1 ? "" : "s"} not present in the GitHub repo: ` +
          skippedSkillIds.join(", "),
      });
    }

    return ok([...new Set(matchedLeafIds)], warnings);
  }

  private resolveSelectedLeafIds(
    sourceLeafs: LeafRecord[],
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
        if (leaf.linkName === selector || leaf.name === selector) {
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
          ...this.buildImportSkillSelectorVariants(leaf.name, canonicalRepo),
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
    const state = await this.stateStoreV2.readState();
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

    return this.sourceAuthorityServiceV2.removeSource([sourceId]);
  }

  private prepareManifestForDraft(
    manifest: Manifest,
    lockFile: LockFile,
    sourceId: string,
    draft: DraftBinding,
  ): { manifest: Manifest; draft: DraftBinding; warnings: Warning[] } {
    manifest.bindings[sourceId] = this.bindingFromDraft(draft);
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (source) {
      const sourceLeafCount = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId).length;
      source.selectionMode =
        draft.selectedLeafIds.length >= sourceLeafCount && sourceLeafCount > 0
          ? "all"
          : "partial";
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

  private prepareManifestV2ForDraft(
    manifest: ManifestFileV2,
    lockFile: LockFileV2,
    sourceId: string,
    draft: DraftBinding,
  ): Result<{ manifest: ManifestFileV2; draft: DraftBinding; warnings: Warning[] }> {
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
        message: `${sourceId} is missing from V2 lock sources.`,
      });
    }

    const enabledTargets = [...new Set(draft.enabledTargets)];
    const selectedLeafIds = [...new Set(draft.selectedLeafIds)];
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

    return ok({ manifest, draft: normalizedDraft, warnings: [] });
  }

  private findExactDuplicateLeafSelections(
    manifest: Manifest,
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

  private getExactDuplicateKey(leaf: LeafRecord): string {
    return `${leaf.linkName}\n${leaf.name}\n${leaf.description}`;
  }

  private async planForAffectedSources(
    manifest: Manifest,
    lockFile: LockFile,
    primarySourceId: string,
  ): Promise<Result<DeploymentPlan>> {
    await this.refreshAdapters();
    const sourceIds = manifest.sources
      .map((source) => source.id)
      .filter((sourceId) => sourceId === primarySourceId || this.hasActiveTargets(manifest, sourceId));

    return this.planForSources(manifest, lockFile, sourceIds);
  }

  private async planForAffectedSourcesV2(
    manifest: ManifestFileV2,
    lockFile: LockFileV2,
    primarySourceId: string,
    preferences: SharedPreferences,
  ): Promise<Result<DeploymentPlan>> {
    const sourceIds = manifest.sources
      .map((source) => source.id)
      .filter((sourceId) => sourceId === primarySourceId || this.hasActiveTargetsV2(manifest, sourceId));

    return this.planForSourcesV2(manifest, lockFile, sourceIds, preferences);
  }

  private async planForSources(
    manifest: Manifest,
    lockFile: LockFile,
    sourceIds: string[],
  ): Promise<Result<DeploymentPlan>> {
    const uniqueSourceIds = [...new Set(sourceIds)];

    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];

    for (const sourceId of uniqueSourceIds) {
      const plan = await this.planner.planForSource(sourceId, manifest, lockFile);
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

  private async planForSourcesV2(
    manifest: ManifestFileV2,
    lockFile: LockFileV2,
    sourceIds: string[],
    preferences: SharedPreferences,
  ): Promise<Result<DeploymentPlan>> {
    const uniqueSourceIds = [...new Set(sourceIds)];
    const planner = new DeploymentPlannerV2(this.createAdaptersForPreferences(preferences));

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
    preferences: SharedPreferences,
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
    preferences?: SharedPreferences,
  ): Promise<void> {
    const currentPreferences = preferences ?? (await this.readRuntimeAuthorityView()).preferences;
    if (
      !currentPreferences.recentProjects.some((project) => project.projectId === projectId) &&
      !(projectId in currentPreferences.projectDrafts) &&
      !(
        currentPreferences.selectedProjectScope.kind === "project" &&
        currentPreferences.selectedProjectScope.projectId === projectId
      )
    ) {
      return;
    }

    const { [projectId]: _removedDrafts, ...remainingProjectDrafts } = currentPreferences.projectDrafts;
    await this.writePreferencesV2FromView({
      ...currentPreferences,
      selectedProjectScope:
        currentPreferences.selectedProjectScope.kind === "project" &&
          currentPreferences.selectedProjectScope.projectId === projectId
          ? { kind: "global" }
          : currentPreferences.selectedProjectScope,
      recentProjects: currentPreferences.recentProjects.filter(
        (project) => project.projectId !== projectId,
      ),
      projectDrafts: remainingProjectDrafts,
    });
  }

  private cloneLockFileForScopedDeployments(
    lockFile: LockFile,
    deployments: LockFile["deployments"],
  ): LockFile {
    return {
      ...lockFile,
      sources: lockFile.sources.map((source) => ({
        ...source,
        ...(source.observedTargets
          ? { observedTargets: source.observedTargets.map((entry) => ({ ...entry })) }
          : {}),
      })),
      leafInventory: lockFile.leafInventory.map((leaf) => ({ ...leaf })),
      deployments: deployments.map((deployment) => ({ ...deployment })),
      projections: deployments.map((deployment) => ({
        ...deployment,
        mode: "managed" as const,
      })),
    };
  }

  private async resolveScopedInspectDeployments(
    manifest: Manifest,
    lockFile: LockFile,
    sourceId: string,
    scope: Extract<ProjectScope, { kind: "project" }>,
    targets: DeploymentTargetId[],
    preferences?: SharedPreferences,
  ): Promise<LockFile["deployments"]> {
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
    manifest: Manifest,
    lockFile: LockFile,
    sourceId: string,
    targetRootOverrides: TargetRootOverrides,
    adaptersOverride?: ChannelAdapter[],
  ): Promise<LockFile["deployments"]> {
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (!source) {
      return [];
    }

    const binding = manifest.bindings[sourceId] ?? { targets: {} };
    const scopedDeployments: LockFile["deployments"] = [];
    const adapters = adaptersOverride ?? await this.refreshAdapters();

    for (const [target, rootPath] of Object.entries(targetRootOverrides) as Array<[DeploymentTargetId, string]>) {
      const targetBinding = binding.targets[target];
      if (!targetBinding?.enabled) {
        continue;
      }

      const adapter = adapters.find((candidate) => candidate.target === target);
      if (!adapter) {
        continue;
      }

      const projectedLinkNames = this.buildProjectedLinkNameMap(manifest, lockFile, target);
      for (const leafId of targetBinding.leafIds) {
        const leaf = this.findLeafForSourceBinding(source, binding, lockFile, leafId);
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

  private async planAndApplySources(
    manifest: Manifest,
    lockFile: LockFile,
    sourceIds: string[],
  ): Promise<Result<{ actions: DeploymentAction[] }>> {
    await this.refreshAdapters();
    const planned = await this.planForSources(manifest, lockFile, sourceIds);
    if (!planned.ok) {
      return fail(planned.errors, planned.warnings);
    }

    const applyResult = await this.applier.applyPlan(lockFile, planned.data.actions);
    if (!applyResult.ok) {
      return fail(applyResult.errors, [...planned.warnings, ...applyResult.warnings]);
    }

    return ok(
      { actions: planned.data.actions },
      [...planned.warnings, ...applyResult.warnings],
    );
  }

  private async rebuildDeploymentState(
    manifest: Manifest,
    lockFile: LockFile,
    sourceIds?: string[],
  ): Promise<number> {
    const requested = sourceIds?.length ? new Set(sourceIds) : undefined;
    const previousDeployments = getManagedDeployments(lockFile);
    const previousCount = previousDeployments.length;
    const previousByKey = new Map(
      previousDeployments.map((deployment) => [
        this.getDeploymentKey(deployment.sourceId, deployment.leafId, deployment.target),
        deployment,
      ]),
    );
    const nextDeployments = previousDeployments.filter(
      (deployment) => requested ? !requested.has(deployment.sourceId) : false,
    );
    const preferences = await this.store.readPreferences();
    const adapters = createChannelAdapters(
      getMergedTargetDefinitions(preferences.customTargets, preferences.agentDisplayOrder),
    );
    const detectionCache = new Map<
      DeploymentTargetId,
      Awaited<ReturnType<(typeof adapters)[number]["detect"]>>
    >();
    const projectedNameCache = new Map<DeploymentTargetId, Map<string, string>>();

    for (const source of manifest.sources) {
      if (requested && !requested.has(source.id)) {
        continue;
      }

      const binding = manifest.bindings[source.id] ?? { targets: {} };
      for (const adapter of adapters) {
        const targetBinding = binding.targets[adapter.target];
        if (!targetBinding?.enabled) {
          continue;
        }

        let detection = detectionCache.get(adapter.target);
        if (!detection) {
          detection = await adapter.detect();
          detectionCache.set(adapter.target, detection);
        }

        for (const leafId of targetBinding.leafIds) {
          const leaf = this.findLeafForSourceBinding(source, binding, lockFile, leafId);
          if (!leaf) {
            continue;
          }

          const existing = previousByKey.get(
            this.getDeploymentKey(source.id, leaf.id, adapter.target),
          );
          if (!detection.available) {
            if (existing) {
          nextDeployments.push({
                ...existing,
                contentHash: leaf.contentHash,
                status: "active",
              });
            }
            continue;
          }

          let projectedLinkNames = projectedNameCache.get(adapter.target);
          if (!projectedLinkNames) {
            projectedLinkNames = this.buildProjectedLinkNameMap(
              manifest,
              lockFile,
              adapter.target,
            );
            projectedNameCache.set(adapter.target, projectedLinkNames);
          }

          const rebuilt = await this.findManagedDeploymentOnDisk(
            source,
            leaf,
            adapter.target,
            adapter.strategy,
            detection.rootPath,
            projectedLinkNames,
            existing,
          );
          if (!rebuilt) {
            continue;
          }

          nextDeployments.push(rebuilt);
        }
      }
    }

    const bootstrapProjections = (lockFile.projections ?? []).filter(
      (projection) => projection.mode === "bootstrap-imported",
    );
    lockFile.projections = [
      ...bootstrapProjections,
      ...nextDeployments.map((deployment) => ({
        ...deployment,
        mode: "managed" as const,
      })),
    ];
    return Math.max(0, previousCount - nextDeployments.length);
  }

  private buildProjectedLinkNameMap(
    manifest: Manifest,
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
    source: Manifest["sources"][number],
    leaf: LeafRecord,
    target: DeploymentTargetId,
    strategy: "symlink" | "copy",
    rootPath: string,
    projectedLinkNames: Map<string, string>,
    existing?: LockFile["deployments"][number],
  ): Promise<LockFile["deployments"][number] | undefined> {
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
    leaf: LeafRecord,
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

  private getDeploymentKey(
    sourceId: string,
    leafId: string,
    target: DeploymentTargetId,
  ) {
    return `${sourceId}\n${leafId}\n${target}`;
  }

  private hasActiveTargets(manifest: Manifest, sourceId: string): boolean {
    const binding = manifest.bindings[sourceId];
    if (!binding) {
      return false;
    }

    return Object.values(binding.targets).some((target) => target?.enabled);
  }

  private hasActiveTargetsV2(manifest: ManifestFileV2, sourceId: string): boolean {
    return (manifest.bindings[sourceId]?.enabledTargets.length ?? 0) > 0;
  }

  private buildLocalCandidates(
    query: string,
    manifest: Manifest,
    lockFile: LockFile,
  ): SkillCandidate[] {
    return lockFile.leafInventory
      .filter((leaf) => {
        const source = manifest.sources.find((item) => item.id === leaf.sourceId);
        return this.matchesQuery(query, [
          leaf.name,
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
            leaf.name,
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

  private getCandidateTitle(leaf: LeafRecord): string {
    const title = leaf.title.trim();
    if (title.length === 0 || /^\{[^}]+\}$/.test(title)) {
      return leaf.linkName || leaf.name;
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
    manifest: Manifest,
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

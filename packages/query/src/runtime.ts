import fs from "node:fs/promises";
import path from "node:path";
import { createChannelAdapters } from "@skill-flow/integration/adapters/channel-adapters";
import type {
  AddSourceDraftOptions,
  AddSourcePreparation,
  DraftBinding,
  DeploymentAction,
  DeploymentPlan,
  DeploymentTargetName,
  DoctorReport,
  ImportDraft,
  ImportDataCache,
  ImportGroupCandidate,
  ImportRecommendationFeed,
  ImportRecommendationFeedId,
  ImportSearchHit,
  ImportSearchSnapshot,
  ImportPreviewResult,
  ImportReasonCode,
  ImportSourceResult,
  LeafRecord,
  LockFile,
  Manifest,
  ProjectScope,
  ProjectionRecord,
  RecentProject,
  Result,
  SharedPreferences,
  SkillCandidate,
  SourceMetadataResult,
  SourceStats,
  SourceBinding,
  SourceUpdateResult,
  SourceUpdateResultItem,
  TargetBinding,
  UnifiedSourceSnapshot,
  UnifiedSourceTrust,
  Warning,
  WorkflowSummary,
} from "@skill-flow/domain/types";
import { getBootstrapImportedTargets, getManagedDeployments } from "@skill-flow/domain/projection-compat";
import { StateStore } from "@skill-flow/storage/store";
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
  parseGitHubRepo,
  resolveProjectedSkillNames,
} from "@skill-flow/integration/utils/naming";
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
  fetchSkillsDirectorySourcePreview,
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
import { RecentProjectService } from "@skill-flow/core-engine/services/recent-project-service";
import { SourceService } from "@skill-flow/core-engine/services/source-service";
import { WorkflowService } from "./workflow-service.js";
import type {
  AddSourceOptions,
  SourcePreview,
  SourceSnapshot,
} from "@skill-flow/core-engine/services/source-service";
import {
  WorkspaceBootstrapService,
  type BootstrapEvent,
} from "@skill-flow/core-engine/services/workspace-bootstrap-service";

const EMPTY_DRAFT: DraftBinding = { enabledTargets: [], selectedLeafIds: [] };

type SkillFlowAddOptions = AddSourceOptions &
  AddSourceDraftOptions & {
    project?: boolean;
  };

type AddSourceResult = SourceSnapshot & AddSourcePreparation & { projected: boolean };
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
};
type GroupCardEnrichmentSnapshot = {
  sourceMetadata?: SourceMetadataResult;
  sourceSnapshot?: UnifiedSourceSnapshot;
  groupPath?: string;
};
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

export class SkillFlowApp {
  private static readonly importGroupResolveConcurrency = 3;

  readonly store: StateStore;
  readonly adapters;
  readonly inventoryService: InventoryService;
  readonly sourceService: SourceService;
  readonly planner: DeploymentPlanner;
  readonly applier: DeploymentApplier;
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
    const adapters = createChannelAdapters();
    this.store = new StateStore();
    this.adapters = adapters;
    this.inventoryService = new InventoryService();
    this.sourceService = new SourceService(this.store, this.inventoryService);
    this.planner = new DeploymentPlanner(adapters);
    this.applier = new DeploymentApplier(adapters);
    this.doctorService = new DoctorService();
    this.workflowService = new WorkflowService();
    this.recentProjectService = new RecentProjectService();
    this.workspaceBootstrapService = new WorkspaceBootstrapService(this.store);
    this.configCoordinator = new ConfigCoordinator({
      store: this.store,
      recentProjectService: this.recentProjectService,
      doctorService: this.doctorService,
      workflowService: this.workflowService,
      getAvailableTargets: () => this.getAvailableTargets(),
      pruneMissingCheckouts: () => this.pruneMissingCheckoutsImpl(),
      getConfigData: () => this.getConfigDataImpl(),
    });
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
    const result = await this.sourceService.addSource(locator, addOptions);
    if (!result.ok) {
      return fail(result.errors, result.warnings);
    }

    const { manifest, lockFile } = await this.store.readState();
    await this.ensureProjectionLedger(manifest, lockFile);
    const source = manifest.sources.find((item) => item.id === result.data.manifest.id);
    if (!source) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${result.data.manifest.id}' is not registered.`,
      });
    }

    const requestedPath = this.normalizeRequestedPath(source.requestedPath);
    if (requestedPath) {
      source.requestedPath = requestedPath;
      result.data.manifest.requestedPath = requestedPath;
    } else {
      delete source.requestedPath;
      delete result.data.manifest.requestedPath;
    }

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

    source.selectionMode =
      addOptions.selectionMode ??
      (preparedDraft.data.selectedLeafIds.length >= sourceLeafs.length && sourceLeafs.length > 0
        ? "all"
        : "partial");
    result.data.manifest.selectionMode = source.selectionMode;
    manifest.bindings[source.id] = { targets: {} };
    await this.ensureProjectionLedger(manifest, lockFile);
    await this.store.writeState(manifest, lockFile);

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
        ...result.data,
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

  async searchImportGroups(
    query: string,
  ): Promise<Result<{ groups: ImportGroupCandidate[]; exact: boolean }>> {
    return this.searchImportGroupsImpl(query);
  }

  async previewImportSource(locator: string): Promise<Result<ImportPreviewResult>> {
    return this.previewImportSourceImpl(locator);
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

  async listWorkflows(): Promise<
    Result<{
      summaries: WorkflowSummary[];
      pinnedSourceIds: string[];
      recentProjects: RecentProject[];
      selectedProjectScope: ProjectScope;
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    return this.runSerializedMutation(() => this.listWorkflowsImpl());
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
    const { manifest, lockFile } = await this.store.readState();
    this.normalizeBindings(manifest, lockFile);
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (!source) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    const summary = this.workflowService.getSummaries(manifest, lockFile).find((item) => item.source.id === sourceId);
    if (!summary) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Unable to inspect '${sourceId}' because no summary data was found.`,
      });
    }

    const binding = manifest.bindings[sourceId] ?? { selectedLeafIds: [], targets: {} };
    const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const deployments = getManagedDeployments(lockFile).filter(
      (deployment) => deployment.sourceId === sourceId,
    );

    if (scope.kind === "global") {
      return ok({ summary, source, binding, leafs, deployments });
    }

    const initialDrafts: Record<string, DraftBinding> = {
      [sourceId]: this.draftFromBinding(sourceId, binding, lockFile),
    };
    const preferences = await this.store.readPreferences();
    const scopedDraft = this.resolveDraftForScope(sourceId, initialDrafts, preferences, scope);

    const scopedManifest = this.cloneManifest(manifest);
    this.normalizeBindings(scopedManifest, lockFile);
    const prepared = this.prepareManifestForDraft(scopedManifest, lockFile, sourceId, scopedDraft);
    const scopedSource = prepared.manifest.sources.find((item) => item.id === sourceId) ?? source;
    const scopedSummary =
      this.workflowService.getSummaries(prepared.manifest, lockFile).find((item) => item.source.id === sourceId)
      ?? summary;
    const scopedBinding = prepared.manifest.bindings[sourceId] ?? binding;

    return ok({
      summary: scopedSummary,
      source: scopedSource,
      binding: scopedBinding,
      leafs,
      deployments,
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

    return ok({ groups });
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
      const exactRepo = normalizeImportCanonicalRepo(normalizedQuery);
      if (exactRepo) {
        try {
          const details = await fetchSkillsDirectorySourceDetails(exactRepo);
          return ok({
            groups: [
              {
                id: exactRepo,
                provider: "skills",
                locator: exactRepo,
                canonicalRepo: exactRepo,
                aliases: [exactRepo, `https://github.com/${exactRepo}`, `https://github.com/${exactRepo}.git`, `git@github.com:${exactRepo}.git`],
                title: details.repoLabel?.split("/")[1] ?? exactRepo.split("/")[1] ?? exactRepo,
                installed: installedRepos.has(exactRepo),
                ...(details.description ? { summary: details.description } : {}),
                ...(details.sourceUrl ? { sourceUrl: details.sourceUrl } : {}),
                ...(details.repoUrl ? { repoUrl: details.repoUrl } : {}),
                ...(details.starCount !== undefined ? { starCount: details.starCount } : {}),
                ...(details.totalInstalls !== undefined ? { totalInstalls: details.totalInstalls } : {}),
                enrichState: { status: "ready" as const },
                previewState: { status: "idle" as const },
              },
            ],
            exact: true,
          });
        } catch {
          const exactCandidate = this.buildImmediateImportGroupCandidate(importCache, exactRepo, {
            installed: installedRepos.has(exactRepo),
          });

          if (
            exactCandidate.enrichState.status === "ready" ||
            exactCandidate.enrichState.status === "loading" ||
            exactCandidate.enrichState.status === "failed" &&
              exactCandidate.enrichState.reasonCode !== "provider_data_unavailable"
          ) {
            return ok({ groups: [exactCandidate], exact: true });
          }
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

  private async previewImportSourceImpl(locator: string): Promise<Result<ImportPreviewResult>> {
    const canonicalRepo = normalizeImportCanonicalRepo(locator);
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

    try {
      const snapshot = await this.resolveImportPreviewSnapshot(canonicalRepo);
      const availableTargets = await this.getAvailableTargets();
      return ok({
        status: "ready",
        locator: canonicalRepo,
        canonicalRepo,
        snapshot,
        selectedSkillIds: snapshot.skills.map((skill) => skill.skillId),
        enabledTargets: [],
        skills: snapshot.skills.map((skill) => ({
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
    const normalizedLocator = normalizeImportCanonicalRepo(locator) ?? locator.trim();
    const prepared = await this.prepareAddSourceImpl(normalizedLocator, { project: false });
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
      normalizeImportCanonicalRepo(normalizedLocator),
      draft,
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
      canonicalRepo: normalizeImportCanonicalRepo(normalizedLocator) ?? normalizedLocator,
    }, [...finalDraft.warnings, ...applied.warnings]);
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

  private async buildDirectImportGroupCandidate(
    locator: string,
    manifest: Manifest,
  ): Promise<ImportGroupCandidate | null> {
    const resolvedLocator = await this.resolveImportDirectLocator(locator);
    if (!resolvedLocator) {
      return null;
    }

    const aliases = [
      locator.trim(),
      resolvedLocator,
      `file://${resolvedLocator}`,
    ].filter((value, index, values) => value && values.indexOf(value) === index);

    return {
      id: resolvedLocator,
      provider: "skills",
      locator: resolvedLocator,
      canonicalRepo: resolvedLocator,
      aliases,
      title: deriveDisplayName(resolvedLocator),
      installed: manifest.sources.some(
        (source) => source.kind === "local" && path.resolve(source.locator) === resolvedLocator,
      ),
      summary: `Import from ${resolvedLocator}`,
      enrichState: { status: "idle" },
      previewState: { status: "idle" },
    };
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
      const trust = await this.resolveCachedImportSourceTrust(normalizedRepo, {
        refreshInBackground: false,
      });
      const snapshot = await fetchSkillsDirectorySourcePreview(normalizedRepo, {
        ...(this.hasUnifiedSourceTrust(trust) ? { trust } : {}),
      });
      const mergedSnapshot = cachedSnapshot
        ? this.mergeSourceSnapshots(cachedSnapshot, snapshot)
        : snapshot;
      await this.store.writeImportSourceSnapshotEntry({
        canonicalRepo: normalizedRepo,
        checkedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + IMPORT_SOURCE_CACHE_TTL_MS).toISOString(),
        data: mergedSnapshot,
      });
      return mergedSnapshot;
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
    const resolvedLocator = await this.resolveImportDirectLocator(locator);
    if (!resolvedLocator) {
      return null;
    }

    const preview = await this.sourceService.previewSource(resolvedLocator);
    if (!preview.ok) {
      return ok({
        status: "failed",
        reasonCode: this.inferImportReasonCode(preview.errors[0]),
        retryable: this.importFailureRetryable(preview.errors[0]),
      }, preview.warnings);
    }

    const availableTargets = await this.getAvailableTargets();

    return ok(
      this.buildDirectImportPreviewResult(resolvedLocator, preview.data, availableTargets),
      preview.warnings,
    );
  }

  private buildDirectImportPreviewResult(
    locator: string,
    preview: SourcePreview,
    availableTargets: DeploymentTargetName[],
  ): ImportPreviewResult {
    return {
      status: "ready",
      locator,
      canonicalRepo: locator,
      selectedSkillIds: preview.leafs.map((leaf) => leaf.name),
      enabledTargets: [],
      skills: preview.leafs.map((leaf) => ({
        id: leaf.name,
        title: leaf.title,
        summary: leaf.description,
        selectedByDefault: true,
      })),
      targets: availableTargets.map((target) => ({
        id: target,
        selectedByDefault: false,
      })),
    };
  }

  private async resolveImportDirectLocator(locator: string): Promise<string | undefined> {
    const trimmed = locator.trim();
    if (!trimmed || normalizeImportCanonicalRepo(trimmed)) {
      return undefined;
    }

    const resolvedPath = path.resolve(trimmed.startsWith("file://")
      ? decodeURIComponent(new URL(trimmed).pathname)
      : trimmed);
    if (await pathExists(resolvedPath)) {
      return resolvedPath;
    }

    return undefined;
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
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    const pruned = await this.pruneMissingCheckoutsImpl();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }
    const reconciled = await this.sourceService.reconcileInventory(undefined, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    const { manifest, lockFile } = await this.store.readState();
    await this.store.pruneSourceMetadataCache(manifest.sources.map((source) => source.id));
    await this.persistNormalizedBindings(manifest, lockFile);
    const recentProjects = await this.recentProjectService.listRecentProjects().catch(() => []);
    const preferences = await this.store.pruneMissingSourceIds();
    await this.store.writePreferences({
      ...preferences,
      recentProjects,
    });
    const reconciledPreferences = await this.store.readPreferences();
    const groupCardEnrichmentBySourceId = await this.readCachedGroupCardEnrichmentBySourceId(
      manifest,
      lockFile,
    );
    return ok(
      {
        summaries: this.workflowService.getSummaries(manifest, lockFile),
        pinnedSourceIds: reconciledPreferences.pinnedSourceIds,
        recentProjects: reconciledPreferences.recentProjects,
        selectedProjectScope: reconciledPreferences.selectedProjectScope,
        groupCardEnrichmentBySourceId,
      },
      pruned.warnings,
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
    const pruned = await this.pruneMissingCheckoutsImpl();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }
    const reconciled = await this.sourceService.reconcileInventory(undefined, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    const { manifest, lockFile } = await this.store.readState();
    await this.persistNormalizedBindings(manifest, lockFile);
    return ok(
      {
        manifest,
        lockFile,
        summaries: this.workflowService.getSummaries(manifest, lockFile),
      },
      pruned.warnings,
    );
  }

  async bootstrapWorkspaceState(
    onEvent?: (event: BootstrapEvent) => void,
  ): Promise<
    Result<{
      availableTargets: DeploymentTargetName[];
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
      availableTargets: DeploymentTargetName[];
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
      groupCardEnrichmentBySourceId: Record<string, GroupCardEnrichmentSnapshot>;
    }>
  > {
    const boot = await this.configCoordinator.bootstrapWorkspaceState(onEvent);
    if (!boot.ok) {
      return fail(boot.errors, boot.warnings);
    }
    const preferences = await this.store.pruneMissingSourceIds();
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

  async getAvailableTargets(): Promise<DeploymentTargetName[]> {
    const adapters = createChannelAdapters();
    const availableTargets: DeploymentTargetName[] = [];

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
    const { manifest, lockFile } = await this.readStateConsistently();
    this.normalizeBindings(manifest, lockFile);
    const prepared = this.prepareManifestForDraft(manifest, lockFile, sourceId, draft);
    const plan = await this.planForAffectedSources(
      prepared.manifest,
      lockFile,
      sourceId,
    );
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }

    return ok(
      { plan: plan.data, manifest: prepared.manifest, lockFile },
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
    const { manifest, lockFile } = await this.store.readState();
    const before = await this.captureSourceAuditSnapshot(manifest, lockFile, sourceId);
    const result = await this.applyDraftImpl(sourceId, draft, scope);
    const { manifest: nextManifest, lockFile: nextLockFile } = await this.store.readState();
    const after = await this.captureSourceAuditSnapshot(nextManifest, nextLockFile, sourceId);

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
      const { manifest, lockFile } = await this.store.readState();
      if (!manifest.sources.some((source) => source.id === sourceId)) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }

      this.normalizeBindings(manifest, lockFile);
      const scopedManifest = this.cloneManifest(manifest);
      this.normalizeBindings(scopedManifest, lockFile);
      const prepared = this.prepareManifestForDraft(scopedManifest, lockFile, sourceId, draft);

      const preferences = await this.store.readPreferences();
      await this.store.writePreferences({
        ...preferences,
        projectDrafts: {
          ...preferences.projectDrafts,
          [scope.projectId]: {
            ...(preferences.projectDrafts[scope.projectId] ?? {}),
            [sourceId]: prepared.draft,
          },
        },
      });

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

    const { manifest, lockFile } = await this.store.readState();
    this.normalizeBindings(manifest, lockFile);
    await this.ensureProjectionLedger(manifest, lockFile);
    const previousEnabledTargets = this.getEnabledTargetsForSource(manifest, sourceId);
    const sourceLock = lockFile.sources.find((source) => source.id === sourceId);
    const prepared = this.prepareManifestForDraft(manifest, lockFile, sourceId, draft);

    const plan = await this.planForAffectedSources(prepared.manifest, lockFile, sourceId);
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }

    const applyResult = await this.applier.applyPlan(lockFile, plan.data.actions);
    await this.ensureProjectionLedger(prepared.manifest, lockFile);
    await this.store.writeState(prepared.manifest, lockFile);

    if (!applyResult.ok) {
      return fail(
        applyResult.errors,
        [...prepared.warnings, ...plan.warnings, ...applyResult.warnings],
      );
    }

    const importedTargets = sourceLock?.importMode === "bootstrap-detected"
      ? getBootstrapImportedTargets(lockFile, sourceLock)
      : [];
    const removedImportedTargets = [...new Set([
      ...previousEnabledTargets,
      ...importedTargets,
    ])].filter((target) => !prepared.draft.enabledTargets.includes(target));
    const importedCleanupWarnings = await this.cleanupImportedTargetPaths(
      prepared.manifest,
      lockFile,
      [sourceId],
      removedImportedTargets,
    );
    const detachedWarnings = await this.cleanupDetachedTargetSymlinksForSources(lockFile, [sourceId]);
    const orphanWarnings = await this.cleanupOrphanTargetSymlinks(lockFile);
    await this.store.writeState(prepared.manifest, lockFile);

    const freshState = await this.buildApplyDraftFreshState(sourceId, scope);
    return ok(
      {
        actions: plan.data.actions,
        draft: prepared.draft,
        ...(freshState.summary ? { summary: freshState.summary } : {}),
        ...(freshState.inspect ? { inspect: freshState.inspect } : {}),
      },
      [
        ...prepared.warnings,
        ...plan.warnings,
        ...applyResult.warnings,
        ...importedCleanupWarnings,
        ...detachedWarnings,
        ...orphanWarnings,
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
    const pruned = await this.pruneMissingCheckoutsImpl();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }
    const requestedIds = sourceIds?.filter((sourceId) => !pruned.data.removedSourceIds.includes(sourceId));
    if (sourceIds?.length && requestedIds?.length === 0) {
      return ok({ updated: [] }, pruned.warnings);
    }

    const updated = await this.sourceService.updateSources(requestedIds);
    if (!updated.ok) {
      return updated;
    }

    const { manifest, lockFile } = await this.store.readState();
    this.applySourceUpdateResults(manifest, lockFile, updated.data.updated);
    await this.persistNormalizedBindings(manifest, lockFile);
    const planSourceIds = manifest.sources
      .map((source) => source.id)
      .filter((id) =>
        updated.data.updated.some((item) => item.sourceId === id) ||
        this.hasActiveTargets(manifest, id) ||
        getManagedDeployments(lockFile).some((deployment) => deployment.sourceId === id),
      );
    const planned = await this.planAndApplySources(manifest, lockFile, planSourceIds);
    if (!planned.ok) {
      return fail(planned.errors, [...pruned.warnings, ...updated.warnings, ...planned.warnings]);
    }
    await this.store.writeState(manifest, lockFile);
    return ok(updated.data, [...pruned.warnings, ...updated.warnings, ...planned.warnings]);
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
    const { manifest, lockFile } = await this.store.readState();
    this.normalizeBindings(manifest, lockFile);
    await this.ensureProjectionLedger(manifest, lockFile);
    const warnings: Warning[] = await this.cleanupOrphanTargetSymlinks(lockFile);

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
        this.hasActiveTargets(manifest, sourceId) ||
        getManagedDeployments(lockFile).some((deployment) => deployment.sourceId === sourceId),
    );
    for (const sourceId of requestedIds) {
      if (planSourceIds.includes(sourceId)) {
        continue;
      }
      const sourceLock = lockFile.sources.find((source) => source.id === sourceId);
      if (
        sourceLock?.importMode === "bootstrap-detected" ||
        (lockFile.projections ?? []).some(
          (projection) =>
            projection.sourceId === sourceId &&
            projection.mode === "bootstrap-imported",
        )
      ) {
        warnings.push({
          code: "REPAIR_TARGETS_SKIPPED_BOOTSTRAP_IMPORTED",
          message: `Skipped repair for bootstrap-imported source '${sourceId}' because it has no managed target bindings.`,
        });
      }
    }
    const planned = await this.planAndApplySources(manifest, lockFile, planSourceIds);
    if (!planned.ok) {
      return fail(planned.errors, [...warnings, ...planned.warnings]);
    }

    await this.store.writeState(manifest, lockFile);
    return ok({ actions: planned.data.actions }, [...warnings, ...planned.warnings]);
  }

  async repairSource(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    return this.runSerializedMutation(() => this.repairSourceImpl(sourceIds));
  }

  private async repairSourceImpl(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    const pruned = await this.pruneMissingCheckoutsImpl();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }

    const requestedIds = sourceIds?.filter(
      (sourceId) => !pruned.data.removedSourceIds.includes(sourceId),
    );
    if (sourceIds?.length && requestedIds?.length === 0) {
      return ok({ updated: [] }, pruned.warnings);
    }

    const repaired = await this.sourceService.updateSources(requestedIds);
    if (!repaired.ok) {
      return repaired;
    }

    const { manifest, lockFile } = await this.store.readState();
    this.applySourceUpdateResults(manifest, lockFile, repaired.data.updated);
    await this.persistNormalizedBindings(manifest, lockFile);
    await this.store.writeState(manifest, lockFile);

    return ok(repaired.data, [...pruned.warnings, ...repaired.warnings]);
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
    const { manifest, lockFile } = await this.store.readState();
    await this.ensureProjectionLedger(manifest, lockFile);
    const warnings: string[] = [];
    const removedRefs = sourceIds
      .map((sourceId) => manifest.sources.find((source) => source.id === sourceId))
      .filter((source): source is Manifest["sources"][number] => Boolean(source));

    for (const sourceId of sourceIds) {
      const projections = (lockFile.projections ?? []).filter(
        (projection) => projection.sourceId === sourceId,
      );

      for (const projection of projections) {
        if (!(await pathExists(projection.targetPath))) {
          continue;
        }
        if (!this.isProjectionPathManaged(lockFile, projection)) {
          warnings.push(`Refusing to remove unmanaged target path ${projection.targetPath}.`);
          continue;
        }
        try {
          if (!this.hasPersistentProjectionOwnerForPath(lockFile, projection)) {
            await removePath(projection.targetPath);
          }
        } catch (error) {
          warnings.push(`Unable to remove ${projection.targetPath}: ${String(error)}`);
        }
      }

      lockFile.projections = (lockFile.projections ?? []).filter(
        (projection) => projection.sourceId !== sourceId,
      );
    }

    const detachedWarnings = await this.cleanupDetachedTargetSymlinksForSources(lockFile, sourceIds);
    const orphanWarnings = await this.cleanupOrphanTargetSymlinks(lockFile);
    warnings.push(...detachedWarnings.map((warning) => warning.message));
    warnings.push(...orphanWarnings.map((warning) => warning.message));

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
      removed = await this.sourceService.removeSource(sourceIds);
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
    const targets: Partial<Record<DeploymentTargetName, TargetBinding>> = {};
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

  private async pruneMissingCheckoutsImpl(): Promise<Result<{ removedSourceIds: string[] }>> {
    const { manifest, lockFile } = await this.store.readState();
    await this.ensureProjectionLedger(manifest, lockFile);
    const orphanWarnings = await this.cleanupOrphanTargetSymlinks(lockFile);
    const removedSourceIds: string[] = [];
    const warnings: Warning[] = [];

    for (const source of lockFile.sources) {
      if (await pathExists(source.checkoutPath)) {
        continue;
      }

      removedSourceIds.push(source.id);
      warnings.push({
        code: "SOURCE_CHECKOUT_MISSING",
        message: `Removed ${source.displayName} because checkout is missing at ${source.checkoutPath}.`,
      });

      const projections = (lockFile.projections ?? []).filter(
        (projection) => projection.sourceId === source.id,
      );
      for (const projection of projections) {
        if (!(await pathExists(projection.targetPath))) {
          continue;
        }
        if (!this.isProjectionPathManaged(lockFile, projection)) {
          warnings.push({
            code: "SOURCE_CHECKOUT_PRUNE_SKIPPED",
            message: `Skipped unmanaged deployment path ${projection.targetPath} while pruning ${source.displayName}.`,
          });
          continue;
        }
        try {
          if (!this.hasPersistentProjectionOwnerForPath(lockFile, projection)) {
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
      if (orphanWarnings.length > 0) {
        await this.store.writeState(manifest, lockFile);
      }
      return ok({ removedSourceIds: [] }, orphanWarnings);
    }

    manifest.sources = manifest.sources.filter((source) => !removedSourceIds.includes(source.id));
    for (const sourceId of removedSourceIds) {
      delete manifest.bindings[sourceId];
    }
    lockFile.sources = lockFile.sources.filter((source) => !removedSourceIds.includes(source.id));
    lockFile.leafInventory = lockFile.leafInventory.filter(
      (leaf) => !removedSourceIds.includes(leaf.sourceId),
    );
    lockFile.projections = (lockFile.projections ?? []).filter(
      (projection) => !removedSourceIds.includes(projection.sourceId),
    );

    await this.store.writeState(manifest, lockFile);
    await this.store.pruneSourceMetadataCache(manifest.sources.map((source) => source.id));

    return ok({ removedSourceIds }, [...orphanWarnings, ...warnings]);
  }

  private async cleanupOrphanTargetSymlinks(lockFile: LockFile): Promise<Warning[]> {
    const warnings: Warning[] = [];
    const managedStateRoot = await fs.realpath(this.store.rootPath).catch(() =>
      path.resolve(this.store.rootPath),
    );

    for (const adapter of this.adapters) {
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
          this.isProjectionStillResolvable(lockFile, projection),
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

    for (const adapter of this.adapters) {
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

  private isProjectionStillResolvable(lockFile: LockFile, projection: ProjectionRecord): boolean {
    if (!lockFile.sources.some((source) => source.id === projection.sourceId)) {
      return false;
    }

    if (projection.mode === "managed") {
      return lockFile.leafInventory.some((leaf) => leaf.id === projection.leafId);
    }

    return true;
  }

  private async getTargetRootMap(): Promise<Map<DeploymentTargetName, string>> {
    return new Map(
      await Promise.all(
        this.adapters.map(async (adapter) => {
          const detection = await adapter.detect();
          return [adapter.target, detection.rootPath] as const;
        }),
      ),
    );
  }

  private getEnabledTargetsForSource(
    manifest: Manifest,
    sourceId: string,
  ): DeploymentTargetName[] {
    const binding = manifest.bindings[sourceId];
    if (!binding) {
      return [];
    }

    return Object.entries(binding.targets)
      .filter(([, targetBinding]) => targetBinding?.enabled)
      .map(([target]) => target as DeploymentTargetName);
  }

  private isPathInsideManagedTargetRoot(
    target: DeploymentTargetName,
    targetPath: string,
    targetRoots: Map<DeploymentTargetName, string>,
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
    restrictedTargets?: DeploymentTargetName[],
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
    target: DeploymentTargetName,
    rootPath: string,
    projectedLinkNames: Map<string, string>,
  ): Set<string> {
    const source = manifest.sources.find((item) => item.id === sourceId);
    if (!source) {
      return new Set();
    }

    const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const groupAuthor =
      parseGitHubRepo(source.locator)?.owner
      ?? (source.originLocator ? parseGitHubRepo(source.originLocator)?.owner : undefined);
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
    const projectedNameCache = new Map<DeploymentTargetName, Map<string, string>>();
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
      const observedByTarget = new Map<DeploymentTargetName, {
        target: DeploymentTargetName;
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
      parseGitHubRepo(source?.locator ?? "")?.owner
      ?? (source?.originLocator ? parseGitHubRepo(source.originLocator)?.owner : undefined);
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
    return this.runSerializedMutation(() => this.store.readManifest());
  }

  private async readStateConsistently(): Promise<{ manifest: Manifest; lockFile: LockFile }> {
    return this.runSerializedMutation(() => this.store.readState());
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
      () => this.store.withMutationLock(task),
      () => this.store.withMutationLock(task),
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

  private normalizeBindings(manifest: Manifest, lockFile: LockFile): boolean {
    let changed = false;

    for (const source of manifest.sources) {
      const currentBinding = manifest.bindings[source.id] ?? { targets: {} };
      const normalizedDraft = this.draftFromBinding(source.id, currentBinding, lockFile);
      const normalizedBinding = this.bindingFromDraft(normalizedDraft);

      if (JSON.stringify(currentBinding) === JSON.stringify(normalizedBinding)) {
        continue;
      }

      manifest.bindings[source.id] = normalizedBinding;
      changed = true;
    }

    return changed;
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
    availableTargets: DeploymentTargetName[],
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
    availableTargets: DeploymentTargetName[],
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
    availableTargets: DeploymentTargetName[],
    requestedTargets?: DeploymentTargetName[],
  ): Result<DeploymentTargetName[]> {
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
    const { lockFile, manifest } = await this.store.readState();
    if (!manifest.sources.some((source) => source.id === sourceId)) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    if (getManagedDeployments(lockFile).some((deployment) => deployment.sourceId === sourceId)) {
      return fail({
        code: "ADD_ROLLBACK_HAS_DEPLOYMENTS",
        message: `Unable to roll back skills group id '${sourceId}' because deployments already exist.`,
      });
    }

    await this.cleanupDetachedTargetSymlinksForSources(lockFile, [sourceId]);
    await this.cleanupOrphanTargetSymlinks(lockFile);
    await this.store.writeState(manifest, lockFile);

    return this.sourceService.removeSource([sourceId]);
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

  private findExactDuplicateLeafSelections(
    manifest: Manifest,
    lockFile: LockFile,
    currentSourceId: string,
    enabledTargets: DeploymentTargetName[],
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
    const sourceIds = manifest.sources
      .map((source) => source.id)
      .filter((sourceId) => sourceId === primarySourceId || this.hasActiveTargets(manifest, sourceId));

    return this.planForSources(manifest, lockFile, sourceIds);
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

  private async planAndApplySources(
    manifest: Manifest,
    lockFile: LockFile,
    sourceIds: string[],
  ): Promise<Result<{ actions: DeploymentAction[] }>> {
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
    const adapters = createChannelAdapters();
    const detectionCache = new Map<
      DeploymentTargetName,
      Awaited<ReturnType<(typeof adapters)[number]["detect"]>>
    >();
    const projectedNameCache = new Map<DeploymentTargetName, Map<string, string>>();

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
          const leaf = lockFile.leafInventory.find(
            (candidate) => candidate.sourceId === source.id && candidate.id === leafId,
          );
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
    target: DeploymentTargetName,
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
            groupAuthor: parseGitHubRepo(source.locator)?.owner,
            skillName: leaf.linkName,
          }));
      }),
    );
  }

  private async findManagedDeploymentOnDisk(
    source: Manifest["sources"][number],
    leaf: LeafRecord,
    target: DeploymentTargetName,
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
      groupAuthor: parseGitHubRepo(source.locator)?.owner,
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
    target: DeploymentTargetName,
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

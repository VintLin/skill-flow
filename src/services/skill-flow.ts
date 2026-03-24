import fs from "node:fs/promises";
import path from "node:path";
import { createChannelAdapters } from "../adapters/channel-adapters.js";
import type {
  AddSourceDraftOptions,
  AddSourcePreparation,
  DraftBinding,
  DeploymentAction,
  DeploymentPlan,
  DeploymentTargetName,
  DoctorReport,
  LeafRecord,
  LockFile,
  Manifest,
  Result,
  SkillCandidate,
  SourceBinding,
  SourceUpdateResult,
  SourceUpdateResultItem,
  TargetBinding,
  Warning,
  WorkflowSummary,
} from "../domain/types.js";
import { StateStore } from "../state/store.js";
import {
  ensureDir,
  hashDirectory,
  pathExists,
  readJsonFile,
  removePath,
  writeJsonFile,
} from "../utils/fs.js";
import { getBuiltinGitSources } from "../utils/builtin-git-sources.js";
import { fetchGitHubSkillPaths } from "../utils/github-catalog.js";
import {
  buildProjectedSkillNameCandidates,
  parseGitHubRepo,
  resolveProjectedSkillNames,
} from "../utils/naming.js";
import { fail, ok } from "../utils/result.js";
import { searchClawHubSkills } from "../utils/clawhub.js";
import { deriveDisplayName, deriveSourceId } from "../utils/source-id.js";
import { DeploymentApplier } from "./deployment-applier.js";
import { ConfigCoordinator } from "./config-coordinator.js";
import { DeploymentPlanner } from "./deployment-planner.js";
import { DoctorService } from "./doctor-service.js";
import { InventoryService } from "./inventory-service.js";
import { SourceService } from "./source-service.js";
import { WorkflowService } from "./workflow-service.js";
import type { AddSourceOptions, SourceSnapshot } from "./source-service.js";
import {
  WorkspaceBootstrapService,
  type BootstrapEvent,
} from "./workspace-bootstrap-service.js";

type SkillFlowAddOptions = AddSourceOptions &
  AddSourceDraftOptions & {
    project?: boolean;
  };

type AddSourceResult = SourceSnapshot & AddSourcePreparation & { projected: boolean };

export class SkillFlowApp {
  readonly store: StateStore;
  readonly inventoryService: InventoryService;
  readonly sourceService: SourceService;
  readonly planner: DeploymentPlanner;
  readonly applier: DeploymentApplier;
  readonly doctorService: DoctorService;
  readonly workflowService: WorkflowService;
  readonly workspaceBootstrapService: WorkspaceBootstrapService;
  readonly configCoordinator: ConfigCoordinator;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.store = new StateStore();
    this.inventoryService = new InventoryService();
    this.sourceService = new SourceService(this.store, this.inventoryService);
    this.planner = new DeploymentPlanner(createChannelAdapters());
    this.applier = new DeploymentApplier();
    this.doctorService = new DoctorService();
    this.workflowService = new WorkflowService();
    this.workspaceBootstrapService = new WorkspaceBootstrapService(this.store);
    this.configCoordinator = new ConfigCoordinator({
      store: this.store,
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
    return this.runSerializedMutation(() => this.addSourceImpl(locator, options));
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
    const { manifest, lockFile } = await this.store.readState();
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

  async listWorkflows(): Promise<Result<{ summaries: WorkflowSummary[] }>> {
    return this.runSerializedMutation(() => this.listWorkflowsImpl());
  }

  private async listWorkflowsImpl(): Promise<Result<{ summaries: WorkflowSummary[] }>> {
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
        summaries: this.workflowService.getSummaries(manifest, lockFile),
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
    }>
  > {
    return this.runSerializedMutation(() => this.bootstrapWorkspaceStateImpl(onEvent));
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
    }>
  > {
    const boot = await this.configCoordinator.bootstrapWorkspaceState(onEvent);
    if (!boot.ok) {
      return fail(boot.errors, boot.warnings);
    }

    return ok({
      availableTargets: boot.data.availableTargets,
      manifest: boot.data.manifest,
      lockFile: boot.data.lockFile,
      summaries: boot.data.summaries,
      initialDrafts: boot.data.initialDrafts,
      audit: boot.data.audit,
      importedSourceIds: [],
    });
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
    const { manifest, lockFile } = await this.store.readState();
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
  ): Promise<Result<{ actions: DeploymentAction[]; draft: DraftBinding }>> {
    return this.runSerializedMutation(() => this.applyDraftImpl(sourceId, draft));
  }

  private async applyDraftImpl(
    sourceId: string,
    draft: DraftBinding,
  ): Promise<Result<{ actions: DeploymentAction[]; draft: DraftBinding }>> {
    const { manifest, lockFile } = await this.store.readState();
    this.normalizeBindings(manifest, lockFile);
    const prepared = this.prepareManifestForDraft(manifest, lockFile, sourceId, draft);

    const plan = await this.planForAffectedSources(prepared.manifest, lockFile, sourceId);
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }

    const applyResult = await this.applier.applyPlan(lockFile, plan.data.actions);
    await this.store.writeState(prepared.manifest, lockFile);

    if (!applyResult.ok) {
      return fail(
        applyResult.errors,
        [...prepared.warnings, ...plan.warnings, ...applyResult.warnings],
      );
    }

    return ok(
      { actions: plan.data.actions, draft: prepared.draft },
      [...prepared.warnings, ...plan.warnings, ...applyResult.warnings],
    );
  }

  async updateSources(sourceIds?: string[]): Promise<
    Result<SourceUpdateResult>
  > {
    return this.runSerializedMutation(() => this.updateSourcesImpl(sourceIds));
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
        lockFile.deployments.some((deployment) => deployment.sourceId === id),
      );
    const planned = await this.planAndApplySources(manifest, lockFile, planSourceIds);
    if (!planned.ok) {
      return fail(planned.errors, [...pruned.warnings, ...updated.warnings, ...planned.warnings]);
    }
    await this.store.writeState(manifest, lockFile);
    return ok(updated.data, [...pruned.warnings, ...updated.warnings, ...planned.warnings]);
  }

  async doctor(): Promise<Result<DoctorReport>> {
    return this.runSerializedMutation(() => this.doctorImpl());
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
        lockFile.deployments.some((deployment) => deployment.sourceId === sourceId),
    );
    const planned = await this.planAndApplySources(manifest, lockFile, planSourceIds);
    if (!planned.ok) {
      return fail(planned.errors, planned.warnings);
    }

    await this.store.writeState(manifest, lockFile);
    return ok({ actions: planned.data.actions }, planned.warnings);
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
    return this.runSerializedMutation(() => this.uninstallImpl(sourceIds));
  }

  private async uninstallImpl(sourceIds: string[]): Promise<
    Result<{
      removed: string[];
      removedRefs: Array<{ id: string; locator: string; displayName: string }>;
      warnings: string[];
    }>
  > {
    const { manifest, lockFile } = await this.store.readState();
    const warnings: string[] = [];
    const removedRefs = sourceIds
      .map((sourceId) => manifest.sources.find((source) => source.id === sourceId))
      .filter((source): source is Manifest["sources"][number] => Boolean(source));

    for (const sourceId of sourceIds) {
      const deployments = lockFile.deployments.filter(
        (deployment) => deployment.sourceId === sourceId,
      );

      for (const deployment of deployments) {
        if (!(await pathExists(deployment.targetPath))) {
          continue;
        }
        try {
          await removePath(deployment.targetPath);
        } catch (error) {
          warnings.push(`Unable to remove ${deployment.targetPath}: ${String(error)}`);
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

  private async pruneMissingCheckoutsImpl(): Promise<Result<{ removedSourceIds: string[] }>> {
    const { manifest, lockFile } = await this.store.readState();
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

      const deployments = lockFile.deployments.filter(
        (deployment) => deployment.sourceId === source.id,
      );
      for (const deployment of deployments) {
        if (!(await pathExists(deployment.targetPath))) {
          continue;
        }
        try {
          await removePath(deployment.targetPath);
        } catch (error) {
          return fail({
            code: "SOURCE_CHECKOUT_PRUNE_FAILED",
            message: `Unable to clean deployment ${deployment.targetPath}: ${String(error)}`,
          }, warnings);
        }
      }
    }

    if (removedSourceIds.length === 0) {
      return ok({ removedSourceIds: [] });
    }

    manifest.sources = manifest.sources.filter((source) => !removedSourceIds.includes(source.id));
    for (const sourceId of removedSourceIds) {
      delete manifest.bindings[sourceId];
    }
    lockFile.sources = lockFile.sources.filter((source) => !removedSourceIds.includes(source.id));
    lockFile.leafInventory = lockFile.leafInventory.filter(
      (leaf) => !removedSourceIds.includes(leaf.sourceId),
    );
    lockFile.deployments = lockFile.deployments.filter(
      (deployment) => !removedSourceIds.includes(deployment.sourceId),
    );

    await this.store.writeState(manifest, lockFile);

    return ok({ removedSourceIds }, warnings);
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

  private resolveSelectedLeafIds(
    sourceLeafs: LeafRecord[],
    requestedPath: string | undefined,
    skillNames?: string[],
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

      const fallbackMatches = sourceLeafs.filter(
        (leaf) => leaf.linkName === selector || leaf.name === selector,
      );
      if (fallbackMatches.length === 1) {
        matchedLeafIds.push(fallbackMatches[0]!.id);
        continue;
      }
      if (fallbackMatches.length > 1) {
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

    if (lockFile.deployments.some((deployment) => deployment.sourceId === sourceId)) {
      return fail({
        code: "ADD_ROLLBACK_HAS_DEPLOYMENTS",
        message: `Unable to roll back skills group id '${sourceId}' because deployments already exist.`,
      });
    }

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
    const previousDeployments = lockFile.deployments;
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

    lockFile.deployments = nextDeployments;
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

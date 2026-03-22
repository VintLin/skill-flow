import fs from "node:fs/promises";
import path from "node:path";
import { createChannelAdapters } from "../adapters/channel-adapters.js";
import type {
  DeploymentAction,
  DeploymentPlan,
  LeafRecord,
  DeploymentTargetName,
  DoctorReport,
  LockFile,
  Manifest,
  Result,
  SkillCandidate,
  SourceBinding,
  TargetBinding,
  Warning,
  WorkflowSummary,
} from "../domain/types.js";
import { StateStore } from "../state/store.js";
import { ensureDir, hashDirectory, pathExists, readJsonFile, removePath, writeJsonFile } from "../utils/fs.js";
import { getBuiltinGitSources } from "../utils/builtin-git-sources.js";
import { fetchGitHubSkillPaths } from "../utils/github-catalog.js";
import { parseGitHubRepo } from "../utils/naming.js";
import { fail, ok } from "../utils/result.js";
import { searchClawHubSkills } from "../utils/clawhub.js";
import { deriveDisplayName, deriveSourceId } from "../utils/source-id.js";
import { DeploymentApplier } from "./deployment-applier.js";
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

export type DraftBinding = {
  enabledTargets: DeploymentTargetName[];
  selectedLeafIds: string[];
};

export class SkillFlowApp {
  readonly store = new StateStore();
  readonly inventoryService = new InventoryService();
  readonly sourceService = new SourceService(this.store, this.inventoryService);
  readonly planner = new DeploymentPlanner(createChannelAdapters());
  readonly applier = new DeploymentApplier();
  readonly doctorService = new DoctorService();
  readonly workflowService = new WorkflowService();
  readonly workspaceBootstrapService = new WorkspaceBootstrapService(this.store);

  async addSource(
    locator: string,
    options?: AddSourceOptions,
  ): Promise<Result<SourceSnapshot>> {
    const addOptions = options ?? {};
    const result = await this.sourceService.addSource(locator, addOptions);
    if (!result.ok) {
      return result;
    }

    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    const source = manifest.sources.find((item) => item.id === result.data.manifest.id);
    if (!source) {
      return result;
    }

    source.selectionMode =
      addOptions.selectionMode ??
      (source.requestedPath ? "partial" : "all");

    const enabledTargets =
      addOptions.enabledTargets ??
      await this.getAvailableTargets();
    manifest.bindings[source.id] = this.bindingFromDraft({
      enabledTargets,
      selectedLeafIds: this.selectLeafIdsForRequestedPath(
        lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id),
        source.requestedPath,
      ),
    });
    await this.store.writeManifest(manifest);

    if (addOptions.project === false) {
      return result;
    }

    const plan = await this.planForAffectedSources(manifest, lockFile, source.id);
    if (!plan.ok) {
      return fail(plan.errors, [...result.warnings, ...plan.warnings]);
    }
    const applied = await this.applier.applyPlan(lockFile, plan.data.actions);
    await this.store.writeLock(lockFile);
    if (!applied.ok) {
      return fail(applied.errors, [...result.warnings, ...plan.warnings, ...applied.warnings]);
    }

    return ok(result.data, [...result.warnings, ...plan.warnings, ...applied.warnings]);
  }

  async findSkills(query: string): Promise<Result<{ candidates: SkillCandidate[] }>> {
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    const normalizedQuery = query.trim().toLowerCase();
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
      const results = await searchClawHubSkills(query, 8);
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
    const reconciled = await this.sourceService.reconcileInventory(undefined, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    await this.persistNormalizedBindings(manifest, lockFile);
    return ok({
      summaries: this.workflowService.getSummaries(manifest, lockFile),
    });
  }

  async getConfigData(): Promise<
    Result<{ manifest: Manifest; lockFile: LockFile; summaries: WorkflowSummary[] }>
  > {
    const reconciled = await this.sourceService.reconcileInventory(undefined, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    await this.persistNormalizedBindings(manifest, lockFile);
    return ok({
      manifest,
      lockFile,
      summaries: this.workflowService.getSummaries(manifest, lockFile),
    });
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
    onEvent?.({
      phase: "detect-targets",
      level: "info",
      message: "Detecting available agent targets...",
    });
    const availableTargets = await this.getAvailableTargets();

    await this.store.init();
    let manifest = await this.store.readManifest();
    let lockFile = await this.store.readLock();
    const detected = await this.workspaceBootstrapService.detectUnmanagedExternalSkills(
      manifest,
      lockFile,
      onEvent,
    );

    const importedSourceIds: string[] = [];
    if (detected.length > 0) {
      onEvent?.({
        phase: "import-unmanaged-skills",
        level: "info",
        message: `Importing ${detected.length} unmanaged skill${detected.length === 1 ? "" : "s"} into skill-flow...`,
      });
    }
    for (const item of detected) {
      const imported = await this.addSource(item.path, {
        enabledTargets: item.importedFromTargets,
        selectionMode: "all",
        project: false,
        sourceIdOverride: item.sourceId,
        displayNameOverride: item.displayName,
        importedFromTargets: item.importedFromTargets,
        importMode: "bootstrap-detected",
        ...(item.originLocator ? { originLocator: item.originLocator } : {}),
        ...(item.originRequestedPath ? { originRequestedPath: item.originRequestedPath } : {}),
        ...(item.originBranch ? { originBranch: item.originBranch } : {}),
      });
      if (!imported.ok) {
        return fail(imported.errors, imported.warnings);
      }
      importedSourceIds.push(imported.data.manifest.id);
      onEvent?.({
        phase: "import-unmanaged-skills",
        level: "success",
        message: `Imported ${imported.data.manifest.displayName}.`,
      });
    }

    onEvent?.({
      phase: "refresh-sources",
      level: "info",
      message: "Refreshing managed inventory...",
    });
    const reconciled = await this.sourceService.reconcileInventory(undefined, { force: true });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }

    manifest = await this.store.readManifest();
    lockFile = await this.store.readLock();
    onEvent?.({
      phase: "normalize-bindings",
      level: "info",
      message: "Normalizing config state...",
    });
    await this.persistNormalizedBindings(manifest, lockFile);

    onEvent?.({
      phase: "audit-projections",
      level: "info",
      message: "Auditing current projections...",
    });
    const audit = await this.doctorService.run(manifest, lockFile);
    if (!audit.ok) {
      return fail(audit.errors, audit.warnings);
    }

    onEvent?.({
      phase: "build-summaries",
      level: "info",
      message: "Building config summaries...",
    });
    const summaries = this.workflowService.getSummaries(manifest, lockFile, audit.data);
    onEvent?.({
      phase: "done",
      level: "success",
      message: "Config bootstrap complete.",
    });

    return ok({
      availableTargets,
      manifest,
      lockFile,
      summaries,
      initialDrafts: this.buildInitialDrafts(summaries),
      audit: audit.data,
      importedSourceIds,
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
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
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
    const reconciled = await this.sourceService.reconcileInventory([sourceId], {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    this.normalizeBindings(manifest, lockFile);
    const prepared = this.prepareManifestForDraft(manifest, lockFile, sourceId, draft);

    const plan = await this.planForAffectedSources(prepared.manifest, lockFile, sourceId);
    if (!plan.ok) {
      return fail(plan.errors, [...prepared.warnings, ...plan.warnings]);
    }

    const applyResult = await this.applier.applyPlan(lockFile, plan.data.actions);
    await this.store.writeManifest(prepared.manifest);
    await this.store.writeLock(lockFile);

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
    Result<
      {
        updated: Array<{
          sourceId: string;
          changed: boolean;
          addedLeafIds: string[];
          removedLeafIds: string[];
          invalidatedLeafIds: string[];
        }>;
      }
    >
  > {
    const reconciled = await this.sourceService.reconcileInventory(sourceIds, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    const updated = await this.sourceService.updateSources(sourceIds);
    if (!updated.ok) {
      return updated;
    }

    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    this.applySelectionModeForUpdatedSources(manifest, lockFile, updated.data.updated);
    await this.persistNormalizedBindings(manifest, lockFile);
    const activeSourceIds = manifest.sources
      .map((source) => source.id)
      .filter((id) => this.hasActiveTargets(manifest, id));

    for (const sourceId of activeSourceIds) {
      const plan = await this.planner.planForSource(sourceId, manifest, lockFile);
      if (!plan.ok) {
        return fail(plan.errors, plan.warnings);
      }
      await this.applier.applyPlan(lockFile, plan.data.actions);
    }

    await this.store.writeLock(lockFile);
    return updated;
  }

  async doctor(): Promise<Result<DoctorReport>> {
    const reconciled = await this.sourceService.reconcileInventory();
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    await this.persistNormalizedBindings(manifest, lockFile);
    return this.doctorService.run(manifest, lockFile);
  }

  async uninstall(sourceIds: string[]): Promise<
    Result<{
      removed: string[];
      removedRefs: Array<{ id: string; locator: string; displayName: string }>;
      warnings: string[];
    }>
  > {
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
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

        if (deployment.strategy === "symlink") {
          const stats = await fs.lstat(deployment.targetPath);
          if (stats.isSymbolicLink()) {
            await removePath(deployment.targetPath);
          } else {
            warnings.push(
              `Skipped ${deployment.targetPath} because it no longer looks like a managed symlink.`,
            );
          }
          continue;
        }

        const currentHash = await hashDirectory(deployment.targetPath);
        if (currentHash === deployment.contentHash) {
          await removePath(deployment.targetPath);
        } else {
          warnings.push(
            `Skipped ${deployment.targetPath} because the copied skill has drifted from saved state.`,
          );
        }
      }
    }

    const removed = await this.sourceService.removeSource(sourceIds);
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
    return { targets };
  }

  private async persistNormalizedBindings(
    manifest: Manifest,
    lockFile: LockFile,
  ): Promise<void> {
    if (!this.normalizeBindings(manifest, lockFile)) {
      return;
    }

    await this.store.writeManifest(manifest);
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
    const selectedLeafIds = [...new Set(
      enabledTargets.flatMap((target) => binding.targets[target]?.leafIds ?? []),
    )].filter((leafId) => leafIds.has(leafId));

    return {
      enabledTargets,
      selectedLeafIds,
    };
  }

  private selectLeafIdsForRequestedPath(
    leafs: LeafRecord[],
    requestedPath?: string,
  ): string[] {
    if (!requestedPath) {
      return leafs.map((leaf) => leaf.id);
    }

    const normalizedPath = requestedPath.replace(/^\.\/+/, "").replace(/\/+$/, "");
    return leafs
      .filter(
        (leaf) =>
          leaf.relativePath === normalizedPath ||
          leaf.relativePath.startsWith(`${normalizedPath}/`),
      )
      .map((leaf) => leaf.id);
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

    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];

    for (const sourceId of sourceIds) {
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
          title: leaf.title,
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

    const haystack = fields.join("\n").toLowerCase();
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
    const titleField = candidate.title.toLowerCase();
    const pathTail = (candidate.relativePath ?? "").split("/").pop()?.toLowerCase() ?? "";
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

  private buildInitialDrafts(summaries: WorkflowSummary[]): Record<string, DraftBinding> {
    return Object.fromEntries(
      summaries.map((summary) => {
        const enabledTargets = Object.entries(summary.bindings.targets)
          .filter(([, value]) => value?.enabled)
          .map(([target]) => target) as DraftBinding["enabledTargets"];
        const selectedLeafIds = [...new Set(
          enabledTargets.flatMap((target) => summary.bindings.targets[target]?.leafIds ?? []),
        )];
        return [summary.source.id, { enabledTargets, selectedLeafIds }];
      }),
    );
  }

  private applySelectionModeForUpdatedSources(
    manifest: Manifest,
    lockFile: LockFile,
    updates: Array<{
      sourceId: string;
      changed: boolean;
      addedLeafIds: string[];
    }>,
  ) {
    for (const update of updates) {
      if (!update.changed || update.addedLeafIds.length === 0) {
        continue;
      }
      const source = manifest.sources.find((item) => item.id === update.sourceId);
      const binding = manifest.bindings[update.sourceId];
      if (!source || !binding || source.selectionMode !== "all") {
        continue;
      }

      for (const targetBinding of Object.values(binding.targets)) {
        if (!targetBinding?.enabled) {
          continue;
        }
        const merged = new Set([...targetBinding.leafIds, ...update.addedLeafIds]);
        targetBinding.leafIds = [...merged].filter((leafId) =>
          lockFile.leafInventory.some((leaf) => leaf.id === leafId && leaf.sourceId === update.sourceId),
        );
      }
    }
  }
}

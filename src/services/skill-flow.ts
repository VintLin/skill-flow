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
import { hashDirectory, pathExists, removePath } from "../utils/fs.js";
import { git } from "../utils/git.js";
import { getBuiltinGitSources } from "../utils/builtin-git-sources.js";
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
import type { AddSourceOptions } from "./source-service.js";

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

  async addSource(locator: string, options?: AddSourceOptions) {
    return this.sourceService.addSource(locator, options);
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

    for (const builtin of getBuiltinGitSources()) {
      try {
        const checkoutPath = await this.ensureBuiltinCatalogCheckout(
          builtin.locator,
          builtin.branch,
        );
        const sourceId = deriveSourceId(builtin.locator);
        const displayName = deriveDisplayName(builtin.locator);
        const scanned = await this.inventoryService.scanSource(sourceId, checkoutPath, displayName);
        remoteSearchSucceeded = true;

        for (const leaf of scanned.leafs) {
          if (!this.matchesQuery(normalizedQuery, [
            leaf.name,
            leaf.title,
            leaf.description,
            leaf.relativePath,
            displayName,
          ])) {
            continue;
          }

          const candidate: SkillCandidate = {
            id: `builtin-git:${leaf.id}`,
            title: leaf.title,
            description: leaf.description,
            source: "builtin-git",
            sourceLabel: this.formatSourceLabel(builtin.locator, displayName),
            sourceId,
            sourceKind: "git",
            locator: builtin.locator,
            relativePath: leaf.relativePath,
            installed: false,
            action: {
              type: "add-git",
              locator: builtin.locator,
              requestedPath: leaf.relativePath,
            },
          };

          if (localKeys.has(this.getCandidateKey(candidate))) {
            continue;
          }

          candidates.push(candidate);
        }
      } catch (error) {
        warnings.push({
          code: "BUILTIN_SOURCE_UNAVAILABLE",
          message: `Unable to refresh built-in source '${builtin.locator}': ${String(error)}`,
        });
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
    return ok({
      manifest,
      lockFile,
      summaries: this.workflowService.getSummaries(manifest, lockFile),
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

  private prepareManifestForDraft(
    manifest: Manifest,
    lockFile: LockFile,
    sourceId: string,
    draft: DraftBinding,
  ): { manifest: Manifest; draft: DraftBinding; warnings: Warning[] } {
    manifest.bindings[sourceId] = this.bindingFromDraft(draft);

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
      message: `${lockFile.leafInventory.find((leaf) => leaf.id === leafId)?.linkName ?? leafId} skipped because an identical skill is already selected in another workflow group.`,
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
          leaf.description,
          leaf.relativePath,
          source?.displayName ?? "",
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

  private async ensureBuiltinCatalogCheckout(locator: string, branch: string): Promise<string> {
    const sourceId = deriveSourceId(locator);
    const checkoutPath = this.store.getCatalogCheckoutPath(sourceId);
    if (await pathExists(path.join(checkoutPath, ".git"))) {
      await git(["pull", "--ff-only"], { cwd: checkoutPath });
      return checkoutPath;
    }

    if (await pathExists(checkoutPath)) {
      return checkoutPath;
    }

    await git(["clone", "--depth", "1", "--branch", branch, locator, checkoutPath]);
    return checkoutPath;
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
    const fields = [
      titleField,
      candidate.description.toLowerCase(),
      candidate.sourceLabel.toLowerCase(),
      (candidate.relativePath ?? "").toLowerCase(),
    ];

    let score = 0;
    for (const token of tokens) {
      if (titleField === token) {
        score += 8;
      } else if (titleField.includes(token)) {
        score += 5;
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
    const repo = parseGitHubRepo(locator);
    if (!repo) {
      return displayName;
    }
    return `${displayName}(@${repo.owner})`;
  }
}

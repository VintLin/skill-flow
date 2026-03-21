import fs from "node:fs/promises";
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
  SourceBinding,
  TargetBinding,
  Warning,
  WorkflowSummary,
} from "../domain/types.js";
import { StateStore } from "../state/store.js";
import { hashDirectory, pathExists, removePath } from "../utils/fs.js";
import { fail, ok } from "../utils/result.js";
import { DeploymentApplier } from "./deployment-applier.js";
import { DeploymentPlanner } from "./deployment-planner.js";
import { DoctorService } from "./doctor-service.js";
import { InventoryService } from "./inventory-service.js";
import { SourceService } from "./source-service.js";
import { WorkflowService } from "./workflow-service.js";

export type DraftBinding = {
  enabledTargets: DeploymentTargetName[];
  selectedLeafIds: string[];
};

export class SkillManagerApp {
  readonly store = new StateStore();
  readonly inventoryService = new InventoryService();
  readonly sourceService = new SourceService(this.store, this.inventoryService);
  readonly planner = new DeploymentPlanner(createChannelAdapters());
  readonly applier = new DeploymentApplier();
  readonly doctorService = new DoctorService();
  readonly workflowService = new WorkflowService();

  async addSource(locator: string) {
    return this.sourceService.addSource(locator);
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

  async uninstall(sourceIds: string[]): Promise<Result<{ removed: string[]; warnings: string[] }>> {
    await this.store.init();
    const lockFile = await this.store.readLock();
    const warnings: string[] = [];

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

    return ok({ removed: removed.data.removed, warnings });
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
      message: `${leafId} skipped because an identical skill is already selected in another workflow group.`,
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
}

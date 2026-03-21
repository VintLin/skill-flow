import fs from "node:fs/promises";
import { createChannelAdapters } from "../adapters/channel-adapters.js";
import type {
  DeploymentAction,
  DeploymentPlan,
  DeploymentTargetName,
  DoctorReport,
  LockFile,
  Manifest,
  Result,
  SourceBinding,
  TargetBinding,
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
    manifest.bindings[sourceId] = this.bindingFromDraft(draft);
    const plan = await this.planner.planForSource(sourceId, manifest, lockFile);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }

    return ok({ plan: plan.data, manifest, lockFile }, plan.warnings);
  }

  async applyDraft(
    sourceId: string,
    draft: DraftBinding,
  ): Promise<Result<{ actions: DeploymentAction[] }>> {
    const reconciled = await this.sourceService.reconcileInventory([sourceId], {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, reconciled.warnings);
    }
    await this.store.init();
    const manifest = await this.store.readManifest();
    const lockFile = await this.store.readLock();
    manifest.bindings[sourceId] = this.bindingFromDraft(draft);

    const plan = await this.planner.planForSource(sourceId, manifest, lockFile);
    if (!plan.ok) {
      return fail(plan.errors, plan.warnings);
    }

    const applyResult = await this.applier.applyPlan(lockFile, plan.data.actions);
    await this.store.writeManifest(manifest);
    await this.store.writeLock(lockFile);

    if (!applyResult.ok) {
      return fail(applyResult.errors, applyResult.warnings);
    }

    return ok({ actions: plan.data.actions }, [...plan.warnings, ...applyResult.warnings]);
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

    for (const item of updated.data.updated) {
      const binding = manifest.bindings[item.sourceId];
      const hasActiveTargets = binding
        ? Object.values(binding.targets).some((target) => target?.enabled)
        : false;
      if (!hasActiveTargets) {
        continue;
      }

      const plan = await this.planner.planForSource(item.sourceId, manifest, lockFile);
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
}

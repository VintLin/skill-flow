import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentAction,
  DeploymentPlan,
  DeploymentRecord,
  DeploymentTargetName,
  LeafRecord,
  LockFile,
  Manifest,
  Result,
  Warning,
} from "../domain/types.js";
import type { ChannelAdapter } from "../adapters/channel-adapters.js";
import { fail, ok } from "../utils/result.js";

export class DeploymentPlanner {
  constructor(private readonly adapters: ChannelAdapter[]) {}

  async planForSource(
    sourceId: string,
    manifest: Manifest,
    lockFile: LockFile,
  ): Promise<Result<DeploymentPlan>> {
    const binding = manifest.bindings[sourceId] ?? { targets: {} };
    const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const previousDeployments = lockFile.deployments.filter(
      (deployment) => deployment.sourceId === sourceId,
    );
    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];

    for (const adapter of this.adapters) {
      const detection = await adapter.detect();
      const targetBinding = binding.targets[adapter.target];
      const desiredLeafIds =
        targetBinding?.enabled === true ? new Set(targetBinding.leafIds) : new Set<string>();
      const projectedLinkNames = this.buildProjectedLinkNameMap(
        manifest,
        lockFile,
        adapter.target,
      );

      const plannedForTarget = await this.planTarget(
        sourceId,
        adapter,
        detection.available,
        detection.rootPath,
        detection.reason,
        desiredLeafIds,
        leafs,
        previousDeployments,
        projectedLinkNames,
      );

      actions.push(...plannedForTarget.actions);
      warnings.push(...plannedForTarget.warnings);
    }

    return ok({
      actions,
      warnings,
      blocked: actions.filter((action) => action.kind === "blocked"),
    });
  }

  // fetch -> scan -> diff -> replan -> reapply
  //
  // desired bindings + lock state + disk state
  //     -> create | update | remove | noop | blocked
  private async planTarget(
    sourceId: string,
    adapter: ChannelAdapter,
    targetAvailable: boolean,
    rootPath: string,
    unavailableReason: string | undefined,
    desiredLeafIds: Set<string>,
    leafs: LeafRecord[],
    previousDeployments: DeploymentRecord[],
    projectedLinkNames: Map<string, string>,
  ): Promise<DeploymentPlan> {
    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];
    const desiredLeafs = leafs.filter((leaf) => desiredLeafIds.has(leaf.id));
    const deploymentsForTarget = previousDeployments.filter(
      (deployment) => deployment.target === adapter.target,
    );
    const managedByLeafId = new Map(
      deploymentsForTarget.map((deployment) => [deployment.leafId, deployment]),
    );
    const missingDesiredLeafIds = [...desiredLeafIds].filter(
      (leafId) => !desiredLeafs.some((leaf) => leaf.id === leafId),
    );

    for (const missingLeafId of missingDesiredLeafIds) {
      const existing = managedByLeafId.get(missingLeafId);
      warnings.push({
        code: "MISSING_LEAF_SELECTION",
        message: `${missingLeafId} no longer exists in source inventory.`,
      });
      if (existing) {
        actions.push({
          kind: "remove",
          sourceId,
          leafId: missingLeafId,
          target: existing.target,
          strategy: existing.strategy,
          sourcePath: "",
          targetPath: existing.targetPath,
          contentHash: existing.contentHash,
          reason: "Selected leaf no longer exists in source inventory.",
        });
      }
    }

    for (const leaf of desiredLeafs) {
      const existing = managedByLeafId.get(leaf.id);
      const projectedLinkName = projectedLinkNames.get(leaf.id) ?? leaf.linkName;
      const targetPath = adapter.resolveTargetPath(rootPath, projectedLinkName);

      if (!targetAvailable) {
        const blockedAction: DeploymentAction = {
          kind: "blocked",
          sourceId,
          leafId: leaf.id,
          target: adapter.target,
          strategy: adapter.strategy,
          sourcePath: leaf.absolutePath,
          targetPath,
          contentHash: leaf.contentHash,
          ...(unavailableReason ? { reason: unavailableReason } : {}),
        };
        actions.push(blockedAction);
        continue;
      }

      const diskState = await this.inspectTargetPath(targetPath, leaf.absolutePath);
      if (diskState.foreign && !existing) {
        actions.push({
          kind: "blocked",
          sourceId,
          leafId: leaf.id,
          target: adapter.target,
          strategy: adapter.strategy,
          sourcePath: leaf.absolutePath,
          targetPath,
          reason: "Foreign content already exists at target path.",
          contentHash: leaf.contentHash,
        });
        continue;
      }

      const kind = this.resolveDesiredAction(existing, diskState.matchesExpected, leaf);
      actions.push({
        kind,
        sourceId,
        leafId: leaf.id,
        target: adapter.target,
        strategy: adapter.strategy,
        sourcePath: leaf.absolutePath,
        targetPath,
        ...(existing && existing.targetPath !== targetPath
          ? { previousTargetPath: existing.targetPath }
          : {}),
        contentHash: leaf.contentHash,
      });
    }

    for (const deployment of deploymentsForTarget) {
      if (desiredLeafIds.has(deployment.leafId)) {
        continue;
      }

      actions.push({
        kind: "remove",
        sourceId,
        leafId: deployment.leafId,
        target: deployment.target,
        strategy: deployment.strategy,
        sourcePath: "",
        targetPath: deployment.targetPath,
        contentHash: deployment.contentHash,
      });
    }

    return { actions, warnings, blocked: actions.filter((item) => item.kind === "blocked") };
  }

  private resolveDesiredAction(
    existing: DeploymentRecord | undefined,
    matchesExpected: boolean,
    leaf: LeafRecord,
  ): DeploymentAction["kind"] {
    if (!existing) {
      return matchesExpected ? "noop" : "create";
    }

    if (!matchesExpected) {
      return "update";
    }

    return existing.contentHash === leaf.contentHash ? "noop" : "update";
  }

  private async inspectTargetPath(
    targetPath: string,
    expectedSourcePath: string,
  ): Promise<{ exists: boolean; matchesExpected: boolean; foreign: boolean }> {
    try {
      const stats = await fs.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        const linked = await fs.readlink(targetPath);
        const resolved = path.resolve(path.dirname(targetPath), linked);
        const matchesExpected = resolved === expectedSourcePath;
        return { exists: true, matchesExpected, foreign: !matchesExpected };
      }
      return { exists: true, matchesExpected: false, foreign: true };
    } catch {
      return { exists: false, matchesExpected: false, foreign: false };
    }
  }

  private buildProjectedLinkNameMap(
    manifest: Manifest,
    lockFile: LockFile,
    target: DeploymentTargetName,
  ): Map<string, string> {
    const selectedLeafs = manifest.sources.flatMap((source) => {
      const targetBinding = manifest.bindings[source.id]?.targets[target];
      if (!targetBinding?.enabled) {
        return [];
      }

      return targetBinding.leafIds
        .map((leafId) => lockFile.leafInventory.find((leaf) => leaf.id === leafId))
        .filter((leaf): leaf is LeafRecord => Boolean(leaf));
    });

    const byLinkName = new Map<string, LeafRecord[]>();
    for (const leaf of selectedLeafs) {
      const group = byLinkName.get(leaf.linkName) ?? [];
      group.push(leaf);
      byLinkName.set(leaf.linkName, group);
    }

    const result = new Map<string, string>();
    for (const leaf of selectedLeafs) {
      const collisions = byLinkName.get(leaf.linkName) ?? [];
      if (collisions.length <= 1) {
        result.set(leaf.id, leaf.linkName);
        continue;
      }

      result.set(leaf.id, `${leaf.sourceId}-${leaf.linkName}`);
    }

    return result;
  }
}

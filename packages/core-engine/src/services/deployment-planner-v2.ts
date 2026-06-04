import type {
  DeploymentAction,
  DeploymentPlan,
  LeafRecordV2,
  LockFileV2,
  ManifestFileV2,
  ProjectionRecordV2,
  Result,
  SkillLeafIdV2,
  Warning,
} from "@skill-flow/domain/types";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import { fail, ok } from "@skill-flow/integration/utils/result";

export class DeploymentPlannerV2 {
  constructor(private readonly adapters: ChannelAdapter[]) {}

  async planForSource(
    sourceId: string,
    manifest: ManifestFileV2,
    lockFile: LockFileV2,
  ): Promise<Result<DeploymentPlan>> {
    const sourceLock = lockFile.sources[sourceId];
    if (!sourceLock) {
      return fail({
        code: "SOURCE_LOCK_MISSING",
        message: `${sourceId} is missing from V2 lock sources.`,
      });
    }

    const binding = manifest.bindings[sourceId];
    const sourceLeafs = this.resolveSourceLeafs(sourceLock.leafIds, lockFile);
    const previousProjections = lockFile.projections.filter(
      (projection) => projection.sourceId === sourceId && projection.status === "active",
    );
    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];

    for (const adapter of this.adapters) {
      const detection = await adapter.detect();
      const desiredLeafIds = this.resolveDesiredLeafIds(adapter.target, binding, sourceLock.leafIds);
      const plannedForTarget = this.planTarget(
        sourceId,
        adapter,
        detection.available,
        detection.rootPath,
        detection.reason,
        desiredLeafIds,
        sourceLeafs,
        previousProjections,
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

  private resolveDesiredLeafIds(
    target: ChannelAdapter["target"],
    binding: ManifestFileV2["bindings"][string] | undefined,
    sourceLeafIds: SkillLeafIdV2[],
  ): Set<SkillLeafIdV2> {
    if (!binding?.enabledTargets.includes(target)) {
      return new Set();
    }

    if (binding.selectionMode === "all") {
      return new Set(sourceLeafIds);
    }

    return new Set(binding.selectedLeafIds);
  }

  private resolveSourceLeafs(
    sourceLeafIds: SkillLeafIdV2[],
    lockFile: LockFileV2,
  ): LeafRecordV2[] {
    const leafById = new Map(lockFile.leafInventory.map((leaf) => [leaf.id, leaf]));
    return sourceLeafIds
      .map((leafId) => leafById.get(leafId))
      .filter((leaf): leaf is LeafRecordV2 => Boolean(leaf));
  }

  private planTarget(
    sourceId: string,
    adapter: ChannelAdapter,
    targetAvailable: boolean,
    rootPath: string,
    unavailableReason: string | undefined,
    desiredLeafIds: Set<SkillLeafIdV2>,
    sourceLeafs: LeafRecordV2[],
    previousProjections: ProjectionRecordV2[],
  ): DeploymentPlan {
    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];
    const desiredLeafs = sourceLeafs.filter((leaf) => desiredLeafIds.has(leaf.id));
    const projectionsForTarget = previousProjections.filter(
      (projection) => projection.target === adapter.target,
    );
    const previousByLeafId = new Map(
      projectionsForTarget.map((projection) => [projection.leafId, projection]),
    );
    const missingDesiredLeafIds = [...desiredLeafIds].filter(
      (leafId) => !desiredLeafs.some((leaf) => leaf.id === leafId),
    );

    for (const missingLeafId of missingDesiredLeafIds) {
      const existing = previousByLeafId.get(missingLeafId);
      warnings.push({
        code: "MISSING_LEAF_SELECTION",
        message: `${missingLeafId} no longer exists in source inventory.`,
      });
      if (existing) {
        actions.push(this.removeAction(sourceId, existing, "Selected leaf no longer exists in source inventory."));
      }
    }

    for (const leaf of desiredLeafs) {
      const existing = previousByLeafId.get(leaf.id);
      const targetPath = adapter.resolveTargetPath(rootPath, leaf.linkName);
      const targetRootPath = rootPath;

      if (!targetAvailable) {
        actions.push({
          kind: "blocked",
          sourceId,
          leafId: leaf.id,
          target: adapter.target,
          strategy: adapter.strategy,
          sourcePath: leaf.absolutePath,
          targetPath,
          targetRootPath,
          contentHash: leaf.contentHash,
          ...(unavailableReason ? { reason: unavailableReason } : {}),
        });
        continue;
      }

      actions.push({
        kind: this.resolveDesiredAction(existing, leaf, targetPath, targetRootPath, adapter.strategy),
        sourceId,
        leafId: leaf.id,
        target: adapter.target,
        strategy: adapter.strategy,
        sourcePath: leaf.absolutePath,
        targetPath,
        targetRootPath,
        ...(existing && existing.targetPath !== targetPath
          ? {
              previousTargetPath: existing.targetPath,
              ...(existing.targetRootPath
                ? { previousTargetRootPath: existing.targetRootPath }
                : {}),
            }
          : {}),
        contentHash: leaf.contentHash,
      });
    }

    for (const projection of projectionsForTarget) {
      if (desiredLeafIds.has(projection.leafId)) {
        continue;
      }

      actions.push(this.removeAction(sourceId, projection));
    }

    return { actions, warnings, blocked: actions.filter((action) => action.kind === "blocked") };
  }

  private resolveDesiredAction(
    existing: ProjectionRecordV2 | undefined,
    leaf: LeafRecordV2,
    targetPath: string,
    targetRootPath: string,
    strategy: ChannelAdapter["strategy"],
  ): DeploymentAction["kind"] {
    if (!existing) {
      return "create";
    }

    if (
      existing.contentHash !== leaf.contentHash ||
      existing.targetPath !== targetPath ||
      existing.targetRootPath !== targetRootPath ||
      existing.strategy !== strategy
    ) {
      return "update";
    }

    return "noop";
  }

  private removeAction(
    sourceId: string,
    projection: ProjectionRecordV2,
    reason?: string,
  ): DeploymentAction {
    return {
      kind: "remove",
      sourceId,
      leafId: projection.leafId,
      target: projection.target,
      strategy: projection.strategy,
      sourcePath: "",
      targetPath: projection.targetPath,
      ...(projection.targetRootPath ? { targetRootPath: projection.targetRootPath } : {}),
      contentHash: projection.contentHash,
      ...(reason ? { reason } : {}),
    };
  }
}

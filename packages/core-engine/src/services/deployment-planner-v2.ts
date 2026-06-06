import fs from "node:fs/promises";
import path from "node:path";
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
import {
  buildProjectedSkillNameCandidates,
  getHostedGitOwner,
} from "@skill-flow/integration/utils/naming";
import { hashDirectory, isPathInside } from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";

export class DeploymentPlannerV2 {
  constructor(
    private readonly adapters: ChannelAdapter[],
    private readonly projectedLinkNamesByTarget: ReadonlyMap<ChannelAdapter["target"], ReadonlyMap<string, string>> = new Map(),
  ) {}

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
    const activeProjections = lockFile.projections.filter(
      (projection) => projection.status === "active",
    );
    const previousProjections = activeProjections.filter(
      (projection) => projection.sourceId === sourceId && projection.status === "active",
    );
    const source = manifest.sources.find((item) => item.id === sourceId);
    const actions: DeploymentAction[] = [];
    const warnings: Warning[] = [];

    for (const adapter of this.adapters) {
      const detection = await adapter.detect();
      const desiredLeafIds = this.resolveDesiredLeafIds(adapter.target, binding, sourceLock.leafIds);
      const plannedForTarget = await this.planTarget(
        sourceId,
        adapter,
        detection.available,
        detection.rootPath,
        detection.reason,
        desiredLeafIds,
        sourceLeafs,
        previousProjections,
        activeProjections,
        {
          id: sourceId,
          displayName: source?.displayName ?? sourceId,
          author: getHostedGitOwner(source?.locator ?? ""),
        },
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

  private async planTarget(
    sourceId: string,
    adapter: ChannelAdapter,
    targetAvailable: boolean,
    rootPath: string,
    unavailableReason: string | undefined,
    desiredLeafIds: Set<SkillLeafIdV2>,
    sourceLeafs: LeafRecordV2[],
    previousProjections: ProjectionRecordV2[],
    activeProjections: ProjectionRecordV2[],
    sourceRef: { id: string; displayName: string; author?: string | undefined },
  ): Promise<DeploymentPlan> {
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
      const targetPathCandidates = buildProjectedSkillNameCandidates({
        preferredName: this.projectedLinkNamesByTarget.get(adapter.target)?.get(leaf.id) ?? leaf.linkName,
        groupId: sourceRef.id,
        groupName: sourceRef.displayName,
        groupAuthor: sourceRef.author,
        skillName: leaf.linkName,
      }).map((linkName) => ({
        linkName,
        targetPath: adapter.resolveTargetPath(rootPath, linkName),
      }));
      const preferredTargetPath =
        targetPathCandidates[0]?.targetPath ?? adapter.resolveTargetPath(rootPath, leaf.linkName);
      const targetRootPath = rootPath;
      const containedTargetPathCandidates = targetPathCandidates.filter((candidate) =>
        isPathInside(rootPath, candidate.targetPath),
      );

      if (!targetAvailable) {
        actions.push({
          kind: "blocked",
          sourceId,
          leafId: leaf.id,
          target: adapter.target,
          strategy: adapter.strategy,
          sourcePath: leaf.absolutePath,
          targetPath: preferredTargetPath,
          targetRootPath,
          contentHash: leaf.contentHash,
          ...(unavailableReason ? { reason: unavailableReason } : {}),
        });
        continue;
      }

      let chosenCandidate:
        | {
            linkName: string;
            targetPath: string;
            diskState: Awaited<ReturnType<DeploymentPlannerV2["inspectTargetPath"]>>;
            relocateExternalToTargetPath?: string;
          }
        | undefined;
      let preferredForeignCandidate:
        | {
            linkName: string;
            targetPath: string;
            diskState: Awaited<ReturnType<DeploymentPlannerV2["inspectTargetPath"]>>;
          }
        | undefined;
      for (const candidate of containedTargetPathCandidates) {
        const diskState = await this.inspectTargetPath(
          candidate.targetPath,
          leaf.absolutePath,
          leaf,
          sourceId,
          adapter.target,
          adapter.strategy,
          activeProjections,
        );

        if (
          diskState.managedBySkillFlow &&
          !this.matchesProjectionSourceLeaf(diskState.managedProjection, sourceId, leaf.id)
        ) {
          continue;
        }

        if (diskState.foreign) {
          if (candidate.targetPath === preferredTargetPath) {
            preferredForeignCandidate = { ...candidate, diskState };
          }
          if (
            candidate.targetPath === preferredTargetPath &&
            diskState.externalExactMatch
          ) {
            const relocationTargetPath = await this.resolveExternalRelocationTargetPath(
              preferredTargetPath,
              rootPath,
              activeProjections,
            );
            if (relocationTargetPath) {
              chosenCandidate = {
                ...candidate,
                diskState,
                relocateExternalToTargetPath: relocationTargetPath,
              };
              break;
            }
          }
          continue;
        }

        chosenCandidate = {
          ...candidate,
          diskState,
        };
        break;
      }

      if (!chosenCandidate && preferredForeignCandidate) {
        const relocationTargetPath = await this.resolveExternalRelocationTargetPath(
          preferredTargetPath,
          rootPath,
          activeProjections,
        );
        if (relocationTargetPath) {
          chosenCandidate = {
            ...preferredForeignCandidate,
            relocateExternalToTargetPath: relocationTargetPath,
          };
        }
      }

      if (!chosenCandidate) {
        actions.push({
          kind: "blocked",
          sourceId,
          leafId: leaf.id,
          target: adapter.target,
          strategy: adapter.strategy,
          sourcePath: leaf.absolutePath,
          targetPath: preferredTargetPath,
          targetRootPath,
          reason: "Target path is unavailable and no safe fallback name is available.",
          contentHash: leaf.contentHash,
        });
        continue;
      }

      if (
        chosenCandidate.targetPath !== preferredTargetPath &&
        !chosenCandidate.diskState.externalExactMatch
      ) {
        warnings.push({
          code: "EXTERNAL_NAME_COLLISION_RENAMED",
          message: `${leaf.linkName} kept existing target content at ${preferredTargetPath} and will deploy as ${chosenCandidate.linkName}.`,
        });
      }
      if (chosenCandidate.relocateExternalToTargetPath) {
        warnings.push({
          code: "EXTERNAL_SKILL_RELOCATED",
          message: `${leaf.linkName} reclaimed ${preferredTargetPath} and moved the external skill to ${chosenCandidate.relocateExternalToTargetPath}.`,
        });
      }

      actions.push({
        kind: this.resolveDesiredAction(
          existing,
          chosenCandidate.diskState.matchesExpected,
          leaf,
          chosenCandidate.targetPath,
          targetRootPath,
          adapter.strategy,
        ),
        sourceId,
        leafId: leaf.id,
        target: adapter.target,
        strategy: adapter.strategy,
        sourcePath: leaf.absolutePath,
        targetPath: chosenCandidate.targetPath,
        targetRootPath,
        ...(existing && existing.targetPath !== chosenCandidate.targetPath
          ? {
              previousTargetPath: existing.targetPath,
              ...(existing.targetRootPath
                ? { previousTargetRootPath: existing.targetRootPath }
                : {}),
            }
          : {}),
        ...(chosenCandidate.relocateExternalToTargetPath
          ? { relocateExternalToTargetPath: chosenCandidate.relocateExternalToTargetPath }
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
    matchesExpected: boolean,
    leaf: LeafRecordV2,
    targetPath: string,
    targetRootPath: string,
    strategy: ChannelAdapter["strategy"],
  ): DeploymentAction["kind"] {
    if (!existing) {
      return "create";
    }

    if (
      !matchesExpected ||
      existing.contentHash !== leaf.contentHash ||
      existing.targetPath !== targetPath ||
      existing.targetRootPath !== targetRootPath ||
      existing.strategy !== strategy
    ) {
      return "update";
    }

    return "noop";
  }

  private async inspectTargetPath(
    targetPath: string,
    expectedSourcePath: string,
    leaf: LeafRecordV2,
    sourceId: string,
    target: ChannelAdapter["target"],
    strategy: ChannelAdapter["strategy"],
    activeProjections: ProjectionRecordV2[],
  ): Promise<{
    exists: boolean;
    matchesExpected: boolean;
    foreign: boolean;
    managedBySkillFlow: boolean;
    managedProjection?: ProjectionRecordV2;
    externalExactMatch: boolean;
    identity?: { name: string; description: string };
  }> {
    const managedProjections = await this.findActiveProjectionOwners(
      targetPath,
      activeProjections,
    );
    const blockingManagedProjection = managedProjections.find(
      (projection) => !this.matchesProjectionSourceLeaf(projection, sourceId, leaf.id),
    );
    const managedProjection =
      blockingManagedProjection ??
      managedProjections.find((projection) =>
        this.matchesProjection(projection, sourceId, leaf.id, target),
      ) ??
      managedProjections.find((projection) =>
        this.matchesProjectionSourceLeaf(projection, sourceId, leaf.id),
      );

    try {
      const stats = await fs.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        const linked = await fs.readlink(targetPath);
        const resolved = path.resolve(path.dirname(targetPath), linked);
        const matchesExpected = resolved === expectedSourcePath;
        return {
          exists: true,
          matchesExpected,
          foreign: !matchesExpected,
          managedBySkillFlow: Boolean(managedProjection),
          ...(managedProjection ? { managedProjection } : {}),
          ...(await this.buildExternalIdentityState(targetPath, leaf, managedProjection)),
        };
      }

      const matchesExpected =
        strategy === "copy" &&
        this.matchesProjection(managedProjection, sourceId, leaf.id, target) &&
        (await this.copyTargetMatchesExpected(targetPath, expectedSourcePath, leaf.contentHash));
      return {
        exists: true,
        matchesExpected,
        foreign: !matchesExpected && !managedProjection,
        managedBySkillFlow: managedProjections.length > 0,
        ...(managedProjection ? { managedProjection } : {}),
        ...(await this.buildExternalIdentityState(targetPath, leaf, managedProjection)),
      };
    } catch {
      return {
        exists: false,
        matchesExpected: false,
        foreign: false,
        managedBySkillFlow: managedProjections.length > 0,
        ...(managedProjection ? { managedProjection } : {}),
        externalExactMatch: false,
      };
    }
  }

  private async copyTargetMatchesExpected(
    targetPath: string,
    expectedSourcePath: string,
    contentHash: string,
  ): Promise<boolean> {
    try {
      const [targetHash, sourceHash] = await Promise.all([
        hashDirectory(targetPath),
        hashDirectory(expectedSourcePath),
      ]);
      return targetHash === contentHash && sourceHash === contentHash;
    } catch {
      return false;
    }
  }

  private matchesProjectionSourceLeaf(
    projection: ProjectionRecordV2 | undefined,
    sourceId: string,
    leafId: string,
  ): boolean {
    return projection?.sourceId === sourceId && projection.leafId === leafId;
  }

  private async buildExternalIdentityState(
    targetPath: string,
    leaf: LeafRecordV2,
    managedProjection: ProjectionRecordV2 | undefined,
  ) {
    const identity = !managedProjection ? await this.readSkillIdentity(targetPath) : undefined;
    return {
      externalExactMatch:
        !managedProjection &&
        identity?.name === leaf.linkName &&
        identity.description === leaf.description,
      ...(identity ? { identity } : {}),
    };
  }

  private async readSkillIdentity(targetPath: string) {
    try {
      const raw = await fs.readFile(path.join(targetPath, "SKILL.md"), "utf8");
      const lines = raw.split(/\r?\n/);
      if (lines[0]?.trim() !== "---") {
        return undefined;
      }

      const data: Record<string, string> = {};
      let index = 1;
      while (index < lines.length) {
        const line = lines[index] ?? "";
        if (line.trim() === "---") {
          break;
        }

        const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!pair) {
          index += 1;
          continue;
        }

        const key = pair[1];
        const rest = pair[2];
        if (!key || rest === undefined) {
          index += 1;
          continue;
        }

        if (rest === "|" || rest === ">") {
          const blockLines: string[] = [];
          index += 1;
          while (index < lines.length) {
            const blockLine = lines[index] ?? "";
            if (blockLine.length === 0) {
              blockLines.push("");
              index += 1;
              continue;
            }
            if (!blockLine.startsWith("  ")) {
              break;
            }
            blockLines.push(blockLine.slice(2));
            index += 1;
          }
          data[key] = blockLines.join("\n").trim();
          continue;
        }

        data[key] = rest.trim();
        index += 1;
      }

      const name = data.name?.trim();
      const description = data.description?.trim();
      if (!name || !description) {
        return undefined;
      }
      return { name, description };
    } catch {
      return undefined;
    }
  }

  private async resolveExternalRelocationTargetPath(
    preferredTargetPath: string,
    rootPath: string,
    activeProjections: ProjectionRecordV2[],
  ): Promise<string | undefined> {
    const currentLinkName = path.basename(preferredTargetPath);
    for (const relocationLinkName of this.buildExternalRelocationLinkNames(currentLinkName)) {
      const relocationTargetPath = path.join(rootPath, relocationLinkName);
      if (!isPathInside(rootPath, relocationTargetPath)) {
        continue;
      }
      if (await this.isExistingOrManagedTargetPath(relocationTargetPath, activeProjections)) {
        continue;
      }

      return relocationTargetPath;
    }

    return undefined;
  }

  private buildExternalRelocationLinkNames(currentLinkName: string) {
    return Array.from({ length: 12 }, (_, index) =>
      index === 0 ? `${currentLinkName}-external` : `${currentLinkName}-external-${index + 1}`,
    );
  }

  private async isExistingOrManagedTargetPath(
    targetPath: string,
    activeProjections: ProjectionRecordV2[],
  ): Promise<boolean> {
    if ((await this.findActiveProjectionOwners(targetPath, activeProjections)).length > 0) {
      return true;
    }

    try {
      await fs.lstat(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private async findActiveProjectionOwners(
    targetPath: string,
    activeProjections: ProjectionRecordV2[],
  ): Promise<ProjectionRecordV2[]> {
    const expectedPath = await this.resolvePhysicalTargetPath(targetPath);
    const owners: ProjectionRecordV2[] = [];
    for (const projection of activeProjections) {
      const projectionPath = await this.resolvePhysicalTargetPath(projection.targetPath);
      if (projectionPath === expectedPath) {
        owners.push(projection);
      }
    }
    return owners;
  }

  private async resolvePhysicalTargetPath(targetPath: string): Promise<string> {
    const resolvedPath = path.resolve(targetPath);
    const parentPath = path.dirname(resolvedPath);
    const physicalParentPath = await fs.realpath(parentPath).catch(() => path.resolve(parentPath));
    return path.join(physicalParentPath, path.basename(resolvedPath));
  }

  private matchesProjection(
    projection: ProjectionRecordV2 | undefined,
    sourceId: string,
    leafId: string,
    target: ChannelAdapter["target"],
  ): boolean {
    return (
      projection?.sourceId === sourceId &&
      projection.leafId === leafId &&
      projection.target === target
    );
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

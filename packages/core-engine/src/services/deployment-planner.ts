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
} from "@skill-flow/domain/types";
import { getManagedDeployments } from "@skill-flow/domain/projection-compat";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import {
  buildProjectedSkillNameCandidates,
  parseGitHubRepo,
  resolveProjectedSkillNames,
} from "@skill-flow/integration/utils/naming";
import { fail, ok } from "@skill-flow/integration/utils/result";

export class DeploymentPlanner {
  constructor(private readonly adapters: ChannelAdapter[]) {}

  async planForSource(
    sourceId: string,
    manifest: Manifest,
    lockFile: LockFile,
  ): Promise<Result<DeploymentPlan>> {
    const binding = manifest.bindings[sourceId] ?? { targets: {} };
    const source = manifest.sources.find((item) => item.id === sourceId);
    const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const previousDeployments = getManagedDeployments(lockFile).filter(
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
        lockFile,
        projectedLinkNames,
        {
          id: sourceId,
          displayName: source?.displayName ?? sourceId,
          author: parseGitHubRepo(source?.locator ?? "")?.owner,
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
    lockFile: LockFile,
    projectedLinkNames: Map<string, string>,
    sourceRef: { id: string; displayName: string; author?: string | undefined },
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
          ...(existing.targetRootPath ? { targetRootPath: existing.targetRootPath } : {}),
          contentHash: existing.contentHash,
          reason: "Selected leaf no longer exists in source inventory.",
        });
      }
    }

    for (const leaf of desiredLeafs) {
      const existing = managedByLeafId.get(leaf.id);
      const projectedLinkName = projectedLinkNames.get(leaf.id) ?? leaf.linkName;
      const targetPathCandidates = buildProjectedSkillNameCandidates({
        preferredName: projectedLinkName,
        groupId: sourceRef.id,
        groupName: sourceRef.displayName,
        groupAuthor: sourceRef.author,
        skillName: leaf.linkName,
      }).map((linkName) => ({
        linkName,
        targetPath: adapter.resolveTargetPath(rootPath, linkName),
      }));
      const preferredTargetPath = targetPathCandidates[0]?.targetPath ?? adapter.resolveTargetPath(rootPath, projectedLinkName);

      if (!targetAvailable) {
        const blockedAction: DeploymentAction = {
          kind: "blocked",
          sourceId,
          leafId: leaf.id,
          target: adapter.target,
          strategy: adapter.strategy,
          sourcePath: leaf.absolutePath,
          targetPath: preferredTargetPath,
          contentHash: leaf.contentHash,
          ...(unavailableReason ? { reason: unavailableReason } : {}),
        };
        actions.push(blockedAction);
        continue;
      }

      let chosenCandidate:
        | {
            linkName: string;
            targetPath: string;
            diskState: Awaited<ReturnType<DeploymentPlanner["inspectTargetPath"]>>;
            relocateExternalToTargetPath?: string;
          }
        | undefined;
      const inspectedCandidates: Array<{
        linkName: string;
        targetPath: string;
        diskState: Awaited<ReturnType<DeploymentPlanner["inspectTargetPath"]>>;
      }> = [];

      for (const candidate of targetPathCandidates) {
        const diskState = await this.inspectTargetPath(
          candidate.targetPath,
          leaf.absolutePath,
          leaf,
          lockFile,
        );
        inspectedCandidates.push({
          ...candidate,
          diskState,
        });
        if (
          diskState.managedBySkillFlow &&
          !(
            (existing &&
              diskState.managedDeployment?.sourceId === existing.sourceId &&
              diskState.managedDeployment?.leafId === existing.leafId &&
              diskState.managedDeployment?.target === existing.target) ||
            (diskState.managedDeployment?.sourceId === sourceId &&
              diskState.managedDeployment?.leafId === leaf.id)
          )
        ) {
          continue;
        }

        if (diskState.foreign && !diskState.externalExactMatch) {
          continue;
        }

        chosenCandidate = {
          ...candidate,
          diskState,
        };
        break;
      }

      if (!chosenCandidate) {
        chosenCandidate = await this.buildExternalRelocationCandidate(
          preferredTargetPath,
          inspectedCandidates,
          leaf,
          rootPath,
        );
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
          reason: "Foreign content already exists at target path and no safe fallback name is available.",
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

      const kind = this.resolveDesiredAction(
        existing,
        chosenCandidate.diskState.matchesExpected,
        leaf,
      );
      actions.push({
        kind,
        sourceId,
        leafId: leaf.id,
        target: adapter.target,
        strategy: adapter.strategy,
        sourcePath: leaf.absolutePath,
        targetPath: chosenCandidate.targetPath,
        ...((chosenCandidate.targetPath === preferredTargetPath ||
          chosenCandidate.targetPath.startsWith(`${rootPath}${path.sep}`))
          ? { targetRootPath: rootPath }
          : (existing?.targetRootPath
              ? { targetRootPath: existing.targetRootPath }
              : {})),
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
        ...(deployment.targetRootPath ? { targetRootPath: deployment.targetRootPath } : {}),
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
    leaf: LeafRecord,
    lockFile: LockFile,
  ): Promise<{
    exists: boolean;
    matchesExpected: boolean;
    foreign: boolean;
    managedBySkillFlow: boolean;
    managedDeployment?: DeploymentRecord;
    externalExactMatch: boolean;
    identity?: { name: string; description: string };
  }> {
    try {
      const managedDeployment = getManagedDeployments(lockFile).find(
        (deployment) => deployment.targetPath === targetPath && deployment.status === "active",
      );
      const stats = await fs.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        const linked = await fs.readlink(targetPath);
        const resolved = path.resolve(path.dirname(targetPath), linked);
        const matchesExpected = resolved === expectedSourcePath;
        return {
          exists: true,
          matchesExpected,
          foreign: !matchesExpected,
          managedBySkillFlow: Boolean(managedDeployment),
          ...(managedDeployment ? { managedDeployment } : {}),
          ...(await this.buildExternalIdentityState(targetPath, leaf, managedDeployment)),
        };
      }
      return {
        exists: true,
        matchesExpected: false,
        foreign: true,
        managedBySkillFlow: Boolean(managedDeployment),
        ...(managedDeployment ? { managedDeployment } : {}),
        ...(await this.buildExternalIdentityState(targetPath, leaf, managedDeployment)),
      };
    } catch {
      return {
        exists: false,
        matchesExpected: false,
        foreign: false,
        managedBySkillFlow: false,
        externalExactMatch: false,
      };
    }
  }

  private async buildExternalIdentityState(
    targetPath: string,
    leaf: LeafRecord,
    managedDeployment: DeploymentRecord | undefined,
  ) {
    const identity = !managedDeployment ? await this.readSkillIdentity(targetPath) : undefined;
    return {
      externalExactMatch:
        !managedDeployment &&
        identity?.name === leaf.name &&
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

  private async buildExternalRelocationCandidate(
    preferredTargetPath: string,
    inspectedCandidates: Array<{
      linkName: string;
      targetPath: string;
      diskState: Awaited<ReturnType<DeploymentPlanner["inspectTargetPath"]>>;
    }>,
    leaf: LeafRecord,
    rootPath: string,
  ) {
    const preferredCandidate = inspectedCandidates.find(
      (candidate) => candidate.targetPath === preferredTargetPath,
    );
    if (
      !preferredCandidate ||
      !preferredCandidate.diskState.exists ||
      preferredCandidate.diskState.managedBySkillFlow ||
      preferredCandidate.diskState.externalExactMatch
    ) {
      return undefined;
    }

    const currentLinkName = path.basename(preferredTargetPath);
    for (const relocationLinkName of this.buildExternalRelocationLinkNames(currentLinkName)) {
      const relocationTargetPath = path.join(rootPath, relocationLinkName);
      const relocationState = await this.inspectExistingTargetPath(relocationTargetPath);
      if (relocationState.exists) {
        continue;
      }

      return {
        linkName: currentLinkName,
        targetPath: preferredTargetPath,
        diskState: preferredCandidate.diskState,
        relocateExternalToTargetPath: relocationTargetPath,
      };
    }

    return undefined;
  }

  private buildExternalRelocationLinkNames(currentLinkName: string) {
    return Array.from({ length: 12 }, (_, index) =>
      index === 0 ? `${currentLinkName}-external` : `${currentLinkName}-external-${index + 1}`,
    );
  }

  private async inspectExistingTargetPath(targetPath: string) {
    try {
      await fs.lstat(targetPath);
      return { exists: true };
    } catch {
      return { exists: false };
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
    const sourcesById = new Map(manifest.sources.map((source) => [source.id, source]));
    return resolveProjectedSkillNames(
      selectedLeafs.map((leaf) => ({
        leafId: leaf.id,
        groupId: leaf.sourceId,
        groupName: sourcesById.get(leaf.sourceId)?.displayName ?? leaf.sourceId,
        groupAuthor: parseGitHubRepo(sourcesById.get(leaf.sourceId)?.locator ?? "")?.owner,
        skillName: leaf.linkName,
      })),
    );
  }
}

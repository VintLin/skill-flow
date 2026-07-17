import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentAction,
  DeploymentPlan,
  DeploymentTargetId,
  LeafRecord,
  LockFile,
  ManifestFile,
  ProjectionRecord,
  Result,
  Warning,
} from "@skill-flow/domain/types";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import {
  buildProjectedSkillNameCandidates,
  getHostedGitOwner,
  resolveProjectedSkillNames,
} from "@skill-flow/integration/utils/naming";
import { fail, ok } from "@skill-flow/integration/utils/result";
import { isPathInside, pathExists, removePath } from "@skill-flow/integration/utils/fs";
import {
  DeploymentApplier,
  type DeploymentApplierOptions,
} from "@skill-flow/core-engine/services/deployment-applier";
import { DeploymentPlanner } from "@skill-flow/core-engine/services/deployment-planner";

export type DeploymentReconcileInput = {
  manifest: ManifestFile;
  lockFile: LockFile;
  sourceIds: string[];
  adapters: ChannelAdapter[];
  trustedTargetRoots?: DeploymentApplierOptions["trustedTargetRoots"];
};

export type DeploymentPlanInput = Omit<DeploymentReconcileInput, "trustedTargetRoots">;

export type DeploymentApplyInput = Pick<DeploymentReconcileInput, "lockFile" | "adapters" | "trustedTargetRoots"> & {
  actions: DeploymentAction[];
};

export type ImportedTargetCleanupInput = {
  manifest: ManifestFile;
  lockFile: LockFile;
  sourceIds: string[];
  adapters: ChannelAdapter[];
  restrictedTargets?: DeploymentTargetId[];
};

/**
 * Coordinates projection planning and filesystem application for one or more
 * skill groups. Runtime workflows retain authority writes, locks, and audit;
 * this module owns the deployment implementation between those seams.
 */
export class DeploymentReconciler {
  async reconcile(input: DeploymentReconcileInput): Promise<Result<{ actions: DeploymentAction[] }>> {
    const planned = await this.plan(input);
    if (!planned.ok) {
      return fail(planned.errors, planned.warnings);
    }

    const applied = await this.apply({
      lockFile: input.lockFile,
      actions: planned.data.actions,
      adapters: input.adapters,
      ...(input.trustedTargetRoots ? { trustedTargetRoots: input.trustedTargetRoots } : {}),
    });
    if (!applied.ok) {
      return fail(applied.errors, [...planned.warnings, ...applied.warnings]);
    }

    return ok({ actions: planned.data.actions }, [...planned.warnings, ...applied.warnings]);
  }

  async plan(input: DeploymentPlanInput): Promise<Result<DeploymentPlan>> {
    const planner = new DeploymentPlanner(
      input.adapters,
      this.projectedLinkNameMaps(input.manifest, input.lockFile),
    );
    const uniqueSourceIds = [...new Set(input.sourceIds)];
    const actions: DeploymentAction[] = [];
    const warnings: DeploymentPlan["warnings"] = [];

    for (const sourceId of uniqueSourceIds) {
      const planned = await planner.planForSource(sourceId, input.manifest, input.lockFile);
      if (!planned.ok) {
        return fail(planned.errors, [...warnings, ...planned.warnings]);
      }
      actions.push(...planned.data.actions);
      warnings.push(...planned.warnings);
    }

    return ok({
      actions,
      warnings,
      blocked: actions.filter((action) => action.kind === "blocked"),
    }, warnings);
  }

  async apply(input: DeploymentApplyInput) {
    return new DeploymentApplier({
      adapters: input.adapters,
      ...(input.trustedTargetRoots ? { trustedTargetRoots: input.trustedTargetRoots } : {}),
    }).applyPlan(input.lockFile, input.actions);
  }

  async cleanupImportedTargetPaths(input: ImportedTargetCleanupInput): Promise<Warning[]> {
    const warnings: Warning[] = [];
    await this.ensureProjectionLedger(input.manifest, input.lockFile, input.adapters);
    const projections = input.lockFile.projections.filter(
      (projection) =>
        projection.status === "active" &&
        input.lockFile.sources[projection.sourceId]?.importMode === "bootstrap-detected" &&
        input.sourceIds.includes(projection.sourceId) &&
        (input.restrictedTargets ? input.restrictedTargets.includes(projection.target) : true),
    );

    for (const projection of projections) {
      if (
        await pathExists(projection.targetPath) &&
        !this.isProjectionPathManaged(projection)
      ) {
        warnings.push({
          code: "IMPORTED_TARGET_PATH_INVALID",
          message: `Refusing to remove unmanaged imported target path ${projection.targetPath}.`,
        });
        continue;
      }

      if (await pathExists(projection.targetPath)) {
        try {
          if (!this.hasPersistentProjectionOwnerForPath(input.lockFile, projection)) {
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

      input.lockFile.projections = input.lockFile.projections.filter(
        (candidate) => !this.matchesProjection(candidate, projection),
      );
    }

    return warnings;
  }

  async cleanupDetachedTargetSymlinks(input: {
    lockFile: LockFile;
    sourceIds: string[];
    adapters: ChannelAdapter[];
  }): Promise<Warning[]> {
    const warnings: Warning[] = [];
    const checkoutRoots = new Map<string, string>();
    for (const source of Object.values(input.lockFile.sources).filter((item) => input.sourceIds.includes(item.sourceId))) {
      const resolvedCheckoutPath = await fs.realpath(source.localPath).catch(() => path.resolve(source.localPath));
      checkoutRoots.set(source.sourceId, resolvedCheckoutPath);
    }
    if (checkoutRoots.size === 0) {
      return warnings;
    }

    for (const adapter of input.adapters) {
      const detection = await adapter.detect();
      if (!detection.available || !(await pathExists(detection.rootPath))) {
        continue;
      }
      const entries = await fs.readdir(detection.rootPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const targetPath = path.join(detection.rootPath, entry.name);
        const resolvedTargetPath = path.resolve(targetPath);
        const linkTarget = await this.resolveLinkTarget(targetPath);
        if (!linkTarget) {
          continue;
        }
        const ownerSourceId = [...checkoutRoots.entries()].find(([, checkoutPath]) =>
          linkTarget === checkoutPath || isPathInside(checkoutPath, linkTarget),
        )?.[0];
        if (!ownerSourceId) {
          continue;
        }
        const matchingProjection = input.lockFile.projections.some(
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

  async cleanupOrphanTargetSymlinks(input: {
    manifest: ManifestFile;
    lockFile: LockFile;
    adapters: ChannelAdapter[];
    stateRoot: string;
  }): Promise<Warning[]> {
    const warnings: Warning[] = [];
    const managedStateRoot = await fs.realpath(input.stateRoot).catch(() => path.resolve(input.stateRoot));

    for (const adapter of input.adapters) {
      const detection = await adapter.detect();
      if (!detection.available || !(await pathExists(detection.rootPath))) {
        continue;
      }
      const entries = await fs.readdir(detection.rootPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const targetPath = path.join(detection.rootPath, entry.name);
        const resolvedTargetPath = path.resolve(targetPath);
        const linkTarget = await this.resolveLinkTarget(targetPath);
        if (!linkTarget || (!isPathInside(managedStateRoot, linkTarget) && linkTarget !== managedStateRoot)) {
          continue;
        }
        const matchingProjections = input.lockFile.projections.filter(
          (projection) => path.resolve(projection.targetPath) === resolvedTargetPath,
        );
        if (matchingProjections.some((projection) => this.isProjectionStillResolvable(input.manifest, input.lockFile, projection))) {
          continue;
        }

        await removePath(targetPath);
        input.lockFile.projections = input.lockFile.projections.filter(
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

  projectedLinkNameMaps(
    manifest: ManifestFile,
    lockFile: LockFile,
  ): Map<DeploymentTargetId, Map<string, string>> {
    const maps = new Map<DeploymentTargetId, Map<string, string>>();
    const targets = new Set<DeploymentTargetId>(
      Object.values(manifest.bindings).flatMap((binding) => binding.enabledTargets),
    );

    for (const target of targets) {
      maps.set(
        target,
        resolveProjectedSkillNames(
          manifest.sources.flatMap((source) => {
            const binding = manifest.bindings[source.id];
            const sourceLock = lockFile.sources[source.id];
            if (!binding?.enabledTargets.includes(target) || !sourceLock) {
              return [];
            }
            const leafIds = binding.selectionMode === "all"
              ? sourceLock.leafIds
              : binding.selectedLeafIds;
            return leafIds
              .map((leafId) => lockFile.leafInventory.find((leaf) => leaf.id === leafId))
              .filter((leaf): leaf is LockFile["leafInventory"][number] => Boolean(leaf))
              .map((leaf) => ({
                leafId: leaf.id,
                groupId: source.id,
                groupName: source.displayName,
                groupAuthor: getHostedGitOwner(source.locator),
                skillName: leaf.linkName,
              }));
          }),
        ),
      );
    }

    return maps;
  }

  private async ensureProjectionLedger(
    manifest: ManifestFile,
    lockFile: LockFile,
    adapters: ChannelAdapter[],
  ): Promise<void> {
    const targetRoots = await this.targetRoots(adapters);
    const projectedNameCache = new Map<DeploymentTargetId, Map<string, string>>();
    const managed = this.activeProjections(lockFile)
      .filter((projection) => lockFile.sources[projection.sourceId]?.importMode !== "bootstrap-detected");
    const previousBootstrap = this.activeProjections(lockFile).filter(
      (projection) => lockFile.sources[projection.sourceId]?.importMode === "bootstrap-detected",
    );
    const bootstrap: LockFile["projections"] = [];

    for (const sourceLock of Object.values(lockFile.sources)) {
      const bootstrapTargets = this.bootstrapImportedTargets(lockFile, sourceLock);
      if (sourceLock.importMode !== "bootstrap-detected" || bootstrapTargets.length === 0) {
        continue;
      }

      const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceLock.sourceId && leaf.valid);
      const observedByTarget = new Map<DeploymentTargetId, { target: DeploymentTargetId; rootPath: string; targetPath: string }>();
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
          projectedLinkNames = this.projectedLinkNameMaps(manifest, lockFile).get(target) ?? new Map();
          projectedNameCache.set(target, projectedLinkNames);
        }

        for (const leaf of leafs) {
          const previous = previousBootstrap.find(
            (projection) =>
              projection.sourceId === sourceLock.sourceId &&
              projection.leafId === leaf.id &&
              projection.target === target,
          );
          const targetPath = await this.resolveBootstrapProjectionTargetPath({
            manifest,
            sourceLock,
            leaf,
            rootPath,
            projectedLinkNames,
            ...(observedRootPath === rootPath && observedTargetPath
              ? { observedTargetPath }
              : {}),
            ...(previous?.targetPath ? { previousTargetPath: previous.targetPath } : {}),
          });
          if (!targetPath) {
            continue;
          }
          bootstrap.push({
            sourceId: sourceLock.sourceId,
            leafId: leaf.id,
            target,
            targetPath,
            targetRootPath: rootPath,
            strategy: "symlink",
            status: "active",
            contentHash: leaf.contentHash,
            updatedAt: sourceLock.revision.capturedAt,
          });
        }
      }
    }

    lockFile.projections = [...managed, ...bootstrap];
  }

  private activeProjections(lockFile: LockFile): LockFile["projections"] {
    return lockFile.projections.filter((projection) => projection.status === "active");
  }

  private bootstrapImportedTargets(
    lockFile: LockFile,
    sourceLock: LockFile["sources"][string],
  ): DeploymentTargetId[] {
    return [
      ...new Set([
        ...this.activeProjections(lockFile)
          .filter((projection) => projection.sourceId === sourceLock.sourceId)
          .map((projection) => projection.target),
        ...(sourceLock.observedTargets?.map((item) => item.target) ?? []),
        ...(sourceLock.importedFromTargets ?? []),
      ]),
    ];
  }

  private async resolveBootstrapProjectionTargetPath(input: {
    manifest: ManifestFile;
    sourceLock: LockFile["sources"][string];
    leaf: LeafRecord;
    rootPath: string;
    projectedLinkNames: Map<string, string>;
    observedTargetPath?: string;
    previousTargetPath?: string;
  }): Promise<string | undefined> {
    if (input.previousTargetPath && isPathInside(input.rootPath, input.previousTargetPath)) {
      return input.previousTargetPath;
    }
    if (input.observedTargetPath && isPathInside(input.rootPath, input.observedTargetPath)) {
      return input.observedTargetPath;
    }
    const scannedObservedTargetPath = await this.findObservedBootstrapTargetPath(input.sourceLock, input.rootPath);
    if (scannedObservedTargetPath) {
      return scannedObservedTargetPath;
    }

    const source = input.manifest.sources.find((item) => item.id === input.sourceLock.sourceId);
    const groupAuthor =
      getHostedGitOwner(source?.locator ?? "") ??
      (source?.canonicalLocator ? getHostedGitOwner(source.canonicalLocator) : undefined);
    const projectedLinkName = input.projectedLinkNames.get(input.leaf.id) ?? input.leaf.linkName;
    const candidates = buildProjectedSkillNameCandidates({
      preferredName: projectedLinkName,
      groupId: input.sourceLock.sourceId,
      groupName: source?.displayName ?? input.sourceLock.sourceId,
      groupAuthor,
      skillName: input.leaf.linkName,
    }).map((name) => path.join(input.rootPath, name));

    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private async findObservedBootstrapTargetPath(
    sourceLock: LockFile["sources"][string],
    rootPath: string,
  ): Promise<string | undefined> {
    if (!(await pathExists(rootPath))) {
      return undefined;
    }
    const observedRealpaths = new Set(
      [sourceLock.canonicalLocator, sourceLock.localPath]
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
      if (!isDirectoryLike || !(await pathExists(path.join(candidatePath, "SKILL.md")))) {
        continue;
      }
      const resolvedPath = await fs.realpath(candidatePath).catch(() => path.resolve(candidatePath));
      if (observedRealpaths.has(resolvedPath)) {
        return candidatePath;
      }
    }
    return undefined;
  }

  private async targetRoots(adapters: ChannelAdapter[]): Promise<Map<DeploymentTargetId, string>> {
    return new Map(
      await Promise.all(adapters.map(async (adapter) => {
        const detection = await adapter.detect();
        return [adapter.target, detection.rootPath] as const;
      })),
    );
  }

  private async resolveLinkTarget(targetPath: string): Promise<string | undefined> {
    const realTargetPath = await fs.realpath(targetPath).catch(() => undefined);
    const linkTarget = realTargetPath
      ? realTargetPath
      : await fs.readlink(targetPath)
          .then((value) => path.resolve(path.dirname(targetPath), value))
          .catch(() => undefined);
    return linkTarget ? path.resolve(linkTarget) : undefined;
  }

  private isProjectionStillResolvable(
    manifest: ManifestFile,
    lockFile: LockFile,
    projection: ProjectionRecord,
  ): boolean {
    const source = manifest.sources.find((item) => item.id === projection.sourceId);
    if (!source) {
      return false;
    }
    const sourceLock = lockFile.sources[projection.sourceId];
    if (sourceLock?.importMode === "bootstrap-detected") {
      return projection.status === "active";
    }
    const binding = manifest.bindings[source.id];
    if (!binding) {
      return false;
    }
    const selectedLeafIds = binding.selectionMode === "all" ? sourceLock?.leafIds ?? [] : binding.selectedLeafIds;
    return selectedLeafIds.includes(projection.leafId);
  }

  private isProjectionPathManaged(projection: ProjectionRecord): boolean {
    return Boolean(projection.targetRootPath && isPathInside(projection.targetRootPath, projection.targetPath));
  }

  private hasPersistentProjectionOwnerForPath(lockFile: LockFile, projection: ProjectionRecord): boolean {
    return lockFile.projections.some((candidate) =>
      candidate.targetPath === projection.targetPath && !this.matchesProjection(candidate, projection),
    );
  }

  private matchesProjection(left: ProjectionRecord, right: ProjectionRecord): boolean {
    return left.sourceId === right.sourceId &&
      left.leafId === right.leafId &&
      left.target === right.target &&
      left.targetPath === right.targetPath;
  }
}

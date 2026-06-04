import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentAction,
  LockFileV2,
  ProjectionRecordV2,
  Result,
} from "@skill-flow/domain/types";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import {
  copyDirectory,
  createSymlink,
  ensureDir,
  isPathInside,
  pathExists,
  removePath,
} from "@skill-flow/integration/utils/fs";
import { ok } from "@skill-flow/integration/utils/result";

export class DeploymentApplierV2 {
  constructor(private readonly adapters: ChannelAdapter[] = []) {}

  async applyPlan(
    lockFile: LockFileV2,
    actions: DeploymentAction[],
  ): Promise<Result<{ applied: DeploymentAction[] }>> {
    const applied: DeploymentAction[] = [];
    const targetRoots = new Map(
      await Promise.all(
        this.adapters.map(async (adapter) => {
          const detection = await adapter.detect();
          return [adapter.target, detection.rootPath] as const;
        }),
      ),
    );

    for (const action of actions) {
      if (action.kind === "blocked" || action.kind === "noop") {
        continue;
      }

      this.assertManagedTargetPath(
        action.target,
        action.targetPath,
        targetRoots,
        action.targetRootPath,
      );

      if (action.kind === "remove") {
        if (
          (await pathExists(action.targetPath)) &&
          !(await this.hasPersistentOwnerForPath(lockFile, actions, action))
        ) {
          await removePath(action.targetPath);
        }
        lockFile.projections = lockFile.projections.filter(
          (projection) => !this.matchesAction(projection, action),
        );
        applied.push(action);
        continue;
      }

      await ensureDir(path.dirname(action.targetPath));
      if (
        action.previousTargetPath &&
        action.previousTargetPath !== action.targetPath &&
        (await pathExists(action.previousTargetPath))
      ) {
        this.assertManagedTargetPath(
          action.target,
          action.previousTargetPath,
          targetRoots,
          action.previousTargetRootPath,
        );
        if (!(await this.hasPersistentOwnerForPath(lockFile, actions, action, action.previousTargetPath))) {
          await removePath(action.previousTargetPath);
        }
      }

      if (
        action.relocateExternalToTargetPath &&
        (await pathExists(action.targetPath))
      ) {
        this.assertManagedTargetPath(
          action.target,
          action.relocateExternalToTargetPath,
          targetRoots,
          action.targetRootPath,
        );
        await ensureDir(path.dirname(action.relocateExternalToTargetPath));
        await fs.rename(action.targetPath, action.relocateExternalToTargetPath);
      }

      if (action.strategy === "symlink") {
        await createSymlink(action.sourcePath, action.targetPath);
      } else {
        await copyDirectory(action.sourcePath, action.targetPath);
      }

      const nextProjection: ProjectionRecordV2 = {
        target: action.target,
        sourceId: action.sourceId,
        leafId: action.leafId,
        targetPath: action.targetPath,
        ...(action.targetRootPath ? { targetRootPath: action.targetRootPath } : {}),
        strategy: action.strategy,
        contentHash: action.contentHash,
        status: "active",
        updatedAt: new Date().toISOString(),
      };

      lockFile.projections = [
        ...lockFile.projections.filter((projection) => !this.matchesAction(projection, action)),
        nextProjection,
      ];
      applied.push(action);
    }

    return ok({ applied });
  }

  private async hasPersistentOwnerForPath(
    lockFile: LockFileV2,
    actions: DeploymentAction[],
    action: DeploymentAction,
    targetPath = action.targetPath,
  ): Promise<boolean> {
    const samePathProjections = lockFile.projections.filter(
      (projection) =>
        projection.status === "active" &&
        projection.targetPath === targetPath &&
        !this.matchesAction(projection, action),
    );
    if (samePathProjections.length === 0) {
      return false;
    }

    return samePathProjections.some((projection) => {
      const plannedAction = actions.find(
        (candidate) =>
          candidate.sourceId === projection.sourceId &&
          candidate.leafId === projection.leafId &&
          candidate.target === projection.target,
      );
      return plannedAction?.kind !== "remove";
    });
  }

  private matchesAction(projection: ProjectionRecordV2, action: DeploymentAction): boolean {
    return (
      projection.sourceId === action.sourceId &&
      projection.leafId === action.leafId &&
      projection.target === action.target
    );
  }

  private assertManagedTargetPath(
    target: DeploymentAction["target"],
    targetPath: string,
    targetRoots: Map<DeploymentAction["target"], string>,
    explicitRootPath?: string,
  ) {
    const roots = [
      explicitRootPath,
      targetRoots.get(target),
    ].filter((value): value is string => Boolean(value));
    if (roots.length === 0) {
      throw new Error(`Managed target root is unavailable for ${target}.`);
    }

    if (!roots.some((rootPath) => isPathInside(rootPath, targetPath))) {
      throw new Error(`Refusing to modify path outside managed root for ${target}: ${targetPath}`);
    }
  }
}

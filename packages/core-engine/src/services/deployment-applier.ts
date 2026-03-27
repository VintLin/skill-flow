import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentAction,
  DeploymentRecord,
  LockFile,
  Result,
} from "@skill-flow/domain/types";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import { copyDirectory, createSymlink, ensureDir, isPathInside, pathExists, removePath } from "@skill-flow/integration/utils/fs";
import { ok } from "@skill-flow/integration/utils/result";

export class DeploymentApplier {
  constructor(private readonly adapters: ChannelAdapter[] = []) {}

  async applyPlan(
    lockFile: LockFile,
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
        if (await pathExists(action.targetPath)) {
          await removePath(action.targetPath);
        }
        lockFile.deployments = lockFile.deployments.filter(
          (deployment) =>
            !(
              deployment.sourceId === action.sourceId &&
              deployment.leafId === action.leafId &&
              deployment.target === action.target
            ),
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
        await removePath(action.previousTargetPath);
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

      const nextRecord: DeploymentRecord = {
        sourceId: action.sourceId,
        leafId: action.leafId,
        target: action.target,
        targetPath: action.targetPath,
        ...(action.targetRootPath ? { targetRootPath: action.targetRootPath } : {}),
        strategy: action.strategy,
        status: "active",
        contentHash: action.contentHash,
        appliedAt: new Date().toISOString(),
      };

      lockFile.deployments = [
        ...lockFile.deployments.filter(
          (deployment) =>
            !(
              deployment.sourceId === action.sourceId &&
              deployment.leafId === action.leafId &&
              deployment.target === action.target
            ),
        ),
        nextRecord,
      ];
      applied.push(action);
    }

    return ok({ applied });
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

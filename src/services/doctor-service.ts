import fs from "node:fs/promises";
import { createChannelAdapters } from "../adapters/channel-adapters.js";
import type {
  DoctorIssue,
  DoctorReport,
  LockFile,
  Manifest,
  Result,
} from "../domain/types.js";
import { hashDirectory, isBrokenSymlink, pathExists } from "../utils/fs.js";
import { ok } from "../utils/result.js";

export class DoctorService {
  private readonly adapters = createChannelAdapters();

  async run(manifest: Manifest, lockFile: LockFile): Promise<Result<DoctorReport>> {
    const issues: DoctorIssue[] = [];

    for (const source of manifest.sources) {
      const binding = manifest.bindings[source.id] ?? { targets: {} };

      for (const adapter of this.adapters) {
        const configured = binding.targets[adapter.target];
        if (!configured?.enabled) {
          continue;
        }

        const detection = await adapter.detect();
        if (!detection.available) {
          issues.push({
            severity: "error",
            sourceId: source.id,
            target: adapter.target,
            code: "TARGET_UNAVAILABLE",
            message: detection.reason ?? "Target is unavailable.",
          });
          continue;
        }

        for (const leafId of configured.leafIds) {
          const leaf = lockFile.leafInventory.find((item) => item.id === leafId);
          const deployment = lockFile.deployments.find(
            (item) =>
              item.sourceId === source.id &&
              item.leafId === leafId &&
              item.target === adapter.target,
          );

          if (!leaf) {
            issues.push({
              severity: "error",
              sourceId: source.id,
              target: adapter.target,
              leafId,
              code: "LEAF_MISSING",
              message: "This saved selection no longer exists in the source inventory.",
            });
            continue;
          }

          const targetPath = adapter.resolveTargetPath(detection.rootPath, leaf);
          if (!deployment) {
            issues.push({
              severity: "warning",
              sourceId: source.id,
              target: adapter.target,
              leafId,
              code: "DRIFT_NOT_DEPLOYED",
              message: "This selected skill is not currently projected to disk.",
            });
            continue;
          }

          if (!(await pathExists(targetPath))) {
            issues.push({
              severity: "error",
              sourceId: source.id,
              target: adapter.target,
              leafId,
              code: "TARGET_MISSING",
              message: "Projected target is missing on disk.",
            });
            continue;
          }

          if (deployment.strategy === "symlink") {
            const stats = await fs.lstat(targetPath);
            if (!stats.isSymbolicLink()) {
              issues.push({
                severity: "warning",
                sourceId: source.id,
                target: adapter.target,
                leafId,
                code: "DRIFT_TYPE",
                message: "Expected a symlink, but found foreign content.",
              });
              continue;
            }

            if (await isBrokenSymlink(targetPath)) {
              issues.push({
                severity: "error",
                sourceId: source.id,
                target: adapter.target,
                leafId,
                code: "BROKEN_SYMLINK",
                message: "Projected symlink is broken.",
              });
            }
          } else {
            const onDiskHash = await hashDirectory(targetPath);
            if (onDiskHash !== deployment.contentHash) {
              issues.push({
                severity: "warning",
                sourceId: source.id,
                target: adapter.target,
                leafId,
                code: "DRIFT_COPY",
                message: "Projected copy no longer matches saved state.",
              });
            }
          }
        }
      }
    }

    for (const deployment of lockFile.deployments) {
      const sourceStillExists = manifest.sources.some(
        (source) => source.id === deployment.sourceId,
      );
      if (!sourceStillExists) {
        issues.push({
          severity: "warning",
          sourceId: deployment.sourceId,
          target: deployment.target,
          leafId: deployment.leafId,
          code: "STALE_DEPLOYMENT",
          message: "Saved deployment exists for a workflow group that is no longer registered.",
        });
      }
    }

    const hasError = issues.some((issue) => issue.severity === "error");
    const hasWarning = issues.some((issue) => issue.severity === "warning");
    const status: DoctorReport["status"] = hasError
      ? "BLOCKED"
      : hasWarning
        ? "PARTIAL"
        : "HEALTHY";

    return ok({ status, issues });
  }
}

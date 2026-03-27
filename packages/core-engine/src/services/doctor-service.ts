import path from "node:path";
import fs from "node:fs/promises";
import { createChannelAdapters } from "@skill-flow/integration/adapters/channel-adapters";
import type {
  DoctorIssue,
  DoctorReport,
  LockFile,
  Manifest,
  Result,
} from "@skill-flow/domain/types";
import { hashDirectory, isBrokenSymlink, pathExists } from "@skill-flow/integration/utils/fs";
import { formatGroupLabel } from "@skill-flow/integration/utils/naming";
import { ok } from "@skill-flow/integration/utils/result";

export class DoctorService {
  private readonly adapters = createChannelAdapters();

  async run(manifest: Manifest, lockFile: LockFile): Promise<Result<DoctorReport>> {
    const issues: DoctorIssue[] = [];

    for (const source of manifest.sources) {
      const binding = manifest.bindings[source.id] ?? { targets: {} };
      const sourceLock = lockFile.sources.find((item) => item.id === source.id);
      const invalidLeafPaths = new Set(
        sourceLock?.invalidLeafs.map((leaf) => leaf.path) ?? [],
      );

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
            sourceLabel: formatGroupLabel(source),
            target: adapter.target,
            code: "TARGET_UNAVAILABLE",
            message: detection.reason ?? "Target is unavailable.",
          });
          continue;
        }

        for (const leafId of configured.leafIds) {
          const selectedPath = this.getLeafPath(source.id, leafId);
          if (selectedPath && invalidLeafPaths.has(selectedPath)) {
            issues.push({
              severity: "error",
              sourceId: source.id,
              sourceLabel: formatGroupLabel(source),
              target: adapter.target,
              leafId,
              leafLabel: path.basename(selectedPath) || selectedPath,
              code: "INVALIDATED_SELECTED_LEAF",
              message: "This selected skill is invalid in the current source inventory.",
            });
            continue;
          }

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
              sourceLabel: formatGroupLabel(source),
              target: adapter.target,
              leafId,
              code: "LEAF_MISSING",
              message: "This saved selection no longer exists in the source inventory.",
            });
            continue;
          }

          const targetPath = deployment?.targetPath ?? adapter.resolveTargetPath(
            detection.rootPath,
            leaf.linkName,
          );
          if (!deployment) {
            issues.push({
              severity: "warning",
              sourceId: source.id,
              sourceLabel: formatGroupLabel(source),
              target: adapter.target,
              leafId,
              leafLabel: leaf.linkName,
              code: "DRIFT_NOT_DEPLOYED",
              message: "This selected skill is not currently projected to disk.",
            });
            continue;
          }

          if (!(await pathExists(targetPath))) {
            issues.push({
              severity: "error",
              sourceId: source.id,
              sourceLabel: formatGroupLabel(source),
              target: adapter.target,
              leafId,
              leafLabel: leaf.linkName,
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
                sourceLabel: formatGroupLabel(source),
                target: adapter.target,
                leafId,
                leafLabel: leaf.linkName,
                code: "DRIFT_TYPE",
                message: "Expected a symlink, but found foreign content.",
              });
              continue;
            }

            if (await isBrokenSymlink(targetPath)) {
              issues.push({
                severity: "error",
                sourceId: source.id,
                sourceLabel: formatGroupLabel(source),
                target: adapter.target,
                leafId,
                leafLabel: leaf.linkName,
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
                sourceLabel: formatGroupLabel(source),
                target: adapter.target,
                leafId,
                leafLabel: leaf.linkName,
                code: "DRIFT_COPY",
                message: "Projected copy no longer matches saved state.",
              });
            }
          }
        }
      }
    }

    await this.reportUnmanagedExternalSkills(lockFile, issues);

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
          message: "Saved deployment exists for a skills group that is no longer registered.",
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

  private getLeafPath(sourceId: string, leafId: string) {
    const prefix = `${sourceId}:`;
    if (!leafId.startsWith(prefix)) {
      return undefined;
    }
    return leafId.slice(prefix.length);
  }

  private async reportUnmanagedExternalSkills(
    lockFile: LockFile,
    issues: DoctorIssue[],
  ): Promise<void> {
    const managedTargetPaths = new Set(
      lockFile.deployments.map((deployment) => path.resolve(deployment.targetPath)),
    );
    const seenPaths = new Set<string>();

    for (const adapter of this.adapters) {
      const detection = await adapter.detect();
      if (!detection.available) {
        continue;
      }

      const entries = await fs.readdir(detection.rootPath, { withFileTypes: true });
      for (const entry of entries) {
        const skillDir = path.join(detection.rootPath, entry.name);
        const isDirectoryLike =
          entry.isDirectory() ||
          (entry.isSymbolicLink() &&
            (await fs.stat(skillDir).then((stats) => stats.isDirectory()).catch(() => false)));
        if (!isDirectoryLike) {
          continue;
        }

        if (!(await pathExists(path.join(skillDir, "SKILL.md")))) {
          continue;
        }

        const resolvedPath = await fs.realpath(skillDir).catch(() => path.resolve(skillDir));
        if (managedTargetPaths.has(path.resolve(skillDir)) || seenPaths.has(resolvedPath)) {
          continue;
        }

        seenPaths.add(resolvedPath);
        issues.push({
          severity: "warning",
          sourceId: `unmanaged:${adapter.target}:${entry.name}`,
          sourceLabel: "Unmanaged external skill",
          target: adapter.target,
          leafLabel: entry.name,
          code: "UNMANAGED_EXTERNAL_TARGET_SKILL",
          message: `Unmanaged skill discovered at ${resolvedPath}.`,
        });
      }
    }
  }
}

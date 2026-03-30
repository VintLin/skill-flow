import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DeploymentTargetName, LockFile, Manifest } from "@skill-flow/domain/types";
import { getManagedDeployments } from "@skill-flow/domain/projection-compat";
import { getTargetScanRoots, TARGET_DEFINITIONS, TARGET_ORDER } from "@skill-flow/integration/utils/constants";
import { hashDirectory, pathExists, readJsonFile } from "@skill-flow/integration/utils/fs";
import { deriveSourceId } from "@skill-flow/integration/utils/source-id";
import { StateStore } from "@skill-flow/storage/store";

export type BootstrapEvent = {
  phase:
    | "detect-targets"
    | "scan-external-roots"
    | "import-unmanaged-skills"
    | "refresh-sources"
    | "normalize-bindings"
    | "audit-projections"
    | "build-summaries"
    | "done";
  level: "info" | "warning" | "error" | "success";
  message: string;
};

export type DetectedExternalSkill = {
  path: string;
  displayName: string;
  sourceId: string;
  importedFromTargets: DeploymentTargetName[];
  observedTargets: Array<{
    target: DeploymentTargetName;
    rootPath: string;
    targetPath: string;
  }>;
  originLocator?: string;
  originRequestedPath?: string;
  originBranch?: string;
};

type AgentsLockFile = {
  skills?: Record<
    string,
    {
      source?: string;
      sourceType?: string;
      sourceUrl?: string;
      skillPath?: string;
      branch?: string;
      sourceBranch?: string;
    }
  >;
};

type AgentsOrigin = {
  originLocator: string | undefined;
  originRequestedPath: string | undefined;
  originBranch: string | undefined;
};

export class WorkspaceBootstrapService {
  constructor(private readonly store: StateStore) {}

  async detectUnmanagedExternalSkills(
    manifest: Manifest,
    lockFile: LockFile,
    onEvent?: (event: BootstrapEvent) => void,
  ): Promise<DetectedExternalSkill[]> {
    const managedLocators = new Set(
      manifest.sources
        .filter((source) => source.kind === "local")
        .map((source) => path.resolve(source.locator)),
    );
    const managedCheckouts = new Set(
      lockFile.sources.map((source) => path.resolve(source.checkoutPath)),
    );
    const managedTargetPaths = new Set(
      getManagedDeployments(lockFile).map((deployment) => path.resolve(deployment.targetPath)),
    );
    const agentsOrigins = await this.readAgentsOrigins();
    const grouped = new Map<
      string,
      {
        path: string;
        displayName: string;
        hash: string;
        targets: Set<DeploymentTargetName>;
        observedTargets: Array<{
          target: DeploymentTargetName;
          rootPath: string;
          targetPath: string;
        }>;
        origin: AgentsOrigin | undefined;
      }
    >();

    onEvent?.({
      phase: "scan-external-roots",
      level: "info",
      message: "Scanning detected agent roots for unmanaged skills...",
    });

    for (const target of TARGET_ORDER) {
      const roots = getTargetScanRoots(target).map((root) => path.resolve(root));
      for (const root of roots) {
        if (!(await pathExists(root))) {
          continue;
        }

        const entries = await fs.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          const skillDir = path.join(root, entry.name);
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
          if (this.isUnderSkillFlowStore(resolvedPath)) {
            continue;
          }
          if (
            managedLocators.has(resolvedPath) ||
            managedCheckouts.has(resolvedPath) ||
            managedTargetPaths.has(resolvedPath)
          ) {
            continue;
          }

          const contentHash = await hashDirectory(resolvedPath);
          const groupKey = `${resolvedPath}\n${contentHash}`;
          const current = grouped.get(groupKey);
          if (current) {
            current.targets.add(target);
            current.observedTargets.push({
              target,
              rootPath: root,
              targetPath: skillDir,
            });
            continue;
          }

          grouped.set(groupKey, {
            path: resolvedPath,
            displayName: entry.name,
            hash: contentHash,
            targets: new Set([target]),
            observedTargets: [{
              target,
              rootPath: root,
              targetPath: skillDir,
            }],
            origin: agentsOrigins.get(entry.name),
          });
        }
      }
    }

    const takenSourceIds = new Set(manifest.sources.map((source) => source.id));
    const results: DetectedExternalSkill[] = [];

    for (const item of grouped.values()) {
      const baseId = deriveSourceId(item.path);
      const sourceId = this.allocateSourceId(baseId, item.targets, takenSourceIds);
      takenSourceIds.add(sourceId);
      results.push({
        path: item.path,
        displayName: item.displayName,
        sourceId,
        importedFromTargets: TARGET_ORDER.filter((target) => item.targets.has(target)),
        observedTargets: [...item.observedTargets],
        ...(item.origin?.originLocator ? { originLocator: item.origin.originLocator } : {}),
        ...(item.origin?.originRequestedPath
          ? { originRequestedPath: item.origin.originRequestedPath }
          : {}),
        ...(item.origin?.originBranch ? { originBranch: item.origin.originBranch } : {}),
      });
    }

    return results.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  private isUnderSkillFlowStore(candidatePath: string) {
    const relative = path.relative(this.store.rootPath, candidatePath);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  private allocateSourceId(
    baseId: string,
    targets: Set<DeploymentTargetName>,
    takenSourceIds: Set<string>,
  ) {
    if (!takenSourceIds.has(baseId)) {
      return baseId;
    }

    for (const target of TARGET_ORDER) {
      if (!targets.has(target)) {
        continue;
      }
      const suffixed = `${baseId}-${TARGET_DEFINITIONS[target].writerKey}`;
      if (!takenSourceIds.has(suffixed)) {
        return suffixed;
      }
    }

    let index = 2;
    while (takenSourceIds.has(`${baseId}-${index}`)) {
      index += 1;
    }
    return `${baseId}-${index}`;
  }

  private async readAgentsOrigins(): Promise<Map<string, AgentsOrigin>> {
    const lockPath = path.join(os.homedir(), ".agents", ".skill-lock.json");
    const lockFile = await readJsonFile<AgentsLockFile>(lockPath, {});
    const results = new Map<string, AgentsOrigin>();

    for (const [name, record] of Object.entries(lockFile.skills ?? {})) {
      if (!record || record.sourceType !== "github") {
        continue;
      }
      results.set(name, {
        originLocator: record.source ? `https://github.com/${record.source}.git` : undefined,
        originRequestedPath: record.skillPath,
        originBranch: record.branch ?? record.sourceBranch ?? this.parseBranchFromSourceUrl(record.sourceUrl),
      });
    }

    return results;
  }

  private parseBranchFromSourceUrl(sourceUrl?: string) {
    if (!sourceUrl) {
      return undefined;
    }
    const treeIndex = sourceUrl.indexOf("/tree/");
    if (treeIndex === -1) {
      return undefined;
    }
    const tail = sourceUrl.slice(treeIndex + "/tree/".length);
    return tail.split("/")[0] || undefined;
  }
}

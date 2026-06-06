import fs from "node:fs/promises";
import path from "node:path";
import type { DeploymentTargetName, LockFile, Manifest } from "@skill-flow/domain/types";
import { getManagedDeployments } from "@skill-flow/domain/projection-compat";
import { getTargetScanRoots, TARGET_DEFINITIONS, TARGET_ORDER } from "@skill-flow/integration/utils/constants";
import { hashDirectory, pathExists } from "@skill-flow/integration/utils/fs";
import { deriveSourceId } from "@skill-flow/integration/utils/source-id";
import {
  type AgentsOrigin,
  type AgentsOriginReader,
} from "./legacy-agents-lock.js";

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
  contentHash: string;
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

export type LocalSkillScanResult = DetectedExternalSkill & {
  title: string;
  description: string;
};

export type WorkspaceBootstrapServiceOptions = {
  stateRoot: string;
  agentsOriginReader?: AgentsOriginReader;
};

export class WorkspaceBootstrapService {
  private readonly stateRoot: string;
  private readonly agentsOriginReader: AgentsOriginReader;

  constructor(options: WorkspaceBootstrapServiceOptions) {
    this.stateRoot = options.stateRoot;
    this.agentsOriginReader = options.agentsOriginReader ?? {
      readAgentsLockOrigins: async () => new Map(),
    };
  }

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
    const agentsOrigins = await this.agentsOriginReader.readAgentsLockOrigins();
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
        contentHash: item.hash,
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

  async scanUnmanagedLocalSkills(
    manifest: Manifest,
    lockFile: LockFile,
    onEvent?: (event: BootstrapEvent) => void,
  ): Promise<LocalSkillScanResult[]> {
    const detected = await this.detectUnmanagedExternalSkills(manifest, lockFile, onEvent);
    const enriched: LocalSkillScanResult[] = [];

    for (const item of detected) {
      const metadata = await this.readSkillMetadata(
        path.join(item.path, "SKILL.md"),
        item.displayName,
      );
      enriched.push({
        ...item,
        title: metadata.title,
        description: metadata.description,
      });
    }

    return enriched;
  }

  private isUnderSkillFlowStore(candidatePath: string) {
    const relative = path.relative(this.stateRoot, candidatePath);
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

  private async readSkillMetadata(
    skillFilePath: string,
    fallbackName: string,
  ): Promise<{ title: string; description: string }> {
    const content = (await fs.readFile(skillFilePath, "utf8").catch(() => "")).replace(
      /\r\n?/g,
      "\n",
    );
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    const body = frontmatter?.[1] ?? "";
    const nameMatch = body.match(/^name:\s*(.+)$/m);
    const descriptionBlock = body.match(/^description:\s*\|\s*\n((?:\s+.+\n?)*)/m);
    const descriptionLine = body.match(/^description:\s*(.+)$/m);
    const title = nameMatch?.[1]?.trim() || fallbackName;
    const description = descriptionBlock?.[1]
      ? descriptionBlock[1].split("\n").map((line) => line.trim()).filter(Boolean).join(" ")
      : descriptionLine?.[1]?.trim() ?? "";

    return { title, description };
  }
}

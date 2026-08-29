import fs from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentTargetName,
  ProjectionRecord,
  LockFile,
  ManifestFile,
} from "@skill-flow/domain/types";
import { getTargetScanRoots, TARGET_DEFINITIONS, TARGET_ORDER } from "@skill-flow/integration/utils/constants";
import { hashDirectory, pathExists } from "@skill-flow/integration/utils/fs";
import { deriveSourceId } from "@skill-flow/integration/utils/source-id";
import { parseSkillFrontmatter } from "./skill-frontmatter.js";

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
};

export type LocalSkillScanResult = DetectedExternalSkill & {
  title: string;
  description: string;
};

export type WorkspaceBootstrapServiceOptions = {
  stateRoot: string;
};

export class WorkspaceBootstrapService {
  private readonly stateRoot: string;

  constructor(options: WorkspaceBootstrapServiceOptions) {
    this.stateRoot = options.stateRoot;
  }

  async detectUnmanagedExternalSkills(
    manifest: ManifestFile,
    lockFile: LockFile,
    onEvent?: (event: BootstrapEvent) => void,
  ): Promise<DetectedExternalSkill[]> {
    const managedLocators = new Set(
      manifest.sources
        .filter((source) => source.kind === "local")
        .map((source) => path.resolve(source.locator)),
    );
    const managedCheckouts = new Set(
      sourceLocks(lockFile).map((source) => path.resolve(source.localPath)),
    );
    const managedTargetPaths = new Set(
      activeProjections(lockFile).map((deployment) => path.resolve(deployment.targetPath)),
    );
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
      });
    }

    return results.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async scanUnmanagedLocalSkills(
    manifest: ManifestFile,
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
    const frontmatter = parseSkillFrontmatter(content);
    const title = frontmatter?.data.name?.trim() || fallbackName;
    const description = frontmatter?.data.description?.trim() ?? "";

    return { title, description };
  }
}

function sourceLocks(lockFile: LockFile): Array<{ sourceId: string; localPath: string }> {
  return Object.values(lockFile.sources).map((source) => ({
    sourceId: source.sourceId,
    localPath: source.localPath,
  }));
}

function activeProjections(lockFile: LockFile): ProjectionRecord[] {
  return lockFile.projections.filter((projection) => projection.status === "active");
}

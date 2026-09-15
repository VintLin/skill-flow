import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent, Stats } from "node:fs";
import type { DoctorIssue, DoctorReport, DeploymentTargetName, LeafRecord, MergedTargetDefinition, ProjectCheckRoot } from "@skill-flow/domain/types";
import { hashDirectory, isPathInside } from "@skill-flow/integration/utils/fs";
import { buildProjectedSkillNameCandidates, getHostedGitOwner } from "@skill-flow/integration/utils/naming";
import { getMergedTargetDefinitions, resolveDocumentedProjectSkillPath } from "@skill-flow/integration/utils/constants";
import type { StateStore } from "@skill-flow/storage/state-store";
import { inspectProjectCopy } from "./project-copy-inspection.js";
import { inspectExternalProjectSkill } from "./project-external-inspection.js";
import { inspectProjectSkillDirectory, inspectProjectSymlink } from "./project-skill-inspection.js";
import { DeploymentReconciler } from "./deployment-reconciler.js";

export type ExpectedProjectSkill = {
  path: string;
  leaf: LeafRecord;
  definition: MergedTargetDefinition;
  issue: Pick<DoctorIssue, "sourceId" | "sourceLabel" | "leafId" | "leafLabel" | "target" | "targets" | "path">;
};

export type ProjectInspection = {
  issues: DoctorIssue[];
  incomplete(path: string, error: unknown, context?: Partial<DoctorIssue>): void;
};

export function isMissing(error: unknown): boolean {
  return ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "");
}

export function projectDoctorStatus(issues: DoctorIssue[]): DoctorReport["status"] {
  return issues.some((issue) => issue.severity === "error") ? "BLOCKED"
    : issues.some((issue) => issue.severity === "warning") ? "PARTIAL" : "HEALTHY";
}

/** No runtime bootstrap, registration, reconciliation, audit, or repair belongs here. */
export async function checkProjectHealth(requestedPath: string, store: StateStore): Promise<DoctorReport> {
  const issues: DoctorIssue[] = [];
  const roots: ProjectCheckRoot[] = [];
  let complete = true;
  const normalizedPath = requestedPath.trim();
  // Keep an empty path attributable as unavailable; path.resolve("") would
  // incorrectly turn it into the process working directory.
  let projectPath = normalizedPath ? path.resolve(normalizedPath) : "";
  let managedSkillCount = 0;
  let externalSkillCount = 0;
  const inspection: ProjectInspection = {
    issues,
    incomplete(affectedPath, error, context = {}) {
      complete = false;
      const message = `Unable to inspect ${affectedPath}: ${String(error)}`;
      if (issues.some((issue) => issue.code === "PROJECT_CHECK_INCOMPLETE" && issue.path === affectedPath && issue.message === message)) return;
      issues.push({ sourceId: "project", ...context, path: affectedPath, severity: "warning",
        code: "PROJECT_CHECK_INCOMPLETE", message });
    },
  };
  const finish = (baseline: "available" | "unavailable", projectId?: string): DoctorReport => ({
    status: projectDoctorStatus(issues), issues, scope: "project", projectPath,
    ...(projectId ? { projectId } : {}), baseline, coverage: { complete, roots },
    managedSkillCount, externalSkillCount,
  });
  try {
    if (!normalizedPath) throw new Error("Project path is empty");
    projectPath = await fs.realpath(projectPath);
    if (!(await fs.stat(projectPath)).isDirectory()) throw new Error("Project path is not a directory");
  } catch (error) {
    complete = false;
    issues.push({ sourceId: "project", path: projectPath, severity: "error", code: "PROJECT_PATH_UNAVAILABLE",
      message: `Project path is unavailable: ${String(error)}` });
    return finish("unavailable");
  }

  const state = await store.readStateReadonly().catch((error) => {
    inspection.incomplete(store.rootPath, error);
    return undefined;
  });
  let projectId: string | undefined;
  for (const project of state?.preferences.recentProjects ?? []) {
    if (!project.projectPath) continue;
    const candidate = await fs.realpath(project.projectPath).catch(() => path.resolve(project.projectPath!));
    if (candidate === projectPath) { projectId = project.projectId; break; }
  }
  const drafts = projectId ? state?.preferences.projectSourceDrafts[projectId] : undefined;
  const baseline = drafts && Object.keys(drafts).length > 0 ? "available" : "unavailable";
  if (baseline === "unavailable") issues.push({ sourceId: "project", path: projectPath, severity: "warning",
    code: "PROJECT_BASELINE_UNAVAILABLE", message: "No successful project application baseline; deployment completeness is unknown. Disk inspection continues." });

  const definitions = getMergedTargetDefinitions(state?.preferences.customTargets ?? [], state?.preferences.agentDisplayOrder ?? []);
  const rootsByIdentity = new Map<string, ProjectCheckRoot>();
  const rootForTarget = new Map<string, ProjectCheckRoot>();
  for (const definition of definitions) {
    const rootPath = definition.kind === "builtin"
      ? resolveDocumentedProjectSkillPath(definition.id as DeploymentTargetName, projectPath)
      : definition.projectPathTemplate ? path.join(projectPath, definition.projectPathTemplate) : null;
    if (!rootPath) continue;
    if (!isPathInside(projectPath, rootPath)) {
      inspection.incomplete(rootPath, "Configured Skill root is outside the project", { target: definition.id });
      continue;
    }
    let identity = path.resolve(rootPath);
    try { identity = await fs.realpath(rootPath); } catch { /* readdir below classifies absence and read failures */ }
    let root = rootsByIdentity.get(identity);
    if (!root) {
      root = { path: identity, targets: [], status: "scanned" };
      rootsByIdentity.set(identity, root);
      roots.push(root);
    }
    root.targets.push(definition.id);
    rootForTarget.set(definition.id, root);
  }

  const expected = new Map<string, ExpectedProjectSkill>();
  if (state && drafts) {
    const scopedManifest = { ...state.manifest, bindings: Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, {
      sourceId: id, enabledTargets: draft.enabledTargets, selectedLeafIds: draft.selectedLeafIds, selectionMode: "selected" as const,
    }])) };
    const names = new DeploymentReconciler().projectedLinkNameMaps(scopedManifest, state.lockFile);
    for (const [sourceId, draft] of Object.entries(drafts)) {
      for (const target of draft.enabledTargets) {
        const root = rootForTarget.get(target);
        const definition = definitions.find((item) => item.id === target);
        if (!root || !definition) {
          if (draft.selectedLeafIds.length) inspection.incomplete(projectPath, `Agent '${target}' has no supported project root`, { sourceId, target });
          continue;
        }
        for (const leafId of draft.selectedLeafIds) {
          const leaf = state.lockFile.leafInventory.find((item) => item.id === leafId);
          const context = { sourceId, sourceLabel: state.manifest.sources.find((item) => item.id === sourceId)?.displayName ?? sourceId,
            leafId, target, targets: root.targets };
          if (!leaf) {
            issues.push({ ...context, path: root.path, severity: "error", code: "PROJECT_SKILL_MISSING", message: "Applied Skill is missing from the current source inventory." });
            continue;
          }
          const source = state.manifest.sources.find((item) => item.id === sourceId);
          const candidateNames = buildProjectedSkillNameCandidates({
            preferredName: names.get(target)?.get(leafId) ?? leaf.linkName,
            groupId: sourceId, groupName: source?.displayName ?? sourceId,
            groupAuthor: source ? getHostedGitOwner(source.locator) : undefined,
            skillName: leaf.linkName,
          });
          // Earlier applications can retain a short name when later groups disambiguate.
          const candidates = [...new Set([...candidateNames, leaf.linkName])]
            .map((name) => path.join(root.path, name)).filter((candidate) => isPathInside(root.path, candidate));
          const otherLeaves = Object.values(drafts)
            .filter((applied) => applied.enabledTargets.some((agent) => rootForTarget.get(agent) === root))
            .flatMap((applied) => applied.selectedLeafIds)
            .filter((id) => id !== leaf.id)
            .map((id) => state.lockFile.leafInventory.find((item) => item.id === id))
            .filter((item): item is LeafRecord => item !== undefined);
          const targetPath = await resolveExpectedProjectPath(candidates, leaf, definition, expected, inspection, context, otherLeaves);
          if (!targetPath) {
            inspection.incomplete(root.path, "No safe deployment name is available", context);
            continue;
          }
          const previous = expected.get(targetPath);
          if (previous) {
            if (previous.leaf.id !== leafId || previous.definition.strategy !== definition.strategy) {
              issues.push({ ...context, path: targetPath, severity: "error", code: "PROJECT_PATH_CONFLICT", message: "Multiple incompatible deployments expect the same project path." });
            }
            continue;
          }
          expected.set(targetPath, { path: targetPath, leaf, definition, issue: { ...context, leafLabel: leaf.linkName, path: targetPath } });
        }
      }
    }
  }

  const scannedEntries = new Map<ProjectCheckRoot, Dirent[]>();
  for (const root of roots) {
    try {
      scannedEntries.set(root, await fs.readdir(root.path, { withFileTypes: true }));
    } catch (error) {
      let absent = false;
      let reason = error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        try { absent = await confirmedAbsentRoot(root.path, projectPath); }
        catch (inspectionError) { reason = inspectionError; }
      }
      if (absent) root.status = "absent";
      else {
        root.status = "unreadable";
        inspection.incomplete(root.path, reason, { targets: root.targets });
      }
    }
  }
  for (const entry of expected.values()) {
    if (rootsByIdentity.get(path.dirname(entry.path))?.status === "unreadable") continue;
    let stats: Stats;
    try { stats = await fs.lstat(entry.path); } catch (error) {
      if (isMissing(error)) issues.push({ ...entry.issue, severity: "error", code: "PROJECT_DEPLOYMENT_MISSING", message: "Expected project deployment is missing on disk." });
      else inspection.incomplete(entry.path, error, entry.issue);
      continue;
    }
    managedSkillCount++;
    const expectedType = entry.definition.strategy === "symlink" ? stats.isSymbolicLink() : stats.isDirectory();
    if (!expectedType) {
      issues.push({ ...entry.issue, severity: "error", code: "PROJECT_PATH_CONFLICT",
        message: `Expected a ${entry.definition.strategy === "symlink" ? "symlink" : "directory copy"}, but the deployment path contains another entry type.` });
      continue;
    }
    if (entry.definition.strategy === "symlink") await inspectProjectSymlink(entry, inspection);
    else {
      await inspectProjectSkillDirectory(entry.path, inspection, entry.issue);
      await inspectProjectCopy(entry, inspection);
    }
  }
  for (const [root, entries] of scannedEntries) {
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const skillPath = path.join(root.path, entry.name);
      if (expected.has(skillPath)) continue;
      if (await inspectExternalProjectSkill(skillPath, root.targets, inspection)) externalSkillCount++;
    }
  }
  return finish(baseline, projectId);
}

/** Inspect naming alternatives without adopting a same-named, valid foreign Skill. */
async function resolveExpectedProjectPath(
  candidates: string[], leaf: LeafRecord, definition: MergedTargetDefinition,
  expected: Map<string, ExpectedProjectSkill>, inspection: ProjectInspection, context: Partial<DoctorIssue>,
  otherLeaves: LeafRecord[],
): Promise<string | undefined> {
  let occupied: string | undefined;
  let matched: string | undefined;
  const observed = new Map<string, Stats>();
  for (const candidate of candidates) {
    const reserved = expected.get(candidate);
    if (reserved) {
      if (reserved.leaf.id === leaf.id) return candidate;
      continue;
    }
    let stats: Stats;
    try { stats = await fs.lstat(candidate); } catch (error) {
      if (!isMissing(error)) {
        inspection.incomplete(candidate, error, context);
        occupied ??= candidate;
      }
      continue;
    }
    // A different applied Skill can retain the shared short name. Do not let
    // draft insertion order turn its independently identifiable entry ambiguous.
    try {
      if (stats.isSymbolicLink()) {
        const linked = path.resolve(path.dirname(candidate), await fs.readlink(candidate));
        if (linked !== path.resolve(leaf.absolutePath) && otherLeaves.some((other) => linked === path.resolve(other.absolutePath))) continue;
      } else if (definition.strategy === "copy" && stats.isDirectory() && otherLeaves.length) {
        const contentHash = await hashDirectory(candidate, { symlinkPolicy: "preserve-safe" });
        if (contentHash !== leaf.contentHash && otherLeaves.some((other) => contentHash === other.contentHash)) continue;
      }
    } catch { /* Keep unknown entries for the diagnostic pass. */ }
    occupied ??= candidate;
    observed.set(candidate, stats);
    try {
      if (definition.strategy === "symlink" && stats.isSymbolicLink()) {
        const linked = path.resolve(path.dirname(candidate), await fs.readlink(candidate));
        if (linked === path.resolve(leaf.absolutePath)) matched ??= candidate;
        else {
          const actual = await fs.realpath(candidate);
          if (actual === await fs.realpath(leaf.absolutePath)) matched ??= candidate;
        }
      } else if (definition.strategy === "copy" && stats.isDirectory()) {
        // A content match is additional evidence for an old naming alternative.
        if (await hashDirectory(candidate, { symlinkPolicy: "preserve-safe" }) === leaf.contentHash) matched ??= candidate;
      }
    } catch {
      // Retain the observed entry; the diagnostic pass distinguishes damage from read failure.
    }
  }
  const selected = matched ?? occupied ?? candidates.find((candidate) => !expected.has(candidate)) ?? candidates[0];
  if (observed.size > 1) {
    inspection.incomplete(path.dirname(candidates[0]!),
      `Deployment path is ambiguous: multiple naming candidates exist (${[...observed.keys()].join(", ")}). Saved selections do not identify which path was applied.`, context);
    if (definition.strategy === "copy") {
      let sourceHash: string | undefined;
      try { sourceHash = await hashDirectory(leaf.absolutePath, { symlinkPolicy: "preserve-safe" }); }
      catch (error) { inspection.incomplete(leaf.absolutePath, error, context); }
      if (sourceHash !== undefined) {
        for (const [candidate, stats] of observed) {
          if (candidate === selected || !stats.isDirectory()) continue;
          try {
            if (await hashDirectory(candidate, { symlinkPolicy: "preserve-safe" }) !== sourceHash) {
              inspection.issues.push({ sourceId: "project", ...context, path: candidate, severity: "warning",
                code: "PROJECT_COPY_DIFFERENT",
                message: "This copy candidate differs from the current source content. Its deployment ownership is uncertain because multiple naming candidates exist; the comparison does not identify which side changed.",
                advice: "Review the candidate paths and source before choosing which content to keep."
                  + (definition.kind === "custom" ? " You can explicitly change this Agent's deployment strategy to symlink and apply it to reflect subsequent changes to the linked local source; this does not update a remote repository." : "") });
            }
          } catch (error) { inspection.incomplete(candidate, error, context); }
        }
      }
    }
  }
  return selected;
}

/** Missing unused roots are normal; broken or unreadable ancestors are a coverage gap. */
async function confirmedAbsentRoot(rootPath: string, projectPath: string): Promise<boolean> {
  let candidate = rootPath;
  while (candidate === projectPath || isPathInside(projectPath, candidate)) {
    let stats: Stats;
    try { stats = await fs.lstat(candidate); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      candidate = path.dirname(candidate);
      continue;
    }
    if (candidate === rootPath) return false;
    return stats.isSymbolicLink() ? (await fs.stat(candidate)).isDirectory() : stats.isDirectory();
  }
  return false;
}

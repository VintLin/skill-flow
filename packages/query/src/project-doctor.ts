import fs from "node:fs/promises";
import path from "node:path";
import type { Stats } from "node:fs";
import type { DoctorIssue, DoctorReport, DeploymentTargetName, LeafRecord, MergedTargetDefinition, ProjectCheckRoot } from "@skill-flow/domain/types";
import { getMergedTargetDefinitions, resolveDocumentedProjectSkillPath } from "@skill-flow/integration/utils/constants";
import type { StateStore } from "@skill-flow/storage/state-store";
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
  let projectPath = path.resolve(requestedPath);
  let managedSkillCount = 0;
  const inspection: ProjectInspection = {
    issues,
    incomplete(affectedPath, error, context = {}) {
      complete = false;
      issues.push({ sourceId: "project", ...context, path: affectedPath, severity: "warning",
        code: "PROJECT_CHECK_INCOMPLETE", message: `Unable to inspect ${affectedPath}: ${String(error)}` });
    },
  };
  const finish = (baseline: "available" | "unavailable", projectId?: string): DoctorReport => ({
    status: projectDoctorStatus(issues), issues, scope: "project", projectPath,
    ...(projectId ? { projectId } : {}), baseline, coverage: { complete, roots },
    managedSkillCount, externalSkillCount: 0,
  });
  try {
    if (!requestedPath.trim()) throw new Error("Project path is empty");
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
          const targetPath = path.join(root.path, names.get(target)?.get(leafId) ?? leaf.linkName);
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

  for (const root of roots) {
    try {
      await fs.readdir(root.path, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !(await fs.lstat(root.path).catch(() => undefined))) root.status = "absent";
      else {
        root.status = "unreadable";
        inspection.incomplete(root.path, error, { targets: root.targets });
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
    else await inspectProjectSkillDirectory(entry.path, inspection, entry.issue);
  }
  complete = false;
  issues.push({ sourceId: "project", severity: "warning", code: "PROJECT_CHECKS_INCOMPLETE", path: projectPath,
    message: "Copy comparison and external Skill validation are not yet complete." });
  return finish(baseline, projectId);
}

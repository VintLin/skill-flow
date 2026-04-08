import type {
  DeploymentAction,
  DeploymentTargetId,
  DoctorIssue,
  SkillCandidate,
  WorkflowSummary,
} from "@skill-flow/domain/types";
import { TARGET_LABELS, TARGET_ORDER } from "./constants.js";
import { buildFindCommand } from "./find-command.js";
import { formatGroupLabel } from "./naming.js";

export function formatWorkflowList(summaries: WorkflowSummary[]): string {
  if (summaries.length === 0) {
    return [
      "No skills groups yet",
      "Add a source to discover a grouped set of related skills.",
    ].join("\n");
  }

  return summaries
    .map((summary) => {
      const invalidCount = summary.lock?.invalidLeafs.length ?? 0;
      const warningCount = summary.leafs.reduce(
        (count, leaf) => count + leaf.metadataWarnings.length,
        0,
      );
      const suffixParts = [];
      if (warningCount > 0) {
        suffixParts.push(`${warningCount} warnings`);
      }
      if (invalidCount > 0) {
        suffixParts.push(`${invalidCount} skipped`);
      }
      const suffix = suffixParts.length > 0 ? `, ${suffixParts.join(", ")}` : "";
      return `${formatGroupLabel(summary.source)}  ${summary.health}  ${summary.leafs.length} skills  ${summary.activeTargetCount} targets${suffix}`;
    })
    .join("\n");
}

export function countActions(actions: DeploymentAction[]): Record<string, number> {
  return actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.kind] = (acc[action.kind] ?? 0) + 1;
    return acc;
  }, {});
}

export function formatActionSummary(actions: DeploymentAction[]): string {
  const counts = countActions(actions);
  return ["create", "update", "remove", "noop", "blocked"]
    .map((kind) => `${kind}:${counts[kind] ?? 0}`)
    .join("  ");
}

export function formatTargetName(target: DeploymentTargetId): string {
  return TARGET_ORDER.includes(target as typeof TARGET_ORDER[number])
    ? TARGET_LABELS[target as typeof TARGET_ORDER[number]]
    : target;
}

export function formatDoctorIssue(issue: DoctorIssue): string {
  const target = issue.target ? ` ${formatTargetName(issue.target)}` : "";
  const leaf = issue.leafLabel
    ? ` skill:${issue.leafLabel}`
    : issue.leafId
      ? ` skill:${issue.leafId}`
      : "";
  return `[${issue.severity.toUpperCase()}] ${issue.sourceLabel ?? issue.sourceId}${target}${leaf} ${issue.message}`;
}

export function formatSkillCandidates(candidates: SkillCandidate[]): string {
  if (candidates.length === 0) {
    return "No matching skills found.";
  }

  return candidates
    .map((candidate, index) => {
      const location = candidate.relativePath ? ` · ${candidate.relativePath}` : "";
      const next = buildFindCommand(candidate);
      return [
        `${index + 1}. ${candidate.title}  ${candidate.source}${candidate.installed ? "  installed" : ""}`,
        candidate.description,
        `${candidate.sourceLabel}${location}`,
        next ? `next: ${next}` : "next: already installed",
      ].join("\n");
    })
    .join("\n\n");
}

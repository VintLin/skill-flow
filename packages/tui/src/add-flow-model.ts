import type {
  DeploymentPlan,
  DeploymentTargetId,
  DraftBinding,
  LeafRecord,
  SourceManifestRecord,
} from "@skill-flow/domain/types";
import { getMergedTargetDefinitionById } from "@skill-flow/integration/utils/constants";
import { countActions, formatActionSummary, formatTargetName } from "@skill-flow/integration/utils/format";
import { formatGroupRef } from "@skill-flow/integration/utils/naming";

export type AddFlowRequest = {
  locator: string;
  path?: string;
  requestedSkills?: string[];
  requestedAgents?: string[];
  yes?: boolean;
  all?: boolean;
};

export type AddChoice = {
  id: string;
  label: string;
  hint?: string;
  description?: string;
};

export const ALL_SKILLS_CHOICE_ID = "__all_skills__";
export const ALL_AGENTS_CHOICE_ID = "__all_agents__";

export type AddFlowPrepared = {
  source: SourceManifestRecord;
  leafs: LeafRecord[];
  availableTargets: DeploymentTargetId[];
  draft: DraftBinding;
  importWarnings: string[];
  requestedPath?: string;
};

export function normalizeRequestedPath(requestedPath?: string): string | undefined {
  if (!requestedPath) {
    return undefined;
  }

  const normalized = requestedPath.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
  return normalized.length > 0 && normalized !== "." ? normalized : undefined;
}

export function buildDefaultSelectedLeafIds(
  leafs: LeafRecord[],
  requestedPath?: string,
): string[] {
  const normalizedPath = normalizeRequestedPath(requestedPath);
  if (!normalizedPath) {
    return leafs.map((leaf) => leaf.id);
  }

  return leafs
    .filter(
      (leaf) =>
        leaf.relativePath === normalizedPath ||
        leaf.relativePath.startsWith(`${normalizedPath}/`),
    )
    .map((leaf) => leaf.id);
}

export function buildLeafChoices(leafs: LeafRecord[]): AddChoice[] {
  return leafs.map((leaf) => ({
    id: leaf.id,
    label: leaf.linkName,
    hint: leaf.relativePath,
    description: leaf.description,
  }));
}

export function buildTargetChoices(
  targets: DeploymentTargetId[],
): AddChoice[] {
  return targets.map((target) => {
    const definition = getMergedTargetDefinitionById(target);
    return {
    id: target,
    label: formatTargetName(target),
    ...(definition?.globalPath
      ? { hint: definition.globalPath }
      : {}),
  };
  });
}

export function withAllChoice(choices: AddChoice[], label: string, id: string): AddChoice[] {
  return [{ id, label }, ...choices];
}

export function filterChoices(choices: AddChoice[], query: string): AddChoice[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) {
    return choices;
  }

  return choices.filter((choice) => {
    const haystack = normalizeSearch(
      [choice.label, choice.hint, choice.description, choice.id].filter(Boolean).join(" "),
    );
    return haystack.includes(normalizedQuery);
  });
}

export function resolveRequestedLeafIds(
  leafs: LeafRecord[],
  requestedSkills: string[],
): { ok: true; value: string[] } | { ok: false; message: string } {
  const resolvedIds: string[] = [];

  for (const requestedSkill of requestedSkills) {
    const match = resolveLeafToken(leafs, requestedSkill);
    if (!match.ok) {
      return match;
    }
    resolvedIds.push(match.value);
  }

  return { ok: true, value: [...new Set(resolvedIds)] };
}

export function resolveRequestedTargets(
  availableTargets: DeploymentTargetId[],
  requestedAgents: string[],
) : { ok: true; value: DeploymentTargetId[] } | { ok: false; message: string } {
  const availableSet = new Set(availableTargets);
  const resolvedTargets: DeploymentTargetId[] = [];

  for (const requestedAgent of requestedAgents) {
    const normalized = normalizeSearch(requestedAgent);
    const matches = availableTargets.filter((target) => {
      if (!availableSet.has(target)) {
        return false;
      }

      return [
        target,
        formatTargetName(target),
      ].some((value) => normalizeSearch(value) === normalized);
    });

    if (matches.length === 0) {
      return {
        ok: false,
        message: `Unknown or unavailable agent '${requestedAgent}'.`,
      };
    }

    resolvedTargets.push(matches[0]!);
  }

  return { ok: true, value: [...new Set(resolvedTargets)] };
}

export function buildInitialDraft(
  leafs: LeafRecord[],
  availableTargets: DeploymentTargetId[],
  options: {
    requestedPath?: string;
    requestedSkills?: string[];
    requestedAgents?: string[];
    yes?: boolean;
    all?: boolean;
  },
): { ok: true; value: DraftBinding } | { ok: false; message: string } {
  const selectedLeafIds = options.requestedSkills?.length
    ? resolveRequestedLeafIds(leafs, options.requestedSkills)
    : {
        ok: true as const,
        value:
          options.all || options.yes
            ? leafs.map((leaf) => leaf.id)
            : buildDefaultSelectedLeafIds(leafs, options.requestedPath),
      };
  if (!selectedLeafIds.ok) {
    return selectedLeafIds;
  }

  const enabledTargets = options.requestedAgents?.length
    ? resolveRequestedTargets(availableTargets, options.requestedAgents)
    : {
        ok: true as const,
        value: [...availableTargets],
      };
  if (!enabledTargets.ok) {
    return enabledTargets;
  }

  return {
    ok: true,
    value: {
      selectedLeafIds: selectedLeafIds.value,
      enabledTargets: enabledTargets.value,
    },
  };
}

export function buildAddCompletionMessage(
  source: SourceManifestRecord,
  draft: DraftBinding,
  leafs: LeafRecord[],
): string {
  const selectedCount = draft.selectedLeafIds.length;
  const targetCount = draft.enabledTargets.length;
  const importedCount = leafs.length;
  const targetSummary =
    targetCount === 0
      ? "no agents enabled"
      : `${targetCount} agent${targetCount === 1 ? "" : "s"} selected`;

  return `Added ${formatGroupRef(source)} with ${selectedCount}/${importedCount} skills enabled, ${targetSummary}.`;
}

export function areAllSelected(selectedIds: readonly string[], allIds: readonly string[]): boolean {
  return allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
}

export function toggleAllSelections(
  selectedIds: readonly string[],
  allIds: readonly string[],
): string[] {
  const current = new Set(selectedIds);
  if (areAllSelected(selectedIds, allIds)) {
    for (const id of allIds) {
      current.delete(id);
    }
    return [...current];
  }

  for (const id of allIds) {
    current.add(id);
  }
  return [...current];
}

export function buildSummaryLines(
  prepared: AddFlowPrepared,
  preview: DeploymentPlan,
): string[] {
  const counts = countActions(preview.actions);
  const selectedLeafLabels = prepared.leafs
    .filter((leaf) => prepared.draft.selectedLeafIds.includes(leaf.id))
    .map((leaf) => leaf.linkName)
    .sort((left, right) => left.localeCompare(right));
  const selectedTargetLabels = prepared.draft.enabledTargets.map((target) => formatTargetName(target));

  return [
    `Source    ${formatGroupRef(prepared.source)}`,
    `Skills    ${prepared.draft.selectedLeafIds.length}/${prepared.leafs.length} enabled`,
    `Agents    ${prepared.draft.enabledTargets.length} selected`,
    ...(prepared.requestedPath
      ? [`Default   preselected from ${prepared.requestedPath}`]
      : []),
    `Plan      ${formatActionSummary(preview.actions)}`,
    ...(selectedLeafLabels.length > 0
      ? [`Enabled   ${truncateSummary(selectedLeafLabels)}`]
      : []),
    ...(selectedTargetLabels.length > 0
      ? [`Targets   ${truncateSummary(selectedTargetLabels)}`]
      : []),
    ...(counts.blocked ? [`Blocked   ${counts.blocked}`] : []),
  ];
}

function resolveLeafToken(
  leafs: LeafRecord[],
  requestedSkill: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const normalized = normalizeSearch(requestedSkill);
  const relativePathMatches = leafs.filter(
    (leaf) => normalizeSearch(leaf.relativePath) === normalized,
  );
  if (relativePathMatches.length === 1) {
    return { ok: true, value: relativePathMatches[0]!.id };
  }
  if (relativePathMatches.length > 1) {
    return {
      ok: false,
      message: `Skill selector '${requestedSkill}' is ambiguous. Use a unique relative path.`,
    };
  }

  const fallbackMatches = leafs.filter((leaf) =>
    [leaf.linkName, leaf.name].some((value) => normalizeSearch(value) === normalized),
  );

  if (fallbackMatches.length === 1) {
    return { ok: true, value: fallbackMatches[0]!.id };
  }

  if (fallbackMatches.length > 1) {
    return {
      ok: false,
      message: `Skill selector '${requestedSkill}' is ambiguous. Use a relative path such as '${fallbackMatches[0]!.relativePath}'.`,
    };
  }

  return {
    ok: false,
    message: `Unknown skill selector '${requestedSkill}'.`,
  };
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_\s-]+/g, " ")
    .trim();
}

function truncateSummary(values: string[]): string {
  if (values.length <= 4) {
    return values.join(", ");
  }

  return `${values.slice(0, 4).join(", ")}, +${values.length - 4} more`;
}

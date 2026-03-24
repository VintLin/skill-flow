import { TARGET_DEFINITIONS, TARGET_LABELS, TARGET_ORDER } from "@skill-flow/core/utils/constants.js";
import { countActions, formatActionSummary, formatTargetName } from "@skill-flow/core/utils/format.js";
import { formatGroupRef } from "@skill-flow/core/utils/naming.js";
export const ALL_SKILLS_CHOICE_ID = "__all_skills__";
export const ALL_AGENTS_CHOICE_ID = "__all_agents__";
export function normalizeRequestedPath(requestedPath) {
    if (!requestedPath) {
        return undefined;
    }
    const normalized = requestedPath.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
    return normalized.length > 0 && normalized !== "." ? normalized : undefined;
}
export function buildDefaultSelectedLeafIds(leafs, requestedPath) {
    const normalizedPath = normalizeRequestedPath(requestedPath);
    if (!normalizedPath) {
        return leafs.map((leaf) => leaf.id);
    }
    return leafs
        .filter((leaf) => leaf.relativePath === normalizedPath ||
        leaf.relativePath.startsWith(`${normalizedPath}/`))
        .map((leaf) => leaf.id);
}
export function buildLeafChoices(leafs) {
    return leafs.map((leaf) => ({
        id: leaf.id,
        label: leaf.linkName,
        hint: leaf.relativePath,
        description: leaf.description,
    }));
}
export function buildTargetChoices(targets) {
    const orderedTargets = [...targets].sort((left, right) => TARGET_ORDER.indexOf(left) - TARGET_ORDER.indexOf(right));
    return orderedTargets.map((target) => ({
        id: target,
        label: formatTargetName(target),
        ...(TARGET_DEFINITIONS[target].writeRootCandidates[0]
            ? { hint: TARGET_DEFINITIONS[target].writeRootCandidates[0] }
            : {}),
    }));
}
export function withAllChoice(choices, label, id) {
    return [{ id, label }, ...choices];
}
export function filterChoices(choices, query) {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) {
        return choices;
    }
    return choices.filter((choice) => {
        const haystack = normalizeSearch([choice.label, choice.hint, choice.description, choice.id].filter(Boolean).join(" "));
        return haystack.includes(normalizedQuery);
    });
}
export function resolveRequestedLeafIds(leafs, requestedSkills) {
    const resolvedIds = [];
    for (const requestedSkill of requestedSkills) {
        const match = resolveLeafToken(leafs, requestedSkill);
        if (!match.ok) {
            return match;
        }
        resolvedIds.push(match.value);
    }
    return { ok: true, value: [...new Set(resolvedIds)] };
}
export function resolveRequestedTargets(availableTargets, requestedAgents) {
    const availableSet = new Set(availableTargets);
    const resolvedTargets = [];
    for (const requestedAgent of requestedAgents) {
        const normalized = normalizeSearch(requestedAgent);
        const matches = TARGET_ORDER.filter((target) => {
            if (!availableSet.has(target)) {
                return false;
            }
            return [
                target,
                TARGET_LABELS[target],
            ].some((value) => normalizeSearch(value) === normalized);
        });
        if (matches.length === 0) {
            return {
                ok: false,
                message: `Unknown or unavailable agent '${requestedAgent}'.`,
            };
        }
        resolvedTargets.push(matches[0]);
    }
    return { ok: true, value: [...new Set(resolvedTargets)] };
}
export function buildInitialDraft(leafs, availableTargets, options) {
    const selectedLeafIds = options.requestedSkills?.length
        ? resolveRequestedLeafIds(leafs, options.requestedSkills)
        : {
            ok: true,
            value: options.all || options.yes
                ? leafs.map((leaf) => leaf.id)
                : buildDefaultSelectedLeafIds(leafs, options.requestedPath),
        };
    if (!selectedLeafIds.ok) {
        return selectedLeafIds;
    }
    const enabledTargets = options.requestedAgents?.length
        ? resolveRequestedTargets(availableTargets, options.requestedAgents)
        : {
            ok: true,
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
export function buildAddCompletionMessage(source, draft, leafs) {
    const selectedCount = draft.selectedLeafIds.length;
    const targetCount = draft.enabledTargets.length;
    const importedCount = leafs.length;
    const targetSummary = targetCount === 0
        ? "no agents enabled"
        : `${targetCount} agent${targetCount === 1 ? "" : "s"} selected`;
    return `Added ${formatGroupRef(source)} with ${selectedCount}/${importedCount} skills enabled, ${targetSummary}.`;
}
export function areAllSelected(selectedIds, allIds) {
    return allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
}
export function toggleAllSelections(selectedIds, allIds) {
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
export function buildSummaryLines(prepared, preview) {
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
function resolveLeafToken(leafs, requestedSkill) {
    const normalized = normalizeSearch(requestedSkill);
    const relativePathMatches = leafs.filter((leaf) => normalizeSearch(leaf.relativePath) === normalized);
    if (relativePathMatches.length === 1) {
        return { ok: true, value: relativePathMatches[0].id };
    }
    if (relativePathMatches.length > 1) {
        return {
            ok: false,
            message: `Skill selector '${requestedSkill}' is ambiguous. Use a unique relative path.`,
        };
    }
    const fallbackMatches = leafs.filter((leaf) => [leaf.linkName, leaf.name].some((value) => normalizeSearch(value) === normalized));
    if (fallbackMatches.length === 1) {
        return { ok: true, value: fallbackMatches[0].id };
    }
    if (fallbackMatches.length > 1) {
        return {
            ok: false,
            message: `Skill selector '${requestedSkill}' is ambiguous. Use a relative path such as '${fallbackMatches[0].relativePath}'.`,
        };
    }
    return {
        ok: false,
        message: `Unknown skill selector '${requestedSkill}'.`,
    };
}
function normalizeSearch(value) {
    return (value ?? "")
        .toLowerCase()
        .replace(/[_\s-]+/g, " ")
        .trim();
}
function truncateSummary(values) {
    if (values.length <= 4) {
        return values.join(", ");
    }
    return `${values.slice(0, 4).join(", ")}, +${values.length - 4} more`;
}
//# sourceMappingURL=add-flow-model.js.map
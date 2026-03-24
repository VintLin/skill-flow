import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type {
  ConfigBootStatus,
  DeploymentAction,
  DeploymentTargetName,
  DoctorReport,
  DraftBinding,
  WorkflowSummary,
} from "../domain/types.js";
import type { SkillFlowApp } from "../services/skill-flow.js";
import { TARGET_LABELS, TARGET_ORDER } from "../utils/constants.js";
import {
  buildProjectedSkillName,
  formatGroupLabel,
  parseGitHubRepo,
  resolveProjectedSkillNames,
} from "../utils/naming.js";
import {
  getParentSelectionState,
  toggleChild,
  toggleParent,
  type TreeSelectionState,
} from "./selection-state.js";

type ConfigAppProps = {
  app: SkillFlowApp;
  availableTargets: DeploymentTargetName[];
  summaries: WorkflowSummary[];
  initialDrafts: Record<string, DraftBinding>;
  bootStatus: ConfigBootStatus;
};

type ConfigBootstrapState =
  | { phase: "loading"; logs: string[] }
  | {
      phase: "ready";
      logs: string[];
      availableTargets: DeploymentTargetName[];
      summaries: WorkflowSummary[];
      initialDrafts: Record<string, DraftBinding>;
      audit: DoctorReport;
      bootStatus: ConfigBootStatus;
    }
  | { phase: "error"; logs: string[]; message: string };

type FocusPane = "groups" | "detail.agents" | "detail.skills" | "detail.actions";
type DetailFocus = Exclude<FocusPane, "groups">;
type ActionName = "update" | "delete";
type AlertLevel = "error" | "blocked" | "warning";

type PreviewState = {
  actions: DeploymentAction[];
  blockedCount: number;
  errorMessage: string | undefined;
  loading: boolean;
  requestId: number;
};

type SaveState = {
  phase: "idle" | "saving" | "saved" | "failed";
  message: string | undefined;
};

type UpdateState = {
  phase: "idle" | "updating" | "updated" | "failed";
  message: string | undefined;
};

type DeleteState = {
  phase: "idle" | "deleting" | "failed";
  sourceId: string | undefined;
  message: string | undefined;
};

type StatusKind =
  | "clean"
  | "saving"
  | "saved"
  | "failed"
  | "updating"
  | "updated"
  | "update-failed"
  | "deleting";

type StatusDisplay = {
  kind: StatusKind;
  label: string;
  color: "green" | "cyan" | "red" | "yellow" | "gray";
};

type TopBarDisplay = {
  title: string;
  titleColor: "blue";
  detail?: string;
  detailColor?: StatusDisplay["color"];
};

type PaneRow = {
  key: string;
  text: string;
  active: boolean;
  color: "cyan" | "gray" | "green" | "red" | "white" | "yellow" | undefined;
  bold?: boolean;
  activeColor?: "cyan" | "gray" | "green" | "red" | "white" | "yellow";
};

type AlertItem = {
  level: AlertLevel;
  message: string;
};

export type ConfigGroup = {
  id: string;
  title: string;
  kind: "source" | "clawhub";
  summaries: WorkflowSummary[];
};

type ConfigSkillRow = {
  summary: WorkflowSummary;
  leaf: WorkflowSummary["leafs"][number];
};

type WindowedRows<T> = {
  rows: T[];
  start: number;
  end: number;
};

type FocusSnapshot = {
  focus: FocusPane;
  groupIndex: number;
  groupId: string;
  sourceId: string | undefined;
  agentTarget: DeploymentTargetName | undefined;
  skillId: string | undefined;
  action: ActionName;
};

type ProjectionWarningMap = Record<string, string[]>;
type ProjectionNameMap = Map<string, string>;

const EMPTY_DRAFT: DraftBinding = {
  enabledTargets: [],
  selectedLeafIds: [],
};

const EMPTY_CONFIG_GROUP: ConfigGroup = {
  id: "__empty__",
  title: "",
  kind: "source",
  summaries: [],
};

const EMPTY_PREVIEW: PreviewState = {
  actions: [],
  blockedCount: 0,
  errorMessage: undefined,
  loading: false,
  requestId: 0,
};

const PANE_CHROME_ROWS = 5;
const UPDATED_FEEDBACK_MS = 1_200;
const CLAWHUB_GROUP_ID = "__clawhub_skills__";

export function normalizeDraft(draft: DraftBinding): DraftBinding {
  return {
    enabledTargets: [...draft.enabledTargets].sort(),
    selectedLeafIds: [...draft.selectedLeafIds].sort(),
  };
}

export function draftsEqual(left: DraftBinding, right: DraftBinding): boolean {
  const nextLeft = normalizeDraft(left);
  const nextRight = normalizeDraft(right);
  return JSON.stringify(nextLeft) === JSON.stringify(nextRight);
}

export function buildDraftsFromSummaries(
  summaries: WorkflowSummary[],
): Record<string, DraftBinding> {
  return Object.fromEntries(
    summaries.map((summary) => {
      const enabledTargets = Object.entries(summary.bindings.targets)
        .filter(([, value]) => value?.enabled)
        .map(([target]) => target) as DraftBinding["enabledTargets"];
      const selectedLeafIds = [
        ...new Set(
          (summary.bindings.selectedLeafIds && summary.bindings.selectedLeafIds.length > 0
            ? summary.bindings.selectedLeafIds
            : enabledTargets.flatMap((target) => summary.bindings.targets[target]?.leafIds ?? [])),
        ),
      ];
      return [summary.source.id, normalizeDraft({ enabledTargets, selectedLeafIds })];
    }),
  );
}

export function buildConfigGroups(summaries: WorkflowSummary[]): ConfigGroup[] {
  const clawhubSummaries = summaries.filter((summary) => summary.source.kind === "clawhub");
  const groups: ConfigGroup[] = [];
  let clawhubGroupInserted = false;

  for (const summary of summaries) {
    if (summary.source.kind === "clawhub") {
      if (!clawhubGroupInserted && clawhubSummaries.length > 0) {
        groups.push({
          id: CLAWHUB_GROUP_ID,
          title: "ClawHub Skills",
          kind: "clawhub",
          summaries: clawhubSummaries,
        });
        clawhubGroupInserted = true;
      }
      continue;
    }

    groups.push({
      id: summary.source.id,
      title: formatGroupLabel(summary.source),
      kind: "source",
      summaries: [summary],
    });
  }

  if (!clawhubGroupInserted && clawhubSummaries.length > 0) {
    groups.push({
      id: CLAWHUB_GROUP_ID,
      title: "ClawHub Skills",
      kind: "clawhub",
      summaries: clawhubSummaries,
    });
  }

  return groups;
}

export function buildConfigGroupSkillRows(group: ConfigGroup): ConfigSkillRow[] {
  return group.summaries.flatMap((summary) =>
    summary.leafs.map((leaf) => ({
      summary,
      leaf,
    })),
  );
}

export function getPaneViewportCount(paneHeight: number, reservedRows = 0) {
  return Math.max(1, paneHeight - PANE_CHROME_ROWS - reservedRows);
}

export function getPaneWidths(terminalColumns: number): [number, number] {
  const available = Math.max(56, terminalColumns - 1);
  const left = Math.max(20, Math.min(30, Math.floor(available * 0.28)));
  return [left, Math.max(32, available - left)];
}

export function getActionChangeCount(actions: DeploymentAction[]) {
  return actions.filter((action) => action.kind !== "noop").length;
}

export function getGroupSelectedLeafCount({
  drafts,
  group,
}: {
  drafts: Record<string, DraftBinding>;
  group: ConfigGroup;
}) {
  return group.summaries.reduce(
    (count, summary) => count + (drafts[summary.source.id]?.selectedLeafIds.length ?? 0),
    0,
  );
}

export function getStatusDisplay({
  deleteState,
  isSelectedDelete,
  saveState,
  updateState,
}: {
  deleteState: DeleteState;
  isSelectedDelete: boolean;
  saveState: SaveState;
  updateState: UpdateState;
}): StatusDisplay {
  if (isSelectedDelete && deleteState.phase === "deleting") {
    return { kind: "deleting", label: "Deleting", color: "yellow" };
  }
  if (updateState.phase === "updating") {
    return { kind: "updating", label: "Updating", color: "cyan" };
  }
  if (updateState.phase === "failed") {
    return { kind: "update-failed", label: "Update Failed", color: "red" };
  }
  if (saveState.phase === "saving") {
    return { kind: "saving", label: "Saving", color: "cyan" };
  }
  if (saveState.phase === "failed") {
    return { kind: "failed", label: "Failed", color: "red" };
  }
  if (updateState.phase === "updated") {
    return { kind: "updated", label: "Updated", color: "green" };
  }
  if (saveState.phase === "saved") {
    return { kind: "saved", label: "Saved", color: "green" };
  }
  return { kind: "clean", label: "Clean", color: "gray" };
}

export function buildTopBar({
  width,
  isDirty,
  changeCount,
  showDelete,
  statusLabel,
}: {
  width: number;
  isDirty: boolean;
  changeCount: number;
  showDelete: boolean;
  statusLabel: string;
}): TopBarDisplay {
  const topBar: TopBarDisplay = {
    title: "Skill Flow",
    titleColor: "blue",
  };
  if (changeCount > 0) {
    topBar.detail = `Changes: ${changeCount}`;
    return topBar;
  }
  if (
    statusLabel === "Saving" ||
    statusLabel === "Updating" ||
    statusLabel === "Deleting" ||
    statusLabel === "Failed" ||
    statusLabel === "Update Failed"
  ) {
    topBar.detail = `Status: ${statusLabel}`;
    topBar.detailColor =
      statusLabel === "Deleting"
        ? "yellow"
        : statusLabel === "Saving" || statusLabel === "Updating"
          ? "cyan"
          : "red";
  }
  return topBar;
}

export function prioritizeAlerts(alerts: AlertItem[]): AlertItem[] {
  const seen = new Set<string>();
  const priority: Record<AlertLevel, number> = {
    error: 0,
    blocked: 1,
    warning: 2,
  };
  return alerts
    .filter((alert) => {
      const key = `${alert.level}:${alert.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => priority[left.level] - priority[right.level])
    .slice(0, 2);
}

export function getInitialDetailFocus({
  hasAgents,
  hasSkills,
}: {
  hasAgents: boolean;
  hasSkills: boolean;
}): DetailFocus {
  if (hasAgents) {
    return "detail.agents";
  }
  if (hasSkills) {
    return "detail.skills";
  }
  return "detail.actions";
}

export function moveDetailFocus({
  actionCursor,
  actionCount,
  agentCount,
  agentCursor,
  direction,
  focus,
  skillCount,
  skillCursor,
}: {
  actionCursor: number;
  actionCount: number;
  agentCount: number;
  agentCursor: number;
  direction: -1 | 1;
  focus: DetailFocus;
  skillCount: number;
  skillCursor: number;
}): {
  focus: DetailFocus;
  agentCursor: number;
  skillCursor: number;
  actionCursor: number;
} {
  if (focus === "detail.agents") {
    if (direction === -1) {
      if (agentCount > 0 && agentCursor > 0) {
        return { focus, agentCursor: agentCursor - 1, skillCursor, actionCursor };
      }
      return { focus, agentCursor, skillCursor, actionCursor };
    }

    if (agentCount > 0 && agentCursor < agentCount - 1) {
      return { focus, agentCursor: agentCursor + 1, skillCursor, actionCursor };
    }
    if (skillCount > 0) {
      return { focus: "detail.skills", agentCursor, skillCursor: 0, actionCursor };
    }
    return {
      focus: "detail.actions",
      agentCursor,
      skillCursor,
      actionCursor: Math.min(actionCursor, Math.max(0, actionCount - 1)),
    };
  }

  if (focus === "detail.skills") {
    if (direction === -1) {
      if (skillCount > 0 && skillCursor > 0) {
        return { focus, agentCursor, skillCursor: skillCursor - 1, actionCursor };
      }
      if (agentCount > 0) {
        return {
          focus: "detail.agents",
          agentCursor: Math.max(0, agentCount - 1),
          skillCursor,
          actionCursor,
        };
      }
      return { focus, agentCursor, skillCursor, actionCursor };
    }

    if (skillCount > 0 && skillCursor < skillCount - 1) {
      return { focus, agentCursor, skillCursor: skillCursor + 1, actionCursor };
    }
    return {
      focus: "detail.actions",
      agentCursor,
      skillCursor,
      actionCursor: Math.min(actionCursor, Math.max(0, actionCount - 1)),
    };
  }

  if (direction === 1) {
    if (actionCursor < actionCount - 1) {
      return { focus, agentCursor, skillCursor, actionCursor: actionCursor + 1 };
    }
    return { focus, agentCursor, skillCursor, actionCursor };
  }

  if (actionCursor > 0) {
    return { focus, agentCursor, skillCursor, actionCursor: actionCursor - 1 };
  }
  if (skillCount > 0) {
    return {
      focus: "detail.skills",
      agentCursor,
      skillCursor: Math.max(0, skillCount - 1),
      actionCursor,
    };
  }
  if (agentCount > 0) {
    return {
      focus: "detail.agents",
      agentCursor: Math.max(0, agentCount - 1),
      skillCursor,
      actionCursor,
    };
  }
  return { focus, agentCursor, skillCursor, actionCursor };
}

export function getNextSelectionIndexAfterDelete(currentIndex: number, nextCount: number) {
  if (nextCount <= 0) {
    return -1;
  }
  return Math.min(currentIndex, nextCount - 1);
}

export function captureFocusSnapshot({
  actionCursor,
  agentCursor,
  availableTargets,
  focus,
  groupId,
  selectedGroupIndex,
  selectedSummary,
  skillCursor,
}: {
  actionCursor: number;
  agentCursor: number;
  availableTargets: DeploymentTargetName[];
  focus: FocusPane;
  groupId: string;
  selectedGroupIndex: number;
  selectedSummary: WorkflowSummary | undefined;
  skillCursor: number;
}): FocusSnapshot {
  return {
    focus,
    groupIndex: selectedGroupIndex,
    groupId,
    sourceId: selectedSummary?.source.id,
    agentTarget: agentCursor > 0 ? availableTargets[agentCursor - 1] : undefined,
    skillId:
      selectedSummary && skillCursor > 0
        ? selectedSummary.leafs[skillCursor - 1]?.id
        : undefined,
    action: actionCursor === 1 ? "delete" : "update",
  };
}

export function reconcileFocusAfterReload({
  availableTargets,
  nextGroups,
  snapshot,
}: {
  availableTargets: DeploymentTargetName[];
  nextGroups: ConfigGroup[];
  snapshot: FocusSnapshot;
}) {
  const selectedGroupIndex = nextGroups.findIndex((group) => group.id === snapshot.groupId);
  const fallbackGroupIndex = Math.min(
    snapshot.groupIndex,
    Math.max(0, nextGroups.length - 1),
  );
  const resolvedGroupIndex =
    nextGroups.length === 0
      ? -1
      : selectedGroupIndex >= 0 && nextGroups[selectedGroupIndex]
        ? selectedGroupIndex
        : fallbackGroupIndex;

  const group = resolvedGroupIndex >= 0 ? nextGroups[resolvedGroupIndex] : undefined;
  const skillRows = group ? buildConfigGroupSkillRows(group) : [];
  const hasAgents = availableTargets.length > 0;
  const hasSkills = skillRows.length > 0;

  let focus = snapshot.focus;
  let agentCursor = 0;
  let skillCursor = 0;
  let actionCursor = snapshot.action === "delete" && group?.kind !== "clawhub" ? 1 : 0;

  if (focus === "detail.agents") {
    if (hasAgents) {
      const nextAgentIndex = snapshot.agentTarget
        ? availableTargets.indexOf(snapshot.agentTarget)
        : -1;
      agentCursor = nextAgentIndex >= 0 ? nextAgentIndex + 1 : 0;
    } else {
      focus = getInitialDetailFocus({ hasAgents, hasSkills });
    }
  }

  if (focus === "detail.skills") {
    if (hasSkills) {
      const nextSkillIndex =
        snapshot.sourceId && snapshot.skillId
          ? skillRows.findIndex(
              (row) =>
                row.summary.source.id === snapshot.sourceId && row.leaf.id === snapshot.skillId,
            )
          : -1;
      skillCursor = nextSkillIndex >= 0 ? nextSkillIndex + 1 : 0;
    } else {
      focus = getInitialDetailFocus({ hasAgents, hasSkills });
    }
  }

  if (focus === "detail.actions") {
    focus = "detail.actions";
  }

  return {
    actionCursor,
    agentCursor,
    focus: resolvedGroupIndex >= 0 ? focus : "groups",
    groupCursor: resolvedGroupIndex,
    selectedGroupIndex: resolvedGroupIndex,
    skillCursor,
  };
}

export function getRequestedAction({
  actionCursor,
  canDelete,
  focus,
  input,
  keyReturn,
}: {
  actionCursor: number;
  canDelete: boolean;
  focus: FocusPane;
  input: string;
  keyReturn: boolean;
}): ActionName | undefined {
  if (input === "u") {
    return "update";
  }
  if (input === "d" && canDelete) {
    return "delete";
  }
  if (focus === "detail.actions" && keyReturn) {
    return actionCursor === 1 && canDelete ? "delete" : "update";
  }
  return undefined;
}

export function buildProjectionWarningMap({
  drafts,
  summaries,
  sourceId,
}: {
  drafts: Record<string, DraftBinding>;
  summaries: WorkflowSummary[];
  sourceId: string;
}): ProjectionWarningMap {
  const currentDraft = drafts[sourceId] ?? EMPTY_DRAFT;
  const currentSummary = summaries.find((summary) => summary.source.id === sourceId);
  if (!currentSummary || currentDraft.enabledTargets.length === 0) {
    return {};
  }

  const currentSelectedLeafIds = new Set(currentDraft.selectedLeafIds);
  const currentEnabledTargets = new Set(currentDraft.enabledTargets);
  const otherSelectedLeafs = summaries.flatMap((summary) => {
    if (summary.source.id === sourceId) {
      return [];
    }

    const otherDraft = drafts[summary.source.id] ?? EMPTY_DRAFT;
    const hasTargetOverlap = otherDraft.enabledTargets.some((target) =>
      currentEnabledTargets.has(target),
    );
    if (!hasTargetOverlap) {
      return [];
    }

    return otherDraft.selectedLeafIds
      .map((leafId) => summary.leafs.find((leaf) => leaf.id === leafId))
      .filter((leaf): leaf is WorkflowSummary["leafs"][number] => Boolean(leaf))
      .map((leaf) => ({
        source: summary.source,
        leaf,
        exactKey: getExactDuplicateKey(leaf.linkName, leaf.name, leaf.description),
      }));
  });
  const projectedNames = resolveProjectedSkillNames([
    ...otherSelectedLeafs.map((candidate) => ({
      leafId: candidate.leaf.id,
      groupId: candidate.source.id,
      groupName: candidate.source.displayName,
      groupAuthor: parseGitHubRepo(candidate.source.locator)?.owner,
      skillName: candidate.leaf.linkName,
    })),
    ...currentSummary.leafs
      .filter((leaf) => currentSelectedLeafIds.has(leaf.id))
      .map((leaf) => ({
        leafId: leaf.id,
        groupId: currentSummary.source.id,
        groupName: currentSummary.source.displayName,
        groupAuthor: parseGitHubRepo(currentSummary.source.locator)?.owner,
        skillName: leaf.linkName,
      })),
  ]);

  const warningsByLeafId: ProjectionWarningMap = {};
  for (const leaf of currentSummary.leafs) {
    if (!currentSelectedLeafIds.has(leaf.id)) {
      continue;
    }

    const exactKey = getExactDuplicateKey(leaf.linkName, leaf.name, leaf.description);
    const exactDuplicate = otherSelectedLeafs.find((candidate) => candidate.exactKey === exactKey);
    if (exactDuplicate) {
      warningsByLeafId[leaf.id] = [
        `identical skill already selected in ${formatGroupLabel(exactDuplicate.source)}, this one will be skipped`,
      ];
      continue;
    }

    const renameConflict = otherSelectedLeafs.find(
      (candidate) => candidate.leaf.linkName === leaf.linkName,
    );
    if (renameConflict) {
      const projectedName =
        projectedNames.get(leaf.id) ??
        buildProjectedSkillName(
          currentSummary.source.displayName,
          leaf.linkName,
          parseGitHubRepo(currentSummary.source.locator)?.owner,
        );
      warningsByLeafId[leaf.id] = [
        `conflicts with ${formatGroupLabel(renameConflict.source)}, will deploy as ${projectedName}`,
      ];
    }
  }

  return warningsByLeafId;
}

function buildProjectionNameMap({
  drafts,
  summaries,
  sourceId,
}: {
  drafts: Record<string, DraftBinding>;
  summaries: WorkflowSummary[];
  sourceId: string;
}): ProjectionNameMap {
  const currentDraft = drafts[sourceId] ?? EMPTY_DRAFT;
  const currentSummary = summaries.find((summary) => summary.source.id === sourceId);
  if (!currentSummary || currentDraft.enabledTargets.length === 0) {
    return new Map();
  }

  const currentEnabledTargets = new Set(currentDraft.enabledTargets);
  const selectedLeafIds = new Set(currentDraft.selectedLeafIds);

  return resolveProjectedSkillNames([
    ...summaries.flatMap((summary) => {
      if (summary.source.id === sourceId) {
        return [];
      }

      const draft = drafts[summary.source.id] ?? EMPTY_DRAFT;
      const hasTargetOverlap = draft.enabledTargets.some((target) =>
        currentEnabledTargets.has(target),
      );
      if (!hasTargetOverlap) {
        return [];
      }

      return draft.selectedLeafIds
        .map((leafId) => summary.leafs.find((leaf) => leaf.id === leafId))
        .filter((leaf): leaf is WorkflowSummary["leafs"][number] => Boolean(leaf))
        .map((leaf) => ({
          leafId: leaf.id,
          groupId: summary.source.id,
          groupName: summary.source.displayName,
          groupAuthor: parseGitHubRepo(summary.source.locator)?.owner,
          skillName: leaf.linkName,
        }));
    }),
    ...currentSummary.leafs
      .filter((leaf) => selectedLeafIds.has(leaf.id))
      .map((leaf) => ({
        leafId: leaf.id,
        groupId: currentSummary.source.id,
        groupName: currentSummary.source.displayName,
        groupAuthor: parseGitHubRepo(currentSummary.source.locator)?.owner,
        skillName: leaf.linkName,
      })),
  ]);
}

export function buildScrollableRows<T extends PaneRow>(
  items: T[],
  cursorIndex: number,
  visibleCount: number,
  keyPrefix = "scroll",
  reserveHintSlots = false,
): WindowedRows<T | PaneRow> {
  const safeVisibleCount = Math.max(1, visibleCount);
  const needsHints = items.length > safeVisibleCount;
  const hasHintSlots = needsHints || (reserveHintSlots && safeVisibleCount >= 3);
  const adjustedVisibleCount = hasHintSlots ? Math.max(1, safeVisibleCount - 2) : safeVisibleCount;
  const windowed = getWindowedRows(items, cursorIndex, adjustedVisibleCount);
  const hasUp = windowed.start > 0;
  const hasDown = windowed.end < items.length;

  const rows: Array<T | PaneRow> = [];
  if (hasHintSlots) {
    rows.push({
      key: `__scroll_up__:${keyPrefix}`,
      text: hasUp ? "↑ more" : "",
      active: false,
      color: "gray",
    });
  }
  rows.push(...windowed.rows);
  if (hasHintSlots) {
    rows.push({
      key: `__scroll_down__:${keyPrefix}`,
      text: hasDown ? "↓ more" : "",
      active: false,
      color: "gray",
    });
  }

  return {
    rows,
    start: windowed.start,
    end: windowed.end,
  };
}

export function ConfigApp({
  app,
  availableTargets,
  summaries,
  initialDrafts,
  bootStatus,
}: ConfigAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const previewRequestIds = useRef<Record<string, number>>({});
  const saveRequestIds = useRef<Record<string, number>>({});
  const updateRequestIds = useRef<Record<string, number>>({});
  const updatedTimers = useRef<Record<string, NodeJS.Timeout | undefined>>({});
  const [summaryList, setSummaryList] = useState(summaries);
  const groupViews = buildConfigGroups(summaryList);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(
    groupViews.length > 0 ? 0 : -1,
  );
  const [groupCursor, setGroupCursor] = useState(groupViews.length > 0 ? 0 : -1);
  const [focus, setFocus] = useState<FocusPane>("groups");
  const [skillCursor, setSkillCursor] = useState(0);
  const [targetCursor, setTargetCursor] = useState(0);
  const [actionCursor, setActionCursor] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftBinding>>(initialDrafts);
  const [savedDrafts, setSavedDrafts] = useState<Record<string, DraftBinding>>(initialDrafts);
  const [previewBySourceId, setPreviewBySourceId] = useState<Record<string, PreviewState>>({});
  const [saveStateBySourceId, setSaveStateBySourceId] = useState<Record<string, SaveState>>({});
  const [updateStateBySourceId, setUpdateStateBySourceId] = useState<
    Record<string, UpdateState>
  >({});
  const [deleteState, setDeleteState] = useState<DeleteState>({
    phase: "idle",
    sourceId: undefined,
    message: undefined,
  });

  const selectedGroup = groupViews[selectedGroupIndex] ?? EMPTY_CONFIG_GROUP;
  const selectedSkillRows = buildConfigGroupSkillRows(selectedGroup);
  const selectedSkillRow = skillCursor > 0 ? selectedSkillRows[skillCursor - 1] : undefined;
  const activeSummary = selectedSkillRow?.summary ?? selectedGroup.summaries[0];
  const selectedSourceId = activeSummary?.source.id ?? "";
  const selectedDraft = drafts[selectedSourceId] ?? EMPTY_DRAFT;
  const savedDraft = savedDrafts[selectedSourceId] ?? EMPTY_DRAFT;
  const isDirty = !draftsEqual(selectedDraft, savedDraft);
  const leafIds = activeSummary?.leafs.map((leaf) => leaf.id) ?? [];
  const groupSelectedLeafCount = getGroupSelectedLeafCount({
    drafts,
    group: selectedGroup,
  });
  const visibleTargets = availableTargets;
  const agentInteractiveCount = visibleTargets.length > 0 ? visibleTargets.length + 1 : 0;
  const skillInteractiveCount = selectedSkillRows.length > 0 ? selectedSkillRows.length + 1 : 0;
  const treeState: TreeSelectionState =
    selectedGroup.kind === "clawhub"
      ? {
          allLeafIds: selectedSkillRows.map((row) => row.leaf.id),
          selectedLeafIds: selectedGroup.summaries.flatMap(
            (summary) => drafts[summary.source.id]?.selectedLeafIds ?? [],
          ),
        }
      : {
          allLeafIds: leafIds,
          selectedLeafIds: selectedDraft.selectedLeafIds,
        };
  const parentSelectionState = getParentSelectionState(treeState);
  const visibleEnabledTargets = visibleTargets.filter((target) =>
    selectedDraft.enabledTargets.includes(target),
  );
  const allTargetsSelected =
    visibleTargets.length > 0 && visibleEnabledTargets.length === visibleTargets.length;
  const projectionWarningsByLeafId = buildProjectionWarningMap({
    drafts,
    summaries: summaryList,
    sourceId: selectedSourceId,
  });
  const projectedNamesByLeafId = buildProjectionNameMap({
    drafts,
    summaries: summaryList,
    sourceId: selectedSourceId,
  });
  const failedBootBySourceId = new Map(
    bootStatus.failedSources.map((item) => [item.sourceId, item.message]),
  );
  const previewState = previewBySourceId[selectedSourceId] ?? EMPTY_PREVIEW;
  const changeCount = getActionChangeCount(previewState.actions);
  const saveState = saveStateBySourceId[selectedSourceId] ?? {
    phase: "idle" as const,
    message: undefined,
  };
  const updateState = updateStateBySourceId[selectedSourceId] ?? {
    phase: "idle" as const,
    message: undefined,
  };
  const isSelectedDelete = deleteState.sourceId === selectedSourceId;
  const canDelete =
    selectedGroup.kind === "clawhub" ? focus === "detail.skills" && skillCursor > 0 : true;
  const showDeleteAction = selectedGroup.kind !== "clawhub";
  const actionCount = showDeleteAction ? 2 : 1;
  const statusDisplay = getStatusDisplay({
    deleteState,
    isSelectedDelete,
    saveState,
    updateState,
  });
  const canEditSelected =
    activeSummary !== undefined &&
    updateState.phase !== "updating" &&
    deleteState.phase !== "deleting";
  const canRunActions =
    activeSummary !== undefined &&
    saveState.phase !== "saving" &&
    updateState.phase !== "updating" &&
    deleteState.phase !== "deleting";

  useEffect(() => {
    return () => {
      for (const timer of Object.values(updatedTimers.current)) {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!activeSummary) {
      return;
    }

    const sourceId = activeSummary.source.id;
    const requestId = (previewRequestIds.current[sourceId] ?? 0) + 1;
    previewRequestIds.current[sourceId] = requestId;

    setPreviewBySourceId((current) => ({
      ...current,
      [sourceId]: {
        ...(current[sourceId] ?? EMPTY_PREVIEW),
        errorMessage: undefined,
        loading: true,
        requestId,
      },
    }));

    let disposed = false;

    void app.previewDraft(sourceId, selectedDraft).then((result) => {
      if (disposed) {
        return;
      }

      setPreviewBySourceId((current) => {
        const currentState = current[sourceId] ?? EMPTY_PREVIEW;
        if (currentState.requestId !== requestId) {
          return current;
        }

        if (!result.ok) {
          return {
            ...current,
            [sourceId]: {
              actions: [],
              blockedCount: 0,
              errorMessage: firstErrorMessage(result),
              loading: false,
              requestId,
            },
          };
        }

        return {
          ...current,
          [sourceId]: {
            actions: result.data.plan.actions,
            blockedCount: result.data.plan.blocked.length,
            errorMessage: undefined,
            loading: false,
            requestId,
          },
        };
      });
    });

    return () => {
      disposed = true;
    };
  }, [app, activeSummary, selectedDraft]);

  useEffect(() => {
    if (!activeSummary || draftsEqual(selectedDraft, savedDraft)) {
      return;
    }
    if (saveState.phase === "saving" || saveState.phase === "failed") {
      return;
    }

    const sourceId = activeSummary.source.id;
    const requestId = (saveRequestIds.current[sourceId] ?? 0) + 1;
    saveRequestIds.current[sourceId] = requestId;
    const draftToSave = normalizeDraft(selectedDraft);

    setSaveStateBySourceId((current) => ({
      ...current,
      [sourceId]: {
        phase: "saving",
        message: "saving changes...",
      },
    }));

    void app.applyDraft(sourceId, draftToSave).then((result) => {
      setSaveStateBySourceId((current) => {
        if ((saveRequestIds.current[sourceId] ?? 0) !== requestId) {
          return current;
        }

        if (!result.ok) {
          return {
            ...current,
            [sourceId]: {
              phase: "failed",
              message: firstErrorMessage(result),
            },
          };
        }

        const appliedDraft = normalizeDraft(result.data.draft);
        setDrafts((draftsCurrent) => ({
          ...draftsCurrent,
          [sourceId]: appliedDraft,
        }));
        setSavedDrafts((savedCurrent) => ({
          ...savedCurrent,
          [sourceId]: appliedDraft,
        }));
        setPreviewBySourceId((previewCurrent) => ({
          ...previewCurrent,
          [sourceId]: {
            actions: result.data.actions,
            blockedCount: result.data.actions.filter((action) => action.kind === "blocked")
              .length,
            errorMessage: undefined,
            loading: false,
            requestId: previewRequestIds.current[sourceId] ?? 0,
          },
        }));

        return {
          ...current,
          [sourceId]: {
            phase: "saved",
            message: "saved",
          },
        };
      });
    });
  }, [app, saveState.phase, savedDraft, selectedDraft, activeSummary]);

  const updateSelectedDraft = (
    updater: (currentDraft: DraftBinding) => DraftBinding,
  ) => {
    if (!activeSummary || !canEditSelected) {
      return;
    }

    const sourceId = activeSummary.source.id;
    setDrafts((current) => {
      const currentDraft = current[sourceId] ?? EMPTY_DRAFT;
      const nextDraft = normalizeDraft(updater(currentDraft));
      if (draftsEqual(currentDraft, nextDraft)) {
        return current;
      }
      return {
        ...current,
        [sourceId]: nextDraft,
      };
    });
    setSaveStateBySourceId((current) => {
      const state = current[sourceId];
      if (!state || state.phase === "idle") {
        return current;
      }
      return {
        ...current,
        [sourceId]: {
          phase: "idle",
          message: undefined,
        },
      };
    });
  };

  const handleUpdate = () => {
    if (!activeSummary || !selectedGroup || !canRunActions) {
      return;
    }

    const sourceId = activeSummary.source.id;
    const sourceIds =
      selectedGroup.kind === "clawhub"
        ? selectedGroup.summaries.map((summary) => summary.source.id)
        : [sourceId];
    const requestId = (updateRequestIds.current[sourceId] ?? 0) + 1;
    updateRequestIds.current[sourceId] = requestId;
    for (const id of sourceIds) {
      previewRequestIds.current[id] = (previewRequestIds.current[id] ?? 0) + 1;
      saveRequestIds.current[id] = (saveRequestIds.current[id] ?? 0) + 1;
    }

    if (updatedTimers.current[sourceId]) {
      clearTimeout(updatedTimers.current[sourceId]);
      updatedTimers.current[sourceId] = undefined;
    }

    const snapshot = captureFocusSnapshot({
      actionCursor,
      agentCursor: targetCursor,
      availableTargets,
      focus,
      groupId: selectedGroup.id,
      selectedGroupIndex,
      selectedSummary: activeSummary,
      skillCursor,
    });

    setUpdateStateBySourceId((current) => ({
      ...current,
      [sourceId]: {
        phase: "updating",
        message: `updating ${selectedGroup.title}...`,
      },
    }));

    void app.updateSources(sourceIds).then(async (result) => {
      if ((updateRequestIds.current[sourceId] ?? 0) !== requestId) {
        return;
      }

      if (!result.ok) {
        setUpdateStateBySourceId((current) => ({
          ...current,
          [sourceId]: {
            phase: "failed",
            message: firstErrorMessage(result),
          },
        }));
        return;
      }

      const configResult = await app.getConfigData();
      if ((updateRequestIds.current[sourceId] ?? 0) !== requestId) {
        return;
      }
      if (!configResult.ok) {
        setUpdateStateBySourceId((current) => ({
          ...current,
          [sourceId]: {
            phase: "failed",
            message: firstErrorMessage(configResult),
          },
        }));
        return;
      }

      const nextSummaries = configResult.data.summaries;
      const nextDrafts = buildDraftsFromSummaries(nextSummaries);
      const nextIds = new Set(nextSummaries.map((summary) => summary.source.id));
      const nextGroups = buildConfigGroups(nextSummaries);
      const nextFocusState = reconcileFocusAfterReload({
        availableTargets,
        nextGroups,
        snapshot,
      });

      setSummaryList(nextSummaries);
      setDrafts(nextDrafts);
      setSavedDrafts(nextDrafts);
      setPreviewBySourceId((current) => pruneSourceMap(current, nextIds));
      setSaveStateBySourceId((current) => ({
        ...pruneSourceMap(current, nextIds),
        [sourceId]: {
          phase: "saved",
          message: "saved",
        },
      }));
      setSelectedGroupIndex(nextFocusState.selectedGroupIndex);
      setGroupCursor(nextFocusState.groupCursor);
      setFocus(nextFocusState.focus);
      setTargetCursor(nextFocusState.agentCursor);
      setSkillCursor(nextFocusState.skillCursor);
      setActionCursor(nextFocusState.actionCursor);
      setUpdateStateBySourceId((current) => ({
        ...pruneSourceMap(current, nextIds),
        [sourceId]: {
          phase: "updated",
          message: "updated",
        },
      }));

      updatedTimers.current[sourceId] = setTimeout(() => {
        if ((updateRequestIds.current[sourceId] ?? 0) !== requestId) {
          return;
        }
        setUpdateStateBySourceId((current) => {
          const state = current[sourceId];
          if (!state || state.phase !== "updated") {
            return current;
          }
          return {
            ...current,
            [sourceId]: {
              phase: "idle",
              message: undefined,
            },
          };
        });
        updatedTimers.current[sourceId] = undefined;
      }, UPDATED_FEEDBACK_MS);
    });
  };

  const handleDelete = () => {
    if (!activeSummary || !canRunActions) {
      return;
    }

    const sourceId = activeSummary.source.id;
    previewRequestIds.current[sourceId] = (previewRequestIds.current[sourceId] ?? 0) + 1;
    saveRequestIds.current[sourceId] = (saveRequestIds.current[sourceId] ?? 0) + 1;
    updateRequestIds.current[sourceId] = (updateRequestIds.current[sourceId] ?? 0) + 1;

    if (updatedTimers.current[sourceId]) {
      clearTimeout(updatedTimers.current[sourceId]);
      updatedTimers.current[sourceId] = undefined;
    }

    setDeleteState({
      phase: "deleting",
      sourceId,
      message: `deleting ${formatGroupLabel(activeSummary.source)}...`,
    });

    void app.uninstall([sourceId]).then((result) => {
      if (!result.ok) {
        setDeleteState({
          phase: "failed",
          sourceId,
          message: firstErrorMessage(result),
        });
        return;
      }

      const nextSummaries = summaryList.filter((summary) => summary.source.id !== sourceId);
      const nextGroups = buildConfigGroups(nextSummaries);
      const nextSelectedGroupIndex = getNextSelectionIndexAfterDelete(
        selectedGroupIndex,
        nextGroups.length,
      );

      setSummaryList(nextSummaries);
      setDrafts((current) => removeSourceFromMap(current, sourceId));
      setSavedDrafts((current) => removeSourceFromMap(current, sourceId));
      setPreviewBySourceId((current) => removeSourceFromMap(current, sourceId));
      setSaveStateBySourceId((current) => removeSourceFromMap(current, sourceId));
      setUpdateStateBySourceId((current) => removeSourceFromMap(current, sourceId));
      setDeleteState({
        phase: "idle",
        sourceId: undefined,
        message: undefined,
      });
      setSelectedGroupIndex(nextSelectedGroupIndex);
      setGroupCursor(nextSelectedGroupIndex);
      setFocus("groups");
      setTargetCursor(0);
      setSkillCursor(0);
      setActionCursor(0);
    });
  };

  useInput((input, key) => {
    if (!activeSummary) {
      if (input === "q" || key.escape || (input === "c" && key.ctrl)) {
        exit();
      }
      return;
    }

    if (input === "c" && key.ctrl) {
      exit();
      return;
    }

    const requestedAction = getRequestedAction({
      actionCursor,
      canDelete,
      focus,
      input,
      keyReturn: Boolean(key.return),
    });
    if (requestedAction === "update") {
      handleUpdate();
      return;
    }
    if (requestedAction === "delete") {
      handleDelete();
      return;
    }

    if (input === "q" || key.escape) {
      if (focus !== "groups") {
        setFocus("groups");
        return;
      }
      exit();
      return;
    }

    if (key.tab) {
      if (focus === "groups") {
        setFocus(
          getInitialDetailFocus({
            hasAgents: agentInteractiveCount > 0,
            hasSkills: skillInteractiveCount > 0,
          }),
        );
        return;
      }
      setFocus("groups");
      return;
    }

    if (key.rightArrow && focus === "groups") {
      setFocus(
        getInitialDetailFocus({
          hasAgents: agentInteractiveCount > 0,
          hasSkills: skillInteractiveCount > 0,
        }),
      );
      return;
    }

    if (key.leftArrow && focus !== "groups") {
      setFocus("groups");
      return;
    }

    if (focus === "groups") {
      if (key.downArrow) {
        const next = Math.min(groupCursor + 1, Math.max(0, groupViews.length - 1));
        setGroupCursor(next);
        setSelectedGroupIndex(next);
        setTargetCursor(0);
        setSkillCursor(0);
        setActionCursor(0);
      }
      if (key.upArrow) {
        const next = Math.max(groupCursor - 1, 0);
        setGroupCursor(next);
        setSelectedGroupIndex(next);
        setTargetCursor(0);
        setSkillCursor(0);
        setActionCursor(0);
      }
      return;
    }

    if (key.downArrow || key.upArrow) {
      const next = moveDetailFocus({
        actionCursor,
        actionCount,
        agentCount: agentInteractiveCount,
        agentCursor: targetCursor,
        direction: key.downArrow ? 1 : -1,
        focus: focus as DetailFocus,
        skillCount: skillInteractiveCount,
        skillCursor,
      });
      setFocus(next.focus);
      setTargetCursor(next.agentCursor);
      setSkillCursor(next.skillCursor);
      setActionCursor(next.actionCursor);
      return;
    }

    if (focus === "detail.agents" && input === " " && agentInteractiveCount > 0) {
      updateSelectedDraft((currentDraft) => {
        if (targetCursor === 0) {
          const enabledTargets = new Set(currentDraft.enabledTargets);
          const nextSelectAll = !visibleTargets.every((target) => enabledTargets.has(target));
          for (const target of visibleTargets) {
            if (nextSelectAll) {
              enabledTargets.add(target);
            } else {
              enabledTargets.delete(target);
            }
          }
          return {
            ...currentDraft,
            enabledTargets: TARGET_ORDER.filter((target) => enabledTargets.has(target)),
          };
        }

        const target = visibleTargets[targetCursor - 1];
        if (!target) {
          return currentDraft;
        }

        const enabledTargets = new Set(currentDraft.enabledTargets);
        if (enabledTargets.has(target)) {
          enabledTargets.delete(target);
        } else {
          enabledTargets.add(target);
        }
        return {
          ...currentDraft,
          enabledTargets: TARGET_ORDER.filter((item) => enabledTargets.has(item)),
        };
      });
      return;
    }

    if (focus === "detail.skills" && input === " " && skillInteractiveCount > 0) {
      updateSelectedDraft((currentDraft) => {
        if (selectedGroup.kind === "clawhub") {
          if (skillCursor === 0) {
            return currentDraft;
          }

          const row = selectedSkillRows[skillCursor - 1];
          if (!row) {
            return currentDraft;
          }

          if (row.summary.source.id !== selectedSourceId) {
            return currentDraft;
          }

          const baseState: TreeSelectionState = {
            allLeafIds: row.summary.leafs.map((leaf) => leaf.id),
            selectedLeafIds: currentDraft.selectedLeafIds,
          };
          const nextState = toggleChild(baseState, row.leaf.id);

          return {
            ...currentDraft,
            selectedLeafIds: nextState.selectedLeafIds,
          };
        }

        const baseState: TreeSelectionState = {
          allLeafIds: leafIds,
          selectedLeafIds: currentDraft.selectedLeafIds,
        };
        const nextState =
          skillCursor === 0
            ? toggleParent(baseState)
            : toggleChild(baseState, leafIds[skillCursor - 1]!);

        return {
          ...currentDraft,
          selectedLeafIds: nextState.selectedLeafIds,
        };
      });
    }
  });

  if (groupViews.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>No skills groups yet</Text>
        <Text>Run skill-flow add &lt;source&gt; to install your first group.</Text>
        <Text dimColor>{deleteState.message ?? "Press q or esc to exit."}</Text>
      </Box>
    );
  }

  const renderSummary = activeSummary!;

  const terminalRows = stdout.rows ?? 24;
  const terminalColumns = stdout.columns ?? 120;
  const paneHeight = Math.max(12, terminalRows - 3);
  const [groupsWidth, detailWidth] = getPaneWidths(terminalColumns);
  const bodyRowCount = getPaneViewportCount(paneHeight);
  const groupRows = buildScrollableRows(
    groupViews.map((group, index) => {
      const isCursor = groupCursor === index;
      const isSelected = selectedGroupIndex === index;
      return {
        key: group.id,
        text: `${group.title}${
          group.kind === "clawhub"
            ? group.summaries.some((summary) => failedBootBySourceId.has(summary.source.id))
              ? " !"
              : ""
            : failedBootBySourceId.has(group.summaries[0]?.source.id ?? "")
              ? " !"
              : ""
        }`,
        active: focus === "groups" && isCursor,
        activeColor: "cyan" as const,
        bold: isSelected,
        color: isSelected ? ("white" as const) : ("gray" as const),
      };
    }),
    Math.max(0, groupCursor),
    bodyRowCount,
    "groups",
  );

  const agentRows: PaneRow[] =
    visibleTargets.length > 0
      ? [
          {
            key: "__all_targets__",
            text: `${selectionMarker(
              allTargetsSelected ? "full" : visibleEnabledTargets.length > 0 ? "partial" : "empty",
            )} All Agents`,
            active: focus === "detail.agents" && targetCursor === 0,
            bold: true,
            color: undefined,
          },
          ...visibleTargets.map((target, index) => ({
            key: target,
            text: `${selectionMarker(
              selectedDraft.enabledTargets.includes(target) ? "full" : "empty",
            )} ${TARGET_LABELS[target]}`,
            active: focus === "detail.agents" && targetCursor === index + 1,
            color: "gray" as const,
          })),
        ]
      : [
          {
            key: "__no_targets__",
            text: "No detected agent targets",
            active: false,
            color: "gray" as const,
          },
        ];

  const skillRows: PaneRow[] =
    selectedSkillRows.length > 0
      ? [
          {
            key: "__all__",
            text: `${selectionMarker(parentSelectionState)} All Skills`,
            active: focus === "detail.skills" && skillCursor === 0,
            bold: true,
            color: undefined,
          },
          ...selectedSkillRows.map((row, index) => {
            const rowDraft = drafts[row.summary.source.id] ?? EMPTY_DRAFT;
            const rowSelected = rowDraft.selectedLeafIds.includes(row.leaf.id);
            const warnings = [
              ...row.leaf.metadataWarnings,
              ...(row.summary.source.id === selectedSourceId
                ? (projectionWarningsByLeafId[row.leaf.id] ?? [])
                : []),
            ];
            const inlineWarning = warnings[0] ? ` (${warnings[0]})` : "";
            const projectedLabel =
              row.summary.source.id === selectedSourceId && rowSelected
                ? (projectedNamesByLeafId.get(row.leaf.id) ?? row.leaf.linkName)
                : row.leaf.linkName;
            const label =
              selectedGroup.kind === "clawhub"
                ? `${projectedLabel} · ${formatGroupLabel(row.summary.source)}`
                : projectedLabel;
            return {
              key: row.leaf.id,
              text: `${selectionMarker(
                rowSelected ? "full" : "empty",
              )} ${label}${inlineWarning}`,
              active: focus === "detail.skills" && skillCursor === index + 1,
              color: warnings.length > 0 ? ("yellow" as const) : ("gray" as const),
            };
          }),
        ]
      : [
          {
            key: "__no_skills__",
            text: "No skills in this group",
            active: false,
            color: "gray" as const,
          },
        ];

  const selectedGroupBootMessages = selectedGroup
    ? selectedGroup.kind === "clawhub"
      ? selectedGroup.summaries
          .map((summary) => failedBootBySourceId.get(summary.source.id))
          .filter((message): message is string => Boolean(message))
      : [failedBootBySourceId.get(selectedSourceId)].filter((message): message is string => Boolean(message))
    : [];
  const alerts = prioritizeAlerts(
    buildAlerts({
      deleteState,
      failedBootMessages: selectedGroupBootMessages,
      isSelectedDelete,
      previewState,
      projectionWarningsByLeafId,
      saveState,
      selectedDraft,
      selectedSummary: renderSummary,
      updateState,
    }),
  );
  const previewLabel = buildPreviewLabel({
    blockedCount: previewState.blockedCount,
    changeCount,
    errorMessage: previewState.errorMessage,
    loading: previewState.loading,
  });
  const bootLabel = selectedGroupBootMessages.length > 0 ? "PARTIAL" : "OK";
  const metadataRows = buildDetailMetadataRows({
    alerts,
    detailWidth,
    group: selectedGroup,
    summary: renderSummary,
  });
  const actionRows = buildActionRows({
    actionCursor,
    canRunActions,
    deleteState,
    focus,
    isSelectedDelete,
    showDeleteAction,
    updateState,
  });
  const fixedRows =
    metadataRows.length +
    4 +
    actionRows.length;
  const sectionBudget = Math.max(2, bodyRowCount - fixedRows);
  const hasAgentSection = visibleTargets.length > 0;
  const hasSkillSection = selectedSkillRows.length > 0;
  const agentBudget =
    hasAgentSection && hasSkillSection
      ? Math.min(
          Math.max(1, sectionBudget - 1),
          Math.max(4, Math.floor(sectionBudget * 0.4)),
        )
      : sectionBudget;
  const skillBudget =
    hasAgentSection && hasSkillSection ? Math.max(1, sectionBudget - agentBudget) : sectionBudget;
  const visibleAgentRows = buildScrollableRows(
    agentRows,
    Math.min(targetCursor, Math.max(0, agentRows.length - 1)),
    Math.max(1, agentBudget),
    "agents",
    true,
  );
  const visibleSkillRows = buildScrollableRows(
    skillRows,
    Math.min(skillCursor, Math.max(0, skillRows.length - 1)),
    Math.max(1, skillBudget),
    "skills",
    true,
  );
  const filledSkillRows = [...visibleSkillRows.rows];
  const skillPaddingCount = Math.max(0, skillBudget - filledSkillRows.length);
  for (let index = 0; index < skillPaddingCount; index += 1) {
    filledSkillRows.push({
      key: `__skills_fill__:${index}`,
      text: "",
      active: false,
      color: undefined,
    });
  }
  const detailRows: PaneRow[] = [
    ...metadataRows,
    {
      key: "__agents_gap__",
      text: "",
      active: false,
      color: undefined,
    },
    {
      key: "__agents_header__",
      text: `Apply to Agents (${visibleEnabledTargets.length}/${visibleTargets.length})`,
      active: false,
      bold: true,
      color: undefined,
    },
    ...visibleAgentRows.rows,
    {
      key: "__skills_gap__",
      text: "",
      active: false,
      color: undefined,
    },
    {
      key: "__skills_header__",
      text: `Included Skills (${selectedGroup.kind === "clawhub" ? groupSelectedLeafCount : selectedDraft.selectedLeafIds.length}/${selectedSkillRows.length})`,
      active: false,
      bold: true,
      color: undefined,
    },
    ...filledSkillRows,
  ];

  const topBar = buildTopBar({
    width: terminalColumns,
    isDirty,
    changeCount,
    showDelete: canDelete,
    statusLabel: statusDisplay.label,
  });

  return (
    <Box flexDirection="column" height={terminalRows}>
      <Box>
        <Text color={topBar.titleColor} wrap="truncate-end">
          {topBar.title}
        </Text>
        {topBar.detail ? (
          topBar.detailColor ? (
            <Text color={topBar.detailColor} wrap="truncate-end">
              {`   ${topBar.detail}`}
            </Text>
          ) : (
            <Text wrap="truncate-end">{`   ${topBar.detail}`}</Text>
          )
        ) : null}
      </Box>
      <Box>
        <Pane
          active={focus === "groups"}
          footer={`${groupViews.length} groups`}
          gapAfter
          height={paneHeight}
          title="Skills Groups"
          width={groupsWidth}
        >
          {renderPaneRows(groupRows.rows, bodyRowCount, groupsWidth)}
        </Pane>
        <Pane
          active={focus !== "groups"}
          footer={buildCommandBar(focus)}
          height={paneHeight}
          title="Group Detail"
          width={detailWidth}
        >
          {renderPaneRows(detailRows, bodyRowCount, detailWidth, actionRows)}
        </Pane>
      </Box>
      <Text dimColor wrap="truncate-end">
        {buildFooterHints(focus, canDelete)}
      </Text>
    </Box>
  );
}

export function ConfigBootstrapApp({ app }: { app: SkillFlowApp }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<ConfigBootstrapState>({
    phase: "loading",
    logs: ["Booting config..."],
  });

  useEffect(() => {
    let cancelled = false;
    void app.configCoordinator.bootstrapWorkspaceState((event) => {
      if (cancelled) {
        return;
      }
      setState((current) => {
        const nextLogs = [...current.logs, event.message].slice(-6);
        return {
          ...current,
          logs: nextLogs,
        };
      });
    }).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setState((current) => ({
          phase: "error",
          logs: current.logs,
          message: firstErrorMessage(result),
        }));
        return;
      }
      setState((current) => ({
        phase: "ready",
        logs: current.logs,
        availableTargets: result.data.availableTargets,
        summaries: result.data.summaries,
        initialDrafts: result.data.initialDrafts,
        audit: result.data.audit,
        bootStatus: result.data.bootStatus,
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [app]);

  useInput((input, key) => {
    if (state.phase === "ready") {
      return;
    }
    if (input === "q" || key.escape || (input === "c" && key.ctrl)) {
      exit();
    }
  });

  if (state.phase === "ready") {
    return (
      <ConfigApp
        app={app}
        availableTargets={state.availableTargets}
        summaries={state.summaries}
        initialDrafts={state.initialDrafts}
        bootStatus={state.bootStatus}
      />
    );
  }

  const rows = stdout.rows ?? 24;
  const bootLogs = state.logs.slice(-4);

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexGrow={1} flexDirection="column">
        <Text bold>Skill Flow Config</Text>
        <Text color="gray">
          {state.phase === "loading"
            ? "Checking groups, skills, targets, and current paths..."
            : "Bootstrap failed"}
        </Text>
        {state.phase === "error" ? <Text color="red">{state.message}</Text> : null}
      </Box>
      <Box flexDirection="column">
        <Text bold>BOOT LOG</Text>
        {bootLogs.map((log) => (
          <Text key={log} color="gray">
            {log}
          </Text>
        ))}
        <Text color="gray">Press q or Esc to exit.</Text>
      </Box>
    </Box>
  );
}

function buildSaveStatusLabel(saveState: SaveState) {
  if (saveState.phase === "saving") {
    return "Saving";
  }
  if (saveState.phase === "saved") {
    return "Saved";
  }
  if (saveState.phase === "failed") {
    return "Failed";
  }
  return "Clean";
}

function buildPreviewLabel({
  blockedCount,
  changeCount,
  errorMessage,
  loading,
}: {
  blockedCount: number;
  changeCount: number;
  errorMessage: string | undefined;
  loading: boolean;
}) {
  if (loading) {
    return "planning...";
  }
  if (errorMessage) {
    return "failed";
  }
  if (blockedCount > 0 && changeCount > 0) {
    return `${changeCount} changes, ${blockedCount} blocked`;
  }
  if (blockedCount > 0) {
    return `${blockedCount} blocked`;
  }
  return `${changeCount} changes`;
}

function buildAlerts({
  deleteState,
  failedBootMessages,
  isSelectedDelete,
  previewState,
  projectionWarningsByLeafId,
  saveState,
  selectedDraft,
  selectedSummary,
  updateState,
}: {
  deleteState: DeleteState;
  failedBootMessages: string[];
  isSelectedDelete: boolean;
  previewState: PreviewState;
  projectionWarningsByLeafId: ProjectionWarningMap;
  saveState: SaveState;
  selectedDraft: DraftBinding;
  selectedSummary: WorkflowSummary;
  updateState: UpdateState;
}) {
  const alerts: AlertItem[] = [];

  if (updateState.phase === "failed" && updateState.message) {
    alerts.push({ level: "error", message: `Update failed: ${updateState.message}` });
  }
  if (isSelectedDelete && deleteState.phase === "failed" && deleteState.message) {
    alerts.push({ level: "error", message: `Delete failed: ${deleteState.message}` });
  }
  if (saveState.phase === "failed" && saveState.message) {
    alerts.push({ level: "error", message: `Save failed: ${saveState.message}` });
  }
  if (previewState.errorMessage) {
    alerts.push({ level: "error", message: `Preview failed: ${previewState.errorMessage}` });
  }
  for (const failedBootMessage of failedBootMessages) {
    alerts.push({ level: "error", message: `Boot issue: ${failedBootMessage}` });
  }

  for (const action of previewState.actions) {
    if (action.kind === "blocked" && action.reason) {
      alerts.push({ level: "blocked", message: action.reason });
    }
  }

  for (const leaf of selectedSummary.leafs) {
    if (!selectedDraft.selectedLeafIds.includes(leaf.id)) {
      continue;
    }
    for (const warning of leaf.metadataWarnings) {
      alerts.push({ level: "warning", message: warning });
    }
    for (const warning of projectionWarningsByLeafId[leaf.id] ?? []) {
      alerts.push({ level: "warning", message: warning });
    }
  }

  if ((selectedSummary.lock?.invalidLeafs.length ?? 0) > 0) {
    alerts.push({
      level: "warning",
      message: `${selectedSummary.lock?.invalidLeafs.length ?? 0} invalid skill entries skipped`,
    });
  }

  return alerts;
}

export function buildDetailMetadataRows({
  alerts,
  detailWidth,
  group,
  summary,
}: {
  alerts: AlertItem[];
  detailWidth: number;
  group: ConfigGroup;
  summary: WorkflowSummary;
}) {
  const sourceSummary =
    group.kind === "clawhub"
      ? `Sources: ${group.summaries.length} clawhub source${group.summaries.length === 1 ? "" : "s"}`
      : `Source: ${summary.source.locator}`;
  const rows: PaneRow[] = [
    {
      key: "__title__",
      text: group.title,
      active: false,
      bold: true,
      color: undefined,
    },
    {
      key: "__source__",
      text: fitPaneLine(sourceSummary, getPaneInnerWidth(detailWidth) - 2),
      active: false,
      color: "gray",
    },
  ];

  if (group.kind === "clawhub") {
    rows.push({
      key: "__focused_source__",
      text: fitPaneLine(
        `Focused Source: ${formatGroupLabel(summary.source)}`,
        getPaneInnerWidth(detailWidth) - 2,
      ),
      active: false,
      color: "gray",
    });
  }

  if (alerts.length > 0) {
    rows.push({
      key: "__alerts__",
      text: "Alerts",
      active: false,
      bold: true,
      color: undefined,
    });
    alerts.forEach((alert, index) => {
      rows.push({
        key: `__alert__:${index}`,
        text: `! ${alert.message}`,
        active: false,
        color:
          alert.level === "error"
            ? "red"
            : alert.level === "blocked"
              ? "yellow"
              : "gray",
      });
    });
  }

  return rows;
}

export function buildActionRows({
  actionCursor,
  canRunActions,
  deleteState,
  focus,
  isSelectedDelete,
  showDeleteAction,
  updateState,
}: {
  actionCursor: number;
  canRunActions: boolean;
  deleteState: DeleteState;
  focus: FocusPane;
  isSelectedDelete: boolean;
  showDeleteAction: boolean;
  updateState: UpdateState;
}) {
  const updateText =
    updateState.phase === "updating"
      ? "Update · UPDATING..."
      : updateState.phase === "failed"
        ? "Update · FAILED"
        : "Update";
  const rows: PaneRow[] = [
    {
      key: "__actions_separator__",
      text: "────────────────────────",
      active: false,
      color: "gray" as const,
    },
    {
      key: "__action_update__",
      text: `[${updateText}]`,
      active: focus === "detail.actions" && actionCursor === 0,
      color: canRunActions || updateState.phase !== "idle" ? undefined : ("gray" as const),
      bold: true,
    },
  ];
  if (showDeleteAction) {
    const deleteText =
      isSelectedDelete && deleteState.phase === "deleting"
        ? "Delete · DELETING..."
        : isSelectedDelete && deleteState.phase === "failed"
          ? "Delete · FAILED"
          : "Delete";
    rows.push({
      key: "__action_delete__",
      text: `[${deleteText}]`,
      active: focus === "detail.actions" && actionCursor === 1,
      color:
        isSelectedDelete && deleteState.phase === "failed"
          ? ("red" as const)
          : canRunActions || (isSelectedDelete && deleteState.phase !== "idle")
            ? ("red" as const)
            : ("gray" as const),
      bold: true,
    });
  }
  return rows;
}

function buildCommandBar(focus: FocusPane) {
  if (focus === "groups") {
    return "[Tab/→] Edit";
  }
  if (focus === "detail.actions") {
    return "[Enter] Action";
  }
  return "[Space] Toggle";
}

function buildFooterHints(focus: FocusPane, canDelete: boolean) {
  if (focus === "groups") {
    return canDelete
      ? "[↑↓] Move   [Tab/→] Switch pane   [u] Update   [d] Delete   [q] Exit"
      : "[↑↓] Move   [Tab/→] Switch pane   [u] Update   [q] Exit";
  }
  if (focus === "detail.actions") {
    return canDelete
      ? "[↑↓] Move   [Enter] Action   [Tab/←/Esc] Back   [u] Update   [d] Delete"
      : "[↑↓] Move   [Enter] Action   [Tab/←/Esc] Back   [u] Update";
  }
  return canDelete
    ? "[↑↓] Move   [Space] Toggle   [Tab/←/Esc] Back   [u] Update   [d] Delete"
    : "[↑↓] Move   [Space] Toggle   [Tab/←/Esc] Back   [u] Update";
}

function RowText({ row, width }: { row: PaneRow; width: number }) {
  const color = row.active ? row.activeColor ?? "cyan" : row.color;
  const prefix = row.active ? "> " : "  ";
  const contentWidth = Math.max(1, getPaneInnerWidth(width) - prefix.length);
  const content = fitPaneLine(row.text, contentWidth);
  return (
    <Text
      wrap="truncate-end"
      {...(color ? { color } : {})}
      {...(row.bold ? { bold: true } : {})}
    >
      {prefix}
      {content}
    </Text>
  );
}

function Pane({
  title,
  active,
  width,
  children,
  height,
  footer,
  gapAfter = false,
}: {
  title: string;
  active: boolean;
  width: number;
  height: number;
  footer: string;
  gapAfter?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      marginRight={gapAfter ? 1 : 0}
      paddingX={1}
      borderStyle="round"
      borderColor={active ? "cyan" : "gray"}
    >
      <Text bold wrap="truncate-end">
        {fitPaneLine(title, getPaneInnerWidth(width))}
      </Text>
      <Text> </Text>
      {children}
      <Text dimColor wrap="truncate-middle">
        {fitPaneLine(footer, getPaneInnerWidth(width))}
      </Text>
    </Box>
  );
}

function renderPaneRows(
  rows: PaneRow[],
  bodyRowCount: number,
  paneWidth: number,
  tailRows: PaneRow[] = [],
) {
  const items: React.ReactNode[] = rows.map((row) => (
    <RowText key={row.key} row={row} width={paneWidth} />
  ));
  const blankCount = Math.max(0, bodyRowCount - rows.length - tailRows.length);
  for (let index = 0; index < blankCount; index += 1) {
    items.push(<Text key={`__blank__:${index}`}> </Text>);
  }
  for (const row of tailRows) {
    items.push(<RowText key={row.key} row={row} width={paneWidth} />);
  }
  return items;
}

function fitPaneLine(text: string, width: number) {
  if (text.length <= width) {
    return text.padEnd(width, " ");
  }
  if (width <= 1) {
    return "…";
  }
  return `${text.slice(0, width - 1)}…`;
}

function getPaneInnerWidth(width: number) {
  return Math.max(1, width - 4);
}

function selectionMarker(state: "empty" | "partial" | "full") {
  if (state === "full") {
    return "[x]";
  }
  if (state === "partial") {
    return "[-]";
  }
  return "[ ]";
}

function getExactDuplicateKey(linkName: string, name: string, description: string) {
  return `${linkName}\n${name}\n${description}`;
}

function getWindowedRows<T>(
  items: T[],
  cursorIndex: number,
  visibleCount: number,
): { rows: T[]; start: number; end: number } {
  const safeVisibleCount = Math.max(1, visibleCount);
  const maxStart = Math.max(0, items.length - safeVisibleCount);
  const start = Math.min(
    Math.max(0, cursorIndex - Math.floor(safeVisibleCount / 2)),
    maxStart,
  );
  const end = Math.min(items.length, start + safeVisibleCount);
  return {
    rows: items.slice(start, end),
    start,
    end,
  };
}

function pruneSourceMap<T>(sourceMap: Record<string, T>, allowedIds: Set<string>) {
  return Object.fromEntries(
    Object.entries(sourceMap).filter(([sourceId]) => allowedIds.has(sourceId)),
  ) as Record<string, T>;
}

function removeSourceFromMap<T>(sourceMap: Record<string, T>, sourceId: string) {
  const next = { ...sourceMap };
  delete next[sourceId];
  return next;
}

function firstErrorMessage(result: { errors: Array<{ message: string }> }) {
  return result.errors[0]?.message ?? "operation failed";
}

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

type PaneRow = {
  key: string;
  text: string;
  active: boolean;
  color: "cyan" | "gray" | "green" | "red" | "white" | "yellow" | undefined;
  bold?: boolean;
};

type AlertItem = {
  level: AlertLevel;
  message: string;
};

type FocusSnapshot = {
  focus: FocusPane;
  groupIndex: number;
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

const EMPTY_PREVIEW: PreviewState = {
  actions: [],
  blockedCount: 0,
  errorMessage: undefined,
  loading: false,
  requestId: 0,
};

const PANE_CHROME_ROWS = 5;
const UPDATED_FEEDBACK_MS = 1_200;

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
          enabledTargets.flatMap((target) => summary.bindings.targets[target]?.leafIds ?? []),
        ),
      ];
      return [summary.source.id, normalizeDraft({ enabledTargets, selectedLeafIds })];
    }),
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
  statusLabel,
}: {
  width: number;
  isDirty: boolean;
  changeCount: number;
  statusLabel: string;
}) {
  const parts = [
    "Skill Flow",
    "[u] Update",
    "[d] Delete",
    `Dirty: ${isDirty ? "Yes" : "No"}`,
  ];
  if (width >= 100) {
    parts.push(`Changes: ${changeCount}`);
  }
  parts.push(`Status: ${statusLabel}`);
  return parts.join("   ");
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
  agentCount,
  agentCursor,
  direction,
  focus,
  skillCount,
  skillCursor,
}: {
  actionCursor: number;
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
    return { focus: "detail.actions", agentCursor, skillCursor, actionCursor: 0 };
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
    return { focus: "detail.actions", agentCursor, skillCursor, actionCursor: 0 };
  }

  if (direction === 1) {
    if (actionCursor < 1) {
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
  selectedGroupIndex,
  selectedSummary,
  skillCursor,
}: {
  actionCursor: number;
  agentCursor: number;
  availableTargets: DeploymentTargetName[];
  focus: FocusPane;
  selectedGroupIndex: number;
  selectedSummary: WorkflowSummary | undefined;
  skillCursor: number;
}): FocusSnapshot {
  return {
    focus,
    groupIndex: selectedGroupIndex,
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
  nextSummaries,
  snapshot,
}: {
  availableTargets: DeploymentTargetName[];
  nextSummaries: WorkflowSummary[];
  snapshot: FocusSnapshot;
}) {
  const selectedGroupIndex = nextSummaries.findIndex(
    (summary) => summary.source.id === snapshot.sourceId,
  );
  const fallbackGroupIndex = Math.min(
    snapshot.groupIndex,
    Math.max(0, nextSummaries.length - 1),
  );
  const resolvedGroupIndex =
    nextSummaries.length === 0
      ? -1
      : selectedGroupIndex >= 0 && nextSummaries[selectedGroupIndex]
        ? selectedGroupIndex
        : fallbackGroupIndex;

  const summary = resolvedGroupIndex >= 0 ? nextSummaries[resolvedGroupIndex] : undefined;
  const hasAgents = availableTargets.length > 0;
  const hasSkills = (summary?.leafs.length ?? 0) > 0;

  let focus = snapshot.focus;
  let agentCursor = 0;
  let skillCursor = 0;
  let actionCursor = snapshot.action === "delete" ? 1 : 0;

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
        snapshot.skillId && summary
          ? summary.leafs.findIndex((leaf) => leaf.id === snapshot.skillId)
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
  focus,
  input,
  keyReturn,
}: {
  actionCursor: number;
  focus: FocusPane;
  input: string;
  keyReturn: boolean;
}): ActionName | undefined {
  if (input === "u") {
    return "update";
  }
  if (input === "d") {
    return "delete";
  }
  if (focus === "detail.actions" && keyReturn) {
    return actionCursor === 1 ? "delete" : "update";
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
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(
    summaries.length > 0 ? 0 : -1,
  );
  const [groupCursor, setGroupCursor] = useState(summaries.length > 0 ? 0 : -1);
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

  const selectedSummary = summaryList[selectedGroupIndex];
  const selectedSourceId = selectedSummary?.source.id ?? "";
  const selectedDraft = drafts[selectedSourceId] ?? EMPTY_DRAFT;
  const savedDraft = savedDrafts[selectedSourceId] ?? EMPTY_DRAFT;
  const isDirty = !draftsEqual(selectedDraft, savedDraft);
  const leafIds = selectedSummary?.leafs.map((leaf) => leaf.id) ?? [];
  const visibleTargets = availableTargets;
  const agentInteractiveCount = visibleTargets.length > 0 ? visibleTargets.length + 1 : 0;
  const skillInteractiveCount = leafIds.length > 0 ? leafIds.length + 1 : 0;
  const treeState: TreeSelectionState = {
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
  const statusDisplay = getStatusDisplay({
    deleteState,
    isSelectedDelete,
    saveState,
    updateState,
  });
  const canEditSelected = updateState.phase !== "updating" && deleteState.phase !== "deleting";
  const canRunActions =
    selectedSummary !== undefined &&
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
    if (!selectedSummary) {
      return;
    }

    const sourceId = selectedSummary.source.id;
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
  }, [app, selectedDraft, selectedSummary]);

  useEffect(() => {
    if (!selectedSummary || draftsEqual(selectedDraft, savedDraft)) {
      return;
    }
    if (saveState.phase === "saving" || saveState.phase === "failed") {
      return;
    }

    const sourceId = selectedSummary.source.id;
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
  }, [app, saveState.phase, savedDraft, selectedDraft, selectedSummary]);

  const updateSelectedDraft = (
    updater: (currentDraft: DraftBinding) => DraftBinding,
  ) => {
    if (!selectedSummary || !canEditSelected) {
      return;
    }

    const sourceId = selectedSummary.source.id;
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
    if (!selectedSummary || !canRunActions) {
      return;
    }

    const sourceId = selectedSummary.source.id;
    const requestId = (updateRequestIds.current[sourceId] ?? 0) + 1;
    updateRequestIds.current[sourceId] = requestId;
    previewRequestIds.current[sourceId] = (previewRequestIds.current[sourceId] ?? 0) + 1;
    saveRequestIds.current[sourceId] = (saveRequestIds.current[sourceId] ?? 0) + 1;

    if (updatedTimers.current[sourceId]) {
      clearTimeout(updatedTimers.current[sourceId]);
      updatedTimers.current[sourceId] = undefined;
    }

    const snapshot = captureFocusSnapshot({
      actionCursor,
      agentCursor: targetCursor,
      availableTargets,
      focus,
      selectedGroupIndex,
      selectedSummary,
      skillCursor,
    });

    setUpdateStateBySourceId((current) => ({
      ...current,
      [sourceId]: {
        phase: "updating",
        message: `updating ${formatGroupLabel(selectedSummary.source)}...`,
      },
    }));

    void app.updateSources([sourceId]).then(async (result) => {
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
      const nextFocusState = reconcileFocusAfterReload({
        availableTargets,
        nextSummaries,
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
    if (!selectedSummary || !canRunActions) {
      return;
    }

    const sourceId = selectedSummary.source.id;
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
      message: `deleting ${formatGroupLabel(selectedSummary.source)}...`,
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
      const nextCount = nextSummaries.length;
      const nextSelectedGroupIndex = getNextSelectionIndexAfterDelete(
        selectedGroupIndex,
        nextCount,
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
    if (!selectedSummary) {
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
        const next = Math.min(groupCursor + 1, Math.max(0, summaryList.length - 1));
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

  if (summaryList.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>No skills groups yet</Text>
        <Text>Run skill-flow add &lt;source&gt; to install your first group.</Text>
        <Text dimColor>{deleteState.message ?? "Press q or esc to exit."}</Text>
      </Box>
    );
  }

  const activeSummary = selectedSummary!;
  const terminalRows = stdout.rows ?? 24;
  const terminalColumns = stdout.columns ?? 120;
  const paneHeight = Math.max(12, terminalRows - 3);
  const [groupsWidth, detailWidth] = getPaneWidths(terminalColumns);
  const bodyRowCount = getPaneViewportCount(paneHeight);
  const groupRows = getWindowedRows(
    summaryList.map((summary, index) => ({
      key: summary.source.id,
      text: `${formatGroupLabel(summary.source)}${failedBootBySourceId.has(summary.source.id) ? " !" : ""}`,
      active: focus === "groups" && groupCursor === index,
      color: failedBootBySourceId.has(summary.source.id) ? ("yellow" as const) : undefined,
    })),
    Math.max(0, groupCursor),
    bodyRowCount,
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
    activeSummary.leafs.length > 0
      ? [
          {
            key: "__all__",
            text: `${selectionMarker(parentSelectionState)} All Skills`,
            active: focus === "detail.skills" && skillCursor === 0,
            bold: true,
            color: undefined,
          },
          ...activeSummary.leafs.map((leaf, index) => {
            const warnings = [
              ...leaf.metadataWarnings,
              ...(projectionWarningsByLeafId[leaf.id] ?? []),
            ];
            const inlineWarning = warnings[0] ? ` (${warnings[0]})` : "";
            const label = selectedDraft.selectedLeafIds.includes(leaf.id)
              ? (projectedNamesByLeafId.get(leaf.id) ?? leaf.linkName)
              : leaf.linkName;
            return {
              key: leaf.id,
              text: `${selectionMarker(
                selectedDraft.selectedLeafIds.includes(leaf.id) ? "full" : "empty",
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

  const alerts = prioritizeAlerts(
    buildAlerts({
      deleteState,
      failedBootMessage: failedBootBySourceId.get(selectedSourceId),
      isSelectedDelete,
      previewState,
      projectionWarningsByLeafId,
      saveState,
      selectedDraft,
      selectedSummary: activeSummary,
      updateState,
    }),
  );
  const previewLabel = buildPreviewLabel({
    blockedCount: previewState.blockedCount,
    changeCount,
    errorMessage: previewState.errorMessage,
    loading: previewState.loading,
  });
  const bootLabel = failedBootBySourceId.has(selectedSourceId) ? "PARTIAL" : "OK";
  const metadataRows = buildDetailMetadataRows({
    alerts,
    bootLabel,
    detailWidth,
    previewLabel,
    saveLabel: statusDisplay.kind === "failed" ? "Failed" : buildSaveStatusLabel(saveState),
    summary: activeSummary,
  });
  const actionRows = buildActionRows({
    actionCursor,
    canRunActions,
    deleteState,
    focus,
    isSelectedDelete,
    updateState,
  });
  const fixedRows =
    metadataRows.length +
    1 +
    1 +
    actionRows.length;
  const sectionBudget = Math.max(2, bodyRowCount - fixedRows);
  const agentBudget =
    visibleTargets.length > 0 && activeSummary.leafs.length > 0
      ? Math.max(1, Math.floor(sectionBudget / 2))
      : sectionBudget;
  const skillBudget =
    visibleTargets.length > 0 && activeSummary.leafs.length > 0
      ? Math.max(1, sectionBudget - agentBudget)
      : sectionBudget;
  const visibleAgentRows = getWindowedRows(
    agentRows,
    Math.min(targetCursor, Math.max(0, agentRows.length - 1)),
    Math.max(1, agentBudget),
  );
  const visibleSkillRows = getWindowedRows(
    skillRows,
    Math.min(skillCursor, Math.max(0, skillRows.length - 1)),
    Math.max(1, skillBudget),
  );
  const detailRows: PaneRow[] = [
    ...metadataRows,
    {
      key: "__agents_header__",
      text: `Apply to Agents (${visibleEnabledTargets.length}/${visibleTargets.length})`,
      active: false,
      bold: true,
      color: undefined,
    },
    ...visibleAgentRows.rows,
    {
      key: "__skills_header__",
      text: `Included Skills (${selectedDraft.selectedLeafIds.length}/${leafIds.length})`,
      active: false,
      bold: true,
      color: undefined,
    },
    ...visibleSkillRows.rows,
  ];

  return (
    <Box flexDirection="column" height={terminalRows}>
      <Text color={statusDisplay.color} wrap="truncate-end">
        {buildTopBar({
          width: terminalColumns,
          isDirty,
          changeCount,
          statusLabel: statusDisplay.label,
        })}
      </Text>
      <Box>
        <Pane
          active={focus === "groups"}
          footer={`group ${selectedGroupIndex + 1}/${summaryList.length}`}
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
        {buildFooterHints(focus)}
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
  failedBootMessage,
  isSelectedDelete,
  previewState,
  projectionWarningsByLeafId,
  saveState,
  selectedDraft,
  selectedSummary,
  updateState,
}: {
  deleteState: DeleteState;
  failedBootMessage: string | undefined;
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
  if (failedBootMessage) {
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

function buildDetailMetadataRows({
  alerts,
  bootLabel,
  detailWidth,
  previewLabel,
  saveLabel,
  summary,
}: {
  alerts: AlertItem[];
  bootLabel: string;
  detailWidth: number;
  previewLabel: string;
  saveLabel: string;
  summary: WorkflowSummary;
}) {
  const rows: PaneRow[] = [
    {
      key: "__title__",
      text: formatGroupLabel(summary.source),
      active: false,
      bold: true,
      color: undefined,
    },
    {
      key: "__type__",
      text: `Type: ${summary.source.kind.toUpperCase()}`,
      active: false,
      color: "gray",
    },
    {
      key: "__source__",
      text: fitPaneLine(`Source: ${summary.source.locator}`, getPaneInnerWidth(detailWidth) - 2),
      active: false,
      color: "gray",
    },
    {
      key: "__save__",
      text: `Save: ${saveLabel}   Preview: ${previewLabel}`,
      active: false,
      color: "gray",
    },
    {
      key: "__boot__",
      text: `Boot: ${bootLabel}`,
      active: false,
      color: bootLabel === "OK" ? "green" : "yellow",
    },
  ];

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

function buildActionRows({
  actionCursor,
  canRunActions,
  deleteState,
  focus,
  isSelectedDelete,
  updateState,
}: {
  actionCursor: number;
  canRunActions: boolean;
  deleteState: DeleteState;
  focus: FocusPane;
  isSelectedDelete: boolean;
  updateState: UpdateState;
}) {
  const updateText =
    updateState.phase === "updating"
      ? "Update · UPDATING..."
      : updateState.phase === "failed"
        ? "Update · FAILED"
        : "Update";
  const deleteText =
    isSelectedDelete && deleteState.phase === "deleting"
      ? "Delete · DELETING..."
      : isSelectedDelete && deleteState.phase === "failed"
        ? "Delete · FAILED"
        : "Delete";

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
    {
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
    },
  ];
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

function buildFooterHints(focus: FocusPane) {
  if (focus === "groups") {
    return "[↑↓] Move   [Tab/→] Switch pane   [u] Update   [d] Delete   [q] Exit";
  }
  if (focus === "detail.actions") {
    return "[↑↓] Move   [Enter] Action   [Tab/←/Esc] Back   [u] Update   [d] Delete";
  }
  return "[↑↓] Move   [Space] Toggle   [Tab/←/Esc] Back   [u] Update   [d] Delete";
}

function RowText({ row, width }: { row: PaneRow; width: number }) {
  const color = row.active ? "cyan" : row.color;
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

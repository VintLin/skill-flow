import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type {
  SourceManifestRecord,
  DeploymentAction,
  DeploymentTargetName,
  WorkflowSummary,
} from "../domain/types.js";
import type { DraftBinding, SkillFlowApp } from "../services/skill-flow.js";
import { TARGET_LABELS, TARGET_ORDER } from "../utils/constants.js";
import {
  buildProjectedSkillName,
  formatGroupLabel,
  resolveProjectedSkillNames,
} from "../utils/naming.js";
import { countActions } from "../utils/format.js";
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
};

type FocusPane = "groups" | "skills" | "targets";

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

export type SaveDisplayPhase = "clean" | "dirty" | "saving" | "saved" | "failed";

type PaneRow = {
  key: string;
  text: string;
  active: boolean;
  color: "cyan" | "gray" | "green" | "red" | "white" | "yellow" | undefined;
  bold?: boolean;
};

type ProjectionWarningMap = Record<string, string[]>;

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

export function getSaveDisplayPhase(
  savePhase: SaveState["phase"],
  isDirty: boolean,
): SaveDisplayPhase {
  if (savePhase === "saving") {
    return "saving";
  }
  if (savePhase === "failed") {
    return "failed";
  }
  if (isDirty) {
    return "dirty";
  }
  if (savePhase === "saved") {
    return "saved";
  }
  return "clean";
}

export function getPaneViewportCount(paneHeight: number, reservedRows = 0) {
  return Math.max(1, paneHeight - PANE_CHROME_ROWS - reservedRows);
}

export function getPaneWidths(terminalColumns: number): [number, number, number] {
  const defaultWidths: [number, number, number] = [34, 52, 42];
  const minWidths: [number, number, number] = [22, 30, 22];
  const gapColumns = 2;
  const available = Math.max(74, terminalColumns - gapColumns);
  const defaultTotal = defaultWidths.reduce((sum, width) => sum + width, 0);
  if (available >= defaultTotal) {
    return defaultWidths;
  }

  const minTotal = minWidths.reduce((sum, width) => sum + width, 0);
  if (available <= minTotal) {
    const left = Math.max(18, Math.floor((available * 22) / minTotal));
    const middle = Math.max(24, Math.floor((available * 30) / minTotal));
    const right = Math.max(18, available - left - middle);
    return [left, middle, right];
  }

  const extra = available - minTotal;
  const flexTotal = defaultTotal - minTotal;
  const left = minWidths[0] + Math.floor((extra * (defaultWidths[0] - minWidths[0])) / flexTotal);
  const middle =
    minWidths[1] + Math.floor((extra * (defaultWidths[1] - minWidths[1])) / flexTotal);
  const right = available - left - middle;
  return [left, middle, right];
}

export function getActionChangeCount(actions: DeploymentAction[]) {
  return actions.filter((action) => action.kind !== "noop").length;
}

export function buildSaveLabel(phase: SaveDisplayPhase, changeCount: number) {
  if (phase === "saving") {
    return "Save · SAVING...";
  }
  if (phase === "saved") {
    return changeCount > 0 ? `Save · SAVED · ${changeCount} changes` : "Save · SAVED";
  }
  if (phase === "failed") {
    return "Save · FAILED";
  }
  if (phase === "dirty") {
    return changeCount > 0 ? `Save · DIRTY · ${changeCount} changes` : "Save · DIRTY";
  }
  return "Save";
}

export function buildCommandBar({
  changeCount,
  focus,
  saveFocused,
  savePhase,
}: {
  changeCount: number;
  focus: FocusPane;
  saveFocused: boolean;
  savePhase: SaveDisplayPhase;
}) {
  const backHint =
    focus === "groups" ? "Esc/q exit" : "Esc/q back";

  if (focus === "groups") {
    return `Enter inspect skills  Tab switch pane  Up/Down move  ${backHint}`;
  }

  if (focus === "skills") {
    return `Space toggle skill  Enter inspect agents  Tab switch pane  Up/Down move  ${backHint}`;
  }

  if (saveFocused) {
    if (savePhase === "saving") {
      return `Enter wait for save  Tab switch pane  Up/Down move  ${backHint}`;
    }
    if (changeCount > 0) {
      return `Enter save ${changeCount} changes  Tab switch pane  Up/Down move  ${backHint}`;
    }
    return `Enter save current state  Tab switch pane  Up/Down move  ${backHint}`;
  }

  return `Space toggle agent  Enter move to save  Tab switch pane  Up/Down move  ${backHint}`;
}

export function buildContextBar({
  blockedCount,
  changeCount,
  previewError,
  previewLoading,
  savePhase,
  saveMessage,
  selectedLeafName,
  selectedLeafWarnings,
  skippedLeafs,
  sourceLabel,
}: {
  blockedCount: number;
  changeCount: number;
  previewError: string | undefined;
  previewLoading: boolean;
  savePhase: SaveDisplayPhase;
  saveMessage: string | undefined;
  selectedLeafName: string | undefined;
  selectedLeafWarnings: string[];
  skippedLeafs: number;
  sourceLabel: string;
}) {
  const parts = [sourceLabel];

  if (selectedLeafName) {
    parts.push(`skill ${selectedLeafName}`);
  }

  if (savePhase === "saving") {
    parts.push("saving changes...");
    return parts.join(" · ");
  }

  if (savePhase === "failed") {
    parts.push(saveMessage ?? "save failed");
    return parts.join(" · ");
  }

  if (savePhase === "saved") {
    parts.push(saveMessage ?? "saved");
    return parts.join(" · ");
  }

  if (previewLoading) {
    parts.push("planning changes...");
    return parts.join(" · ");
  }

  if (previewError) {
    parts.push(`preview failed: ${previewError}`);
    return parts.join(" · ");
  }

  if (selectedLeafWarnings.length > 0) {
    parts.push(`warning: ${selectedLeafWarnings[0]}`);
    return parts.join(" · ");
  }

  if (skippedLeafs > 0) {
    parts.push(`skipped ${skippedLeafs} invalid or duplicate skills`);
    return parts.join(" · ");
  }

  parts.push(`changes ${changeCount}`);
  parts.push(`blocked ${blockedCount}`);
  return parts.join(" · ");
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
      skillName: candidate.leaf.linkName,
    })),
    ...currentSummary.leafs
      .filter((leaf) => currentSelectedLeafIds.has(leaf.id))
      .map((leaf) => ({
        leafId: leaf.id,
        groupId: currentSummary.source.id,
        groupName: currentSummary.source.displayName,
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
        buildProjectedSkillName(currentSummary.source.displayName, leaf.linkName);
      warningsByLeafId[leaf.id] = [
        `conflicts with ${formatGroupLabel(renameConflict.source)}, will deploy as ${projectedName}`,
      ];
    }
  }

  return warningsByLeafId;
}

export function ConfigApp({
  app,
  availableTargets,
  summaries,
  initialDrafts,
}: ConfigAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const previewRequestIds = useRef<Record<string, number>>({});
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(
    summaries.length > 0 ? 0 : -1,
  );
  const [groupCursor, setGroupCursor] = useState(summaries.length > 0 ? 0 : -1);
  const [focus, setFocus] = useState<FocusPane>("groups");
  const [skillCursor, setSkillCursor] = useState(0);
  const [targetCursor, setTargetCursor] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftBinding>>(initialDrafts);
  const [savedDrafts, setSavedDrafts] = useState<Record<string, DraftBinding>>(initialDrafts);
  const [previewBySourceId, setPreviewBySourceId] = useState<
    Record<string, PreviewState>
  >({});
  const [saveStateBySourceId, setSaveStateBySourceId] = useState<
    Record<string, SaveState>
  >({});

  const selectedSummary = summaries[selectedGroupIndex];
  const selectedSourceId = selectedSummary?.source.id ?? "";
  const selectedDraft = drafts[selectedSourceId] ?? EMPTY_DRAFT;
  const savedDraft = savedDrafts[selectedSourceId] ?? EMPTY_DRAFT;
  const isDirty = !draftsEqual(selectedDraft, savedDraft);
  const leafIds = selectedSummary?.leafs.map((leaf) => leaf.id) ?? [];
  const treeState: TreeSelectionState = {
    allLeafIds: leafIds,
    selectedLeafIds: selectedDraft.selectedLeafIds,
  };
  const parentSelectionState = getParentSelectionState(treeState);
  const visibleTargets = availableTargets;
  const targetSelectableCount = visibleTargets.length > 0 ? visibleTargets.length + 1 : 0;
  const targetSaveCursor = targetSelectableCount;
  const visibleEnabledTargets = visibleTargets.filter((target) =>
    selectedDraft.enabledTargets.includes(target),
  );
  const allTargetsSelected =
    visibleTargets.length > 0 && visibleEnabledTargets.length === visibleTargets.length;
  const projectionWarningsByLeafId = buildProjectionWarningMap({
    drafts,
    summaries,
    sourceId: selectedSourceId,
  });
  const selectedLeaf =
    selectedSummary && skillCursor > 0
      ? selectedSummary.leafs[skillCursor - 1]
      : undefined;
  const selectedLeafWarnings = selectedLeaf
    ? [
        ...selectedLeaf.metadataWarnings,
        ...(projectionWarningsByLeafId[selectedLeaf.id] ?? []),
      ]
    : [];
  const previewState = previewBySourceId[selectedSourceId] ?? EMPTY_PREVIEW;
  const actionCounts = countActions(previewState.actions);
  const changeCount = getActionChangeCount(previewState.actions);
  const saveState = saveStateBySourceId[selectedSourceId] ?? {
    phase: "idle" as const,
    message: undefined,
  };
  const savePhase = getSaveDisplayPhase(saveState.phase, isDirty);
  const skippedLeafs = selectedSummary?.lock?.invalidLeafs.length ?? 0;

  useEffect(() => {
    if (!selectedSummary) {
      return;
    }

    // draft -> preview request id -> latest preview wins
    // save  -> explicit phase      -> dirty/saving/saved/failed
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

  const updateSelectedDraft = (
    updater: (currentDraft: DraftBinding) => DraftBinding,
  ) => {
    if (!selectedSummary) {
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

  const handleSave = () => {
    if (!selectedSummary || savePhase === "saving") {
      return;
    }

    const sourceId = selectedSummary.source.id;
    const nextRequestId = (previewRequestIds.current[sourceId] ?? 0) + 1;
    previewRequestIds.current[sourceId] = nextRequestId;

    setSaveStateBySourceId((current) => ({
      ...current,
      [sourceId]: {
        phase: "saving",
        message: "saving changes...",
      },
    }));
    setPreviewBySourceId((current) => ({
      ...current,
      [sourceId]: {
        ...(current[sourceId] ?? EMPTY_PREVIEW),
        errorMessage: undefined,
        loading: false,
        requestId: nextRequestId,
      },
    }));

    const draftToSave = normalizeDraft(selectedDraft);

    void app.applyDraft(sourceId, draftToSave).then((result) => {
      if (!result.ok) {
        const message = firstErrorMessage(result);
        setSaveStateBySourceId((current) => ({
          ...current,
          [sourceId]: {
            phase: "failed",
            message,
          },
        }));
        return;
      }

      const appliedDraft = normalizeDraft(result.data.draft);
      const appliedChangeCount = getActionChangeCount(result.data.actions);
      setDrafts((current) => ({
        ...current,
        [sourceId]: appliedDraft,
      }));
      setSavedDrafts((current) => ({
        ...current,
        [sourceId]: appliedDraft,
      }));
      setSaveStateBySourceId((current) => ({
        ...current,
        [sourceId]: {
          phase: "saved",
          message:
            appliedChangeCount > 0
              ? `saved ${appliedChangeCount} changes`
              : "saved with no changes",
        },
      }));
      setPreviewBySourceId((current) => ({
        ...current,
        [sourceId]: {
          actions: result.data.actions,
          blockedCount: result.data.actions.filter((action) => action.kind === "blocked")
            .length,
          errorMessage: undefined,
          loading: false,
          requestId: nextRequestId,
        },
      }));
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

    if (input === "q" || key.escape) {
      if (focus === "targets") {
        setFocus("skills");
        return;
      }
      if (focus === "skills") {
        setFocus("groups");
        return;
      }
      exit();
      return;
    }

    if (key.tab) {
      const cycle: FocusPane[] = ["groups", "skills", "targets"];
      const currentIndex = cycle.indexOf(focus);
      setFocus(cycle[(currentIndex + 1) % cycle.length] ?? "groups");
      return;
    }

    if (focus === "groups") {
      if (key.downArrow) {
        setGroupCursor((current) => {
          const next = Math.min(current + 1, Math.max(0, summaries.length - 1));
          setSelectedGroupIndex(next);
          setSkillCursor(0);
          setTargetCursor(0);
          return next;
        });
      }
      if (key.upArrow) {
        setGroupCursor((current) => {
          const next = Math.max(current - 1, 0);
          setSelectedGroupIndex(next);
          setSkillCursor(0);
          setTargetCursor(0);
          return next;
        });
      }
      if (key.return) {
        setFocus("skills");
      }
      return;
    }

    if (focus === "skills") {
      if (key.downArrow) {
        setSkillCursor((current) => Math.min(current + 1, leafIds.length));
      }
      if (key.upArrow) {
        setSkillCursor((current) => Math.max(current - 1, 0));
      }
      if (input === " ") {
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
      if (key.return) {
        setFocus("targets");
      }
      return;
    }

    if (key.downArrow) {
      setTargetCursor((current) =>
        Math.min(current + 1, targetSaveCursor),
      );
    }
    if (key.upArrow) {
      setTargetCursor((current) => Math.max(current - 1, 0));
    }
    if (input === " ") {
      updateSelectedDraft((currentDraft) => {
        if (visibleTargets.length === 0 || targetCursor === targetSaveCursor) {
          return currentDraft;
        }

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

        const target = visibleTargets[targetCursor - 1]!;
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
    }
    if (key.return) {
      if (targetCursor === targetSaveCursor) {
        handleSave();
        return;
      }
      setTargetCursor(targetSaveCursor);
    }
  });

  if (summaries.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>No workflow groups yet</Text>
        <Text>Add a Git source to discover a grouped set of related skills.</Text>
        <Text dimColor>Press q or esc to exit.</Text>
      </Box>
    );
  }

  const activeSummary = selectedSummary!;
  const terminalRows = stdout.rows ?? 24;
  const terminalColumns = stdout.columns ?? 120;
  const paneHeight = Math.max(12, terminalRows - 4);
  const [groupsWidth, skillsWidth, targetsWidth] = getPaneWidths(terminalColumns);
  const bodyRowCount = getPaneViewportCount(paneHeight);
  const targetListRowCount = Math.max(1, bodyRowCount - 1);
  const targetItems: PaneRow[] =
    visibleTargets.length > 0
      ? [
          {
            key: "__all_targets__",
            text: `${selectionMarker(
              allTargetsSelected ? "full" : visibleEnabledTargets.length > 0 ? "partial" : "empty",
            )} all agents`,
            active: focus === "targets" && targetCursor === 0,
            bold: true,
            color: undefined,
          },
          ...visibleTargets.map((target, index) => ({
            key: target,
            text: `${selectionMarker(
              selectedDraft.enabledTargets.includes(target) ? "full" : "empty",
            )} ${TARGET_LABELS[target]}`,
            active: focus === "targets" && targetCursor === index + 1,
            color: "gray" as const,
          })),
        ]
      : [
          {
            key: "__no_targets__",
            text: "No detected agent targets",
            active: false,
            bold: false,
            color: "gray" as const,
          },
        ];
  const groupRows = getWindowedRows(
    summaries.map((summary, index) => ({
      key: summary.source.id,
      text: `${formatGroupLabel(summary.source)}  ${formatGroupSaveState(
        getSaveDisplayPhase(
          (saveStateBySourceId[summary.source.id]?.phase ?? "idle"),
          !draftsEqual(
            drafts[summary.source.id] ?? EMPTY_DRAFT,
            savedDrafts[summary.source.id] ?? EMPTY_DRAFT,
          ),
        ),
      )}`,
      active: focus === "groups" && groupCursor === index,
      color: getGroupStateColor(
        getSaveDisplayPhase(
          (saveStateBySourceId[summary.source.id]?.phase ?? "idle"),
          !draftsEqual(
            drafts[summary.source.id] ?? EMPTY_DRAFT,
            savedDrafts[summary.source.id] ?? EMPTY_DRAFT,
          ),
        ),
      ),
    })),
    Math.max(0, groupCursor),
    bodyRowCount,
  );
  const skillRows = getWindowedRows(
    [
      {
        key: "__all__",
        text: `${selectionMarker(parentSelectionState)} all skills`,
        active: focus === "skills" && skillCursor === 0,
        bold: true,
        color: undefined,
      },
      ...activeSummary.leafs.map((leaf, index) => ({
        key: leaf.id,
        text: `${selectionMarker(
          selectedDraft.selectedLeafIds.includes(leaf.id) ? "full" : "empty",
        )} ${leaf.linkName}`,
        active: focus === "skills" && skillCursor === index + 1,
        color:
          leaf.metadataWarnings.length > 0 || (projectionWarningsByLeafId[leaf.id]?.length ?? 0) > 0
            ? ("yellow" as const)
            : ("gray" as const),
      })),
    ],
    skillCursor,
    bodyRowCount,
  );
  const targetRows = getWindowedRows(
    targetItems,
    Math.min(targetCursor, Math.max(0, targetItems.length - 1)),
    targetListRowCount,
  );

  const saveRow = buildSaveRow(
    focus === "targets" && targetCursor === targetSaveCursor,
    savePhase,
    changeCount,
  );
  const contextBar = buildContextBar({
    blockedCount: previewState.blockedCount,
    changeCount,
    previewError: previewState.errorMessage,
    previewLoading: previewState.loading,
    savePhase,
    saveMessage: saveState.message,
    selectedLeafName: selectedLeaf?.linkName,
    selectedLeafWarnings,
    skippedLeafs,
    sourceLabel: formatGroupLabel(activeSummary.source),
  });
  const commandBar = buildCommandBar({
    changeCount,
    focus,
    saveFocused: focus === "targets" && targetCursor === targetSaveCursor,
    savePhase,
  });

  return (
    <Box flexDirection="column" height={terminalRows}>
      <Box>
        <Pane
          active={focus === "groups"}
          footer={buildPaneFooter(
            groupRows.start,
            groupRows.end,
            summaries.length,
            `group ${selectedGroupIndex + 1}/${summaries.length}`,
          )}
          gapAfter
          height={paneHeight}
          title="WORKFLOW GROUPS"
          width={groupsWidth}
        >
          {renderPaneRows(groupRows.rows, bodyRowCount, groupsWidth)}
        </Pane>

        <Pane
          active={focus === "skills"}
          footer={buildPaneFooter(
            skillRows.start,
            skillRows.end,
            activeSummary.leafs.length + 1,
            `${selectedDraft.selectedLeafIds.length}/${leafIds.length} selected`,
          )}
          gapAfter
          height={paneHeight}
          title="GROUP DETAIL"
          width={skillsWidth}
        >
          {renderPaneRows(skillRows.rows, bodyRowCount, skillsWidth)}
        </Pane>

        <Pane
          active={focus === "targets"}
          footer={buildPaneFooter(
            targetRows.start,
            targetRows.end,
            targetItems.length,
            visibleTargets.length > 0
              ? `${visibleEnabledTargets.length}/${visibleTargets.length} targets`
              : "no detected targets",
          )}
          height={paneHeight}
          title="AGENT PROJECTION"
          width={targetsWidth}
        >
          {renderPaneRows(targetRows.rows, bodyRowCount, targetsWidth, [saveRow])}
        </Pane>
      </Box>

      <Text dimColor wrap="truncate-middle">
        {contextBar}
      </Text>
      <Text dimColor wrap="truncate-middle">
        {commandBar}
      </Text>
    </Box>
  );
}

function buildSaveRow(
  active: boolean,
  phase: SaveDisplayPhase,
  changeCount: number,
): PaneRow {
  return {
    key: "__save__",
    text: buildSaveLabel(phase, changeCount),
    active,
    bold: true,
    color: getSaveColor(phase),
  };
}

function getSaveColor(phase: SaveDisplayPhase): PaneRow["color"] {
  if (phase === "failed") {
    return "red";
  }
  if (phase === "dirty") {
    return "yellow";
  }
  if (phase === "saving") {
    return "cyan";
  }
  return "green";
}

function getGroupStateColor(phase: SaveDisplayPhase): PaneRow["color"] {
  if (phase === "failed") {
    return "red";
  }
  if (phase === "dirty") {
    return "yellow";
  }
  if (phase === "saving") {
    return "cyan";
  }
  if (phase === "saved") {
    return "green";
  }
  return "green";
}

function buildPaneFooter(start: number, end: number, total: number, summary: string) {
  const overflow = formatOverflow(start, end, total);
  return `${overflow} · ${summary}`;
}

function formatOverflow(start: number, end: number, total: number) {
  const above = start;
  const below = Math.max(0, total - end);
  if (above === 0 && below === 0) {
    return "top / bottom";
  }
  return `${above > 0 ? `${above} above` : "top"} / ${
    below > 0 ? `${below} below` : "bottom"
  }`;
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


function formatGroupSaveState(phase: SaveDisplayPhase) {
  if (phase === "dirty") {
    return "DIRTY";
  }
  if (phase === "saving") {
    return "SAVING";
  }
  if (phase === "saved") {
    return "SAVED";
  }
  if (phase === "failed") {
    return "FAILED";
  }
  return "SAVED";
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

function firstErrorMessage(result: { errors: Array<{ message: string }> }) {
  return result.errors[0]?.message ?? "operation failed";
}

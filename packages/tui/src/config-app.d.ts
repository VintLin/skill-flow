import type { ConfigBootStatus, DeploymentAction, DeploymentTargetName, DraftBinding, WorkflowSummary } from "@skill-flow/core/domain/types.js";
import type { SkillFlowApp } from "@skill-flow/core/services/skill-flow.js";
type ConfigAppProps = {
    app: SkillFlowApp;
    availableTargets: DeploymentTargetName[];
    summaries: WorkflowSummary[];
    initialDrafts: Record<string, DraftBinding>;
    bootStatus: ConfigBootStatus;
};
type FocusPane = "groups" | "detail.agents" | "detail.skills" | "detail.actions";
type DetailFocus = Exclude<FocusPane, "groups">;
type ActionName = "update" | "delete";
type AlertLevel = "error" | "blocked" | "warning";
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
type StatusKind = "clean" | "saving" | "saved" | "failed" | "updating" | "updated" | "update-failed" | "deleting";
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
export declare function normalizeDraft(draft: DraftBinding): DraftBinding;
export declare function draftsEqual(left: DraftBinding, right: DraftBinding): boolean;
export declare function buildDraftsFromSummaries(summaries: WorkflowSummary[]): Record<string, DraftBinding>;
export declare function buildConfigGroups(summaries: WorkflowSummary[]): ConfigGroup[];
export declare function buildConfigGroupSkillRows(group: ConfigGroup): ConfigSkillRow[];
export declare function getPaneViewportCount(paneHeight: number, reservedRows?: number): number;
export declare function getPaneWidths(terminalColumns: number): [number, number];
export declare function getActionChangeCount(actions: DeploymentAction[]): number;
export declare function getGroupSelectedLeafCount({ drafts, group, }: {
    drafts: Record<string, DraftBinding>;
    group: ConfigGroup;
}): number;
export declare function getStatusDisplay({ deleteState, isSelectedDelete, saveState, updateState, }: {
    deleteState: DeleteState;
    isSelectedDelete: boolean;
    saveState: SaveState;
    updateState: UpdateState;
}): StatusDisplay;
export declare function buildTopBar({ width, isDirty, changeCount, showDelete, statusLabel, }: {
    width: number;
    isDirty: boolean;
    changeCount: number;
    showDelete: boolean;
    statusLabel: string;
}): TopBarDisplay;
export declare function prioritizeAlerts(alerts: AlertItem[]): AlertItem[];
export declare function getInitialDetailFocus({ hasAgents, hasSkills, }: {
    hasAgents: boolean;
    hasSkills: boolean;
}): DetailFocus;
export declare function moveDetailFocus({ actionCursor, actionCount, agentCount, agentCursor, direction, focus, skillCount, skillCursor, }: {
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
};
export declare function getNextSelectionIndexAfterDelete(currentIndex: number, nextCount: number): number;
export declare function captureFocusSnapshot({ actionCursor, agentCursor, availableTargets, focus, groupId, selectedGroupIndex, selectedSummary, skillCursor, }: {
    actionCursor: number;
    agentCursor: number;
    availableTargets: DeploymentTargetName[];
    focus: FocusPane;
    groupId: string;
    selectedGroupIndex: number;
    selectedSummary: WorkflowSummary | undefined;
    skillCursor: number;
}): FocusSnapshot;
export declare function reconcileFocusAfterReload({ availableTargets, nextGroups, snapshot, }: {
    availableTargets: DeploymentTargetName[];
    nextGroups: ConfigGroup[];
    snapshot: FocusSnapshot;
}): {
    actionCursor: number;
    agentCursor: number;
    focus: FocusPane;
    groupCursor: number;
    selectedGroupIndex: number;
    skillCursor: number;
};
export declare function getRequestedAction({ actionCursor, canDelete, focus, input, keyReturn, }: {
    actionCursor: number;
    canDelete: boolean;
    focus: FocusPane;
    input: string;
    keyReturn: boolean;
}): ActionName | undefined;
export declare function buildProjectionWarningMap({ drafts, summaries, sourceId, }: {
    drafts: Record<string, DraftBinding>;
    summaries: WorkflowSummary[];
    sourceId: string;
}): ProjectionWarningMap;
export declare function buildScrollableRows<T extends PaneRow>(items: T[], cursorIndex: number, visibleCount: number, keyPrefix?: string, reserveHintSlots?: boolean): WindowedRows<T | PaneRow>;
export declare function ConfigApp({ app, availableTargets, summaries, initialDrafts, bootStatus, }: ConfigAppProps): import("react/jsx-runtime").JSX.Element;
export declare function ConfigBootstrapApp({ app }: {
    app: SkillFlowApp;
}): import("react/jsx-runtime").JSX.Element;
export declare function buildDetailMetadataRows({ detailWidth, group, summary, }: {
    detailWidth: number;
    group: ConfigGroup;
    summary: WorkflowSummary;
}): PaneRow[];
export declare function buildActionRows({ actionCursor, canRunActions, deleteState, focus, isSelectedDelete, showDeleteAction, updateState, }: {
    actionCursor: number;
    canRunActions: boolean;
    deleteState: DeleteState;
    focus: FocusPane;
    isSelectedDelete: boolean;
    showDeleteAction: boolean;
    updateState: UpdateState;
}): PaneRow[];
export declare function buildCommandBar(focus: FocusPane): "[Tab/→] Edit" | "[Enter] Action" | "[Space] Toggle";
export declare function buildFooterHints(focus: FocusPane, canDelete: boolean): "[↑↓] Move   [Tab/→] Switch pane   [u] Update   [d] Delete   [q] Exit" | "[↑↓] Move   [Tab/→] Switch pane   [u] Update   [q] Exit" | "[↑↓] Move   [Enter] Action   [Tab/←/Esc] Back   [u] Update   [d] Delete" | "[↑↓] Move   [Enter] Action   [Tab/←/Esc] Back   [u] Update" | "[↑↓] Move   [Space] Toggle   [Tab/←/Esc] Back   [u] Update   [d] Delete" | "[↑↓] Move   [Space] Toggle   [Tab/←/Esc] Back   [u] Update";
export declare function selectionMarker(state: "empty" | "partial" | "full"): "●" | "○" | "◐";
export {};

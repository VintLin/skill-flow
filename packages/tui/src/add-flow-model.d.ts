import type { DeploymentPlan, DeploymentTargetName, DraftBinding, LeafRecord, SourceManifestRecord } from "@skill-flow/core/domain/types.js";
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
export declare const ALL_SKILLS_CHOICE_ID = "__all_skills__";
export declare const ALL_AGENTS_CHOICE_ID = "__all_agents__";
export type AddFlowPrepared = {
    source: SourceManifestRecord;
    leafs: LeafRecord[];
    availableTargets: DeploymentTargetName[];
    draft: DraftBinding;
    importWarnings: string[];
    requestedPath?: string;
};
export declare function normalizeRequestedPath(requestedPath?: string): string | undefined;
export declare function buildDefaultSelectedLeafIds(leafs: LeafRecord[], requestedPath?: string): string[];
export declare function buildLeafChoices(leafs: LeafRecord[]): AddChoice[];
export declare function buildTargetChoices(targets: DeploymentTargetName[]): AddChoice[];
export declare function withAllChoice(choices: AddChoice[], label: string, id: string): AddChoice[];
export declare function filterChoices(choices: AddChoice[], query: string): AddChoice[];
export declare function resolveRequestedLeafIds(leafs: LeafRecord[], requestedSkills: string[]): {
    ok: true;
    value: string[];
} | {
    ok: false;
    message: string;
};
export declare function resolveRequestedTargets(availableTargets: DeploymentTargetName[], requestedAgents: string[]): {
    ok: true;
    value: DeploymentTargetName[];
} | {
    ok: false;
    message: string;
};
export declare function buildInitialDraft(leafs: LeafRecord[], availableTargets: DeploymentTargetName[], options: {
    requestedPath?: string;
    requestedSkills?: string[];
    requestedAgents?: string[];
    yes?: boolean;
    all?: boolean;
}): {
    ok: true;
    value: DraftBinding;
} | {
    ok: false;
    message: string;
};
export declare function buildAddCompletionMessage(source: SourceManifestRecord, draft: DraftBinding, leafs: LeafRecord[]): string;
export declare function areAllSelected(selectedIds: readonly string[], allIds: readonly string[]): boolean;
export declare function toggleAllSelections(selectedIds: readonly string[], allIds: readonly string[]): string[];
export declare function buildSummaryLines(prepared: AddFlowPrepared, preview: DeploymentPlan): string[];

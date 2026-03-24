import type { DeploymentAction, DeploymentTargetName, DoctorIssue, SkillCandidate, WorkflowSummary } from "../domain/types.js";
export declare function formatWorkflowList(summaries: WorkflowSummary[]): string;
export declare function countActions(actions: DeploymentAction[]): Record<string, number>;
export declare function formatActionSummary(actions: DeploymentAction[]): string;
export declare function formatTargetName(target: DeploymentTargetName): string;
export declare function formatDoctorIssue(issue: DoctorIssue): string;
export declare function formatSkillCandidates(candidates: SkillCandidate[]): string;

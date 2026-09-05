import type { DeploymentTargetId, PreferencesFile, ProjectScope, RecentProject, Result, WorkflowSummary } from "@skill-flow/domain/types";

export type WorkflowListQueryResult = {
  availableTargets: DeploymentTargetId[];
  summaries: WorkflowSummary[];
  pinnedSourceIds: string[];
  recentProjects: RecentProject[];
  selectedProjectScope: ProjectScope;
  customTargets: PreferencesFile["customTargets"];
  agentDisplayOrder: PreferencesFile["agentDisplayOrder"];
  groupCardEnrichmentBySourceId: Record<string, unknown>;
};

/** Read-only application seam used by clients that only need workflow summaries. */
export type WorkflowListQuery = {
  listWorkflows(): Promise<Result<WorkflowListQueryResult>>;
};

export async function listWorkflows(query: WorkflowListQuery): Promise<Result<WorkflowListQueryResult>> {
  return query.listWorkflows();
}

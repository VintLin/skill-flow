import type { AddSourceDraftOptions, AddSourcePreparation, DraftBinding, DeploymentAction, DeploymentPlan, DeploymentTargetName, DoctorReport, LockFile, Manifest, Result, SkillCandidate, SourceBinding, SourceUpdateResult, WorkflowSummary } from "../domain/types.js";
import { StateStore } from "../state/store.js";
import { DeploymentApplier } from "./deployment-applier.js";
import { ConfigCoordinator } from "./config-coordinator.js";
import { DeploymentPlanner } from "./deployment-planner.js";
import { DoctorService } from "./doctor-service.js";
import { InventoryService } from "./inventory-service.js";
import { SourceService } from "./source-service.js";
import { WorkflowService } from "./workflow-service.js";
import type { AddSourceOptions, SourceSnapshot } from "./source-service.js";
import { WorkspaceBootstrapService, type BootstrapEvent } from "./workspace-bootstrap-service.js";
type SkillFlowAddOptions = AddSourceOptions & AddSourceDraftOptions & {
    project?: boolean;
};
type AddSourceResult = SourceSnapshot & AddSourcePreparation & {
    projected: boolean;
};
export declare class SkillFlowApp {
    readonly store: StateStore;
    readonly inventoryService: InventoryService;
    readonly sourceService: SourceService;
    readonly planner: DeploymentPlanner;
    readonly applier: DeploymentApplier;
    readonly doctorService: DoctorService;
    readonly workflowService: WorkflowService;
    readonly workspaceBootstrapService: WorkspaceBootstrapService;
    readonly configCoordinator: ConfigCoordinator;
    private mutationQueue;
    constructor();
    addSource(locator: string, options?: SkillFlowAddOptions): Promise<Result<AddSourceResult>>;
    prepareAddSource(locator: string, options?: SkillFlowAddOptions): Promise<Result<AddSourceResult>>;
    private addSourceImpl;
    private prepareAddSourceImpl;
    rollbackPreparedSource(sourceId: string): Promise<Result<{
        removed: string[];
    }>>;
    findSkills(query: string): Promise<Result<{
        candidates: SkillCandidate[];
    }>>;
    listWorkflows(): Promise<Result<{
        summaries: WorkflowSummary[];
    }>>;
    private listWorkflowsImpl;
    getConfigData(): Promise<Result<{
        manifest: Manifest;
        lockFile: LockFile;
        summaries: WorkflowSummary[];
    }>>;
    private getConfigDataImpl;
    bootstrapWorkspaceState(onEvent?: (event: BootstrapEvent) => void): Promise<Result<{
        availableTargets: DeploymentTargetName[];
        manifest: Manifest;
        lockFile: LockFile;
        summaries: WorkflowSummary[];
        initialDrafts: Record<string, DraftBinding>;
        audit: DoctorReport;
        importedSourceIds: string[];
    }>>;
    private bootstrapWorkspaceStateImpl;
    getAvailableTargets(): Promise<DeploymentTargetName[]>;
    previewDraft(sourceId: string, draft: DraftBinding): Promise<Result<{
        plan: DeploymentPlan;
        manifest: Manifest;
        lockFile: LockFile;
    }>>;
    applyDraft(sourceId: string, draft: DraftBinding): Promise<Result<{
        actions: DeploymentAction[];
        draft: DraftBinding;
    }>>;
    private applyDraftImpl;
    updateSources(sourceIds?: string[]): Promise<Result<SourceUpdateResult>>;
    private updateSourcesImpl;
    doctor(): Promise<Result<DoctorReport>>;
    private doctorImpl;
    repairTargets(sourceIds?: string[]): Promise<Result<{
        actions: DeploymentAction[];
    }>>;
    private repairTargetsImpl;
    repairSource(sourceIds?: string[]): Promise<Result<SourceUpdateResult>>;
    private repairSourceImpl;
    repairState(sourceIds?: string[]): Promise<Result<{
        repairedSourceIds: string[];
        removedDeploymentCount: number;
    }>>;
    private repairStateImpl;
    uninstall(sourceIds: string[]): Promise<Result<{
        removed: string[];
        removedRefs: Array<{
            id: string;
            locator: string;
            displayName: string;
        }>;
        warnings: string[];
    }>>;
    private uninstallImpl;
    bindingFromDraft(draft: DraftBinding): SourceBinding;
    private pruneMissingCheckoutsImpl;
    private persistNormalizedBindings;
    private runSerializedMutation;
    private normalizeBindings;
    private draftFromBinding;
    private selectLeafIdsForRequestedPath;
    private buildAddDraft;
    private resolveSelectedLeafIds;
    private resolveRequestedTargets;
    private normalizeRequestedPath;
    private rollbackPreparedSourceInternal;
    private prepareManifestForDraft;
    private findExactDuplicateLeafSelections;
    private getExactDuplicateKey;
    private planForAffectedSources;
    private planForSources;
    private planAndApplySources;
    private rebuildDeploymentState;
    private buildProjectedLinkNameMap;
    private findManagedDeploymentOnDisk;
    private matchesManagedProjection;
    private getDeploymentKey;
    private hasActiveTargets;
    private buildLocalCandidates;
    private searchBuiltinGitSource;
    private getBuiltinCatalogSkillPaths;
    private matchesQuery;
    private compareCandidates;
    private getSourceRank;
    private getQueryScore;
    private getCandidateKey;
    private getCandidateTitle;
    private normalizeSearchQuery;
    private formatSourceLabel;
    private applySourceUpdateResults;
}
export {};

import type { ConfigBootStatus, DeploymentTargetName, DoctorReport, DraftBinding, LockFile, Manifest, Result, WorkflowSummary } from "../domain/types.js";
import type { BootstrapEvent } from "./workspace-bootstrap-service.js";
type ConfigCoordinatorDeps = {
    store: {
        init(): Promise<void>;
        readManifest(): Promise<Manifest>;
    };
    doctorService: {
        run(manifest: Manifest, lockFile: LockFile): Promise<Result<DoctorReport>>;
    };
    workflowService: {
        getSummaries(manifest: Manifest, lockFile: LockFile, audit?: DoctorReport): WorkflowSummary[];
    };
    getAvailableTargets(): Promise<DeploymentTargetName[]>;
    pruneMissingCheckouts(): Promise<Result<{
        removedSourceIds: string[];
    }>>;
    getConfigData(): Promise<Result<{
        manifest: Manifest;
        lockFile: LockFile;
        summaries: WorkflowSummary[];
    }>>;
};
export type ConfigBootstrapData = {
    availableTargets: DeploymentTargetName[];
    manifest: Manifest;
    lockFile: LockFile;
    summaries: WorkflowSummary[];
    initialDrafts: Record<string, DraftBinding>;
    audit: DoctorReport;
    bootStatus: ConfigBootStatus;
};
export declare class ConfigCoordinator {
    private readonly deps;
    constructor(deps: ConfigCoordinatorDeps);
    bootstrapWorkspaceState(onEvent?: (event: BootstrapEvent) => void): Promise<Result<ConfigBootstrapData>>;
}
export {};

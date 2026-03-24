import type { DeploymentTargetName, LockFile, Manifest } from "../domain/types.js";
import { StateStore } from "../state/store.js";
export type BootstrapEvent = {
    phase: "detect-targets" | "scan-external-roots" | "import-unmanaged-skills" | "refresh-sources" | "normalize-bindings" | "audit-projections" | "build-summaries" | "done";
    level: "info" | "warning" | "error" | "success";
    message: string;
};
export type DetectedExternalSkill = {
    path: string;
    displayName: string;
    sourceId: string;
    importedFromTargets: DeploymentTargetName[];
    originLocator?: string;
    originRequestedPath?: string;
    originBranch?: string;
};
export declare class WorkspaceBootstrapService {
    private readonly store;
    constructor(store: StateStore);
    detectUnmanagedExternalSkills(manifest: Manifest, lockFile: LockFile, onEvent?: (event: BootstrapEvent) => void): Promise<DetectedExternalSkill[]>;
    private isUnderSkillFlowStore;
    private allocateSourceId;
    private readAgentsOrigins;
    private parseBranchFromSourceUrl;
}

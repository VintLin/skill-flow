import type { DeploymentTargetName, Result, SourceUpdateResult, SourceLockRecord, SourceManifestRecord } from "../domain/types.js";
import { StateStore } from "../state/store.js";
import { InventoryService } from "./inventory-service.js";
export type SourceSnapshot = {
    manifest: SourceManifestRecord;
    lock: SourceLockRecord;
    leafCount: number;
    invalidLeafCount: number;
};
export type AddSourceOptions = {
    path?: string;
    enabledTargets?: DeploymentTargetName[];
    selectionMode?: "all" | "partial";
    project?: boolean;
    sourceIdOverride?: string;
    displayNameOverride?: string;
    originLocator?: string;
    originRequestedPath?: string;
    originBranch?: string;
    importedFromTargets?: DeploymentTargetName[];
    importMode?: "explicit-add" | "bootstrap-detected";
};
export declare class SourceService {
    private readonly store;
    private readonly inventoryService;
    constructor(store: StateStore, inventoryService: InventoryService);
    addSource(locator: string, options?: AddSourceOptions): Promise<Result<SourceSnapshot>>;
    updateSources(sourceIds?: string[]): Promise<Result<SourceUpdateResult>>;
    removeSource(sourceIds: string[]): Promise<Result<{
        removed: string[];
    }>>;
    reconcileInventory(sourceIds?: string[], options?: {
        force?: boolean;
    }): Promise<Result<{
        updatedSourceIds: string[];
    }>>;
    private needsInventoryReconcile;
    private buildSourceUpdateDiff;
    private createDiffItem;
    private canClassifyAsMoved;
    private normalizeRequestedPath;
    private isWithinRequestedPath;
    private buildSnapshot;
    private normalizeLocator;
    private resolveSource;
    private resolveUniqueLocalSource;
    private parseTreeLocator;
    private parseGitHubShorthandSubpath;
    private parseFileLocator;
    private isGitRepositoryPath;
    private joinRequestedPaths;
    private findRequestedLeafs;
    private fetchSource;
    private updateSource;
    private refreshLocalSourceCheckout;
    private readSourceSnapshot;
}

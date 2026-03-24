import type { DeploymentPlan, LockFile, Manifest, Result } from "../domain/types.js";
import type { ChannelAdapter } from "../adapters/channel-adapters.js";
export declare class DeploymentPlanner {
    private readonly adapters;
    constructor(adapters: ChannelAdapter[]);
    planForSource(sourceId: string, manifest: Manifest, lockFile: LockFile): Promise<Result<DeploymentPlan>>;
    private planTarget;
    private resolveDesiredAction;
    private inspectTargetPath;
    private buildExternalIdentityState;
    private readSkillIdentity;
    private buildExternalRelocationCandidate;
    private buildExternalRelocationLinkNames;
    private inspectExistingTargetPath;
    private buildProjectedLinkNameMap;
}

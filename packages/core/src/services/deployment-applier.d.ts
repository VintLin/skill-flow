import type { DeploymentAction, LockFile, Result } from "../domain/types.js";
export declare class DeploymentApplier {
    applyPlan(lockFile: LockFile, actions: DeploymentAction[]): Promise<Result<{
        applied: DeploymentAction[];
    }>>;
}

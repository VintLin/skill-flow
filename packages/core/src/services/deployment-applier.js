import fs from "node:fs/promises";
import path from "node:path";
import { copyDirectory, createSymlink, ensureDir, pathExists, removePath } from "../utils/fs.js";
import { ok } from "../utils/result.js";
export class DeploymentApplier {
    async applyPlan(lockFile, actions) {
        const applied = [];
        for (const action of actions) {
            if (action.kind === "blocked" || action.kind === "noop") {
                continue;
            }
            if (action.kind === "remove") {
                if (await pathExists(action.targetPath)) {
                    await removePath(action.targetPath);
                }
                lockFile.deployments = lockFile.deployments.filter((deployment) => !(deployment.sourceId === action.sourceId &&
                    deployment.leafId === action.leafId &&
                    deployment.target === action.target));
                applied.push(action);
                continue;
            }
            await ensureDir(path.dirname(action.targetPath));
            if (action.previousTargetPath &&
                action.previousTargetPath !== action.targetPath &&
                (await pathExists(action.previousTargetPath))) {
                await removePath(action.previousTargetPath);
            }
            if (action.relocateExternalToTargetPath &&
                (await pathExists(action.targetPath))) {
                await ensureDir(path.dirname(action.relocateExternalToTargetPath));
                await fs.rename(action.targetPath, action.relocateExternalToTargetPath);
            }
            if (action.strategy === "symlink") {
                await createSymlink(action.sourcePath, action.targetPath);
            }
            else {
                await copyDirectory(action.sourcePath, action.targetPath);
            }
            const nextRecord = {
                sourceId: action.sourceId,
                leafId: action.leafId,
                target: action.target,
                targetPath: action.targetPath,
                strategy: action.strategy,
                status: "active",
                contentHash: action.contentHash,
                appliedAt: new Date().toISOString(),
            };
            lockFile.deployments = [
                ...lockFile.deployments.filter((deployment) => !(deployment.sourceId === action.sourceId &&
                    deployment.leafId === action.leafId &&
                    deployment.target === action.target)),
                nextRecord,
            ];
            applied.push(action);
        }
        return ok({ applied });
    }
}
//# sourceMappingURL=deployment-applier.js.map
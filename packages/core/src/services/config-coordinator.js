import { fail, ok } from "../utils/result.js";
export class ConfigCoordinator {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async bootstrapWorkspaceState(onEvent) {
        onEvent?.({
            phase: "detect-targets",
            level: "info",
            message: "Detecting available agent targets...",
        });
        const availableTargets = await this.deps.getAvailableTargets();
        const pruned = await this.deps.pruneMissingCheckouts();
        if (!pruned.ok) {
            return fail(pruned.errors, pruned.warnings);
        }
        if (pruned.data.removedSourceIds.length > 0) {
            onEvent?.({
                phase: "refresh-sources",
                level: "warning",
                message: `Removed ${pruned.data.removedSourceIds.length} missing group${pruned.data.removedSourceIds.length === 1 ? "" : "s"} from config state.`,
            });
        }
        onEvent?.({
            phase: "normalize-bindings",
            level: "info",
            message: "Loading config state...",
        });
        const configData = await this.deps.getConfigData();
        if (!configData.ok) {
            return fail(configData.errors, configData.warnings);
        }
        onEvent?.({
            phase: "audit-projections",
            level: "info",
            message: "Auditing current projections...",
        });
        const audit = await this.deps.doctorService.run(configData.data.manifest, configData.data.lockFile);
        if (!audit.ok) {
            return fail(audit.errors, audit.warnings);
        }
        onEvent?.({
            phase: "build-summaries",
            level: "info",
            message: "Building config summaries...",
        });
        const summaries = this.deps.workflowService.getSummaries(configData.data.manifest, configData.data.lockFile, audit.data);
        const bootStatus = {
            phase: "success",
            updatedSourceIds: [],
            failedSources: [],
        };
        onEvent?.({
            phase: "done",
            level: "success",
            message: "Config bootstrap complete.",
        });
        return ok({
            availableTargets,
            manifest: configData.data.manifest,
            lockFile: configData.data.lockFile,
            summaries,
            initialDrafts: buildInitialDrafts(summaries),
            audit: audit.data,
            bootStatus,
        });
    }
}
function buildInitialDrafts(summaries) {
    return Object.fromEntries(summaries.map((summary) => {
        const enabledTargets = Object.entries(summary.bindings.targets)
            .filter(([, value]) => value?.enabled)
            .map(([target]) => target);
        const selectedLeafIds = [
            ...new Set((summary.bindings.selectedLeafIds && summary.bindings.selectedLeafIds.length > 0
                ? summary.bindings.selectedLeafIds
                : enabledTargets.flatMap((target) => summary.bindings.targets[target]?.leafIds ?? []))),
        ];
        return [summary.source.id, { enabledTargets, selectedLeafIds }];
    }));
}
//# sourceMappingURL=config-coordinator.js.map
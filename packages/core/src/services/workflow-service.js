export class WorkflowService {
    getSummaries(manifest, lockFile, audit) {
        return manifest.sources.map((source) => {
            const lock = lockFile.sources.find((item) => item.id === source.id);
            const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id);
            const bindings = manifest.bindings[source.id] ?? { targets: {} };
            const activeTargetCount = Object.values(bindings.targets).filter((binding) => binding?.enabled).length;
            const warningCount = leafs.reduce((count, leaf) => count + leaf.metadataWarnings.length, 0);
            const issueCounts = {
                warning: audit?.issues.filter((issue) => issue.sourceId === source.id && issue.severity === "warning").length ?? 0,
                error: audit?.issues.filter((issue) => issue.sourceId === source.id && issue.severity === "error").length ?? 0,
            };
            return {
                source,
                lock,
                leafs,
                bindings,
                activeTargetCount,
                health: this.resolveHealth(lock ? lock.invalidLeafs.length : 0, warningCount, activeTargetCount, lock, issueCounts),
                issueCounts,
                ...(issueCounts.error > 0
                    ? { healthReason: "audit errors detected" }
                    : issueCounts.warning > 0
                        ? { healthReason: "audit warnings detected" }
                        : {}),
            };
        });
    }
    resolveHealth(invalidLeafCount, warningCount, activeTargetCount, lock, issueCounts = { warning: 0, error: 0 }) {
        if (!lock) {
            return "BLOCKED";
        }
        if (issueCounts.error > 0) {
            return "BLOCKED";
        }
        if (invalidLeafCount > 0 || warningCount > 0 || issueCounts.warning > 0) {
            return "PARTIAL";
        }
        if (activeTargetCount === 0) {
            return "INACTIVE";
        }
        return "ACTIVE";
    }
}
//# sourceMappingURL=workflow-service.js.map
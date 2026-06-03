import type {
  DoctorReport,
  HealthStatus,
  LeafRecord,
  LockFile,
  Manifest,
  SourceBinding,
  WorkflowSummary,
} from "@skill-flow/domain/types";

export class WorkflowService {
  getSummaries(
    manifest: Manifest,
    lockFile: LockFile,
    audit?: DoctorReport,
  ): WorkflowSummary[] {
    return manifest.sources.map((source) => {
      const lock = lockFile.sources.find((item) => item.id === source.id);
      const bindings = manifest.bindings[source.id] ?? ({ targets: {} } satisfies SourceBinding);
      const leafs = this.resolveSourceLeafs(source, bindings, lockFile, manifest);
      const activeTargetCount = Object.values(bindings.targets).filter(
        (binding) => binding?.enabled,
      ).length;
      const warningCount = leafs.reduce(
        (count, leaf) => count + leaf.metadataWarnings.length,
        0,
      );
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
        health: this.resolveHealth(
          lock ? lock.invalidLeafs.length : 0,
          warningCount,
          activeTargetCount,
          lock,
          issueCounts,
          source.kind === "virtual",
        ),
        issueCounts,
        ...(issueCounts.error > 0
          ? { healthReason: "audit errors detected" }
          : issueCounts.warning > 0
            ? { healthReason: "audit warnings detected" }
            : {}),
      };
    });
  }

  private resolveSourceLeafs(
    source: Manifest["sources"][number],
    binding: SourceBinding,
    lockFile: LockFile,
    manifest: Manifest,
  ): LeafRecord[] {
    if (source.kind !== "virtual") {
      return lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id);
    }

    const sourceTitlesById = new Map(manifest.sources.map((item) => [item.id, item.displayName]));
    const selectedLeafIds = [
      ...new Set([
        ...(binding.selectedLeafIds ?? []),
        ...Object.values(binding.targets).flatMap((targetBinding) => targetBinding?.leafIds ?? []),
      ]),
    ];
    return selectedLeafIds
      .map((leafId) => lockFile.leafInventory.find((leaf) => leaf.id === leafId))
      .filter((leaf): leaf is LeafRecord => Boolean(leaf))
      .map((leaf) => {
        const sourceTitle = sourceTitlesById.get(leaf.sourceId);
        return {
          ...leaf,
          ...(sourceTitle ? { sourceTitle } : {}),
        };
      });
  }

  private resolveHealth(
    invalidLeafCount: number,
    warningCount: number,
    activeTargetCount: number,
    lock?: LockFile["sources"][number],
    issueCounts: { warning: number; error: number } = { warning: 0, error: 0 },
    isVirtualSource = false,
  ): HealthStatus {
    if (!lock && !isVirtualSource) {
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

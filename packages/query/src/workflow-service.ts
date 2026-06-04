import type {
  CollectionsFileV2,
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
    audit: DoctorReport | undefined,
    collections: CollectionsFileV2,
  ): WorkflowSummary[] {
    return manifest.sources.map((source) => {
      const lock = lockFile.sources.find((item) => item.id === source.id);
      const bindings = manifest.bindings[source.id] ?? ({ targets: {} } satisfies SourceBinding);
      const leafs = this.resolveSourceLeafs(source, lockFile, manifest, collections);
      const summarySource = this.resolveSummarySource(source, collections);
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
        source: summarySource,
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

  private resolveSummarySource(
    source: Manifest["sources"][number],
    collections: CollectionsFileV2,
  ): Manifest["sources"][number] {
    if (source.kind !== "virtual") {
      return source;
    }
    const displayName = this.resolveCollectionRecord(collections, source.id)?.displayName.trim();
    if (!displayName) {
      return source;
    }
    return {
      ...source,
      displayName,
      originalDisplayName: displayName,
    };
  }

  private resolveSourceLeafs(
    source: Manifest["sources"][number],
    lockFile: LockFile,
    manifest: Manifest,
    collections: CollectionsFileV2,
  ): LeafRecord[] {
    if (source.kind !== "virtual") {
      return lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id);
    }

    const sourceTitlesById = new Map(manifest.sources.map((item) => [item.id, item.displayName]));
    const leafsById = new Map(lockFile.leafInventory.map((leaf) => [leaf.id, leaf]));
    const collection = this.resolveCollectionRecord(collections, source.id);
    if (!collection) {
      return [];
    }

    return collection.members.flatMap((member): LeafRecord[] => {
      const leaf = leafsById.get(member.snapshot.leafId);
      if (!leaf) {
        return [];
      }
      const sourceTitle = sourceTitlesById.get(member.origin.sourceId)
        ?? member.origin.sourceLocator
        ?? member.origin.canonicalLocator;
      return [{
        ...leaf,
        sourceTitle,
      }];
    });
  }

  private resolveCollectionRecord(collections: CollectionsFileV2, sourceId: string) {
    return collections.collections[sourceId];
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

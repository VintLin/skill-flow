import type {
  HealthStatus,
  LockFile,
  Manifest,
  SourceBinding,
  WorkflowSummary,
} from "../domain/types.js";

export class WorkflowService {
  getSummaries(manifest: Manifest, lockFile: LockFile): WorkflowSummary[] {
    return manifest.sources.map((source) => {
      const lock = lockFile.sources.find((item) => item.id === source.id);
      const leafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id);
      const bindings = manifest.bindings[source.id] ?? ({ targets: {} } satisfies SourceBinding);
      const activeTargetCount = Object.values(bindings.targets).filter(
        (binding) => binding?.enabled,
      ).length;
      const warningCount = leafs.reduce(
        (count, leaf) => count + leaf.metadataWarnings.length,
        0,
      );

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
        ),
      };
    });
  }

  private resolveHealth(
    invalidLeafCount: number,
    warningCount: number,
    activeTargetCount: number,
    lock?: LockFile["sources"][number],
  ): HealthStatus {
    if (!lock) {
      return "BLOCKED";
    }
    if (invalidLeafCount > 0 || warningCount > 0) {
      return "PARTIAL";
    }
    if (activeTargetCount === 0) {
      return "INACTIVE";
    }
    return "ACTIVE";
  }
}

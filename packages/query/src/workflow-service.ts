import type {
  CollectionsFile,
  DeploymentTargetId,
  DoctorReport,
  HealthStatus,
  LeafSummaryRecord,
  LockFile,
  ManifestFile,
  SourceBindingSummary,
  SourceLockSummaryRecord,
  SourceSummaryRecord,
  WorkflowSummary,
} from "@skill-flow/domain/types";
import { deriveDisplayName } from "@skill-flow/integration/utils/source-id";

type NormalizedSourceBinding = {
  selectionMode: "all" | "selected";
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
};

export class WorkflowService {
  getSummaries(
    manifest: ManifestFile,
    lockFile: LockFile,
    audit: DoctorReport | undefined,
    collections: CollectionsFile,
  ): WorkflowSummary[] {
    return manifest.sources.map((source) => {
      const lock = lockFile.sources[source.id];
      const sourceBinding = manifest.bindings[source.id];
      const bindings = this.sourceBindingToSummaryBinding(sourceBinding, lock?.leafIds ?? []);
      const leafs = this.resolveSourceLeafs(source, lockFile, manifest, collections);
      const summarySource = this.resolveSummarySource(source, sourceBinding, collections);
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
      const invalidLeafCount = lockFile.leafInventory.filter(
        (leaf) => leaf.sourceId === source.id && !leaf.valid,
      ).length;

      return {
        source: summarySource,
        lock: lock ? this.sourceLockToSummaryLock(lock, source, lockFile) : undefined,
        leafs,
        bindings,
        activeTargetCount,
        health: this.resolveHealth(
          invalidLeafCount,
          warningCount,
          activeTargetCount,
          Boolean(lock),
          issueCounts,
          source.kind === "collection",
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
    source: ManifestFile["sources"][number],
    binding: ManifestFile["bindings"][string] | undefined,
    collections: CollectionsFile,
  ): SourceSummaryRecord {
    const collectionDisplayName = this.resolveCollectionRecord(collections, source.id)?.displayName.trim();
    const displayName = collectionDisplayName || source.displayName;
    const selectionMode = this.authoritativeSelectionMode(binding);
    return {
      id: source.id,
      locator: source.locator,
      kind: source.kind,
      displayName,
      originalDisplayName: collectionDisplayName || this.originalDisplayNameForSource(source),
      addedAt: source.createdAt,
      ...(selectionMode ? { selectionMode } : {}),
      ...(source.requestedPath ? { requestedPath: source.requestedPath } : {}),
      ...(source.originRequestedPath ? { originRequestedPath: source.originRequestedPath } : {}),
      ...(source.canonicalLocator !== source.locator ? { originLocator: source.canonicalLocator } : {}),
    };
  }

  private resolveSourceLeafs(
    source: ManifestFile["sources"][number],
    lockFile: LockFile,
    manifest: ManifestFile,
    collections: CollectionsFile,
  ): LeafSummaryRecord[] {
    if (source.kind !== "collection") {
      return lockFile.leafInventory
        .filter((leaf) => leaf.sourceId === source.id && leaf.valid)
        .map((leaf) => this.leafToSummaryLeaf(leaf, source.displayName));
    }

    const sourceTitlesById = new Map(manifest.sources.map((item) => [item.id, item.displayName]));
    const leafsById = new Map(lockFile.leafInventory.filter((leaf) => leaf.valid).map((leaf) => [
      leaf.id,
      this.leafToSummaryLeaf(leaf, sourceTitlesById.get(leaf.sourceId)),
    ]));
    const collection = this.resolveCollectionRecord(collections, source.id);
    if (!collection) {
      return [];
    }

    return collection.members.flatMap((member): LeafSummaryRecord[] => {
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

  private resolveCollectionRecord(collections: CollectionsFile, sourceId: string) {
    return collections.collections[sourceId];
  }

  private sourceBindingToSummaryBinding(
    binding: ManifestFile["bindings"][string] | undefined,
    leafIds: string[],
  ): SourceBindingSummary {
    const normalized = this.normalizeSourceBinding(binding, leafIds);
    if (!normalized) {
      return { selectedLeafIds: [], targets: {} };
    }
    const selectedLeafIds = normalized.selectionMode === "all" ? [...leafIds] : [...normalized.selectedLeafIds];
    return {
      selectedLeafIds,
      targets: Object.fromEntries(
        normalized.enabledTargets.map((target) => [
          target,
          { enabled: true, leafIds: [...selectedLeafIds] },
        ]),
      ),
    };
  }

  private normalizeSourceBinding(
    binding: ManifestFile["bindings"][string] | undefined,
    leafIds: string[],
  ): NormalizedSourceBinding | undefined {
    if (!binding || typeof binding !== "object") {
      return undefined;
    }
    const record = binding as Record<string, unknown>;
    const selectedLeafIds = this.stringArray(record.selectedLeafIds);
    const enabledTargets = this.stringArray(record.enabledTargets) as DeploymentTargetId[];
    const hasCurrentBindingShape =
      Array.isArray(record.enabledTargets) ||
      Array.isArray(record.selectedLeafIds) ||
      record.selectionMode === "all" ||
      record.selectionMode === "selected";
    if (hasCurrentBindingShape) {
      return {
        selectionMode: record.selectionMode === "all" ? "all" : "selected",
        selectedLeafIds,
        enabledTargets,
      };
    }
    return undefined;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private authoritativeSelectionMode(
    binding: ManifestFile["bindings"][string] | undefined,
  ): "all" | "selected" | undefined {
    if (!binding || typeof binding !== "object") {
      return undefined;
    }

    return binding.selectionMode === "all" || binding.selectionMode === "selected"
      ? binding.selectionMode
      : undefined;
  }

  private sourceLockToSummaryLock(
    source: LockFile["sources"][string],
    manifestSource: ManifestFile["sources"][number],
    lockFile: LockFile,
  ): SourceLockSummaryRecord {
    return {
      id: source.sourceId,
      locator: source.canonicalLocator,
      kind: source.revision.provider,
      displayName: manifestSource.displayName,
      originalDisplayName: this.originalDisplayNameForSource(manifestSource),
      checkoutPath: source.localPath,
      updatedAt: source.revision.capturedAt,
      leafIds: [...source.leafIds],
      invalidLeafs: lockFile.leafInventory
        .filter((leaf) => leaf.sourceId === source.sourceId && !leaf.valid)
        .map((leaf) => ({
          path: leaf.relativePath,
          reason: (leaf.diagnostics ?? []).map((diagnostic) => diagnostic.message).join("; ") || "Leaf is invalid.",
        })),
      ...("commit" in source.revision && source.revision.commit ? { commitSha: source.revision.commit } : {}),
      ...(source.packageSlug ? { packageSlug: source.packageSlug } : {}),
      ...(source.resolvedVersion ? { resolvedVersion: source.resolvedVersion } : {}),
      ...(source.contentHash ? { contentHash: source.contentHash } : {}),
      ...(source.versionMode ? { versionMode: source.versionMode } : {}),
      ...(source.originBranch ? { originBranch: source.originBranch } : {}),
      ...(source.importedFromTargets ? { importedFromTargets: [...source.importedFromTargets] } : {}),
      ...(source.observedTargets ? { observedTargets: source.observedTargets.map((target) => ({ ...target })) } : {}),
      ...(source.importMode ? { importMode: source.importMode } : {}),
    };
  }

  private originalDisplayNameForSource(source: ManifestFile["sources"][number]): string {
    return deriveDisplayName(source.locator);
  }

  private leafToSummaryLeaf(
    leaf: LockFile["leafInventory"][number],
    sourceTitle: string | undefined,
  ): LeafSummaryRecord {
    const diagnostics = (leaf.diagnostics ?? []).map((diagnostic) => diagnostic.message);
    return {
      id: leaf.id,
      sourceId: leaf.sourceId,
      name: leaf.title ?? leaf.name ?? leaf.linkName,
      linkName: leaf.linkName,
      title: leaf.title,
      description: leaf.description,
      relativePath: leaf.relativePath,
      absolutePath: leaf.absolutePath,
      skillFilePath: leaf.skillFilePath,
      contentHash: leaf.contentHash,
      metadataWarnings: diagnostics,
      ...(sourceTitle ? { sourceTitle } : {}),
      valid: true,
    };
  }

  private resolveHealth(
    invalidLeafCount: number,
    warningCount: number,
    activeTargetCount: number,
    hasLock = false,
    issueCounts: { warning: number; error: number } = { warning: 0, error: 0 },
    isCollectionSource = false,
  ): HealthStatus {
    if (!hasLock && !isCollectionSource) {
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

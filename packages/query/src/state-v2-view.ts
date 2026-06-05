import type {
  DeploymentRecord,
  DeploymentTargetId,
  DeploymentStrategy,
  DraftBinding,
  LeafRecord,
  LockFile,
  LockFileV2,
  Manifest,
  ManifestFileV2,
  PreferencesFileV2,
  ProjectionRecord,
  SharedPreferences,
  SourceBinding,
  SourceBindingV2,
  SourceKind,
  SourceKindV2,
  SourceLockRecord,
  SourceManifestRecord,
} from "@skill-flow/domain/types";

export type StateV2AuthorityView = {
  manifest: Manifest;
  lockFile: LockFileV2View;
  preferences: SharedPreferences;
};

export type ProjectionStatusView = Readonly<{
  sourceId: string;
  leafId: string;
  target: DeploymentTargetId;
  targetPath: string;
  targetRootPath?: string;
  strategy: DeploymentStrategy;
  status: LockFileV2["projections"][number]["status"];
  contentHash: string;
  updatedAt: string;
}>;

export type LockFileV2View = LockFile & {
  readonly projectionViews: readonly ProjectionStatusView[];
};

export type StateV2AuthorityFiles = {
  manifest: ManifestFileV2;
  lockFile: LockFileV2;
  preferences: PreferencesFileV2;
};

export function projectStateV2ToView(state: StateV2AuthorityFiles): StateV2AuthorityView {
  return {
    manifest: projectManifestV2ToView(state.manifest, state.lockFile),
    lockFile: projectLockFileV2ToView(state.lockFile, state.manifest),
    preferences: projectPreferencesV2ToView(state.preferences),
  };
}

export function projectManifestV2ToView(
  manifest: ManifestFileV2,
  lockFile: Pick<LockFileV2, "sources">,
): Manifest {
  return {
    schemaVersion: 1,
    sources: manifest.sources.map(projectSourceManifestV2ToView),
    bindings: Object.fromEntries(
      Object.entries(manifest.bindings).map(([sourceId, binding]) => [
        sourceId,
        projectSourceBindingV2ToView(binding, lockFile.sources[sourceId]?.leafIds ?? []),
      ]),
    ),
  };
}

export function projectSourceBindingV2ToView(
  binding: SourceBindingV2,
  sourceLeafIds: string[],
): SourceBinding {
  const selectedLeafIds = binding.selectionMode === "all"
    ? [...sourceLeafIds]
    : [...binding.selectedLeafIds];

  return {
    selectedLeafIds,
    targets: Object.fromEntries(
      binding.enabledTargets.map((target) => [
        target,
        {
          enabled: true,
          leafIds: [...selectedLeafIds],
        },
      ]),
    ),
  };
}

export function projectLockFileV2ToView(
  lockFile: LockFileV2,
  manifest: Pick<ManifestFileV2, "sources">,
): LockFileV2View {
  const manifestSourceById = new Map(manifest.sources.map((source) => [source.id, source]));
  const activeDeployments = lockFile.projections
    .filter((projection) => projection.status === "active")
    .map(projectProjectionV2ToDeploymentView);
  const projections = activeDeployments.map(projectDeploymentToManagedProjectionView);
  const projectionViews = lockFile.projections.map(projectProjectionV2ToView);

  return {
    schemaVersion: 1,
    sources: Object.values(lockFile.sources).map((source) =>
      projectSourceLockV2ToView(source, manifestSourceById.get(source.sourceId), lockFile),
    ),
    leafInventory: lockFile.leafInventory
      .filter((leaf) => leaf.valid)
      .map((leaf) => projectLeafV2ToView(leaf, manifestSourceById.get(leaf.sourceId)?.displayName)),
    projections,
    projectionViews,
    deployments: activeDeployments,
  };
}

export function projectPreferencesV2ToView(preferences: PreferencesFileV2): SharedPreferences {
  return {
    schemaVersion: 1,
    pinnedSourceIds: [...preferences.pinnedSourceIds],
    selectedProjectScope: { ...preferences.selectedProjectScope },
    recentProjects: preferences.recentProjects.map((project) => ({
      ...project,
      ...(project.tools ? { tools: [...project.tools] } : {}),
    })),
    projectDrafts: Object.fromEntries(
      Object.entries(preferences.projectSourceDrafts).map(([projectId, drafts]) => [
        projectId,
        Object.fromEntries(
          Object.entries(drafts).map(([sourceId, draft]) => [
            sourceId,
            {
              selectedLeafIds: [...draft.selectedLeafIds],
              enabledTargets: [...draft.enabledTargets],
            } satisfies DraftBinding,
          ]),
        ),
      ]),
    ),
    customTargets: preferences.customTargets.map((target) => ({ ...target })),
    agentDisplayOrder: [...preferences.agentDisplayOrder],
  };
}

export function projectSourceKindV2ToView(kind: SourceKindV2): SourceKind {
  switch (kind) {
    case "github":
      return "git";
    case "collection":
      return "virtual";
    case "git":
    case "local":
      return kind;
  }
}

function projectSourceManifestV2ToView(source: ManifestFileV2["sources"][number]): SourceManifestRecord {
  return {
    id: source.id,
    locator: source.locator,
    kind: projectSourceKindV2ToView(source.kind),
    displayName: source.displayName,
    originalDisplayName: source.displayName,
    addedAt: source.createdAt,
    ...(source.canonicalLocator !== source.locator ? { originLocator: source.canonicalLocator } : {}),
  };
}

function projectSourceLockV2ToView(
  source: LockFileV2["sources"][string],
  manifestSource: ManifestFileV2["sources"][number] | undefined,
  lockFile: LockFileV2,
): SourceLockRecord {
  const invalidLeafs = lockFile.leafInventory
    .filter((leaf) => leaf.sourceId === source.sourceId && !leaf.valid)
    .map((leaf) => ({
      path: leaf.relativePath,
      reason: leaf.diagnostics.length > 0
        ? leaf.diagnostics.map((diagnostic) => diagnostic.message).join("; ")
        : "Leaf is invalid.",
    }));

  return {
    id: source.sourceId,
    locator: source.canonicalLocator,
    kind: projectSourceKindV2ToView(source.revision.provider),
    displayName: manifestSource?.displayName ?? source.sourceId,
    originalDisplayName: manifestSource?.displayName ?? source.sourceId,
    checkoutPath: source.localPath,
    updatedAt: source.revision.capturedAt,
    leafIds: [...source.leafIds],
    invalidLeafs,
    ...(source.revision.commit ? { commitSha: source.revision.commit } : {}),
  };
}

function projectLeafV2ToView(
  leaf: LockFileV2["leafInventory"][number],
  sourceTitle: string | undefined,
): LeafRecord {
  return {
    id: leaf.id,
    sourceId: leaf.sourceId,
    name: leaf.displayName,
    linkName: leaf.linkName,
    title: leaf.title,
    description: leaf.description,
    relativePath: leaf.relativePath,
    absolutePath: leaf.absolutePath,
    skillFilePath: leaf.skillFilePath,
    contentHash: leaf.contentHash,
    metadataWarnings: leaf.diagnostics.map((diagnostic) => diagnostic.message),
    ...(sourceTitle ? { sourceTitle } : {}),
    valid: true,
  };
}

function projectProjectionV2ToDeploymentView(
  projection: LockFileV2["projections"][number],
): DeploymentRecord {
  return {
    sourceId: projection.sourceId,
    leafId: projection.leafId,
    target: projection.target,
    targetPath: projection.targetPath,
    ...(projection.targetRootPath ? { targetRootPath: projection.targetRootPath } : {}),
    strategy: projection.strategy,
    status: "active",
    contentHash: projection.contentHash,
    appliedAt: projection.updatedAt,
  };
}

function projectDeploymentToManagedProjectionView(deployment: DeploymentRecord): ProjectionRecord {
  return {
    ...deployment,
    mode: "managed",
  };
}

function projectProjectionV2ToView(
  projection: LockFileV2["projections"][number],
): ProjectionStatusView {
  return {
    sourceId: projection.sourceId,
    leafId: projection.leafId,
    target: projection.target,
    targetPath: projection.targetPath,
    ...(projection.targetRootPath ? { targetRootPath: projection.targetRootPath } : {}),
    strategy: projection.strategy,
    status: projection.status,
    contentHash: projection.contentHash,
    updatedAt: projection.updatedAt,
  };
}

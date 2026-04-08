import type { DeploymentTargetId, LockFile, ProjectionRecord, SourceLockRecord } from "./types.js";

export function getManagedDeployments(lockFile: LockFile): LockFile["deployments"] {
  if (!(lockFile.projections?.length)) {
    return lockFile.deployments ?? [];
  }

  return (lockFile.projections ?? [])
    .filter((projection) => projection.mode === "managed")
    .map(({ mode: _mode, ...deployment }) => deployment);
}

export function getBootstrapImportedTargets(
  lockFile: LockFile,
  sourceLock: SourceLockRecord,
): DeploymentTargetId[] {
  return [
    ...new Set([
      ...(lockFile.projections ?? [])
        .filter(
          (projection) =>
            projection.mode === "bootstrap-imported" &&
            projection.sourceId === sourceLock.id,
        )
        .map((projection) => projection.target),
      ...(sourceLock.observedTargets?.map((item) => item.target) ?? []),
      ...(sourceLock.importedFromTargets ?? []),
    ]),
  ];
}

export function normalizeProjectionRecords(lockFile: LockFile): ProjectionRecord[] {
  const explicitProjections = (lockFile.projections ?? []).map((projection) => ({
    ...projection,
    mode: projection.mode ?? "managed",
  }));
  const explicitManagedProjections = explicitProjections.filter(
    (projection) => projection.mode === "managed",
  );
  const explicitNonManagedProjections = explicitProjections.filter(
    (projection) => projection.mode !== "managed",
  );
  const managedProjections = (
    explicitManagedProjections.length > 0
      ? explicitManagedProjections
      : (lockFile.deployments ?? []).map((deployment) => ({
          ...deployment,
          mode: "managed" as const,
        }))
  );
  const projectionByKey = new Map<string, ProjectionRecord>();

  for (const projection of [...managedProjections, ...explicitNonManagedProjections]) {
    projectionByKey.set(
      [
        projection.mode,
        projection.sourceId,
        projection.leafId,
        projection.target,
        projection.targetPath,
      ].join("\n"),
      projection,
    );
  }

  return [...projectionByKey.values()];
}

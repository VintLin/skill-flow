import type {
  DeploymentTargetId,
  LockFile,
  ProjectionRecord,
  SourceLockRecord,
} from "@skill-flow/domain/types";

export function activeProjections(lockFile: Pick<LockFile, "projections">): ProjectionRecord[] {
  return lockFile.projections.filter((projection) => projection.status === "active");
}

export function bootstrapImportedTargets(
  lockFile: Pick<LockFile, "projections">,
  sourceLock: SourceLockRecord,
): DeploymentTargetId[] {
  return [
    ...new Set([
      ...lockFile.projections
        .filter(
          (projection) =>
            projection.status === "active" &&
            projection.sourceId === sourceLock.sourceId,
        )
        .map((projection) => projection.target),
      ...(sourceLock.observedTargets?.map((item) => item.target) ?? []),
      ...(sourceLock.importedFromTargets ?? []),
    ]),
  ];
}

export const managedProjections = activeProjections;

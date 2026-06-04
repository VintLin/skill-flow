import type { LockFileV2, ProjectionRecordV2 } from "./types.js";

export function getActiveProjectionsV2(lockFile: LockFileV2): ProjectionRecordV2[] {
  return lockFile.projections.filter((projection) => projection.status === "active");
}

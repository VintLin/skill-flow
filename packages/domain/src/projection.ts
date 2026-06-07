import type { LockFile, ProjectionRecord } from "./types.js";

export function getActiveProjections(lockFile: LockFile): ProjectionRecord[] {
  return lockFile.projections.filter((projection) => projection.status === "active");
}

import type { DoctorReport, LockFile, Manifest, WorkflowSummary } from "../domain/types.js";
export declare class WorkflowService {
    getSummaries(manifest: Manifest, lockFile: LockFile, audit?: DoctorReport): WorkflowSummary[];
    private resolveHealth;
}

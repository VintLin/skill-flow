import type { DoctorReport, LockFile, Manifest, Result } from "../domain/types.js";
export declare class DoctorService {
    private readonly adapters;
    run(manifest: Manifest, lockFile: LockFile): Promise<Result<DoctorReport>>;
    private getLeafPath;
    private reportUnmanagedExternalSkills;
}

import fs from "node:fs/promises";
import type { ProjectInspection } from "./project-doctor.js";
import { inspectProjectSkillDirectory } from "./project-skill-inspection.js";

/** External ownership is informational; only confirmed unusability is an error. */
export async function inspectExternalProjectSkill(
  skillPath: string,
  targets: string[],
  inspection: ProjectInspection,
): Promise<boolean> {
  const context = { sourceId: "project", path: skillPath, targets, code: "PROJECT_EXTERNAL_INVALID_SKILL" };
  try {
    const entry = await fs.lstat(skillPath);
    if (entry.isSymbolicLink()) {
      try {
        await fs.stat(skillPath);
      } catch (error) {
        if (["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
          inspection.issues.push({ ...context, code: "PROJECT_EXTERNAL_BROKEN_SYMLINK", severity: "error",
            message: "External project Skill link is broken or cyclic. Check its destination." });
        } else {
          inspection.incomplete(skillPath, error, context);
        }
        return false;
      }
    }
  } catch (error) {
    // A scanned candidate disappearing mid-check is uncertainty, not an empty root.
    inspection.incomplete(skillPath, error, context);
    return false;
  }
  return inspectProjectSkillDirectory(skillPath, inspection, context);
}

import fs from "node:fs/promises";
import { hashDirectory } from "@skill-flow/integration/utils/fs";
import { isMissing, type ExpectedProjectSkill, type ProjectInspection } from "./project-doctor.js";
import { inspectProjectSkillDirectory } from "./project-skill-inspection.js";

/** Compare current content, without inferring which side changed or repairing either. */
export async function inspectProjectCopy(entry: ExpectedProjectSkill, inspection: ProjectInspection): Promise<void> {
  if (entry.definition.strategy !== "copy") return;
  const sourcePath = entry.leaf.absolutePath;
  async function readHash(location: string, source: boolean): Promise<string | undefined> {
    try {
      const stats = await fs.stat(location);
      if (!stats.isDirectory()) {
        inspection.issues.push({ ...entry.issue, severity: "error", path: location,
          code: source ? "PROJECT_SOURCE_INVALID" : "PROJECT_PATH_CONFLICT",
          message: source ? "The current Skill source is not a directory." : "The expected project copy is not a directory." });
        return undefined;
      }
    } catch (error) {
      if (isMissing(error)) inspection.issues.push({ ...entry.issue, severity: "error", path: location,
        code: source ? "PROJECT_SOURCE_MISSING" : "PROJECT_DEPLOYMENT_MISSING",
        message: source ? "The current Skill source is missing on disk." : "Expected project deployment is missing on disk." });
      else inspection.incomplete(location, error, entry.issue);
      return undefined;
    }
    if (source && !await inspectProjectSkillDirectory(location, inspection, { ...entry.issue, code: "PROJECT_SOURCE_INVALID" })) return undefined;
    try {
      return await hashDirectory(location, { symlinkPolicy: "preserve-safe" });
    } catch (error) {
      // A missing nested file may be a concurrent edit, not a missing deployment.
      inspection.incomplete(location, error, entry.issue);
      return undefined;
    }
  }
  const sourceHash = await readHash(sourcePath, true);
  const copyHash = await readHash(entry.path, false);
  if (sourceHash === undefined || copyHash === undefined || sourceHash === copyHash) return;
  inspection.issues.push({ ...entry.issue, severity: "warning", code: "PROJECT_COPY_DIFFERENT",
    message: "The project copy differs from the current source content. The comparison does not identify which side changed.",
    advice: "Review both versions before choosing which content to keep."
      + (entry.definition.kind === "custom"
        ? " You can change this Agent's deployment strategy to symlink and apply it to reflect subsequent changes to the linked local source. This does not update a remote repository."
        : ""),
  });
}

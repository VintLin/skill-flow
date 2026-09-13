import fs from "node:fs/promises";
import path from "node:path";
import type { DoctorIssue } from "@skill-flow/domain/types";
import { parseSkillFile } from "@skill-flow/core-engine/services/inventory-service";
import { isMissing, type ExpectedProjectSkill, type ProjectInspection } from "./project-doctor.js";

/** The same parser rules as inventory scanning, with filesystem uncertainty kept separate. */
export async function inspectProjectSkillDirectory(
  skillPath: string,
  inspection: ProjectInspection,
  context: Partial<DoctorIssue> = {},
): Promise<boolean> {
  const invalid = (message: string) => {
    inspection.issues.push({ sourceId: "project", ...context, severity: "error", path: skillPath,
      code: context.code ?? "PROJECT_SKILL_INVALID", message });
    return false;
  };
  try {
    if (!(await fs.stat(skillPath)).isDirectory()) return invalid("Skill path is not a directory.");
    const skillFilePath = path.join(skillPath, "SKILL.md");
    if (!(await fs.stat(skillFilePath)).isFile()) return invalid("SKILL.md is not a regular file.");
    const parsed = parseSkillFile(await fs.readFile(skillFilePath, "utf8"), path.basename(skillPath));
    return parsed.valid || invalid(parsed.reason);
  } catch (error) {
    if (isMissing(error) || (error as NodeJS.ErrnoException).code === "ELOOP") {
      return invalid(`Skill directory or SKILL.md is missing or unusable: ${String(error)}`);
    }
    inspection.incomplete(skillPath, error, context);
    return false;
  }
}

export async function inspectProjectSymlink(entry: ExpectedProjectSkill, inspection: ProjectInspection): Promise<void> {
  let actual: string;
  try { actual = await fs.realpath(entry.path); } catch (error) {
    if (isMissing(error) || (error as NodeJS.ErrnoException).code === "ELOOP") {
      inspection.issues.push({ ...entry.issue, severity: "error", code: "PROJECT_BROKEN_SYMLINK", message: "Project deployment symlink is broken or cyclic." });
    } else inspection.incomplete(entry.path, error, entry.issue);
    return;
  }
  let intended: string;
  try { intended = await fs.realpath(entry.leaf.absolutePath); } catch (error) {
    if (isMissing(error)) inspection.issues.push({ ...entry.issue, path: entry.leaf.absolutePath, severity: "error", code: "PROJECT_SOURCE_MISSING", message: "Current source Skill is missing." });
    else inspection.incomplete(entry.leaf.absolutePath, error, entry.issue);
    return;
  }
  if (actual !== intended) {
    inspection.issues.push({ ...entry.issue, severity: "error", code: "PROJECT_SYMLINK_MISDIRECTED",
      message: `Project symlink points to '${actual}'; expected '${intended}'.` });
    return;
  }
  await inspectProjectSkillDirectory(entry.path, inspection, entry.issue);
}

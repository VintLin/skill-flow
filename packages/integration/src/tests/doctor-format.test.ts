import { describe, expect, test } from "vitest";
import { formatDoctorIssue } from "../utils/format.js";

describe("doctor issue presentation", () => {
  test("preserves existing global summary", () => {
    expect(formatDoctorIssue({ severity: "warning", sourceId: "source", code: "COPY_DRIFT", message: "Contents differ" }))
      .toBe("[WARNING] source Contents differ");
  });
  test("includes path, all associated Agents and actionable advice", () => {
    const output = formatDoctorIssue({ severity: "warning", sourceId: "source", code: "COPY_CONTENT_MISMATCH", message: "Contents differ", path: "/project/.agents/skills/example", targets: ["codex", "cursor"], advice: "Switch to symlink deployment." });
    expect(output).toContain("Path: /project/.agents/skills/example");
    expect(output).toContain("Codex");
    expect(output).toContain("Cursor");
    expect(output).toContain("Switch to symlink deployment.");
  });
});

import { describe, expect, test } from "vitest";
import { normalizeImportRepoPathSelector } from "../utils/skills-directory.js";

describe("import selector utilities", () => {
  test.each([
    [".", undefined, "."],
    ["./skills/frontend-design", undefined, "skills/frontend-design"],
    ["archive-root/skills/frontend-design", "archive-root", "skills/frontend-design"],
  ])("normalizes repoPath selector %s", (input, archiveRoot, expected) => {
    const options = archiveRoot ? { archiveRoot } : {};
    expect(normalizeImportRepoPathSelector(input, options)).toEqual({
      kind: "repoPath",
      path: expected,
    });
  });

  test.each([
    ["/Users/me/skills/frontend-design"],
    ["../skills/frontend-design"],
    ["skills//frontend-design"],
    ["skills/../../secret"],
    ["skills/\u0000bad"],
  ])("rejects invalid repoPath selector %s", (input) => {
    expect(() => normalizeImportRepoPathSelector(input)).toThrow("IMPORT_SELECTOR_INVALID");
  });
});

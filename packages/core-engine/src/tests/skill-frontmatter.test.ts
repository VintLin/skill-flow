import { describe, expect, test } from "vitest";
import { parseSkillFrontmatter } from "../services/skill-frontmatter.js";

describe("skill frontmatter parser", () => {
  test("preserves scalar and block values exactly", () => {
    const parsed = parseSkillFrontmatter([
      "---",
      String.raw`double: "line\ncarriage\rtab\tquote\"slash\\"`,
      "single: 'it''s exact'",
      "literal: |",
      "  first",
      "",
      "  third",
      "folded: >",
      "  alpha",
      "  beta",
      "---",
      "body",
    ].join("\r\n"));

    expect(parsed).toEqual({
      data: {
        double: "line\ncarriage\rtab\tquote\"slash\\",
        single: "it's exact",
        literal: "first\n\nthird",
        folded: "alpha\nbeta",
      },
      bodyStartLine: 11,
    });
  });

  test("returns undefined for absent or unterminated frontmatter", () => {
    expect(parseSkillFrontmatter("# Skill")).toBeUndefined();
    expect(parseSkillFrontmatter("---\nname: incomplete")).toBeUndefined();
  });
});

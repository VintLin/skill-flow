import { describe, expect, test } from "vitest";
import { parseSkillsSourcePage } from "../utils/source-details.js";

describe("parseSkillsSourcePage", () => {
  test("extracts total installs and repo URL from a skills.sh source page", () => {
    const html = `
      <div>
        <span>735.1K<!-- --> total installs</span>
        <a href="https://github.com/vercel-labs/skills">GitHub</a>
      </div>
    `;

    expect(parseSkillsSourcePage(html)).toEqual({
      totalInstalls: 735100,
      repoUrl: "https://github.com/vercel-labs/skills",
      repoLabel: "vercel-labs/skills",
    });
  });
});

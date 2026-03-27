import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildImportGroupCandidate,
  buildImportRepoAliases,
  groupSkillsDirectorySearchHits,
  normalizeImportCanonicalRepo,
  parseSkillsSourcePage,
  searchSkillsDirectory,
} from "../utils/skills-directory.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("normalizeImportCanonicalRepo", () => {
  test("normalizes github shorthands and urls to one canonical repo", () => {
    expect(normalizeImportCanonicalRepo("vercel-labs/agent-browser")).toBe("vercel-labs/agent-browser");
    expect(normalizeImportCanonicalRepo("https://github.com/vercel-labs/agent-browser")).toBe("vercel-labs/agent-browser");
    expect(normalizeImportCanonicalRepo("https://github.com/vercel-labs/agent-browser.git")).toBe("vercel-labs/agent-browser");
    expect(normalizeImportCanonicalRepo("git@github.com:vercel-labs/agent-browser.git")).toBe("vercel-labs/agent-browser");
  });

  test("applies placeholder aliases to the canonical repo", () => {
    expect(normalizeImportCanonicalRepo("anthropic/skills")).toBe("anthropics/skills");
    expect(normalizeImportCanonicalRepo("https://github.com/anthropic/skills")).toBe("anthropics/skills");
  });
});

describe("buildImportRepoAliases", () => {
  test("includes placeholder aliases and git transport variants", () => {
    expect(buildImportRepoAliases("anthropics/skills")).toEqual([
      "anthropics/skills",
      "https://github.com/anthropics/skills",
      "https://github.com/anthropics/skills.git",
      "git@github.com:anthropics/skills.git",
      "anthropic/skills",
      "https://github.com/anthropic/skills",
      "https://github.com/anthropic/skills.git",
      "git@github.com:anthropic/skills.git",
    ]);
  });
});

describe("parseSkillsSourcePage", () => {
  test("extracts title, skill count, installs and repo url from a source page", () => {
    const html = `
      <h1>anthropics<!-- -->/<!-- -->skills</h1>
      <span>18<!-- --> <!-- -->skills</span>
      <span>735.1K<!-- --> total installs</span>
      <a href="https://github.com/anthropics/skills">GitHub</a>
    `;

    expect(parseSkillsSourcePage(html)).toEqual({
      title: "skills",
      skillCount: 18,
      totalInstalls: 735100,
      repoUrl: "https://github.com/anthropics/skills",
      repoLabel: "anthropics/skills",
    });
  });
});

describe("searchSkillsDirectory", () => {
  test("normalizes search hits into canonical repos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [
          {
            id: "anthropic/skills/research",
            skillId: "research",
            name: "research",
            installs: 1200,
            source: "anthropic/skills",
          },
          {
            id: "anthropics/skills/debugging",
            skillId: "debugging",
            name: "debugging",
            installs: 900,
            source: "anthropics/skills",
          },
        ],
      }),
    }));

    await expect(searchSkillsDirectory("skills")).resolves.toEqual([
      {
        id: "anthropic/skills/research",
        skillId: "research",
        name: "research",
        installs: 1200,
        source: "anthropic/skills",
        canonicalRepo: "anthropics/skills",
      },
      {
        id: "anthropics/skills/debugging",
        skillId: "debugging",
        name: "debugging",
        installs: 900,
        source: "anthropics/skills",
        canonicalRepo: "anthropics/skills",
      },
    ]);
  });
});

describe("groupSkillsDirectorySearchHits", () => {
  test("groups multiple skill hits under one repo", () => {
    expect(groupSkillsDirectorySearchHits([
      {
        id: "a",
        skillId: "research",
        name: "research",
        source: "anthropics/skills",
        canonicalRepo: "anthropics/skills",
      },
      {
        id: "b",
        skillId: "debugging",
        name: "debugging",
        source: "anthropics/skills",
        canonicalRepo: "anthropics/skills",
      },
      {
        id: "c",
        skillId: "deploy",
        name: "deploy",
        source: "vercel-labs/agent-skills",
        canonicalRepo: "vercel-labs/agent-skills",
      },
    ])).toEqual([
      {
        canonicalRepo: "anthropics/skills",
        matchedSkillNames: ["research", "debugging"],
      },
      {
        canonicalRepo: "vercel-labs/agent-skills",
        matchedSkillNames: ["deploy"],
      },
    ]);
  });
});

describe("buildImportGroupCandidate", () => {
  test("creates a ready card candidate with core-owned aliases", () => {
    expect(buildImportGroupCandidate({
      canonicalRepo: "anthropics/skills",
      installed: false,
      matchedSkillNames: ["research"],
      details: {
        title: "skills",
        totalInstalls: 735100,
      },
    })).toMatchObject({
      id: "anthropics/skills",
      locator: "anthropics/skills",
      canonicalRepo: "anthropics/skills",
      installed: false,
      title: "skills",
      totalInstalls: 735100,
      matchedSkillNames: ["research"],
      enrichState: { status: "ready" },
      previewState: { status: "idle" },
    });
  });
});

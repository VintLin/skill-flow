import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildImportGroupCandidate,
  buildImportRepoAliases,
  extractFeedSourceRepos,
  extractOfficialFeedRepos,
  groupSkillsDirectorySearchHits,
  parseSkillsOwnerPage,
  parseSkillsSkillPage,
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
  test("extracts title, skill count, installs, repo url and source skills from a source page", () => {
    const html = `
      <h1>anthropics<!-- -->/<!-- -->skills</h1>
      <span>18<!-- --> <!-- -->skills</span>
      <span>735.1K<!-- --> total installs</span>
      <a href="https://github.com/anthropics/skills">GitHub</a>
      <a href="/anthropics/skills/frontend-design">
        <div><h3>frontend-design</h3></div>
        <div><span class="font-mono text-sm text-foreground">208.4K</span></div>
      </a>
    `;

    expect(parseSkillsSourcePage(html)).toEqual({
      title: "skills",
      skillCount: 18,
      totalInstalls: 735100,
      repoUrl: "https://github.com/anthropics/skills",
      repoLabel: "anthropics/skills",
      skills: [
        {
          skillId: "frontend-design",
          title: "frontend-design",
          installs: 208400,
        },
      ],
    });
  });
});

describe("parseSkillsOwnerPage", () => {
  test("extracts owner summary fields", () => {
    const html = `
      <h1>anthropics</h1>
      <span>11<!-- --> <!-- -->sources</span>
      <span>253<!-- --> skills</span>
      <span>877.9K<!-- --> <!-- -->total installs</span>
      <a href="https://github.com/anthropics" class="flex items-center gap-1 whitespace-nowrap">GitHub</a>
    `;

    expect(parseSkillsOwnerPage(html, "anthropics")).toEqual({
      slug: "anthropics",
      sourceUrl: "https://skills.sh/anthropics",
      githubUrl: "https://github.com/anthropics",
      sourceCount: 11,
      skillCount: 253,
      totalInstalls: 877900,
    });
  });
});

describe("parseSkillsSkillPage", () => {
  test("extracts summary, installs, audits and distribution from a skill page", () => {
    const html = `
      <h1 class="text-4xl">frontend-design</h1>
      <div class="[&amp;_.prose]:prose-sm"><div class="prose"><p><strong>Distinctive</strong> frontend work.</p></div></div>
      <div><span>Weekly Installs</span></div><div class="text-3xl font-semibold font-mono tracking-tight text-foreground">208.2K</div>
      <a href="https://github.com/anthropics/skills" title="anthropics/skills">anthropics/skills</a>
      <div><span>GitHub Stars</span></div><div><div><svg></svg><span>103.8K</span></div></div>
      <div><span>First Seen</span></div><div class="text-sm font-mono text-foreground">Jan 19, 2026</div>
      <span class="text-sm font-medium text-foreground truncate">Gen Agent Trust Hub</span><span class="text-xs font-mono uppercase px-2 py-1 rounded bg-green-500/10 text-green-500">Pass</span>
      <span class="text-sm font-medium text-foreground truncate">Socket</span><span class="text-xs font-mono uppercase px-2 py-1 rounded bg-green-500/10 text-green-500">Pass</span>
      <span class="text-sm font-medium text-foreground truncate">Snyk</span><span class="text-xs font-mono uppercase px-2 py-1 rounded bg-green-500/10 text-green-500">Low Risk</span>
      <div class="flex items-center justify-between text-sm py-2"><span class="text-foreground">opencode</span><span class="text-muted-foreground font-mono">172.3K</span></div>
    `;

    expect(parseSkillsSkillPage(html, "anthropics/skills", "frontend-design")).toEqual({
      skillId: "frontend-design",
      title: "frontend-design",
      summary: "Distinctive frontend work.",
      weeklyInstalls: 208200,
      repoLabel: "anthropics/skills",
      repoUrl: "https://github.com/anthropics/skills",
      repoStars: 103800,
      firstSeen: "Jan 19, 2026",
      audits: {
        gen: "Pass",
        socket: "Pass",
        snyk: "Low Risk",
        riskLevel: "Low Risk",
      },
      installedOn: [{
        agent: "opencode",
        installs: 172300,
      }],
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
        title: "research",
        installs: 1200,
        source: "anthropic/skills",
        canonicalRepo: "anthropics/skills",
      },
      {
        id: "anthropics/skills/debugging",
        skillId: "debugging",
        title: "debugging",
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
        title: "research",
        source: "anthropics/skills",
        canonicalRepo: "anthropics/skills",
      },
      {
        id: "b",
        skillId: "debugging",
        title: "debugging",
        source: "anthropics/skills",
        canonicalRepo: "anthropics/skills",
      },
      {
        id: "c",
        skillId: "deploy",
        title: "deploy",
        source: "vercel-labs/agent-skills",
        canonicalRepo: "vercel-labs/agent-skills",
      },
    ])).toEqual([
      {
        canonicalRepo: "anthropics/skills",
        matchedSkillNames: ["debugging", "research"],
        matchedSkills: [
          { skillId: "debugging", title: "debugging" },
          { skillId: "research", title: "research" },
        ],
      },
      {
        canonicalRepo: "vercel-labs/agent-skills",
        matchedSkillNames: ["deploy"],
        matchedSkills: [{ skillId: "deploy", title: "deploy" }],
      },
    ]);
  });
});

describe("buildImportGroupCandidate", () => {
  test("creates a ready card candidate with core-owned aliases", () => {
    expect(buildImportGroupCandidate({
      canonicalRepo: "anthropics/skills",
      installed: false,
      matchedSkills: [{ skillId: "research", title: "research", installs: 1200 }],
      snapshot: {
        canonicalRepo: "anthropics/skills",
        aliases: buildImportRepoAliases("anthropics/skills"),
        title: "skills",
        provider: "skills",
        sourceUrl: "https://skills.sh/anthropics/skills",
        repoUrl: "https://github.com/anthropics/skills",
        repoLabel: "anthropics/skills",
        totalInstalls: 735100,
        owner: {
          slug: "anthropics",
          sourceUrl: "https://skills.sh/anthropics",
        },
        skills: [],
      },
    })).toMatchObject({
      id: "anthropics/skills",
      locator: "anthropics/skills",
      canonicalRepo: "anthropics/skills",
      installed: false,
      title: "skills",
      totalInstalls: 735100,
      matchedSkillNames: ["research"],
      matchedSkills: [{ skillId: "research", title: "research", installs: 1200 }],
      enrichState: { status: "ready" },
      previewState: { status: "idle" },
    });
  });
});

describe("feed repo extraction", () => {
  test("extracts repo memberships from official and hot/trending/audit pages", () => {
    expect(extractOfficialFeedRepos(`
      {"repo":"anthropics/skills"}
      {"repo":"vercel-labs/agent-skills"}
    `)).toEqual(["anthropics/skills", "vercel-labs/agent-skills"]);

    expect(extractFeedSourceRepos(`
      {"source":"anthropic/skills"}
      {"source":"vercel-labs/agent-skills"}
    `)).toEqual(["anthropics/skills", "vercel-labs/agent-skills"]);
  });
});

import { describe, expect, test } from "vitest";
import { buildFindCommand } from "../utils/find-command.js";
import {
  buildProjectedSkillName,
  formatGroupLabel,
  getHostedGitOwner,
  parseHostedGitRepo,
  parseGitHubRepo,
  resolveProjectedSkillNames,
} from "../utils/naming.js";
import { deriveSourceId } from "../utils/source-id.js";

describe("find and naming utils", () => {
  test("normalizes GitHub locators to the same source id across supported formats", () => {
    const locators = [
      "https://github.com/garrytan/gstack",
      "https://github.com/garrytan/gstack.git",
      "https://github.com/garrytan/gstack/tree/main/releases",
      "git@github.com:garrytan/gstack.git",
      "garrytan/gstack",
    ];

    expect(locators.map((locator) => deriveSourceId(locator))).toEqual([
      "garrytan-gstack",
      "garrytan-gstack",
      "garrytan-gstack",
      "garrytan-gstack",
      "garrytan-gstack",
    ]);
  });

  test("accepts repo root and tree URLs but rejects other GitHub page URLs", () => {
    expect(parseGitHubRepo("https://github.com/garrytan/gstack")).toEqual({
      owner: "garrytan",
      repo: "gstack",
    });
    expect(parseGitHubRepo("https://github.com/garrytan/gstack/tree/main/releases")).toEqual({
      owner: "garrytan",
      repo: "gstack",
    });
    expect(parseGitHubRepo("https://github.com/garrytan/gstack/issues/1")).toBeNull();
    expect(parseGitHubRepo("https://github.com/garrytan/gstack/blob/main/README.md")).toBeNull();
  });

  test("parses hosted git URLs from gitlab for owner-aware naming", () => {
    expect(parseHostedGitRepo("https://gitlab.com/example/skills.git")).toEqual({
      host: "gitlab.com",
      owner: "example",
      repo: "skills",
    });
    expect(getHostedGitOwner("git@gitlab.com:example/skills.git")).toBe("example");
  });

  test("normalizes ClawHub locators to the same source id across version forms", () => {
    expect(deriveSourceId("clawhub:find-skills")).toBe("clawhub-find-skills");
    expect(deriveSourceId("clawhub:find-skills@1.2.3")).toBe("clawhub-find-skills");
  });

  test("builds follow-up commands for search candidates", () => {
    expect(
      buildFindCommand({
        id: "builtin:1",
        title: "find-skills",
        description: "Find skills",
        source: "builtin-git",
        sourceLabel: "skills(@anthropics)",
        sourceId: "anthropics-skills",
        sourceKind: "git",
        locator: "https://github.com/anthropics/skills.git",
        relativePath: "skills/find-skills",
        installed: false,
        action: {
          type: "add-git",
          locator: "https://github.com/anthropics/skills.git",
          requestedPath: "skills/find-skills",
        },
      }),
    ).toBe("skill-flow add https://github.com/anthropics/skills.git --path skills/find-skills");

    expect(
      buildFindCommand({
        id: "clawhub:1",
        title: "Find Skills",
        description: "Find skills",
        source: "clawhub",
        sourceLabel: "ClawHub",
        sourceId: "clawhub-find-skills",
        sourceKind: "clawhub",
        locator: "clawhub:find-skills",
        installed: false,
        action: {
          type: "add-clawhub",
          slug: "find-skills",
          version: "1.2.3",
        },
      }),
    ).toBe("skill-flow add clawhub:find-skills@1.2.3");
  });

  test("formats GitHub groups as groupName(@owner)", () => {
    expect(
      formatGroupLabel({
        id: "garrytan-gstack",
        locator: "git@github.com:garrytan/gstack.git",
        displayName: "gstack",
      }),
    ).toBe("gstack@garrytan");
  });

  test("formats GitLab groups as groupName(@owner)", () => {
    expect(
      formatGroupLabel({
        id: "example-skills",
        locator: "https://gitlab.com/example/skills.git",
        displayName: "skills",
      }),
    ).toBe("skills@example");
  });

  test("prefers groupName-skillName for projected collisions", () => {
    const projected = resolveProjectedSkillNames([
      {
        leafId: "a:browse",
        groupId: "garrytan-gstack",
        groupName: "gstack",
        groupAuthor: "garrytan",
        skillName: "browse",
      },
      {
        leafId: "b:browse",
        groupId: "alice-toolkit",
        groupName: "toolkit",
        groupAuthor: "alice",
        skillName: "browse",
      },
    ]);

    expect(projected.get("a:browse")).toBe(
      buildProjectedSkillName("gstack", "browse", "garrytan"),
    );
    expect(projected.get("b:browse")).toBe(
      buildProjectedSkillName("toolkit", "browse", "alice"),
    );
  });

  test("falls back to groupId-skillName when projected names still collide", () => {
    const projected = resolveProjectedSkillNames([
      {
        leafId: "a:browse",
        groupId: "alice-gstack",
        groupName: "gstack",
        groupAuthor: "alice",
        skillName: "browse",
      },
      {
        leafId: "b:browse",
        groupId: "garrytan-gstack",
        groupName: "gstack",
        groupAuthor: "garrytan",
        skillName: "browse",
      },
    ]);

    expect(projected.get("a:browse")).toBe("gstack(alice)-browse");
    expect(projected.get("b:browse")).toBe("gstack(garrytan)-browse");
  });

  test("prefers author prefix when repo prefix would repeat the skill prefix", () => {
    const projected = resolveProjectedSkillNames([
      {
        leafId: "a:skill-creator",
        groupId: "anthropic-skill",
        groupName: "skill",
        groupAuthor: "anthropic",
        skillName: "skill-creator",
      },
      {
        leafId: "b:skill-creator",
        groupId: "openai-skill",
        groupName: "skill",
        groupAuthor: "openai",
        skillName: "skill-creator",
      },
    ]);

    expect(projected.get("a:skill-creator")).toBe("anthropic-skill-creator");
    expect(projected.get("b:skill-creator")).toBe("openai-skill-creator");
  });
});

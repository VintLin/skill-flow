import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as githubCatalog from "@skill-flow/integration/utils/github-catalog";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("import page flow", () => {
  const sandbox = useSkillFlowSandbox();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("recommendations exclude installed canonical repos", async () => {
    vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({
      provider: "github",
      repoLabel: "garrytan/gstack",
      repoUrl: "https://github.com/garrytan/gstack",
      starCount: 12,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/garrytan/gstack") {
        return responseWithHtml(`
          <h1>garrytan<!-- -->/<!-- -->gstack</h1>
          <span>4<!-- --> <!-- -->skills</span>
          <span>12.3K<!-- --> total installs</span>
          <a href="https://github.com/garrytan/gstack">GitHub</a>
        `);
      }
      if (url === "https://skills.sh/vercel-labs/agent-skills") {
        return responseWithHtml(`
          <h1>vercel-labs<!-- -->/<!-- -->agent-skills</h1>
          <span>3<!-- --> <!-- -->skills</span>
          <span>8.1K<!-- --> total installs</span>
          <a href="https://github.com/vercel-labs/agent-skills">GitHub</a>
        `);
      }
      if (url === "https://skills.sh/anthropics/skills") {
        return responseWithHtml(`
          <h1>anthropics<!-- -->/<!-- -->skills</h1>
          <span>18<!-- --> <!-- -->skills</span>
          <span>735.1K<!-- --> total installs</span>
          <a href="https://github.com/anthropics/skills">GitHub</a>
        `);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "anthropic-installed",
      originLocator: "anthropic/skills",
    });
    expect(added.ok).toBe(true);

    const recommendations = await app.listRecommendedImportGroups();

    expect(recommendations.ok).toBe(true);
    if (!recommendations.ok) {
      return;
    }

    expect(recommendations.data.groups.map((group) => group.canonicalRepo)).toEqual([
      "garrytan/gstack",
      "vercel-labs/agent-skills",
    ]);
  });

  test("exact import search returns a single canonical group card", async () => {
    vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({
      provider: "github",
      repoLabel: "anthropics/skills",
      repoUrl: "https://github.com/anthropics/skills",
      starCount: 406,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/anthropics/skills") {
        return responseWithHtml(`
          <h1>anthropics<!-- -->/<!-- -->skills</h1>
          <span>18<!-- --> <!-- -->skills</span>
          <span>735.1K<!-- --> total installs</span>
          <a href="https://github.com/anthropics/skills">GitHub</a>
        `);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const app = new SkillFlowApp();
    const result = await app.searchImportGroups("https://github.com/anthropic/skills.git");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.exact).toBe(true);
    expect(result.data.groups).toHaveLength(1);
    expect(result.data.groups[0]).toMatchObject({
      canonicalRepo: "anthropics/skills",
      title: "skills",
      totalInstalls: 735100,
      starCount: 406,
    });
  });

  test("previewImportSource is read-only and defaults to all skills with no agents", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/anthropics/skills") {
        return responseWithHtml(`
          <a href="/anthropics/skills/research"><h3>research</h3></a>
          <a href="/anthropics/skills/debugging"><h3>debugging</h3></a>
        `);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const app = new SkillFlowApp();
    const before = await app.store.readState();

    const preview = await app.previewImportSource("anthropic/skills");

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    const after = await app.store.readState();
    expect(after.manifest).toEqual(before.manifest);
    expect(after.lockFile).toEqual(before.lockFile);
    expect(preview.data.selectedSkillIds).toEqual(["research", "debugging"]);
    expect(preview.data.enabledTargets).toEqual([]);
    expect(preview.data.skills.map((skill) => skill.id)).toEqual(["research", "debugging"]);
  });

  test("previewImportSource lists repo skills without fetching per-skill detail pages", async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({
      provider: "github",
      repoLabel: "anthropics/skills",
      repoUrl: "https://github.com/anthropics/skills",
      starCount: 406,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === "https://skills.sh/anthropics/skills") {
        return responseWithHtml(`
          <h1>anthropics<!-- -->/<!-- -->skills</h1>
          <span>2<!-- --> <!-- -->skills</span>
          <span>735.1K<!-- --> total installs</span>
          <a href="https://github.com/anthropics/skills">GitHub</a>
          <a href="/anthropics/skills/research"><h3>research</h3></a>
          <a href="/anthropics/skills/debugging"><h3>debugging</h3></a>
        `);
      }
      if (url === "https://skills.sh/anthropics") {
        return responseWithHtml(`
          <span>11<!-- --> <!-- -->sources</span>
          <span>256<!-- --> skills</span>
          <span>874.4K<!-- --> <!-- -->total installs</span>
          <a href="https://github.com/anthropics" class="flex items-center gap-1 whitespace-nowrap">GitHub</a>
        `);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource("anthropic/skills");

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    expect(preview.data.skills.map((skill) => skill.id)).toEqual(["research", "debugging"]);
    expect(requestedUrls).toEqual([
      "https://skills.sh/anthropics/skills",
      "https://skills.sh/anthropics",
    ]);
  });

  test("importSource applies selected skills and targets", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
      "review/SKILL.md": skillDoc("review", "Review things."),
    });

    const app = new SkillFlowApp();
    const imported = await app.importSource(repoPath, {
      selectedSkillIds: ["browse"],
      enabledTargets: ["cursor"],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest, lockFile } = await app.store.readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectedLeafIds).toHaveLength(1);
    expect(
      lockFile.leafInventory.find((leaf) => leaf.id === binding?.selectedLeafIds?.[0])?.linkName,
    ).toBe("browse");
    expect(Object.keys(binding?.targets ?? {})).toEqual(["cursor"]);
  });

  test("importSource rolls back prepared state when draft targets are invalid", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
    });

    const app = new SkillFlowApp();
    const imported = await app.importSource(repoPath, {
      selectedSkillIds: ["browse"],
      enabledTargets: ["not-a-target" as never],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.data).toEqual({
      status: "failed",
      reasonCode: "ADD_AGENT_NOT_AVAILABLE",
      retryable: true,
    });

    const { manifest, lockFile } = await app.store.readState();
    expect(manifest.sources).toHaveLength(0);
    expect(lockFile.sources).toHaveLength(0);
    expect(lockFile.leafInventory).toHaveLength(0);

    await expect(fs.readdir(path.join(app.store.sourceRoot))).resolves.toEqual([]);
  });
});

function responseWithHtml(html: string): ResponseLike {
  return {
    ok: true,
    status: 200,
    text: async () => html,
    json: async () => {
      throw new Error("Not JSON");
    },
  };
}

type ResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

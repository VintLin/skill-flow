import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as githubCatalog from "@skill-flow/integration/utils/github-catalog";
import { ok } from "@skill-flow/integration/utils/result";
import { SourceService } from "@skill-flow/core-engine/services/source-service";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("import page flow", () => {
  const sandbox = useSkillFlowSandbox();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("recommendations keep installed canonical repos visible", async () => {
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
      "anthropics/skills",
      "garrytan/gstack",
      "vercel-labs/agent-skills",
    ]);
    expect(
      recommendations.data.groups.find((group) => group.canonicalRepo === "anthropics/skills")
        ?.installed,
    ).toBe(true);
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

  test("exact import search normalizes GitHub tree URLs to the repo root", async () => {
    vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({
      provider: "github",
      repoLabel: "VintLin/skill-flow",
      repoUrl: "https://github.com/VintLin/skill-flow",
      starCount: 88,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/vintlin/skill-flow") {
        return responseWithHtml(`
          <h1>VintLin<!-- -->/<!-- -->skill-flow</h1>
          <span>9<!-- --> <!-- -->skills</span>
          <span>1.2K<!-- --> total installs</span>
          <a href="https://github.com/VintLin/skill-flow">GitHub</a>
        `);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const app = new SkillFlowApp();
    const result = await app.searchImportGroups(
      "https://github.com/VintLin/skill-flow/tree/main/releases",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.exact).toBe(true);
    expect(result.data.groups[0]).toMatchObject({
      locator: "vintlin/skill-flow",
      canonicalRepo: "vintlin/skill-flow",
      title: "skill-flow",
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

  test("previewImportSource supports local paths", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
      "review/SKILL.md": skillDoc("review", "Review things."),
    });

    const app = new SkillFlowApp();
    const before = await app.store.readState();
    const preview = await app.previewImportSource(repoPath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    const after = await app.store.readState();
    expect(after.manifest).toEqual(before.manifest);
    expect(after.lockFile).toEqual(before.lockFile);
    expect(preview.data.locator).toBe(repoPath);
    expect(preview.data.canonicalRepo).toBe(repoPath);
    expect(preview.data.selectedSkillIds).toEqual(["browse", "review"]);
    expect(preview.data.skills.map((skill) => skill.id)).toEqual(["browse", "review"]);
    expect(preview.data.targets.every((target) => target.selectedByDefault === false)).toBe(true);
    expect(preview.data.targets.length).toBeGreaterThan(0);
  });

  test("previewImportSource supports quoted local paths with spaces", async () => {
    const parentPath = path.join(sandbox.sandboxRoot, "Path With Spaces");
    await fs.mkdir(parentPath, { recursive: true });
    const repoPath = await createRepo(parentPath, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
    });

    const app = new SkillFlowApp();
    const singleQuoted = await app.previewImportSource(`'${repoPath}'`);
    const doubleQuoted = await app.previewImportSource(`"${repoPath}"`);

    expect(singleQuoted.ok).toBe(true);
    expect(doubleQuoted.ok).toBe(true);
    expect(singleQuoted.ok ? singleQuoted.data.status : "failed").toBe("ready");
    expect(doubleQuoted.ok ? doubleQuoted.data.status : "failed").toBe("ready");
    if (!singleQuoted.ok || !doubleQuoted.ok) {
      throw new Error("Expected quoted local previews to succeed.");
    }
    if (singleQuoted.data.status !== "ready" || doubleQuoted.data.status !== "ready") {
      throw new Error("Expected quoted local previews to be ready.");
    }

    expect(singleQuoted.data.locator).toBe(repoPath);
    expect(doubleQuoted.data.locator).toBe(repoPath);
    expect(singleQuoted.data.skills.map((skill) => skill.id)).toEqual(["browse"]);
    expect(doubleQuoted.data.skills.map((skill) => skill.id)).toEqual(["browse"]);
  });

  test("previewImportSource expands home-relative local paths", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    await fs.mkdir(homeRoot, { recursive: true });
    vi.stubEnv("HOME", homeRoot);
    const repoPath = await createRepo(homeRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
    });
    const homeRelativePath = `~/${path.relative(homeRoot, repoPath)}`;

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource(homeRelativePath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    expect(preview.data.locator).toBe(repoPath);
    expect(preview.data.skills.map((skill) => skill.id)).toEqual(["browse"]);
  }, 15_000);

  test("ClawHub locators are direct import candidates and previews", async () => {
    const previewSpy = vi.spyOn(SourceService.prototype, "previewSource").mockResolvedValue(
      ok({
        locator: "clawhub:find-skills-skill",
        displayName: "find-skills-skill",
        leafs: [
          {
            id: "clawhub-find-skills-skill:find-skills",
            sourceId: "clawhub-find-skills-skill",
            relativePath: ".",
            absolutePath: "/tmp/find-skills",
            skillFilePath: "/tmp/find-skills/SKILL.md",
            name: "find-skills",
            title: "Find Skills",
            description: "Find skills from ClawHub.",
            linkName: "find-skills",
          },
        ],
      }),
    );

    const app = new SkillFlowApp();
    const search = await app.searchImportGroups("clawhub:find-skills-skill");
    const preview = await app.previewImportSource("clawhub:find-skills-skill");

    expect(search.ok).toBe(true);
    if (!search.ok) {
      return;
    }
    expect(search.data.exact).toBe(true);
    expect(search.data.groups[0]).toMatchObject({
      locator: "clawhub:find-skills-skill",
      canonicalRepo: "clawhub:find-skills-skill",
      title: "find-skills-skill",
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }
    expect(previewSpy).toHaveBeenCalledWith("clawhub:find-skills-skill");
    expect(preview.data.locator).toBe("clawhub:find-skills-skill");
    expect(preview.data.skills.map((skill) => skill.id)).toEqual(["find-skills"]);
  });

  test("exact import search treats GitLab locators as direct import candidates", async () => {
    const app = new SkillFlowApp();
    const result = await app.searchImportGroups("https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.exact).toBe(true);
    expect(result.data.groups).toHaveLength(1);
    expect(result.data.groups[0]).toMatchObject({
      locator: "https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git",
      canonicalRepo: "https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git",
      title: "gitlab-mr-review-skill",
    });
  });

  test("exact import search treats GitLab tree locators as direct import candidates", async () => {
    const app = new SkillFlowApp();
    const locator = "https://gitlab.com/reza-marandi/gitlab-mr-review-skill/-/tree/main";
    const result = await app.searchImportGroups(locator);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.exact).toBe(true);
    expect(result.data.groups).toHaveLength(1);
    expect(result.data.groups[0]).toMatchObject({
      locator,
      canonicalRepo: locator,
      title: "gitlab-mr-review-skill",
    });
  });

  test("previewImportSource supports GitLab HTTPS locators", async () => {
    const previewSpy = vi.spyOn(SourceService.prototype, "previewSource").mockResolvedValue(
      ok({
        locator: "https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git",
        displayName: "gitlab-mr-review-skill",
        leafs: [
          {
            id: "gitlab-mr-review-skill:gitlab-mr-comments",
            sourceId: "gitlab-mr-review-skill",
            relativePath: ".",
            absolutePath: "/tmp/gitlab-mr-review-skill",
            skillFilePath: "/tmp/gitlab-mr-review-skill/SKILL.md",
            name: "gitlab-mr-comments",
            title: "GitLab MR Comments",
            description: "GitLab MR review helper.",
            linkName: "gitlab-mr-comments",
          },
        ],
      }),
    );

    const app = new SkillFlowApp();
    const before = await app.store.readState();
    const preview = await app.previewImportSource(
      "https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git",
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    const after = await app.store.readState();
    expect(after.manifest).toEqual(before.manifest);
    expect(after.lockFile).toEqual(before.lockFile);
    expect(previewSpy).toHaveBeenCalledWith("https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git");
    expect(preview.data.locator).toBe("https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git");
    expect(preview.data.skills).toHaveLength(1);
    expect(preview.data.skills[0]).toMatchObject({
      id: "gitlab-mr-comments",
      title: "GitLab MR Comments",
      selectedByDefault: true,
    });
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

  test("importSource uses local preview skill ids without ambiguous selector fallback", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/pdf-analysis/SKILL.md": skillDoc("PDF Analysis", "PDF analysis."),
      "skills/pdf_analysis/SKILL.md": skillDoc("pdf-analysis", "PDF analysis variant."),
    });

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource(repoPath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    expect(preview.data.selectedSkillIds).toEqual([
      "skills/pdf_analysis",
      "skills/pdf-analysis",
    ]);

    const imported = await app.importSource(repoPath, {
      selectedSkillIds: preview.data.selectedSkillIds,
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest } = await app.store.readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectedLeafIds).toEqual([
      `${imported.data.sourceId}:skills/pdf_analysis`,
      `${imported.data.sourceId}:skills/pdf-analysis`,
    ]);
  });

  test("importSource accepts prefixed skills.sh skill ids and resolves them against the GitHub checkout", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/react-best-practices/SKILL.md": skillDoc(
        "vercel-react-best-practices",
        "React best practices.",
      ),
      "skills/deploy-to-vercel/SKILL.md": skillDoc(
        "deploy-to-vercel",
        "Deploy to Vercel.",
      ),
    });

    const app = new SkillFlowApp();
    const imported = await app.importSource(repoPath, {
      selectedSkillIds: ["vercel-react-best-practices"],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest, lockFile } = await app.store.readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectedLeafIds).toHaveLength(1);
    expect(
      lockFile.leafInventory.find((leaf) => leaf.id === binding?.selectedLeafIds?.[0])?.relativePath,
    ).toBe("skills/react-best-practices");
  });

  test("import draft skips skills.sh-only ids that are missing from the GitHub checkout", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/supabase-postgres-best-practices/SKILL.md": skillDoc(
        "supabase-postgres-best-practices",
        "Postgres best practices.",
      ),
    });

    const app = new SkillFlowApp();
    const prepared = await app.prepareAddSource(repoPath, { skipTargetDetection: true });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const result = (app as unknown as {
      resolveImportDraftForPreparedSource: (
        sourceLeafs: Array<{ id: string }>,
        availableTargets: string[],
        canonicalRepo: string | undefined,
        draft?: { selectedSkillIds: string[]; enabledTargets: string[] },
      ) => {
        ok: boolean;
        data?: { selectedLeafIds: string[]; enabledTargets: string[] };
        warnings: Array<{ code: string; message: string }>;
      };
    }).resolveImportDraftForPreparedSource(
      prepared.data.leafs,
      [],
      "supabase/agent-skills",
      {
        selectedSkillIds: ["supabase-postgres-best-practices", "skill-creator"],
        enabledTargets: [],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) {
      return;
    }

    expect(result.data.selectedLeafIds).toEqual([
      `${prepared.data.sourceId}:skills/supabase-postgres-best-practices`,
    ]);
    expect(result.warnings.map((warning) => warning.code)).toContain("IMPORT_SKILL_SKIPPED");
  });

  test("import draft prefers the root GitHub skill when a skills.sh id collides with a variant name", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("last30days", "Root skill."),
      "variants/open/SKILL.md": skillDoc("last30days", "Open variant."),
    });

    const app = new SkillFlowApp();
    const prepared = await app.prepareAddSource(repoPath, { skipTargetDetection: true });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const result = (app as unknown as {
      resolveImportDraftForPreparedSource: (
        sourceLeafs: Array<{ id: string; relativePath: string }>,
        availableTargets: string[],
        canonicalRepo: string | undefined,
        draft?: { selectedSkillIds: string[]; enabledTargets: string[] },
      ) => {
        ok: boolean;
        data?: { selectedLeafIds: string[]; enabledTargets: string[] };
        warnings: Array<{ code: string; message: string }>;
        errors: Array<{ code: string; message: string }>;
      };
    }).resolveImportDraftForPreparedSource(
      prepared.data.leafs,
      [],
      "mvanhorn/last30days-skill",
      {
        selectedSkillIds: ["last30days"],
        enabledTargets: [],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) {
      return;
    }

    expect(result.data.selectedLeafIds).toEqual([
      `${prepared.data.sourceId}:.`,
    ]);
  });

  test("import draft prefers the standard skills bucket over recursive matches", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Primary review skill."),
      "variants/review/SKILL.md": skillDoc("review", "Variant review skill."),
    });

    const app = new SkillFlowApp();
    const prepared = await app.prepareAddSource(repoPath, { skipTargetDetection: true });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const result = (app as unknown as {
      resolveImportDraftForPreparedSource: (
        sourceLeafs: Array<{ id: string; relativePath: string }>,
        availableTargets: string[],
        canonicalRepo: string | undefined,
        draft?: { selectedSkillIds: string[]; enabledTargets: string[] },
      ) => {
        ok: boolean;
        data?: { selectedLeafIds: string[]; enabledTargets: string[] };
      };
    }).resolveImportDraftForPreparedSource(
      prepared.data.leafs,
      [],
      "demo/review-pack",
      {
        selectedSkillIds: ["review"],
        enabledTargets: [],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) {
      return;
    }

    expect(result.data.selectedLeafIds).toEqual([
      `${prepared.data.sourceId}:skills/review`,
    ]);
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

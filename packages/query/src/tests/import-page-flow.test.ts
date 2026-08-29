import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as githubCatalog from "@skill-flow/integration/utils/github-catalog";
import * as gitUtils from "@skill-flow/integration/utils/git";
import { fail, ok } from "@skill-flow/integration/utils/result";
import { deriveSourceId } from "@skill-flow/integration/utils/source-id";
import { createLegacyAgentsOriginReader } from "@skill-flow/core-engine/services/legacy-agents-lock";
import { SourceCheckoutService } from "@skill-flow/core-engine/services/source-checkout-service";
import { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, pathExists, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("import page flow", () => {
  const sandbox = useSkillFlowSandbox();

  const selectedRepoPaths = (preview: { selectedSkills: Array<{ selector: { path: string } }> }) =>
    preview.selectedSkills.map((skill) => skill.selector.path);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  test("recommendations prewarm source previews for faster first import", async () => {
    vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({
      provider: "github",
      repoLabel: "anthropics/skills",
      repoUrl: "https://github.com/anthropics/skills",
      starCount: 406,
    });
    const requestedUrls: string[] = [];
    let resolveAnthropicsSource: ((response: ResponseLike) => void) | undefined;
    const anthropicsSource = new Promise<ResponseLike>((resolve) => {
      resolveAnthropicsSource = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === "https://skills.sh/anthropics/skills") {
        return anthropicsSource;
      }
      if (url === "https://skills.sh/anthropics") {
        return responseWithHtml(`
          <span>11<!-- --> <!-- -->sources</span>
          <a href="https://github.com/anthropics">GitHub</a>
        `);
      }
      return responseWithHtml("<h1>empty</h1>");
    }));

    const app = new SkillFlowApp();
    const recommendations = await app.listRecommendedImportGroups();
    expect(recommendations.ok).toBe(true);

    await vi.waitFor(() => {
      expect(requestedUrls).toContain("https://skills.sh/anthropics/skills");
    });

    const previewPromise = app.previewImportSource("anthropic/skills");
    await Promise.resolve();
    expect(requestedUrls.filter((url) => url === "https://skills.sh/anthropics/skills")).toHaveLength(1);

    resolveAnthropicsSource?.(responseWithHtml(`
      <h1>anthropics<!-- -->/<!-- -->skills</h1>
      <span>2<!-- --> <!-- -->skills</span>
      <a href="https://github.com/anthropics/skills">GitHub</a>
      <a href="/anthropics/skills/research"><h3>research</h3></a>
      <a href="/anthropics/skills/debugging"><h3>debugging</h3></a>
    `));
    const preview = await previewPromise;

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["research", "debugging"]);
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
      locator: "https://github.com/VintLin/skill-flow/tree/main/releases",
      canonicalRepo: "vintlin/skill-flow",
      title: "skill-flow",
      matchedSkillNames: ["releases"],
    });
  });

  test("exact import search marks sources missing from skills directory as failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/open-gsd/gsd-core") {
        return responseWithStatus(404);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const app = new SkillFlowApp();
    const result = await app.searchImportGroups("open-gsd/gsd-core");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toMatchObject({
      exact: true,
      groups: [
        {
          canonicalRepo: "open-gsd/gsd-core",
          enrichState: {
            status: "failed",
            reasonCode: "provider_data_unavailable",
            retryable: true,
          },
        },
      ],
    });
  });

  test("exact import search keeps GitHub repo skill suffix as a selector", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/paramchoudhary/resumeskills") {
        return responseWithStatus(404);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const app = new SkillFlowApp();
    const result = await app.searchImportGroups("paramchoudhary/resumeskills@resume-bullet-writer");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toMatchObject({
      exact: true,
      groups: [
        {
          canonicalRepo: "paramchoudhary/resumeskills",
          locator: "paramchoudhary/resumeskills@resume-bullet-writer",
          matchedSkills: [
            {
              skillId: "resume-bullet-writer",
              title: "resume-bullet-writer",
            },
          ],
          enrichState: {
            status: "failed",
            reasonCode: "provider_data_unavailable",
            retryable: true,
          },
        },
      ],
    });
  });

  test("previewImportSource falls back to GitHub when skills directory has no source page", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/direct/SKILL.md": skillDoc("direct", "Direct GitHub skill."),
    });

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/open-gsd/gsd-core") {
        return responseWithStatus(404);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const previewSource = SourceCheckoutService.prototype.previewSource;
    vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockImplementation(async function (_locator) {
      return previewSource.call(this, repoPath);
    });

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource("open-gsd/gsd-core");

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.data.status).toBe("ready");
    if (preview.data.status !== "ready") {
      return;
    }

    expect(preview.data.canonicalRepo).toBe("open-gsd/gsd-core");
    expect(preview.data.locator).toBe("https://github.com/open-gsd/gsd-core.git");
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["skills/direct"]);
  });

  test("previewImportSource treats GitHub repo suffix as a skill selector", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/resume-bullet-writer/SKILL.md": skillDoc("resume-bullet-writer", "Write resume bullets."),
      "skills/resume-tailor/SKILL.md": skillDoc("resume-tailor", "Tailor resumes."),
    });

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/paramchoudhary/resumeskills") {
        return responseWithStatus(404);
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const previewSource = SourceCheckoutService.prototype.previewSource;
    vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockImplementation(async function (_locator) {
      return previewSource.call(this, repoPath);
    });

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource("paramchoudhary/resumeskills@resume-bullet-writer");

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.data.status).toBe("ready");
    if (preview.data.status !== "ready") {
      return;
    }

    expect(preview.data.canonicalRepo).toBe("paramchoudhary/resumeskills");
    expect(preview.data.version).toBe(2);
    expect(preview.data.locator).toBe("https://github.com/paramchoudhary/resumeskills.git");
    expect(selectedRepoPaths(preview.data)).toEqual(["skills/resume-bullet-writer"]);
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["skills/resume-bullet-writer"]);
    expect(preview.data.skills[0]).toMatchObject({
      providerSkillId: "skills/resume-bullet-writer",
      selector: { kind: "repoPath", path: "skills/resume-bullet-writer" },
      origin: {
        provider: "github",
        repoPath: "skills/resume-bullet-writer",
      },
    });
    expect(preview.data.skills[0]?.uiId).toMatch(/^skill_/);
    expect(preview.data.skills[0]?.uiId).not.toContain("skills-main");
    expect(preview.data.selectedSkills).toEqual([
      {
        uiId: preview.data.skills[0]?.uiId,
        selector: { kind: "repoPath", path: "skills/resume-bullet-writer" },
      },
    ]);
  });

  test("previewImportSource supports GitHub shorthand subpaths", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/resume-bullet-writer/SKILL.md": skillDoc("resume-bullet-writer", "Write resume bullets."),
      "skills/resume-tailor/SKILL.md": skillDoc("resume-tailor", "Tailor resumes."),
    });

    const previewSource = SourceCheckoutService.prototype.previewSource;
    const previewSpy = vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockImplementation(
      async function (_locator, options) {
        return previewSource.call(this, repoPath, options);
      },
    );

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource("paramchoudhary/resumeskills/skills/resume-bullet-writer");

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    expect(previewSpy).toHaveBeenCalledWith(
      "https://github.com/paramchoudhary/resumeskills.git",
      { path: "skills/resume-bullet-writer" },
    );
    expect(preview.data.canonicalRepo).toBe("paramchoudhary/resumeskills");
    expect(selectedRepoPaths(preview.data)).toEqual(["skills/resume-bullet-writer"]);
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["skills/resume-bullet-writer"]);
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
    const before = await new StateStore(app.store.rootPath).readState();

    const preview = await app.previewImportSource("anthropic/skills");

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    const after = await new StateStore(app.store.rootPath).readState();
    expect(after.manifest).toEqual(before.manifest);
    expect(after.lockFile).toEqual(before.lockFile);
    expect(selectedRepoPaths(preview.data)).toEqual(["research", "debugging"]);
    expect(preview.data.enabledTargets).toEqual([]);
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["research", "debugging"]);
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

    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["research", "debugging"]);
    expect(requestedUrls).toEqual([
      "https://skills.sh/anthropics/skills",
      "https://skills.sh/anthropics",
    ]);
  });

  test("previewImportSource reports provider timeout without hanging", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({});
      vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(false);
      // Keep GitHub archive fallback fast so this test isolates skills.sh timeouts.
      vi.spyOn(
        (await import("@skill-flow/core-engine/services/source-checkout-service")).SourceCheckoutService.prototype as {
          downloadGitHubArchive: (...args: unknown[]) => Promise<void>;
        },
        "downloadGitHubArchive",
      ).mockRejectedValue(new Error("GitHub archive download timed out for 'anthropics/skills' branch 'main'."));
      vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          }, { once: true });
        });
      }));

      const app = new SkillFlowApp();
      await app.store.writeImportDataCache({
        searches: {},
        repos: {},
        recommendations: {},
      });
      const previewPromise = app.previewImportSource("anthropics/skills");

      await vi.waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.resolve();
      const preview = await previewPromise;

      expect(preview.ok).toBe(true);
      if (!preview.ok) {
        return;
      }
      expect(preview.data).toMatchObject({
        status: "failed",
        reasonCode: "provider_request_failed",
        retryable: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("commitPreparedImportSource accepts GitHub archive-root preview skill ids", async () => {
    const codexRoot = path.join(sandbox.sandboxRoot, "codex-skills");
    await fs.mkdir(codexRoot, { recursive: true });
    vi.stubEnv("SKILL_FLOW_TARGET_CODEX", codexRoot);
    const anthropicsRepoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
      "skills/skill-creator/SKILL.md": skillDoc("skill-creator", "Create skills."),
    });
    const vercelRepoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/react-best-practices/SKILL.md": skillDoc("react-best-practices", "React practices."),
      "skills/debugging/SKILL.md": skillDoc("debugging", "Debug apps."),
    });
    const gstackRepoPath = await createRepo(sandbox.sandboxRoot, {
      "review/SKILL.md": skillDoc("review", "Review changes."),
      "qa/SKILL.md": skillDoc("qa", "Check quality."),
    });
    const repoPaths = new Map([
      ["anthropics/skills", anthropicsRepoPath],
      ["vercel-labs/agent-skills", vercelRepoPath],
      ["garrytan/gstack", gstackRepoPath],
    ]);
    const prepareSourceCheckout = SourceCheckoutService.prototype.prepareSourceCheckout;
    vi.spyOn(SourceCheckoutService.prototype, "prepareSourceCheckout").mockImplementation(
      async function (locator, input) {
        const repoPath = repoPaths.get(locator);
        if (!repoPath) {
          throw new Error(`Unexpected locator: ${locator}`);
        }
        return prepareSourceCheckout.call(this, repoPath, input);
      },
    );

    const app = new SkillFlowApp();
    const cases = [
      {
        locator: "anthropics/skills",
        selectedSkills: [
          { uiId: "skill_frontend_design", selector: { kind: "repoPath" as const, path: "skills/frontend-design" } },
          { uiId: "skill_skill_creator", selector: { kind: "repoPath" as const, path: "skills/skill-creator" } },
        ],
        expectedLeafNames: ["frontend-design", "skill-creator"],
      },
      {
        locator: "vercel-labs/agent-skills",
        selectedSkills: [
          { uiId: "skill_react_best_practices", selector: { kind: "repoPath" as const, path: "skills/react-best-practices" } },
          { uiId: "skill_debugging", selector: { kind: "repoPath" as const, path: "skills/debugging" } },
        ],
        expectedLeafNames: ["debugging", "react-best-practices"],
      },
      {
        locator: "garrytan/gstack",
        selectedSkills: [
          { uiId: "skill_review", selector: { kind: "repoPath" as const, path: "review" } },
          { uiId: "skill_qa", selector: { kind: "repoPath" as const, path: "qa" } },
        ],
        expectedLeafNames: ["qa", "review"],
      },
    ];

    for (const testCase of cases) {
      const prepared = await app.prepareImportSource(testCase.locator);

      expect(prepared.ok).toBe(true);
      if (!prepared.ok || prepared.data.status !== "ready") {
        return;
      }

      const imported = await app.commitPreparedImportSource(prepared.data.preparationId, {
        selectedSkills: testCase.selectedSkills,
        enabledTargets: ["codex"],
      });

      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }
      expect(imported.data).toMatchObject({
        status: "ready",
      });
      if (imported.data.status !== "ready") {
        return;
      }

      const { manifest, lockFile } = await new StateStore(app.store.rootPath).readState();
      const binding = manifest.bindings[imported.data.sourceId];
      const selectedLeafIds = binding?.selectionMode === "all"
        ? lockFile.sources[imported.data.sourceId]?.leafIds ?? []
        : binding?.selectedLeafIds ?? [];
      const boundLeafNames = selectedLeafIds.map((leafId) =>
        leafId.split(":").pop()?.split("/").pop(),
      ).sort();
      expect(binding?.enabledTargets).toEqual(["codex"]);
      expect(boundLeafNames).toEqual(testCase.expectedLeafNames);
    }
  });

  test("importSource accepts unique GitHub snapshot skill ids when repo paths are nested", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/research/SKILL.md": skillDoc("research", "Research things."),
      "skills/debugging/SKILL.md": skillDoc("debugging", "Debug things."),
    });
    const prepareSourceCheckout = SourceCheckoutService.prototype.prepareSourceCheckout;
    vi.spyOn(SourceCheckoutService.prototype, "prepareSourceCheckout").mockImplementation(
      async function (locator, input) {
        if (locator !== "anthropics/skills" && locator !== "https://github.com/anthropics/skills.git") {
          throw new Error(`Unexpected locator: ${locator}`);
        }
        return prepareSourceCheckout.call(this, repoPath, input);
      },
    );

    const app = new SkillFlowApp();
    const imported = await app.importSource("anthropics/skills", {
      selectedSkills: [
        { uiId: "skill_research", selector: { kind: "repoPath", path: "research" } },
      ],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.data).toMatchObject({ status: "ready" });
    if (imported.data.status !== "ready") {
      return;
    }

    const { manifest, lockFile } = await new StateStore(app.store.rootPath).readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectedLeafIds).toHaveLength(1);
    expect(
      lockFile.leafInventory.find((leaf) => leaf.id === binding?.selectedLeafIds?.[0])?.relativePath,
    ).toBe("skills/research");
  });

  test("previewImportSource supports local paths", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
      "review/SKILL.md": skillDoc("review", "Review things."),
    });

    const app = new SkillFlowApp();
    const before = await new StateStore(app.store.rootPath).readState();
    const preview = await app.previewImportSource(repoPath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    const after = await new StateStore(app.store.rootPath).readState();
    expect(after.manifest).toEqual(before.manifest);
    expect(after.lockFile).toEqual(before.lockFile);
    expect(preview.data.locator).toBe(repoPath);
    expect(preview.data.canonicalRepo).toBe(repoPath);
    expect(selectedRepoPaths(preview.data)).toEqual(["browse", "review"]);
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["browse", "review"]);
    expect(preview.data.targets.every((target) => target.selectedByDefault === false)).toBe(true);
    expect(preview.data.targets.length).toBeGreaterThan(0);
  });

  test("previewImportSource does not prepare local imports", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const preview = await app.previewImportSource(repoPath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }
    expect(preview.data.preparationId).toBeUndefined();
    expect(preview.data.preparationStatus).toBeUndefined();
    expect((await new ImportPreparationCacheStore(app.store.rootPath).readImportPreparationCache()).records).toEqual({});
  });

  test("importSource prepares local imports only when importing", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const preview = await app.previewImportSource(repoPath);
    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }
    expect(preview.data.preparationId).toBeUndefined();
    expect((await new ImportPreparationCacheStore(app.store.rootPath).readImportPreparationCache()).records).toEqual({});

    const imported = await app.importSource(repoPath, {
      selectedSkills: [
        { uiId: "skill_review", selector: { kind: "repoPath", path: "review" } },
      ],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }
    expect(imported.data.usedPreparation).toBe(true);
    expect(imported.data.preparationId).toMatch(/^prep-/);
  });

  test("scanLocalImportGroups builds local fallback cards for local-only skills", async () => {
    const localPath = await createLocalSkill(
      process.env.SKILL_FLOW_TARGET_CODEX!,
      "local-review",
      "local-review",
      "Review local work.",
    );

    const app = new SkillFlowApp();
    const result = await app.scanLocalImportGroups();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.groups).toHaveLength(1);
    expect(result.data.groups[0]).toMatchObject({
      provider: "local",
      locator: localPath,
      canonicalRepo: `local:${deriveSourceId(localPath)}`,
      localImport: {
        validationStatus: "local-only",
        selectedChoiceId: "local",
      },
    });
  });

  test("scanLocalImportGroups returns dedicated local scan groups", async () => {
    const localPath = await createLocalSkill(
      process.env.SKILL_FLOW_TARGET_CODEX!,
      "local-review",
      "local-review",
      "Review local work.",
    );

    const app = new SkillFlowApp();
    const result = await app.scanLocalImportGroups();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.localScanGroups).toHaveLength(1);
    expect(result.data.localScanGroups[0]).toMatchObject({
      id: `local:${deriveSourceId(localPath)}`,
      title: "local-review",
      status: "local-only",
      sourcePaths: [{
        path: localPath,
        kind: "target-agent",
        target: "codex",
        alreadyManaged: false,
      }],
      skills: [{
        id: "local-review",
        title: "local-review",
        status: "local-only",
        selectionRequired: false,
        variants: [{
          path: localPath,
          selectedByDefault: true,
          importable: true,
        }],
      }],
    });
  });

  test("scanLocalImportGroups marks manual non-target local imports", async () => {
    const manualPath = await createLocalSkill(
      path.join(sandbox.sandboxRoot, "manual-skills"),
      "manual-writer",
      "manual-writer",
      "Write local notes.",
    );

    const app = new SkillFlowApp();
    const result = await app.scanLocalImportGroups(manualPath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.localScanGroups).toHaveLength(1);
    expect(result.data.localScanGroups[0]).toMatchObject({
      status: "local-only",
      sourcePaths: [{
        path: manualPath,
        kind: "manual",
        alreadyManaged: false,
      }],
    });
  });

  test("scanLocalImportGroups marks managed local sources as already managed", async () => {
    const managedPath = await createLocalSkill(
      path.join(sandbox.sandboxRoot, "managed"),
      "managed-skill",
      "managed-skill",
      "Managed skill.",
    );

    const app = new SkillFlowApp();
    const added = await app.addSource(managedPath, { sourceIdOverride: "managed-skill" });
    expect(added.ok).toBe(true);

    const result = await app.scanLocalImportGroups(managedPath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.localScanGroups).toHaveLength(1);
    expect(result.data.localScanGroups[0]).toMatchObject({
      status: "already-managed",
      sourcePaths: [{
        path: managedPath,
        alreadyManaged: true,
      }],
      skills: [{
        status: "already-managed",
        selectionRequired: false,
      }],
      importChoices: [],
    });
  });

  test("scanLocalImportGroups deduplicates identical realpaths in local scan groups", async () => {
    const sourcePath = await createLocalSkill(
      process.env.SKILL_FLOW_TARGET_CODEX!,
      "same-realpath",
      "same-realpath",
      "Same real path.",
    );
    const linkedRoot = path.join(process.env.SKILL_FLOW_TARGET_CURSOR!, "same-realpath");
    await fs.symlink(sourcePath, linkedRoot, "dir");

    const app = new SkillFlowApp();
    const result = await app.scanLocalImportGroups();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.localScanGroups).toHaveLength(1);
    expect(result.data.localScanGroups[0].sourcePaths).toHaveLength(1);
    expect(result.data.localScanGroups[0].sourcePaths[0].path).toBe(sourcePath);
  });

  test("scanLocalImportGroups merges same-origin same-hash variants as consistent", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "resume-review": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/resume-review",
        },
      });
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "resume-review",
        "resume-review",
        "Review resumes.",
      );
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CURSOR!,
        "resume-review",
        "resume-review",
        "Review resumes.",
      );
      const originRepo = await createRepo(sandbox.sandboxRoot, {
        "skills/resume-review/SKILL.md": skillDoc("resume-review", "Review resumes."),
      });
      stubGitHubPreview(originRepo);

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const result = await app.scanLocalImportGroups();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.localScanGroups).toHaveLength(1);
      expect(result.data.localScanGroups[0]).toMatchObject({
        status: "matched",
        origin: {
          canonicalRepo: "paramchoudhary/resumeskills",
          previewStatus: "ready",
        },
        skills: [{
          id: "skills/resume-review",
          originSkillId: "skills/resume-review",
          status: "matched",
          selectionRequired: false,
        }],
      });
      expect(result.data.localScanGroups[0].sourcePaths).toHaveLength(2);
      expect(result.data.localScanGroups[0].skills[0].variants).toHaveLength(1);
    } finally {
      restoreHome(originalHome);
    }
  });

  test("scanLocalImportGroups requires selection for same-origin different-hash variants", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "resume-review": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/resume-review",
        },
      });
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "resume-review",
        "resume-review",
        "Review resumes for Codex.",
      );
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CURSOR!,
        "resume-review",
        "resume-review",
        "Review resumes for Cursor.",
      );
      const originRepo = await createRepo(sandbox.sandboxRoot, {
        "skills/resume-review/SKILL.md": skillDoc("resume-review", "Review resumes."),
      });
      stubGitHubPreview(originRepo);

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const result = await app.scanLocalImportGroups();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.localScanGroups).toHaveLength(1);
      const group = result.data.localScanGroups[0];
      expect(group.status).toBe("version-conflict");
      expect(group.skills[0]).toMatchObject({
        id: "skills/resume-review",
        status: "version-conflict",
        selectionRequired: true,
      });
      expect(group.skills[0].variants).toHaveLength(2);
      expect(group.skills[0].variants.every((variant) => variant.selectedByDefault === false)).toBe(true);
      expect(group.importChoices).toHaveLength(0);
    } finally {
      restoreHome(originalHome);
    }
  });

  test("scanLocalImportGroups groups local skills that match the same origin", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "resume-bullet-writer": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/resume-bullet-writer",
        },
        "resume-tailor": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/resume-tailor",
        },
      });
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "resume-bullet-writer",
        "resume-bullet-writer",
        "Write better bullets.",
      );
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CURSOR!,
        "resume-tailor",
        "resume-tailor",
        "Tailor resumes.",
      );
      const originRepo = await createRepo(sandbox.sandboxRoot, {
        "skills/resume-bullet-writer/SKILL.md": skillDoc(
          "resume-bullet-writer",
          "Write better bullets.",
        ),
        "skills/resume-tailor/SKILL.md": skillDoc("resume-tailor", "Tailor resumes."),
      });
      stubGitHubPreview(originRepo);

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const result = await app.scanLocalImportGroups();

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.data.groups).toHaveLength(1);
      expect(result.data.groups[0]).toMatchObject({
        provider: "skills",
        canonicalRepo: "paramchoudhary/resumeskills",
        localImport: {
          validationStatus: "matched",
          selectedChoiceId: "origin",
        },
      });
      expect(result.data.groups[0].matchedSkillNames?.sort()).toEqual([
        "resume-bullet-writer",
        "resume-tailor",
      ]);
      expect(result.data.groups[0].localImport?.choices.map((choice) => choice.sourceChoiceId)).toEqual([
        "origin",
      ]);
      expect(result.data.localScanGroups).toHaveLength(1);
      const localScanGroup = result.data.localScanGroups[0];
      expect(localScanGroup.skills.map((skill) => skill.id).sort()).toEqual([
        "skills/resume-bullet-writer",
        "skills/resume-tailor",
      ]);
      const localScanChoiceIds = localScanGroup.importChoices.map((choice) => choice.sourceChoiceId);
      expect(new Set(localScanChoiceIds).size).toBe(localScanChoiceIds.length);
      expect(localScanChoiceIds).toEqual(["origin"]);
      expect(
        localScanGroup.importChoices.find((choice) => choice.sourceChoiceId === "origin")?.selectedSkills
          .map((skill) => skill.selector.path)
          .sort(),
      ).toEqual([
        "skills/resume-bullet-writer",
        "skills/resume-tailor",
      ]);
    } finally {
      restoreHome(originalHome);
    }
  });

  test("scanLocalImportGroups keeps unselected partial origin skills importable", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "managed-skill": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/managed-skill",
        },
        "new-skill": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/new-skill",
        },
      });
      const managedPath = await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "managed-skill",
        "managed-skill",
        "Managed skill.",
      );
      const newPath = await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CURSOR!,
        "new-skill",
        "new-skill",
        "New skill.",
      );
      const originRepo = await createRepo(sandbox.sandboxRoot, {
        "skills/managed-skill/SKILL.md": skillDoc("managed-skill", "Managed skill."),
        "skills/new-skill/SKILL.md": skillDoc("new-skill", "New skill."),
      });
      stubGitHubPreview(originRepo);

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const added = await app.addSource(originRepo, {
        skillNames: ["skills/managed-skill"],
        originLocator: "paramchoudhary/resumeskills",
        skipTargetDetection: true,
      });
      expect(added.ok).toBe(true);

      const result = await app.scanLocalImportGroups();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.localScanGroups).toHaveLength(1);
      const group = result.data.localScanGroups[0];
      expect(group.status).toBe("matched");
      expect(group.skills).toHaveLength(2);
      expect(group.skills.find((skill) => skill.id === "skills/managed-skill")).toMatchObject({
        status: "already-managed",
        variants: [{
          importable: false,
        }],
      });
      expect(group.skills.find((skill) => skill.id === "skills/new-skill")).toMatchObject({
        status: "matched",
        variants: [{
          path: newPath,
          importable: true,
          selectedByDefault: true,
        }],
      });
      expect(group.sourcePaths.find((sourcePath) => sourcePath.path === managedPath)).toMatchObject({
        alreadyManaged: true,
      });
      expect(group.sourcePaths.find((sourcePath) => sourcePath.path === newPath)).toMatchObject({
        alreadyManaged: false,
      });
      expect(group.importChoices).toHaveLength(1);
      expect(group.importChoices[0]).toMatchObject({
        sourceChoiceId: "origin",
        sourcePath: "https://github.com/paramchoudhary/resumeskills.git",
        selectedSkills: [
          { uiId: "skills/new-skill", selector: { kind: "repoPath", path: "skills/new-skill" } },
        ],
      });
      expect(result.data.groups).toHaveLength(1);
      expect(result.data.groups[0].installed).toBe(false);
      const originChoice = result.data.groups[0].localImport?.choices.find(
        (choice) => choice.sourceChoiceId === "origin",
      );
      expect(originChoice?.selectedSkills.map((skill) => skill.selector.path)).toEqual(["skills/new-skill"]);
      expect(originChoice?.selectedSkills.map((skill) => skill.selector.path)).not.toContain("skills/managed-skill");
    } finally {
      restoreHome(originalHome);
    }
  });

  test("scanLocalImportGroups preserves origin metadata for manually selected local skills", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "resume-bullet-writer": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/resume-bullet-writer",
        },
      });
      const localPath = await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "resume-bullet-writer",
        "resume-bullet-writer",
        "Write better bullets.",
      );
      const originRepo = await createRepo(sandbox.sandboxRoot, {
        "skills/resume-bullet-writer/SKILL.md": skillDoc(
          "resume-bullet-writer",
          "Write better bullets.",
        ),
      });
      stubGitHubPreview(originRepo);

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const result = await app.scanLocalImportGroups(localPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.data.groups).toHaveLength(1);
      expect(result.data.groups[0]).toMatchObject({
        provider: "skills",
        canonicalRepo: "paramchoudhary/resumeskills",
        localImport: {
          validationStatus: "matched",
          selectedChoiceId: "origin",
        },
      });
      expect(result.data.groups[0].localImport?.detectedSkills[0]).toMatchObject({
        originSkillId: "skills/resume-bullet-writer",
      });
      expect(result.data.localScanGroups).toHaveLength(1);
      expect(result.data.localScanGroups[0]?.importChoices.map((choice) => choice.sourceChoiceId)).toEqual([
        "local",
        "origin",
      ]);
      expect(result.data.localScanGroups[0]?.importChoices[0]).toMatchObject({
        sourceChoiceId: "local",
        sourcePath: localPath,
        selectedSkills: [
          {
            uiId: "resume-bullet-writer",
            selector: { kind: "repoPath", path: "resume-bullet-writer" },
          },
        ],
      });
      expect(result.data.localScanGroups[0]?.importChoices[1]).toMatchObject({
        sourceChoiceId: "origin",
        sourcePath: "https://github.com/paramchoudhary/resumeskills.git",
        selectedSkills: [
          {
            uiId: "skills/resume-bullet-writer",
            selector: { kind: "repoPath", path: "skills/resume-bullet-writer" },
          },
        ],
      });
    } finally {
      restoreHome(originalHome);
    }
  });

  test("scanLocalImportGroups uses actual matched origin ids for origin choices", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "resume-review": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/stale-review",
        },
      });
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "resume-review",
        "resume-review",
        "Review resumes.",
      );
      const originRepo = await createRepo(sandbox.sandboxRoot, {
        "skills/actual-review/SKILL.md": skillDoc("resume-review", "Review resumes."),
      });
      stubGitHubPreview(originRepo);

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const result = await app.scanLocalImportGroups();

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.data.groups).toHaveLength(1);
      const originChoice = result.data.groups[0].localImport?.choices.find(
        (choice) => choice.sourceChoiceId === "origin",
      );
      expect(result.data.groups[0].localImport).toMatchObject({
        validationStatus: "matched",
        selectedChoiceId: "origin",
      });
      expect(originChoice?.selectedSkills.map((skill) => skill.selector.path)).toEqual(["skills/actual-review"]);
    } finally {
      restoreHome(originalHome);
    }
  });

  test("scanLocalImportGroups splits non-matched multi-skill origins into local fallback cards", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "changed-local": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/changed-local",
        },
        "missing-local": {
          source: "paramchoudhary/resumeskills",
          skillPath: "skills/missing-local",
        },
      });
      const changedPath = await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "changed-local",
        "changed-local",
        "Changed locally.",
      );
      const missingPath = await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CURSOR!,
        "missing-local",
        "missing-local",
        "Missing locally.",
      );
      const originRepo = await createRepo(sandbox.sandboxRoot, {
        "skills/changed-local/SKILL.md": skillDoc("changed-local", "Changed upstream."),
      });
      stubGitHubPreview(originRepo);

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const result = await app.scanLocalImportGroups();

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.data.groups).toHaveLength(2);
      expect(result.data.groups.map((group) => group.provider)).toEqual(["local", "local"]);
      expect(result.data.groups.map((group) => group.locator).sort()).toEqual([
        changedPath,
        missingPath,
      ].sort());
      for (const group of result.data.groups) {
        const localChoice = group.localImport?.choices.find((choice) => choice.sourceChoiceId === "local");
        expect(group.localImport?.selectedChoiceId).toBe("local");
        expect(localChoice?.locator).toBe(group.locator);
        expect(localChoice?.selectedSkills).toHaveLength(1);
      }
      expect(result.data.localScanGroups).toHaveLength(2);
      expect(new Set(result.data.localScanGroups.map((group) => group.id)).size).toBe(2);
      expect(result.data.localScanGroups.map((group) => group.status).sort()).toEqual([
        "changed",
        "missing",
      ]);
      expect(result.data.localScanGroups.map((group) => group.importChoices[0]?.sourcePath).sort()).toEqual([
        changedPath,
        missingPath,
      ].sort());
    } finally {
      restoreHome(originalHome);
    }
  });

  test("scanLocalImportGroups marks origin skills as unavailable when preview fails", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeRoot;
    try {
      await writeAgentsLock(homeRoot, {
        "missing-origin": {
          source: "skill-flow-test/missing-origin-repo",
          skillPath: "skills/missing-origin",
        },
      });
      await createLocalSkill(
        process.env.SKILL_FLOW_TARGET_CODEX!,
        "missing-origin",
        "missing-origin",
        "Missing origin.",
      );
      vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockResolvedValue(
        fail({
          code: "SOURCE_PREVIEW_FAILED",
          message: "Expected preview failure for origin-unavailable coverage.",
        }),
      );

      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      const result = await app.scanLocalImportGroups();

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.data.groups).toHaveLength(1);
      expect(result.data.groups[0]).toMatchObject({
        provider: "skills",
        canonicalRepo: "skill-flow-test/missing-origin-repo",
        localImport: {
          validationStatus: "origin-unavailable",
          selectedChoiceId: "local",
        },
      });
    } finally {
      restoreHome(originalHome);
    }
  }, 20_000);

  test("scanLocalImportGroups marks local skills as changed when origin summary differs", async () => {
    const result = await scanOneOriginValidationCase(sandbox.sandboxRoot, {
      targetRoot: process.env.SKILL_FLOW_TARGET_CODEX!,
      localName: "resume-quantifier",
      localDescription: "Quantify resume impact locally.",
      lockSkillPath: "skills/resume-quantifier",
      originFiles: {
        "skills/resume-quantifier/SKILL.md": skillDoc(
          "resume-quantifier",
          "Quantify resume impact from origin.",
        ),
      },
    });

    expect(result.group.localImport).toMatchObject({
      validationStatus: "changed",
      selectedChoiceId: "local",
    });
    expect(result.localScanGroup.skills[0]).toMatchObject({
      id: "resume-quantifier",
    });
    expect(result.localScanGroup.importChoices[0]?.selectedSkills.map((skill) => skill.selector.path)).toEqual([
      "resume-quantifier",
    ]);
  });

  test("scanLocalImportGroups marks local skills as missing when origin has no match", async () => {
    const result = await scanOneOriginValidationCase(sandbox.sandboxRoot, {
      targetRoot: process.env.SKILL_FLOW_TARGET_CODEX!,
      localName: "resume-formatter",
      localDescription: "Format resumes.",
      lockSkillPath: "skills/resume-formatter",
      originFiles: {
        "skills/different/SKILL.md": skillDoc("different", "Different skill."),
      },
    });

    expect(result.group.localImport).toMatchObject({
      validationStatus: "missing",
      selectedChoiceId: "local",
    });
  });

  test("scanLocalImportGroups marks local skills as ambiguous when multiple origin skills match", async () => {
    const result = await scanOneOriginValidationCase(sandbox.sandboxRoot, {
      targetRoot: process.env.SKILL_FLOW_TARGET_CODEX!,
      localName: "review",
      localDescription: "Review things.",
      originFiles: {
        "skills/review/SKILL.md": skillDoc("review-primary", "Review things."),
        "skills/.experimental/review/SKILL.md": skillDoc("review-secondary", "Review things."),
      },
    });

    expect(result.group.localImport).toMatchObject({
      validationStatus: "ambiguous",
      selectedChoiceId: "local",
    });
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
    expect(singleQuoted.data.skills.map((skill) => skill.providerSkillId)).toEqual(["browse"]);
    expect(doubleQuoted.data.skills.map((skill) => skill.providerSkillId)).toEqual(["browse"]);
  });

  test("previewImportSource strips YAML quotes from local skill metadata", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "keep-codex-fast/SKILL.md": `---
name: "keep-codex-fast"
description: "Safe Codex local-state maintenance"
---

# Keep Codex Fast
`,
    });

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource(repoPath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      throw new Error("Expected local preview to be ready.");
    }
    expect(preview.data.skills[0]).toMatchObject({
      providerSkillId: "keep-codex-fast",
      title: "keep-codex-fast",
    });
  });

  test("previewImportSource expands home-relative local paths", async () => {
    const homeRoot = path.join(sandbox.sandboxRoot, "home");
    await fs.mkdir(homeRoot, { recursive: true });
    vi.stubEnv("HOME", homeRoot);
    const repoPath = await createRepo(homeRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
    });
    const homeRelativePath = `~/${path.relative(homeRoot, repoPath)}`;

    const app = new SkillFlowApp({
      agentsOriginReader: createLegacyAgentsOriginReader(),
    });
    const preview = await app.previewImportSource(homeRelativePath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    expect(preview.data.locator).toBe(repoPath);
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["browse"]);
  }, 60_000);

  test("ClawHub locators are direct import candidates and previews", async () => {
    const previewSpy = vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockResolvedValue(
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

    const app = new SkillFlowApp({
      agentsOriginReader: createLegacyAgentsOriginReader(),
    });
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
    expect(preview.data.skills.map((skill) => skill.providerSkillId)).toEqual(["find-skills"]);
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
    const previewSpy = vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockResolvedValue(
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
    const before = await new StateStore(app.store.rootPath).readState();
    const preview = await app.previewImportSource(
      "https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git",
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    const after = await new StateStore(app.store.rootPath).readState();
    expect(after.manifest).toEqual(before.manifest);
    expect(after.lockFile).toEqual(before.lockFile);
    expect(previewSpy).toHaveBeenCalledWith("https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git");
    expect(preview.data.locator).toBe("https://gitlab.com/reza-marandi/gitlab-mr-review-skill.git");
    expect(preview.data.skills).toHaveLength(1);
    expect(preview.data.skills[0]).toMatchObject({
      providerSkillId: "gitlab-mr-comments",
      title: "GitLab MR Comments",
    });
    expect(selectedRepoPaths(preview.data)).toEqual(["."]);
  });

  test("importSource applies selected skills and targets", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browse things."),
      "review/SKILL.md": skillDoc("review", "Review things."),
    });

    const app = new SkillFlowApp();
    const imported = await app.importSource(repoPath, {
      selectedSkills: [
        { uiId: "skill_browse", selector: { kind: "repoPath", path: "browse" } },
      ],
      enabledTargets: ["cursor"],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest, lockFile } = await new StateStore(app.store.rootPath).readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectedLeafIds).toHaveLength(1);
    expect(
      lockFile.leafInventory.find((leaf) => leaf.id === binding?.selectedLeafIds?.[0])?.linkName,
    ).toBe("browse");
    expect(binding?.enabledTargets).toEqual(["cursor"]);
  });

  test("importSource returns preparation failures without entering the legacy add path", async () => {
    const app = new SkillFlowApp();
    vi.spyOn(app.importPreparationService, "prepareImportSource").mockResolvedValue(ok({
      status: "failed",
      preparationId: "prep-failed",
      reasonCode: "IMPORT_PREPARE_FAILED",
      retryable: true,
    }, [{ code: "IMPORT_PROVIDER_WARNING", message: "Provider unavailable." }]));
    const legacyAdd = vi.spyOn(app.sourceAuthorityService, "addSource").mockResolvedValue(fail({
      code: "LEGACY_ADD_CALLED",
      message: "Legacy add path must not run.",
    }));

    const imported = await app.importSource("anthropics/skills");

    expect(imported).toEqual(ok({
      status: "failed",
      reasonCode: "IMPORT_PREPARE_FAILED",
      retryable: true,
    }, [{ code: "IMPORT_PROVIDER_WARNING", message: "Provider unavailable." }]));
    expect(legacyAdd).not.toHaveBeenCalled();
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

    expect(selectedRepoPaths(preview.data)).toEqual([
      "skills/pdf_analysis",
      "skills/pdf-analysis",
    ]);

    const imported = await app.importSource(repoPath, {
      selectedSkills: preview.data.selectedSkills,
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest, lockFile } = await new StateStore(app.store.rootPath).readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectionMode).toBe("all");
    expect(binding?.selectedLeafIds).toEqual([]);
    expect(lockFile.sources[imported.data.sourceId]?.leafIds).toEqual([
      `${imported.data.sourceId}:skills/pdf_analysis`,
      `${imported.data.sourceId}:skills/pdf-analysis`,
    ]);
  });

  test("importSource falls back to the downloaded group when selectors are missing", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review things."),
    });

    const app = new SkillFlowApp();
    const imported = await app.importSource(repoPath, {
      selectedSkills: [
        { uiId: "skill_missing", selector: { kind: "repoPath", path: "skills/missing" } },
      ],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.data).toMatchObject({ status: "ready" });
    expect(imported.warnings.map((warning) => warning.code)).toContain("IMPORT_SELECTOR_NOT_FOUND");
    if (imported.data.status !== "ready") {
      return;
    }

    const { manifest, lockFile } = await new StateStore(app.store.rootPath).readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectedLeafIds).toEqual([]);
    expect(binding?.selectionMode).toBe("all");
    expect(lockFile.sources[imported.data.sourceId]?.leafIds).toEqual([
      `${imported.data.sourceId}:skills/review`,
    ]);
  });

  test("importSource skillSelectionMode all selects every imported skill", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/browse/SKILL.md": skillDoc("browse", "Browse things."),
      "skills/review/SKILL.md": skillDoc("review", "Review things."),
    });

    const app = new SkillFlowApp();
    const imported = await app.importSource(repoPath, {
      skillSelectionMode: "all",
      selectedSkills: [],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest } = await new StateStore(app.store.rootPath).readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectionMode).toBe("all");
    expect(binding?.selectedLeafIds).toEqual([]);
  });

  test("importSource selected mode preserves explicit empty skill selection", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/browse/SKILL.md": skillDoc("browse", "Browse things."),
      "skills/review/SKILL.md": skillDoc("review", "Review things."),
    });

    const app = new SkillFlowApp();
    const imported = await app.importSource(repoPath, {
      skillSelectionMode: "selected",
      selectedSkills: [],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest } = await new StateStore(app.store.rootPath).readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectionMode).toBe("selected");
    expect(binding?.selectedLeafIds).toEqual([]);
  });

  test("importSource uses repoPath selectors against the GitHub checkout", async () => {
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
      selectedSkills: [
        {
          uiId: "skill_react_best_practices",
          selector: { kind: "repoPath", path: "skills/react-best-practices" },
        },
      ],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }

    const { manifest, lockFile } = await new StateStore(app.store.rootPath).readState();
    const binding = manifest.bindings[imported.data.sourceId];
    expect(binding?.selectedLeafIds).toHaveLength(1);
    expect(
      lockFile.leafInventory.find((leaf) => leaf.id === binding?.selectedLeafIds?.[0])?.relativePath,
    ).toBe("skills/react-best-practices");
  });

  test("import draft rejects legacy path-array selectors without V2 selectors", async () => {
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
        draft?: Record<string, unknown>,
      ) => {
        ok: boolean;
        data?: { selectedLeafIds: string[]; enabledTargets: string[] };
        warnings: Array<{ code: string; message: string }>;
        errors?: Array<{ code: string; message: string }>;
      };
    }).resolveImportDraftForPreparedSource(
      prepared.data.leafs,
      [],
      "supabase/agent-skills",
      {
        ["selectedSkill" + "Paths"]: ["supabase-postgres-best-practices", "skill-creator"],
        enabledTargets: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("IMPORT_DRAFT_SELECTED_SKILLS_REQUIRED");
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
        draft?: {
          selectedSkills: Array<{ uiId: string; selector: { kind: "repoPath"; path: string } }>;
          enabledTargets: string[];
        },
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
        selectedSkills: [
          { uiId: "skill_last30days", selector: { kind: "repoPath", path: "." } },
        ],
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
        draft?: {
          selectedSkills: Array<{ uiId: string; selector: { kind: "repoPath"; path: string } }>;
          enabledTargets: string[];
        },
      ) => {
        ok: boolean;
        data?: { selectedLeafIds: string[]; enabledTargets: string[] };
      };
    }).resolveImportDraftForPreparedSource(
      prepared.data.leafs,
      [],
      "demo/review-pack",
      {
        selectedSkills: [
          { uiId: "skill_review", selector: { kind: "repoPath", path: "skills/review" } },
        ],
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
      selectedSkills: [
        { uiId: "skill_browse", selector: { kind: "repoPath", path: "browse" } },
      ],
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

    const { manifest, lockFile } = await new StateStore(app.store.rootPath).readState();
    expect(manifest.sources).toHaveLength(0);
    expect(Object.keys(lockFile.sources)).toHaveLength(0);
    expect(lockFile.leafInventory).toHaveLength(0);

    await expect(
      pathExists(app.store.getSourceCheckoutPath("local", deriveSourceId(repoPath))),
    ).resolves.toBe(false);
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

function responseWithStatus(status: number): ResponseLike {
  return {
    ok: false,
    status,
    text: async () => "",
    json: async () => {
      throw new Error("Not JSON");
    },
  };
}

async function createLocalSkill(
  targetRoot: string,
  skillName: string,
  title: string,
  description: string,
): Promise<string> {
  const skillPath = path.join(targetRoot, skillName);
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(path.join(skillPath, "SKILL.md"), skillDoc(title, description), "utf8");
  return await fs.realpath(skillPath);
}

async function writeAgentsLock(
  homeRoot: string,
  skills: Record<string, { source: string; skillPath?: string }>,
) {
  const lockPath = path.join(homeRoot, ".agents", ".skill-lock.json");
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(
    lockPath,
    JSON.stringify({
      skills: Object.fromEntries(
        Object.entries(skills).map(([name, record]) => [
          name,
          {
            sourceType: "github",
            source: record.source,
            ...(record.skillPath ? { skillPath: record.skillPath } : {}),
          },
        ]),
      ),
    }),
    "utf8",
  );
}

function stubGitHubPreview(repoPath: string) {
  const previewSource = SourceCheckoutService.prototype.previewSource;
  vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockImplementation(async function (_locator) {
    return previewSource.call(this, repoPath);
  });
}

async function scanOneOriginValidationCase(
  sandboxRoot: string,
  options: {
    targetRoot: string;
    localName: string;
    localDescription: string;
    lockSkillPath?: string;
    originFiles: Record<string, string>;
  },
) {
  const homeRoot = path.join(sandboxRoot, `home-${options.localName}`);
  const originalHome = process.env.HOME;
  process.env.HOME = homeRoot;
  try {
    await writeAgentsLock(homeRoot, {
      [options.localName]: {
        source: "paramchoudhary/resumeskills",
        ...(options.lockSkillPath ? { skillPath: options.lockSkillPath } : {}),
      },
    });
    await createLocalSkill(
      options.targetRoot,
      options.localName,
      options.localName,
      options.localDescription,
    );
    const originRepo = await createRepo(sandboxRoot, options.originFiles);
    stubGitHubPreview(originRepo);

    const app = new SkillFlowApp({
      agentsOriginReader: createLegacyAgentsOriginReader(),
    });
    const result = await app.scanLocalImportGroups();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected local import scan to succeed.");
    }
    expect(result.data.groups).toHaveLength(1);
    expect(result.data.localScanGroups).toHaveLength(1);
    return {
      group: result.data.groups[0],
      localScanGroup: result.data.localScanGroups[0],
    };
  } finally {
    restoreHome(originalHome);
  }
}

function restoreHome(originalHome: string | undefined) {
  if (originalHome === undefined) {
    delete process.env.HOME;
    return;
  }
  process.env.HOME = originalHome;
}

type ResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

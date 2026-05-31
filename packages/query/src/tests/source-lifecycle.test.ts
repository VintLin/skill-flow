import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import * as clawhubUtils from "@skill-flow/integration/utils/clawhub";
import * as builtinGitSources from "@skill-flow/integration/utils/builtin-git-sources";
import * as gitUtils from "@skill-flow/integration/utils/git";
import * as githubCatalog from "@skill-flow/integration/utils/github-catalog";
import { buildFindCommand } from "@skill-flow/integration/utils/find-command";
import { deriveSourceId } from "@skill-flow/integration/utils/source-id";
import { SkillFlowApp } from "../runtime.js";
import {
  createRepo,
  pathExists,
  seedBuiltinCatalog,
  skillDoc,
  writeRepoFiles,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("source lifecycle", () => {
  const sandbox = useSkillFlowSandbox();

  test("adds a git source and discovers valid skills", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "frontend/SKILL.md": skillDoc("frontend", "Build frontend flows."),
      "ops/SKILL.md": skillDoc("ops", "Run operator workflows."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(2);
    expect(result.warnings).toHaveLength(0);

    const manifest = await app.store.readManifest();
    const binding = manifest.bindings[result.data.manifest.id];
    expect(Object.keys(binding?.targets ?? {})).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "github-copilot",
      "gemini-cli",
      "opencode",
      "openclaw",
      "hermes-agent",
      "pi",
      "windsurf",
      "roo-code",
      "cline",
      "amp",
      "kiro",
    ]);
    expect(binding?.targets["claude-code"]?.leafIds).toEqual([
      `${result.data.manifest.id}:frontend`,
      `${result.data.manifest.id}:ops`,
    ]);
  });

  test("adds a git source with path filtering but only preselects matching skills", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath, { path: "skills/find-skills" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.leafCount).toBe(2);

    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }

    expect(list.data.summaries[0]?.leafs.map((leaf) => leaf.relativePath)).toEqual([
      "skills/find-skills",
      "skills/review",
    ]);

    const manifest = await app.store.readManifest();
    const binding = manifest.bindings[result.data.manifest.id];
    expect(binding?.targets["claude-code"]?.leafIds).toEqual([
      `${result.data.manifest.id}:skills/find-skills`,
    ]);
  });

  test("listWorkflows runs under the shared mutation lock", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const lockSpy = vi.spyOn(app.store, "withMutationLock");

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    lockSpy.mockClear();

    const listed = await app.listWorkflows();

    expect(listed.ok).toBe(true);
    expect(lockSpy).toHaveBeenCalledTimes(1);
  });

  test("addSource keeps sourceIdOverride aligned with local checkout path and leaf ids", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const { manifest, lockFile } = await app.store.readState();
    const source = manifest.sources.find((item) => item.id === "demo-source");
    const lockSource = lockFile.sources.find((item) => item.id === "demo-source");
    const expectedCheckoutPath = app.store.getSourceCheckoutPath("local", "demo-source");

    expect(added.data.manifest.id).toBe("demo-source");
    expect(source?.id).toBe("demo-source");
    expect(lockSource?.checkoutPath).toBe(expectedCheckoutPath);
    expect(path.basename(lockSource?.checkoutPath ?? "")).toBe("demo-source");
    expect(lockSource?.leafIds).toEqual(["demo-source:skills/review"]);
    expect(lockFile.leafInventory.map((leaf) => leaf.id)).toEqual(["demo-source:skills/review"]);
    expect(lockFile.leafInventory.map((leaf) => leaf.sourceId)).toEqual(["demo-source"]);
  });

  test("inspectSource still returns local detail state when reconcileInventory fails", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    vi.spyOn(app.sourceService, "reconcileInventory").mockResolvedValueOnce({
      ok: false,
      errors: [
        {
          code: "RECONCILE_FAILED",
          message: "forced reconcile failure",
        },
      ],
      warnings: [],
    });

    const result = await app.inspectSource(added.data.manifest.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.summary.source.id).toBe(added.data.manifest.id);
    expect(result.data.leafs.map((leaf) => leaf.id)).toEqual([`${added.data.manifest.id}:skills/review`]);
    expect(result.data.binding.selectedLeafIds).toEqual([`${added.data.manifest.id}:skills/review`]);
    expect(result.data).not.toHaveProperty("sourceMetadata");
    expect(result.data).not.toHaveProperty("sourceSnapshot");
  });

  test("inspectSource runs under the shared mutation lock", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const lockSpy = vi.spyOn(app.store, "withMutationLock");

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    lockSpy.mockClear();

    const inspected = await app.inspectSource(added.data.manifest.id);

    expect(inspected.ok).toBe(true);
    expect(lockSpy).toHaveBeenCalledTimes(1);
  });

  test("inspectSource reads managed deployment details from projections when deployments are empty", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:skills/review`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const { manifest, lockFile } = await app.store.readState();
    lockFile.deployments = [];
    await app.store.writeState(manifest, lockFile);

    const result = await app.inspectSource(sourceId);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.deployments).toHaveLength(1);
    expect(result.data.deployments[0]?.leafId).toBe(leafId);
    expect(result.data.deployments[0]?.target).toBe("claude-code");
  });

  test("applyDraft returns fresh summary and inspect payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:skills/review`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["codex"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    expect(applied.data.summary?.source.id).toBe(sourceId);
    expect(applied.data.summary?.bindings.targets.codex?.enabled).toBe(true);
    expect(applied.data.inspect?.summary.source.id).toBe(sourceId);
    expect(applied.data.inspect?.binding.targets.codex?.enabled).toBe(true);
    expect(applied.data.inspect?.deployments[0]?.target).toBe("codex");
  });

  test("previewDraft runs under the shared mutation lock", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const lockSpy = vi.spyOn(app.store, "withMutationLock");

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    lockSpy.mockClear();

    const preview = await app.previewDraft(added.data.manifest.id, {
      enabledTargets: ["codex"],
      selectedLeafIds: [`${added.data.manifest.id}:skills/review`],
    });

    expect(preview.ok).toBe(true);
    expect(lockSpy).toHaveBeenCalledTimes(1);
  });

  test("inspectSourceEnrichment returns metadata and snapshot without recomputing local shell", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const result = await app.inspectSourceEnrichment(added.data.manifest.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toHaveProperty("sourceMetadata");
  });

  test("updating a local source ignores mounted agent symlinks inside priority skill buckets", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "source/skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const originalCodexTarget = process.env.SKILL_FLOW_TARGET_CODEX;
    process.env.SKILL_FLOW_TARGET_CODEX = path.join(repoPath, ".codex", "skills");
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_CODEX, { recursive: true });

    try {
      const app = new SkillFlowApp();
      const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
      expect(added.ok).toBe(true);
      if (!added.ok) {
        return;
      }

      const sourceId = added.data.manifest.id;
      const leafId = `${sourceId}:source/skills/review`;
      const applied = await app.applyDraft(sourceId, {
        enabledTargets: ["codex"],
        selectedLeafIds: [leafId],
      });
      expect(applied.ok).toBe(true);
      if (!applied.ok) {
        return;
      }

      const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX, "review");
      expect(await pathExists(targetPath)).toBe(true);

      const updated = await app.updateSources([sourceId]);
      expect(updated.ok).toBe(true);
      if (!updated.ok) {
        return;
      }

      const inspect = await app.inspectSource(sourceId);
      expect(inspect.ok).toBe(true);
      if (!inspect.ok) {
        return;
      }

      expect(inspect.data.leafs.map((leaf) => leaf.id)).toEqual([leafId]);
      expect(inspect.data.binding.selectedLeafIds).toEqual([leafId]);
      expect(inspect.data.deployments).toHaveLength(1);
      expect(inspect.data.deployments[0]?.target).toBe("codex");
      expect(await pathExists(targetPath)).toBe(true);
    } finally {
      process.env.SKILL_FLOW_TARGET_CODEX = originalCodexTarget;
    }
  });

  test("listWorkflows preserves bootstrap import metadata after reconcile", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "gstack-bootstrap-preserve");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const observedTargets = [
      {
        target: "codex" as const,
        rootPath: process.env.SKILL_FLOW_TARGET_CODEX!,
        targetPath: path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack-bootstrap-preserve"),
      },
    ];

    const added = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      observedTargets,
      importMode: "bootstrap-detected",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const listed = await app.listWorkflows();
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }

    const lock = await app.store.readLock();
    const sourceLock = lock.sources.find((source) => source.id === added.data.manifest.id);

    expect(sourceLock?.importMode).toBe("bootstrap-detected");
    expect(sourceLock?.observedTargets).toEqual(observedTargets);
  });

  test("rejects add path when it does not resolve to a valid skill", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
      "docs/readme.md": "hello",
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath, { path: "docs" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors[0]?.code).toBe("SOURCE_PATH_NOT_FOUND");
  });

  test("parses GitHub tree URLs as repo sources with path filtering", async () => {
    const upstreamRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
    });
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    vi.spyOn(gitUtils, "git").mockImplementation(async (args) => {
      if (args[0] === "clone" && args[3] === "https://github.com/vercel-labs/skills.git") {
        await fs.cp(upstreamRepo, args[4]!, { recursive: true });
        return "";
      }

      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return "test-commit-sha";
      }

      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });

    const app = new SkillFlowApp();
    const result = await app.addSource(
      "https://github.com/vercel-labs/skills/tree/main/skills/find-skills",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.manifest.id).toBe("vercel-labs-skills");
    expect(result.data.manifest.requestedPath).toBe("skills/find-skills");
  }, 30000);

  test("combines GitHub tree paths with --path relative to the tree location", async () => {
    const upstreamRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
    });
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    vi.spyOn(gitUtils, "git").mockImplementation(async (args) => {
      if (args[0] === "clone" && args[3] === "https://github.com/vercel-labs/skills.git") {
        await fs.cp(upstreamRepo, args[4]!, { recursive: true });
        return "";
      }

      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return "test-commit-sha";
      }

      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });

    const app = new SkillFlowApp();
    const result = await app.addSource(
      "https://github.com/vercel-labs/skills/tree/main/skills",
      { path: "find-skills" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.manifest.id).toBe("vercel-labs-skills");
    expect(result.data.manifest.requestedPath).toBe("skills/find-skills");
  }, 30000);

  test("adds a ClawHub source and stores ClawHub lock metadata", async () => {
    vi.spyOn(clawhubUtils, "installClawHubSkill").mockImplementation(async (slug, version) => {
      const workdir = await fs.mkdtemp(path.join(sandbox.sandboxRoot, "clawhub-install-"));
      const installedPath = path.join(workdir, "skills", slug);
      await writeRepoFiles(installedPath, {
        "SKILL.md": skillDoc("find-skills", "Find skills from ClawHub."),
        ".clawhub/origin.json": JSON.stringify({
          slug,
          installedVersion: version ?? "1.0.0",
        }),
      });
      return {
        workdir,
        installedPath,
        slug,
        resolvedVersion: version ?? "1.0.0",
      };
    });

    const app = new SkillFlowApp();

    const result = await app.addSource("clawhub:find-skills-skill");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.manifest.kind).toBe("clawhub");
    expect(result.data.lock.kind).toBe("clawhub");
    expect(result.data.lock.packageSlug).toBe("find-skills-skill");
    expect(result.data.lock.resolvedVersion).toBeTruthy();
    expect(result.data.leafCount).toBeGreaterThan(0);
  }, 20000);

  test("keeps a pinned ClawHub source unchanged on update", async () => {
    vi.spyOn(clawhubUtils, "installClawHubSkill").mockImplementation(async (slug, version) => {
      const resolvedVersion = version ?? "1.0.0";
      const workdir = await fs.mkdtemp(path.join(sandbox.sandboxRoot, "clawhub-install-"));
      const installedPath = path.join(workdir, "skills", slug);
      await writeRepoFiles(installedPath, {
        "SKILL.md": skillDoc("find-skills", "Find skills from ClawHub."),
        ".clawhub/origin.json": JSON.stringify({
          slug,
          installedVersion: resolvedVersion,
        }),
      });
      return {
        workdir,
        installedPath,
        slug,
        resolvedVersion,
      };
    });

    const app = new SkillFlowApp();

    const added = await app.addSource("clawhub:find-skills-skill@1.0.0");

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    expect(added.data.lock.versionMode).toBe("pinned");

    const updated = await app.updateSources([added.data.manifest.id]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    expect(updated.data.updated[0]?.changed).toBe(false);
  }, 20000);

  test("keeps a floating ClawHub source unchanged when no newer version exists", async () => {
    vi.spyOn(clawhubUtils, "installClawHubSkill").mockImplementation(async (slug, version) => {
      const resolvedVersion = version ?? "1.0.0";
      const workdir = await fs.mkdtemp(path.join(sandbox.sandboxRoot, "clawhub-install-"));
      const installedPath = path.join(workdir, "skills", slug);
      await writeRepoFiles(installedPath, {
        "SKILL.md": skillDoc("find-skills", "Find skills from ClawHub."),
        ".clawhub/origin.json": JSON.stringify({
          slug,
          installedVersion: resolvedVersion,
        }),
      });
      return {
        workdir,
        installedPath,
        slug,
        resolvedVersion,
      };
    });

    const app = new SkillFlowApp();

    const added = await app.addSource("clawhub:find-skills-skill");

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    expect(added.data.lock.versionMode).toBe("floating");

    const updated = await app.updateSources([added.data.manifest.id]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    expect(updated.data.updated[0]?.changed).toBe(false);
  }, 40000);

  test("find prefers local results, then built-in git, then ClawHub", async () => {
    vi.spyOn(clawhubUtils, "searchClawHubSkills").mockResolvedValueOnce([
      { slug: "browse-skill", title: "Browse Skill", score: 0.92 },
    ]);

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Local browse skill."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);

    await seedBuiltinCatalog(app);
    const builtin = builtinGitSources.getBuiltinGitSources()[0]!;
    const builtinSourceId = deriveSourceId(builtin.locator);
    await fs.mkdir(
      path.join(app.store.getCatalogCheckoutPath(builtinSourceId), "skills", "browse"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(app.store.getCatalogCheckoutPath(builtinSourceId), "skills", "browse", "SKILL.md"),
      skillDoc("browse", "Built-in browse skill."),
      "utf8",
    );

    const result = await app.findSkills("browse");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.candidates.map((candidate) => candidate.source)).toEqual([
      "local",
      "builtin-git",
      "clawhub",
    ]);
  }, 10000);

  test("find falls back to stale built-in catalog cache with a warning", async () => {
    vi.spyOn(clawhubUtils, "searchClawHubSkills").mockResolvedValueOnce([]);
    vi.spyOn(builtinGitSources, "getBuiltinGitSources").mockReturnValue([
      { locator: "https://github.com/example/catalog.git", branch: "main" },
    ]);
    vi.spyOn(githubCatalog, "fetchGitHubSkillPaths").mockRejectedValueOnce(new Error("offline"));

    const app = new SkillFlowApp();
    const sourceId = deriveSourceId("https://github.com/example/catalog.git");
    await fs.mkdir(app.store.catalogRoot, { recursive: true });
    await fs.writeFile(
      app.store.getCatalogIndexPath(sourceId),
      `${JSON.stringify(
        {
          locator: "https://github.com/example/catalog.git",
          branch: "main",
          skillPaths: ["skills/browse/SKILL.md"],
          updatedAt: "2020-01-01T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await app.findSkills("browse");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.candidates[0]?.source).toBe("builtin-git");
    expect(
      result.warnings.some((warning) => warning.code === "BUILTIN_SOURCE_STALE_CACHE_USED"),
    ).toBe(true);
  });

  test("find builds repo-level add commands for built-in Git results", async () => {
    vi.spyOn(clawhubUtils, "searchClawHubSkills").mockResolvedValueOnce([]);

    const app = new SkillFlowApp();
    await seedBuiltinCatalog(app);
    const builtin = builtinGitSources.getBuiltinGitSources()[0]!;
    const builtinSourceId = deriveSourceId(builtin.locator);
    await fs.mkdir(
      path.join(app.store.getCatalogCheckoutPath(builtinSourceId), "skills", "find-skills"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        app.store.getCatalogCheckoutPath(builtinSourceId),
        "skills",
        "find-skills",
        "SKILL.md",
      ),
      skillDoc("find-skills", "Find skills from a built-in repo."),
      "utf8",
    );

    const result = await app.findSkills("find skills");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const candidate = result.data.candidates[0];
    expect(candidate?.source).toBe("builtin-git");
    expect(buildFindCommand(candidate!)).toBe(
      `skill-flow add ${builtin.locator} --path skills/find-skills`,
    );
  }, 10000);

  test("find normalizes spaces, hyphens, and underscores in query matching", async () => {
    vi.spyOn(clawhubUtils, "searchClawHubSkills").mockResolvedValueOnce([]);
    vi.spyOn(builtinGitSources, "getBuiltinGitSources").mockReturnValue([]);

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "agent-browser/SKILL.md": skillDoc("agent-browser", "Agent browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);

    const result = await app.findSkills("agent browser");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.candidates[0]?.title).toBe("agent-browser");
  }, 10000);

  test("find falls back to linkName when local skill title is a placeholder heading", async () => {
    vi.spyOn(clawhubUtils, "searchClawHubSkills").mockResolvedValueOnce([]);
    vi.spyOn(builtinGitSources, "getBuiltinGitSources").mockReturnValue([]);

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "templated/SKILL.md": `---
name: templated
description: |
  Templated description.
---

# {Title}
`,
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);

    const result = await app.findSkills("templated");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.candidates[0]?.title).toBe("templated");
  });

  test("returns a clear error when git fetch fails", async () => {
    const app = new SkillFlowApp();

    const result = await app.addSource(path.join(sandbox.sandboxRoot, "missing-repo"));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("GIT_CLONE_FAILED");
  });

  test("keeps an existing checkout directory when git fetch fails", async () => {
    const app = new SkillFlowApp();
    const sourceId = "existing-checkout";
    const checkoutPath = app.store.getSourceCheckoutPath("git", sourceId);

    await fs.mkdir(checkoutPath, { recursive: true });
    await fs.writeFile(path.join(checkoutPath, "keep.txt"), "keep", "utf8");

    const result = await app.addSource(path.join(sandbox.sandboxRoot, "missing-repo"), {
      sourceIdOverride: sourceId,
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("GIT_CLONE_FAILED");
    expect(await fs.readFile(path.join(checkoutPath, "keep.txt"), "utf8")).toBe("keep");
  });

  test("refuses to delete the managed source root itself during uninstall", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const lock = await app.store.readLock();
    const source = lock.sources.find((item) => item.id === added.data.manifest.id);
    expect(source).toBeTruthy();
    if (!source) {
      return;
    }
    source.checkoutPath = app.store.getSourceRoot("local");
    await app.store.writeLock(lock);

    const removed = await app.uninstall([added.data.manifest.id]);

    expect(removed.ok).toBe(false);
    if (removed.ok) {
      return;
    }
    expect(removed.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
    expect(await pathExists(app.store.getSourceRoot("local"))).toBe(true);
  });

  test("fails find when no local results exist and all remote search backends are unavailable", async () => {
    vi.spyOn(builtinGitSources, "getBuiltinGitSources").mockReturnValue([]);
    vi.spyOn(clawhubUtils, "searchClawHubSkills").mockRejectedValueOnce(new Error("offline"));

    const app = new SkillFlowApp();
    const result = await app.findSkills("browse");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors[0]?.code).toBe("FIND_UNAVAILABLE");
    expect(result.warnings[0]?.code).toBe("CLAWHUB_SEARCH_FAILED");
  });

  test("rejects uninstall for an unknown skills group", async () => {
    const app = new SkillFlowApp();

    const result = await app.uninstall(["missing-source"]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("SOURCE_NOT_FOUND");
  });

  test("rejects a source with zero valid skills", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "broken/SKILL.md": "No heading here",
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("NO_VALID_LEAFS");
  });

  test("keeps valid skills and warns about invalid ones", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
      "bad/SKILL.md": "Broken file",
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  test("accepts skills that use YAML frontmatter metadata", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": `---
name: browse
version: 1.1.0
description: |
  Fast headless browser for QA testing and site dogfooding.
  Opens pages and validates flows.
---
<!-- generated -->

## Preamble
`,
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);

    const listResult = await app.listWorkflows();
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) {
      return;
    }
    expect(listResult.data.summaries[0]?.leafs[0]?.title).toBe("browse");
    expect(listResult.data.summaries[0]?.leafs[0]?.description).toContain(
      "Fast headless browser",
    );
    expect(listResult.data.summaries[0]?.leafs[0]?.name).toBe("browse");
  });

  test("keeps metadata warnings on valid skills", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "folder-name/SKILL.md": skillDoc("bad--name", "x".repeat(1025)),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs[0]?.metadataWarnings.length).toBeGreaterThan(0);
  });

  test("reads old lock entries without metadata fields", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const lockPath = path.join(sandbox.stateRoot, "lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      leafInventory: Array<Record<string, unknown>>;
    };
    lock.leafInventory = lock.leafInventory.map((leaf) => {
      const next = { ...leaf };
      delete next.metadataWarnings;
      delete next.linkName;
      return next;
    });
    await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs[0]?.metadataWarnings).toEqual([]);
    expect(list.data.summaries[0]?.leafs[0]?.linkName).toBe("browse");
  });

  test("repairSource refreshes a local checkout from origin without mutating target disk", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:browse`;
    const checkoutPath = app.store.getSourceCheckoutPath("local", sourceId);

    await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [leafId],
    });
    const lockBefore = await app.store.readLock();
    const targetPath = lockBefore.deployments.find(
      (deployment) => deployment.sourceId === sourceId && deployment.target === "openclaw",
    )?.targetPath;
    expect(targetPath).toBeTruthy();
    if (!targetPath) {
      return;
    }
    const targetBefore = await fs.readFile(path.join(targetPath, "SKILL.md"), "utf8");

    await writeRepoFiles(repoPath, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow, refreshed upstream."),
    });

    const repaired = await app.repairSource([sourceId]);

    expect(repaired.ok).toBe(true);
    expect(
      await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8"),
    ).toContain("Browser flow, refreshed upstream.");
    expect(await fs.readFile(path.join(targetPath, "SKILL.md"), "utf8")).toBe(targetBefore);
  });

  test("applyDraft writes an audit event with selected targets", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, { sourceIdOverride: "audit-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    process.env.SKILL_FLOW_CALLER = "test-harness";
    const applied = await app.applyDraft(added.data.manifest.id, {
      enabledTargets: ["codex"],
      selectedLeafIds: [`${added.data.manifest.id}:skills/review`],
    });
    delete process.env.SKILL_FLOW_CALLER;

    expect(applied.ok).toBe(true);

    const logLines = (await fs.readFile(path.join(sandbox.stateRoot, "audit.log.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const lastEvent = logLines.at(-1);

    expect(lastEvent?.mutation).toBe("apply-draft");
    expect(lastEvent?.caller).toBe("test-harness");
    expect(lastEvent?.status).toBe("ok");
    expect(lastEvent?.details).toMatchObject({
      sourceId: added.data.manifest.id,
      selectedLeafIds: [`${added.data.manifest.id}:skills/review`],
      enabledTargets: ["codex"],
      stateTransition: {
        after: {
          sourcePresent: true,
          enabledTargets: ["codex"],
        },
      },
    });
    expect(lastEvent?.details).toHaveProperty("actionSummary");
    expect(lastEvent?.details).toHaveProperty("stateTransition.before");
    expect(lastEvent?.details).toHaveProperty("stateTransition.after.projections");
  });

  test("renameSource updates manifest and lock display names without changing ids or bindings", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const before = await app.store.readState();
    const beforeBinding = before.manifest.bindings["demo-source"];
    const beforeDeployments = before.lockFile.deployments;
    const beforeProjections = before.lockFile.projections ?? [];
    const renamed = await app.renameSource("demo-source", "  Writing Tools  ");

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    const originalDisplayName = added.data.manifest.originalDisplayName;
    expect(renamed.data).toEqual({
      sourceId: "demo-source",
      displayName: "Writing Tools",
      originalDisplayName,
      isResetToOriginal: false,
    });

    const after = await app.store.readState();
    expect(after.manifest.sources.find((source) => source.id === "demo-source")?.displayName).toBe("Writing Tools");
    expect(after.lockFile.sources.find((source) => source.id === "demo-source")?.displayName).toBe("Writing Tools");
    expect(after.manifest.sources.find((source) => source.id === "demo-source")?.id).toBe("demo-source");
    expect(after.manifest.bindings["demo-source"]).toEqual(beforeBinding);
    expect(after.lockFile.sources.find((source) => source.id === "demo-source")?.checkoutPath).toBe(
      before.lockFile.sources.find((source) => source.id === "demo-source")?.checkoutPath,
    );
    expect(after.lockFile.deployments).toHaveLength(beforeDeployments.length);
    expect(after.lockFile.projections ?? []).toHaveLength(beforeProjections.length);
    expect(after.lockFile.deployments.map((deployment) => ({
      sourceId: deployment.sourceId,
      leafId: deployment.leafId,
      target: deployment.target,
      targetPath: deployment.targetPath,
    }))).toEqual(beforeDeployments.map((deployment) => ({
      sourceId: deployment.sourceId,
      leafId: deployment.leafId,
      target: deployment.target,
      targetPath: deployment.targetPath,
    })));
    expect((after.lockFile.projections ?? []).map((projection) => ({
      sourceId: projection.sourceId,
      leafId: projection.leafId,
      target: projection.target,
      targetPath: projection.targetPath,
    }))).toEqual(beforeProjections.map((projection) => ({
      sourceId: projection.sourceId,
      leafId: projection.leafId,
      target: projection.target,
      targetPath: projection.targetPath,
    })));
  });

  test("renameSource rejects missing source labels and resets blank labels to original", async () => {
    const app = new SkillFlowApp();

    const missing = await app.renameSource("missing-source", "Writing Tools");
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors[0]).toEqual({
        code: "SOURCE_NOT_FOUND",
        message: "Skills group id 'missing-source' is not registered.",
      });
    }

    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const originalDisplayName = added.data.manifest.originalDisplayName;

    const renamed = await app.renameSource("demo-source", "Writing Tools");
    expect(renamed.ok).toBe(true);

    const reset = await app.renameSource("demo-source", "   ");
    expect(reset).toMatchObject({
      ok: true,
      data: {
        sourceId: "demo-source",
        displayName: originalDisplayName,
        originalDisplayName,
        isResetToOriginal: true,
      },
    });
    const after = await app.store.readState();
    expect(after.manifest.sources.find((source) => source.id === "demo-source")?.displayName).toBe(originalDisplayName);
    expect(after.lockFile.sources.find((source) => source.id === "demo-source")?.displayName).toBe(originalDisplayName);
  });
});

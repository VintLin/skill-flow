import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import * as clawhubUtils from "@skill-flow/integration/utils/clawhub";
import * as builtinGitSources from "@skill-flow/integration/utils/builtin-git-sources";
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
});

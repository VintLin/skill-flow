import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InventoryService } from "../services/inventory-service.js";
import { SkillFlowApp } from "../services/skill-flow.js";
import * as clawhubUtils from "../utils/clawhub.js";
import * as builtinGitSources from "../utils/builtin-git-sources.js";
import { buildFindCommand } from "../utils/find-command.js";
import {
  buildProjectionWarningMap,
  buildCommandBar,
  buildContextBar,
  buildSaveLabel,
  draftsEqual,
  getPaneWidths,
  getPaneViewportCount,
  getSaveDisplayPhase,
} from "../tui/config-app.js";
import {
  TARGET_COMPAT_READ_CANDIDATES,
  TARGET_DEFINITIONS,
  TARGET_PATH_CANDIDATES,
} from "../utils/constants.js";
import {
  buildProjectedSkillName,
  formatGroupLabel,
  resolveProjectedSkillNames,
} from "../utils/naming.js";
import {
  getParentSelectionState,
  toggleChild,
  toggleParent,
  type TreeSelectionState,
} from "../tui/selection-state.js";
import { deriveSourceId } from "../utils/source-id.js";

describe.sequential("skill-flow", () => {
  let sandboxRoot: string;
  let stateRoot: string;
  let targetsRoot: string;

  beforeEach(async () => {
    sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-test-"));
    stateRoot = path.join(sandboxRoot, "state");
    targetsRoot = path.join(sandboxRoot, "targets");
    await fs.mkdir(targetsRoot, { recursive: true });

    process.env.SKILL_FLOW_STATE_ROOT = stateRoot;
    process.env.SKILL_FLOW_TARGET_CLAUDE_CODE = path.join(targetsRoot, "claude");
    process.env.SKILL_FLOW_TARGET_CODEX = path.join(targetsRoot, "codex");
    process.env.SKILL_FLOW_TARGET_CURSOR = path.join(targetsRoot, "cursor");
    process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT = path.join(targetsRoot, "github-copilot");
    process.env.SKILL_FLOW_TARGET_GEMINI_CLI = path.join(targetsRoot, "gemini-cli");
    process.env.SKILL_FLOW_TARGET_OPENCODE = path.join(targetsRoot, "opencode");
    process.env.SKILL_FLOW_TARGET_OPENCLAW = path.join(targetsRoot, "openclaw");
    process.env.SKILL_FLOW_TARGET_PI = path.join(targetsRoot, "pi");
    process.env.SKILL_FLOW_TARGET_WINDSURF = path.join(targetsRoot, "windsurf");
    process.env.SKILL_FLOW_TARGET_ROO_CODE = path.join(targetsRoot, "roo-code");
    process.env.SKILL_FLOW_TARGET_CLINE = path.join(targetsRoot, "cline");
    process.env.SKILL_FLOW_TARGET_AMP = path.join(targetsRoot, "amp");
    process.env.SKILL_FLOW_TARGET_KIRO = path.join(targetsRoot, "kiro");

    await fs.mkdir(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_CODEX, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_CURSOR, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_GEMINI_CLI, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_OPENCODE, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_OPENCLAW, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_PI, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_WINDSURF, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_ROO_CODE, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_CLINE, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_AMP, { recursive: true });
    await fs.mkdir(process.env.SKILL_FLOW_TARGET_KIRO, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.SKILL_FLOW_STATE_ROOT;
    delete process.env.SKILL_FLOW_TARGET_CLAUDE_CODE;
    delete process.env.SKILL_FLOW_TARGET_CODEX;
    delete process.env.SKILL_FLOW_TARGET_CURSOR;
    delete process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT;
    delete process.env.SKILL_FLOW_TARGET_GEMINI_CLI;
    delete process.env.SKILL_FLOW_TARGET_OPENCODE;
    delete process.env.SKILL_FLOW_TARGET_OPENCLAW;
    delete process.env.SKILL_FLOW_TARGET_PI;
    delete process.env.SKILL_FLOW_TARGET_WINDSURF;
    delete process.env.SKILL_FLOW_TARGET_ROO_CODE;
    delete process.env.SKILL_FLOW_TARGET_CLINE;
    delete process.env.SKILL_FLOW_TARGET_AMP;
    delete process.env.SKILL_FLOW_TARGET_KIRO;
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  });

  test("adds a git source and discovers valid skills", async () => {
    const repoPath = await createRepo(sandboxRoot, {
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
  });

  test("adds a git source with path filtering and keeps only matching skills", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath, { path: "skills/find-skills" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.leafCount).toBe(1);

    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }

    expect(list.data.summaries[0]?.leafs.map((leaf) => leaf.relativePath)).toEqual([
      "skills/find-skills",
    ]);
  });

  test("rejects add path when it does not resolve to a valid skill", async () => {
    const repoPath = await createRepo(sandboxRoot, {
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

    expect(result.data.leafCount).toBe(1);
    expect(result.data.manifest.id).toBe("vercel-labs-skills");
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
  }, 20000);

  test("find prefers local results, then built-in git, then ClawHub", async () => {
    vi.spyOn(clawhubUtils, "searchClawHubSkills").mockResolvedValueOnce([
      { slug: "browse-skill", title: "Browse Skill", score: 0.92 },
    ]);

    const repoPath = await createRepo(sandboxRoot, {
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

  test("returns a clear error when git fetch fails", async () => {
    const app = new SkillFlowApp();

    const result = await app.addSource(path.join(sandboxRoot, "missing-repo"));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("GIT_CLONE_FAILED");
  });

  test("normalizes GitHub locators to the same source id across supported formats", () => {
    const locators = [
      "https://github.com/garrytan/gstack",
      "https://github.com/garrytan/gstack.git",
      "git@github.com:garrytan/gstack.git",
      "garrytan/gstack",
    ];

    expect(locators.map((locator) => deriveSourceId(locator))).toEqual([
      "garrytan-gstack",
      "garrytan-gstack",
      "garrytan-gstack",
      "garrytan-gstack",
    ]);
  });

  test("normalizes ClawHub locators to the same source id across version forms", () => {
    expect(deriveSourceId("clawhub:find-skills")).toBe("clawhub-find-skills");
    expect(deriveSourceId("clawhub:find-skills@1.2.3")).toBe("clawhub-find-skills");
  });

  test("builds follow-up commands for search candidates", () => {
    expect(buildFindCommand({
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
    })).toBe("skill-flow add https://github.com/anthropics/skills.git --path skills/find-skills");

    expect(buildFindCommand({
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
    })).toBe("skill-flow add clawhub:find-skills@1.2.3");
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

  test("formats GitHub groups as groupName(@owner)", () => {
    expect(formatGroupLabel({
      id: "garrytan-gstack",
      locator: "git@github.com:garrytan/gstack.git",
      displayName: "gstack",
    })).toBe("gstack(@garrytan)");
  });

  test("prefers groupName-skillName for projected collisions", () => {
    const projected = resolveProjectedSkillNames([
      {
        leafId: "a:browse",
        groupId: "garrytan-gstack",
        groupName: "gstack",
        skillName: "browse",
      },
      {
        leafId: "b:browse",
        groupId: "alice-toolkit",
        groupName: "toolkit",
        skillName: "browse",
      },
    ]);

    expect(projected.get("a:browse")).toBe(buildProjectedSkillName("gstack", "browse"));
    expect(projected.get("b:browse")).toBe(buildProjectedSkillName("toolkit", "browse"));
  });

  test("falls back to groupId-skillName when projected names still collide", () => {
    const projected = resolveProjectedSkillNames([
      {
        leafId: "a:browse",
        groupId: "alice-gstack",
        groupName: "gstack",
        skillName: "browse",
      },
      {
        leafId: "b:browse",
        groupId: "garrytan-gstack",
        groupName: "gstack",
        skillName: "browse",
      },
    ]);

    expect(projected.get("a:browse")).toBe("alice-gstack-browse");
    expect(projected.get("b:browse")).toBe("garrytan-gstack-browse");
  });

  test("rejects uninstall for an unknown workflow group", async () => {
    const app = new SkillFlowApp();

    const result = await app.uninstall(["missing-source"]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("SOURCE_NOT_FOUND");
  });

  test("rejects a source with zero valid skills", async () => {
    const repoPath = await createRepo(sandboxRoot, {
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
    const repoPath = await createRepo(sandboxRoot, {
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
    const repoPath = await createRepo(sandboxRoot, {
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

  test("uses repository display name for a root-level skill link name", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "SKILL.md": skillDoc("gstack", "Root skill."),
    });
    const inventory = new InventoryService();
    const scanned = await inventory.scanSource("garrytan-gstack", repoPath, "gstack");
    expect(scanned.leafs[0]?.linkName).toBe("gstack");
  });

  test("blocks apply preview when foreign content already exists at target path", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    await fs.mkdir(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "good"), {
      recursive: true,
    });

    const preview = await app.previewDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.data.plan.blocked).toHaveLength(1);
    expect(preview.data.plan.blocked[0]?.reason).toContain("Foreign content");
  });

  test("doctor detects broken symlinks", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    await fs.rm(path.join(stateRoot, "source", "git", sourceId, "good"), {
      recursive: true,
      force: true,
    });

    const doctor = await app.doctor();
    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(doctor.data.issues.some((issue) => issue.code === "BROKEN_SYMLINK")).toBe(true);
  });

  test("scans host directories too, but keeps the first discovered duplicate only", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
      ".agents/skills/gstack-browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    expect(
      result.warnings.some((warning) =>
        warning.message.includes("Duplicate skill content"),
      ),
    ).toBe(true);
    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs.map((leaf) => leaf.relativePath)).toEqual([
      "browse",
    ]);
  });

  test("discovers a unique skill from a host directory when no earlier duplicate exists", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      ".agents/skills/gstack-browse/SKILL.md": skillDoc("gstack-browse", "Host directory skill."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs[0]?.relativePath).toBe(".agents/skills/gstack-browse");
  });

  test("prefers visible second-level skill directories before hidden second-level directories", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "catalog/browse/SKILL.md": skillDoc("browse", "Browser flow."),
      "catalog/.generated/browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs[0]?.relativePath).toBe("catalog/browse");
    expect(
      result.warnings.some((warning) =>
        warning.message.includes("catalog/.generated/browse"),
      ),
    ).toBe(true);
  });

  test("dedupes skills by metadata name and description", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "browse/SKILL.md": `---
name: browse
description: |
  Canonical browse skill.
---
## Body
`,
      "copy-of-browse/SKILL.md": `---
name: browse
description: |
  Canonical browse skill.
---
## Body
`,
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    expect(
      result.warnings.some((warning) =>
        warning.message.includes("Duplicate skill content"),
      ),
    ).toBe(true);
  });

  test("keeps same-name skills when descriptions differ", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Canonical browse skill."),
      "copy-of-browse/SKILL.md": skillDoc("browse", "Different browse skill."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(2);
  });

  test("apply uses natural skill names and removes legacy prefixed paths", async () => {
    const repoPath = await createRepo(sandboxRoot, {
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
    const legacyPath = path.join(
      process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!,
      `${sourceId}--browse`,
    );

    await fs.symlink(
      path.join(stateRoot, "source", "git", sourceId, "browse"),
      legacyPath,
      "junction",
    );

    const lockPath = path.join(stateRoot, "lock.json");
    const lockFile = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      deployments: Array<Record<string, string>>;
    };
    lockFile.deployments.push({
      sourceId,
      leafId,
      target: "claude-code",
      targetPath: legacyPath,
      strategy: "symlink",
      status: "active",
      contentHash: "legacy",
      appliedAt: new Date().toISOString(),
    });
    await fs.writeFile(lockPath, `${JSON.stringify(lockFile, null, 2)}\n`, "utf8");

    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(await pathExists(legacyPath)).toBe(false);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(true);
  });

  test("keeps the earlier selected cross-group duplicate when linkName name and description all match", async () => {
    const repoA = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const repoB = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const addedA = await app.addSource(repoA);
    const addedB = await app.addSource(repoB);
    expect(addedA.ok).toBe(true);
    expect(addedB.ok).toBe(true);
    if (!addedA.ok || !addedB.ok) {
      return;
    }

    const sourceA = addedA.data.manifest.id;
    const sourceB = addedB.data.manifest.id;
    const leafA = `${sourceA}:browse`;
    const leafB = `${sourceB}:browse`;

    const firstApply = await app.applyDraft(sourceA, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafA],
    });
    expect(firstApply.ok).toBe(true);

    const secondApply = await app.applyDraft(sourceB, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafB],
    });
    expect(secondApply.ok).toBe(true);
    if (!secondApply.ok) {
      return;
    }

    expect(secondApply.data.draft.selectedLeafIds).toEqual([]);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(true);

    const lockPath = path.join(stateRoot, "lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      deployments: Array<{ sourceId: string; targetPath: string }>;
    };
    expect(
      lock.deployments.filter((deployment) =>
        deployment.targetPath.endsWith(path.join("claude", "browse")),
      ),
    ).toHaveLength(1);
    expect(lock.deployments[0]?.sourceId).toBe(sourceA);
  });

  test("renames cross-group projections when linkName matches but content differs", async () => {
    const repoA = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from A."),
    });
    const repoB = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from B."),
    });
    const app = new SkillFlowApp();
    const addedA = await app.addSource(repoA);
    const addedB = await app.addSource(repoB);
    expect(addedA.ok).toBe(true);
    expect(addedB.ok).toBe(true);
    if (!addedA.ok || !addedB.ok) {
      return;
    }

    const sourceA = addedA.data.manifest.id;
    const sourceB = addedB.data.manifest.id;
    const leafA = `${sourceA}:browse`;
    const leafB = `${sourceB}:browse`;

    const firstApply = await app.applyDraft(sourceA, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafA],
    });
    expect(firstApply.ok).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(true);

    const secondApply = await app.applyDraft(sourceB, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafB],
    });
    expect(secondApply.ok).toBe(true);

    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(false);
    expect(
      await pathExists(
        path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, `${sourceA}-browse`),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, `${sourceB}-browse`),
      ),
    ).toBe(true);
  });

  test("doctor reports unavailable target paths", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await fs.rm(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, {
      recursive: true,
      force: true,
    });

    const doctor = await app.previewDraft(added.data.manifest.id, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [`${added.data.manifest.id}:good`],
    });

    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(doctor.data.plan.blocked[0]?.reason).toContain("Target directory not found");
  });

  test("update detects added skills", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);

    await writeRepoFiles(repoPath, {
      "extra/SKILL.md": skillDoc("extra", "Extra description."),
    });
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "add extra"]);

    const updated = await app.updateSources([added.ok ? added.data.manifest.id : ""]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]?.addedLeafIds).toHaveLength(1);
  });

  test("update removes projections for deleted skills", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    await fs.rm(path.join(repoPath, "good"), { recursive: true, force: true });
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "remove good"]);

    const updated = await app.updateSources([sourceId]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]?.removedLeafIds).toEqual([leafId]);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "good")),
    ).toBe(false);
  });

  test("update surfaces invalidated skills", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await writeRepoFiles(repoPath, {
      "good/SKILL.md": "Broken now",
    });
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "invalidate"]);

    const updated = await app.updateSources([added.data.manifest.id]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]?.invalidatedLeafIds).toHaveLength(1);
  });

  test("selection state machine handles parent child partial transitions", () => {
    let state: TreeSelectionState = {
      allLeafIds: ["a", "b"],
      selectedLeafIds: [],
    };

    expect(getParentSelectionState(state)).toBe("empty");
    state = toggleChild(state, "a");
    expect(getParentSelectionState(state)).toBe("partial");
    state = toggleParent(state);
    expect(getParentSelectionState(state)).toBe("full");
    state = toggleChild(state, "b");
    expect(getParentSelectionState(state)).toBe("partial");
  });

  test("doctor detects drift in copied projections", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [leafId],
    });

    await writeRepoFiles(process.env.SKILL_FLOW_TARGET_OPENCLAW!, {
      ["good/SKILL.md"]: "# Good\nMutated copy.",
    });

    const doctor = await app.doctor();
    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(doctor.data.issues.some((issue) => issue.code === "DRIFT_COPY")).toBe(true);
  });

  test("keeps metadata warnings on valid skills", async () => {
    const repoPath = await createRepo(sandboxRoot, {
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
    const repoPath = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const lockPath = path.join(stateRoot, "lock.json");
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

  test("previewDraft is read-only and does not reconcile inventory on its own", async () => {
    const repoPath = await createRepo(sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const lockPath = path.join(stateRoot, "lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      sources: Array<{ id: string; leafIds: string[] }>;
      leafInventory: Array<Record<string, unknown>>;
    };
    const existingLeaf = lock.leafInventory[0] as {
      id: string;
      absolutePath: string;
      linkName: string;
      name: string;
      relativePath: string;
      skillFilePath: string;
      sourceId: string;
      title: string;
    };
    const generatedLeafId = `${sourceId}:.agents/skills/generated`;
    lock.sources[0]!.leafIds.push(generatedLeafId);
    lock.leafInventory.push({
      ...existingLeaf,
      id: generatedLeafId,
      relativePath: ".agents/skills/generated",
      absolutePath: path.join(stateRoot, "source", "git", sourceId, ".agents/skills/generated"),
      skillFilePath: path.join(
        stateRoot,
        "source",
        "git",
        sourceId,
        ".agents/skills/generated/SKILL.md",
      ),
      linkName: "generated",
      name: "generated",
      title: "generated",
    });
    const mutatedLock = `${JSON.stringify(lock, null, 2)}\n`;
    await fs.writeFile(lockPath, mutatedLock, "utf8");

    const preview = await app.previewDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [`${sourceId}:browse`],
    });

    expect(preview.ok).toBe(true);
    expect(await fs.readFile(lockPath, "utf8")).toBe(mutatedLock);
  });

  test("config helpers derive save, command, and context states", () => {
    expect(draftsEqual(
      {
        enabledTargets: ["codex", "claude-code"],
        selectedLeafIds: ["b", "a"],
      },
      {
        enabledTargets: ["claude-code", "codex"],
        selectedLeafIds: ["a", "b"],
      },
    )).toBe(true);
    expect(getSaveDisplayPhase("idle", true)).toBe("dirty");
    expect(buildSaveLabel("dirty", 3)).toContain("DIRTY");
    expect(getPaneViewportCount(16, 1)).toBe(10);
    expect(getPaneWidths(100).reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(98);
    expect(
      buildCommandBar({
        changeCount: 3,
        focus: "groups",
        saveFocused: false,
        savePhase: "dirty",
      }),
    ).toContain("inspect skills");
    expect(
      buildContextBar({
        blockedCount: 0,
        changeCount: 3,
        previewError: undefined,
        previewLoading: false,
        savePhase: "clean",
        saveMessage: undefined,
        selectedLeafName: "gstack",
        selectedLeafWarnings: ["description should be at most 1024 characters"],
        skippedLeafs: 21,
        sourceLabel: "gstack(@garrytan)",
      }),
    ).toContain("gstack(@garrytan)");
  });

  test("projection warning helper marks identical cross-group skills as skipped", () => {
    const warnings = buildProjectionWarningMap({
      drafts: {
        alpha: { enabledTargets: ["claude-code"], selectedLeafIds: ["alpha:browse"] },
        beta: { enabledTargets: ["claude-code"], selectedLeafIds: ["beta:browse"] },
      },
      summaries: [
        {
          source: {
            id: "alpha",
            locator: "alpha",
            kind: "git",
            displayName: "alpha",
            addedAt: "",
          },
          lock: undefined,
          bindings: { targets: {} },
          activeTargetCount: 0,
          health: "ACTIVE",
          leafs: [
            {
              id: "alpha:browse",
              sourceId: "alpha",
              name: "browse",
              linkName: "browse",
              title: "browse",
              description: "Browser flow.",
              relativePath: "browse",
              absolutePath: "/tmp/alpha/browse",
              skillFilePath: "/tmp/alpha/browse/SKILL.md",
              contentHash: "a",
              metadataWarnings: [],
              valid: true,
            },
          ],
        },
        {
          source: {
            id: "beta",
            locator: "beta",
            kind: "git",
            displayName: "beta",
            addedAt: "",
          },
          lock: undefined,
          bindings: { targets: {} },
          activeTargetCount: 0,
          health: "ACTIVE",
          leafs: [
            {
              id: "beta:browse",
              sourceId: "beta",
              name: "browse",
              linkName: "browse",
              title: "browse",
              description: "Browser flow.",
              relativePath: "browse",
              absolutePath: "/tmp/beta/browse",
              skillFilePath: "/tmp/beta/browse/SKILL.md",
              contentHash: "b",
              metadataWarnings: [],
              valid: true,
            },
          ],
        },
      ],
      sourceId: "beta",
    });

    expect(warnings["beta:browse"]?.[0]).toContain("will be skipped");
  });

  test("projection warning helper marks cross-group name collisions as renamed", () => {
    const warnings = buildProjectionWarningMap({
      drafts: {
        alpha: { enabledTargets: ["claude-code"], selectedLeafIds: ["alpha:browse"] },
        beta: { enabledTargets: ["claude-code"], selectedLeafIds: ["beta:browse"] },
      },
      summaries: [
        {
          source: {
            id: "alpha",
            locator: "alpha",
            kind: "git",
            displayName: "alpha",
            addedAt: "",
          },
          lock: undefined,
          bindings: { targets: {} },
          activeTargetCount: 0,
          health: "ACTIVE",
          leafs: [
            {
              id: "alpha:browse",
              sourceId: "alpha",
              name: "browse",
              linkName: "browse",
              title: "browse",
              description: "Browser flow A.",
              relativePath: "browse",
              absolutePath: "/tmp/alpha/browse",
              skillFilePath: "/tmp/alpha/browse/SKILL.md",
              contentHash: "a",
              metadataWarnings: [],
              valid: true,
            },
          ],
        },
        {
          source: {
            id: "beta",
            locator: "beta",
            kind: "git",
            displayName: "beta",
            addedAt: "",
          },
          lock: undefined,
          bindings: { targets: {} },
          activeTargetCount: 0,
          health: "ACTIVE",
          leafs: [
            {
              id: "beta:browse",
              sourceId: "beta",
              name: "browse",
              linkName: "browse",
              title: "browse",
              description: "Browser flow B.",
              relativePath: "browse",
              absolutePath: "/tmp/beta/browse",
              skillFilePath: "/tmp/beta/browse/SKILL.md",
              contentHash: "b",
              metadataWarnings: [],
              valid: true,
            },
          ],
        },
      ],
      sourceId: "beta",
    });

    expect(warnings["beta:browse"]?.[0]).toContain("will deploy as beta-browse");
  });

  test("supports cursor and pi target projections", async () => {
    const repoPath = await createRepo(sandboxRoot, {
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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["cursor", "pi"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CURSOR!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_PI!, "browse"))).toBe(
      true,
    );
  });

  test("supports additional global agent target projections", async () => {
    const repoPath = await createRepo(sandboxRoot, {
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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: [
        "github-copilot",
        "gemini-cli",
        "windsurf",
        "roo-code",
        "cline",
        "amp",
        "kiro",
      ],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT!, "browse")),
    ).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_GEMINI_CLI!, "browse")),
    ).toBe(true);
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_WINDSURF!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_ROO_CODE!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLINE!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_AMP!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_KIRO!, "browse"))).toBe(
      true,
    );
  });

  test("discovers all configured global targets with isolated roots", async () => {
    const app = new SkillFlowApp();

    const targets = await app.getAvailableTargets();

    expect(targets).toEqual([
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
  });

  test("includes config-based OpenCode skills directory in default detection paths", () => {
    expect(TARGET_PATH_CANDIDATES.opencode).toContain(
      path.join(os.homedir(), ".config", "opencode", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["github-copilot"]).toContain(
      path.join(os.homedir(), ".copilot", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["gemini-cli"]).toContain(
      path.join(os.homedir(), ".gemini", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.windsurf).toContain(
      path.join(os.homedir(), ".codeium", "windsurf", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["roo-code"]).toContain(
      path.join(os.homedir(), ".roo", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.cline).toContain(
      path.join(os.homedir(), ".cline", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".config", "agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.kiro).toContain(
      path.join(os.homedir(), ".kiro", "skills"),
    );
  });

  test("classifies shared global roots as compatibility reads instead of write roots", () => {
    expect(TARGET_DEFINITIONS.codex.writerKey).toBe("agents-skills");
    expect(TARGET_PATH_CANDIDATES.codex).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES["gemini-cli"]).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES["github-copilot"]).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.cursor).toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.pi).toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["gemini-cli"]).not.toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["github-copilot"]).not.toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
  });
});

async function createRepo(
  root: string,
  files: Record<string, string>,
): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(root, "repo-"));
  git(repoPath, ["init"]);
  git(repoPath, ["config", "user.email", "test@example.com"]);
  git(repoPath, ["config", "user.name", "Skill Flow Test"]);
  await writeRepoFiles(repoPath, files);
  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", "initial"]);
  return repoPath;
}

async function seedBuiltinCatalog(app: SkillFlowApp): Promise<void> {
  for (const builtin of builtinGitSources.getBuiltinGitSources()) {
    await fs.mkdir(app.store.getCatalogCheckoutPath(deriveSourceId(builtin.locator)), {
      recursive: true,
    });
  }
}

async function writeRepoFiles(root: string, files: Record<string, string>) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  }
}

function skillDoc(name: string, description: string, heading?: string) {
  return `---
name: ${name}
description: |
  ${description}
---
${heading ? `\n# ${heading}\n` : ""}
`;
}

function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

async function pathExists(targetPath: string) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

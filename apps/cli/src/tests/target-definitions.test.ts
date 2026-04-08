import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import * as constants from "@skill-flow/integration/utils/constants";

const {
  getExplicitTargetNames,
  getTargetDetectionCandidates,
  getTargetScanRoots,
  resolveDocumentedProjectSkillPath,
  TARGET_COMPAT_READ_CANDIDATES,
  TARGET_DEFINITIONS,
  TARGET_DOCUMENTED_GLOBAL_PATHS,
  TARGET_DOCUMENTED_PROJECT_PATHS,
  TARGET_ICON_ASSET_NAMES,
  TARGET_PATH_CANDIDATES,
} = constants;

describe("target definitions", () => {
  test("includes config-based OpenCode skills directory in default detection paths", () => {
    expect(TARGET_PATH_CANDIDATES.opencode).toContain(
      path.join(os.homedir(), ".config", "opencode", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.codex).toContain(
      path.join(os.homedir(), ".codex", "skills"),
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
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".config", "agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.kiro).toContain(
      path.join(os.homedir(), ".kiro", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.trae).toContain(
      path.join(os.homedir(), ".trae", "skills"),
    );
  });

  test("classifies shared global roots as compatibility reads instead of write roots", () => {
    expect(TARGET_DEFINITIONS.codex.writerKey).toBe("agents-skills");
    expect(TARGET_COMPAT_READ_CANDIDATES.codex).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.codex).not.toContain(
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
    expect(TARGET_COMPAT_READ_CANDIDATES.cline).toContain(
      path.join(os.homedir(), ".cline", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".config", "amp", "skills"),
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
    expect(TARGET_PATH_CANDIDATES.cline).not.toContain(
      path.join(os.homedir(), ".cline", "skills"),
    );
  });

  test("exposes documented project/global paths as future-facing metadata", () => {
    expect(TARGET_DOCUMENTED_PROJECT_PATHS["claude-code"]).toBe(".claude/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.codex).toBe(".agents/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.openclaw).toBe("skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.pi).toBe(".pi/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.trae).toBe(".trae/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.windsurf).toBe(".windsurf/skills/");

    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["claude-code"]).toBe("~/.claude/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.codex).toBe("~/.codex/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["github-copilot"]).toBe("~/.copilot/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["roo-code"]).toBe("~/.roo/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.kiro).toBe("~/.kiro/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.trae).toBe("~/.trae/skills/");
  });

  test("resolves documented project skill paths from project roots", () => {
    expect(resolveDocumentedProjectSkillPath("codex", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.agents/skills",
    );
    expect(resolveDocumentedProjectSkillPath("claude-code", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.claude/skills",
    );
    expect(resolveDocumentedProjectSkillPath("trae", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.trae/skills",
    );
    expect(resolveDocumentedProjectSkillPath("codex", "   ")).toBeNull();
  });

  test("keeps icon metadata and documented slug aliases explicit", () => {
    expect(TARGET_ICON_ASSET_NAMES["claude-code"]).toBe("claude-code.svg");
    expect(TARGET_ICON_ASSET_NAMES["github-copilot"]).toBe("copilot.svg");
    expect(TARGET_ICON_ASSET_NAMES.openclaw).toBe("clawdbot.svg");
    expect(TARGET_ICON_ASSET_NAMES.trae).toBe("trae.svg");
    expect(TARGET_ICON_ASSET_NAMES.pi).toBeUndefined();
    expect(TARGET_DEFINITIONS["roo-code"].documentedAgentIds).toEqual(["roo"]);
    expect(TARGET_DEFINITIONS.kiro.documentedAgentIds).toEqual(["kiro-cli"]);
  });

  test("explicit target mode only exposes overridden targets", () => {
    const previousClaude = process.env.SKILL_FLOW_TARGET_CLAUDE_CODE;
    const previousCodex = process.env.SKILL_FLOW_TARGET_CODEX;

    process.env.SKILL_FLOW_TARGET_CLAUDE_CODE = "/tmp/claude-skills";
    delete process.env.SKILL_FLOW_TARGET_CODEX;

    expect(getExplicitTargetNames()).toEqual(["claude-code"]);
    expect(getTargetDetectionCandidates("claude-code")).toEqual(["/tmp/claude-skills"]);
    expect(getTargetDetectionCandidates("codex")).toEqual([]);
    expect(getTargetScanRoots("claude-code")).toEqual(["/tmp/claude-skills"]);
    expect(getTargetScanRoots("codex")).toEqual([]);

    if (previousClaude === undefined) {
      delete process.env.SKILL_FLOW_TARGET_CLAUDE_CODE;
    } else {
      process.env.SKILL_FLOW_TARGET_CLAUDE_CODE = previousClaude;
    }
    if (previousCodex === undefined) {
      delete process.env.SKILL_FLOW_TARGET_CODEX;
    } else {
      process.env.SKILL_FLOW_TARGET_CODEX = previousCodex;
    }
  });
});

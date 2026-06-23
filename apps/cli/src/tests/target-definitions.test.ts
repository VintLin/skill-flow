import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { CustomTargetDefinition } from "@skill-flow/domain/types";
import * as constants from "@skill-flow/integration/utils/constants";

const {
  getMergedTargetDefinitions,
  getMergedTargetDefinitionById,
  getExplicitTargetNames,
  getTargetDetectionCandidates,
  getTargetWriteRootCandidates,
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
      path.join(os.homedir(), ".cline", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".config", "agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.kiro).toContain(
      path.join(os.homedir(), ".kiro", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.zcode).toContain(
      path.join(os.homedir(), ".zcode", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["hermes-agent"]).toContain(
      path.join(os.homedir(), ".hermes", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["minimax-code"]).toContain(
      path.join(os.homedir(), ".minimax", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["kimi-code"]).toContain(
      path.join(os.homedir(), ".kimi-code", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.workbuddy).toContain(
      path.join(os.homedir(), ".workbuddy", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.codebuddy).toContain(
      path.join(os.homedir(), ".codebuddy", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.trae).toContain(
      path.join(os.homedir(), ".trae", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["trae-cn"]).toContain(
      path.join(os.homedir(), ".trae-cn", "skills"),
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
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".config", "amp", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.amp).toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.opencode).toContain(
      path.join(os.homedir(), ".opencode", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.opencode).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES["kimi-code"]).toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["kimi-code"]).not.toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_COMPAT_READ_CANDIDATES.zcode).not.toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["gemini-cli"]).not.toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES["github-copilot"]).not.toContain(
      path.join(os.homedir(), ".claude", "skills"),
    );
    expect(TARGET_PATH_CANDIDATES.cline).not.toContain(
      path.join(os.homedir(), ".agents", "skills"),
    );
  });

  test("detects Trae CN from the app root while writing to the managed skills root", () => {
    expect(getTargetDetectionCandidates("trae-cn")).toContain(
      path.join(os.homedir(), ".trae-cn"),
    );
    expect(getTargetDetectionCandidates("trae-cn")).toContain(
      path.join(os.homedir(), ".trae-cn", "skills"),
    );
    expect(getTargetWriteRootCandidates("trae-cn")).toEqual([
      path.join(os.homedir(), ".trae-cn", "skills"),
    ]);
    expect(TARGET_PATH_CANDIDATES["trae-cn"]).toEqual([
      path.join(os.homedir(), ".trae-cn", "skills"),
    ]);
  });

  test("exposes documented project/global paths as future-facing metadata", () => {
    expect(TARGET_DOCUMENTED_PROJECT_PATHS["claude-code"]).toBe(".claude/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.codex).toBe(".agents/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.opencode).toBe(".opencode/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.openclaw).toBe("skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS["hermes-agent"]).toBe(".hermes/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS["minimax-code"]).toBe(".mavis/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS["kimi-code"]).toBe(".kimi-code/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.workbuddy).toBe(".workbuddy/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.codebuddy).toBe(".codebuddy/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.pi).toBe(".pi/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.trae).toBe(".trae/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS["trae-cn"]).toBe(".trae/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.windsurf).toBe(".windsurf/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.cline).toBe(".cline/skills/");

    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["claude-code"]).toBe("~/.claude/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.codex).toBe("~/.codex/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.opencode).toBe("~/.config/opencode/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["github-copilot"]).toBe("~/.copilot/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["roo-code"]).toBe("~/.roo/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["hermes-agent"]).toBe("~/.hermes/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["minimax-code"]).toBe("~/.minimax/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["kimi-code"]).toBe("~/.kimi-code/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.workbuddy).toBe("~/.workbuddy/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.codebuddy).toBe("~/.codebuddy/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.kiro).toBe("~/.kiro/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.trae).toBe("~/.trae/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS["trae-cn"]).toBe("~/.trae-cn/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.cline).toBe("~/.cline/skills/");
    expect(TARGET_DOCUMENTED_PROJECT_PATHS.zcode).toBe(".zcode/skills/");
    expect(TARGET_DOCUMENTED_GLOBAL_PATHS.zcode).toBe("~/.zcode/skills/");
  });

  test("resolves documented project skill paths from project roots", () => {
    expect(resolveDocumentedProjectSkillPath("codex", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.agents/skills",
    );
    expect(resolveDocumentedProjectSkillPath("claude-code", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.claude/skills",
    );
    expect(resolveDocumentedProjectSkillPath("opencode", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.opencode/skills",
    );
    expect(resolveDocumentedProjectSkillPath("trae", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.trae/skills",
    );
    expect(resolveDocumentedProjectSkillPath("trae-cn", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.trae/skills",
    );
    expect(resolveDocumentedProjectSkillPath("hermes-agent", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.hermes/skills",
    );
    expect(resolveDocumentedProjectSkillPath("minimax-code", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.mavis/skills",
    );
    expect(resolveDocumentedProjectSkillPath("kimi-code", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.kimi-code/skills",
    );
    expect(resolveDocumentedProjectSkillPath("workbuddy", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.workbuddy/skills",
    );
    expect(resolveDocumentedProjectSkillPath("codebuddy", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.codebuddy/skills",
    );
    expect(resolveDocumentedProjectSkillPath("cline", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.cline/skills",
    );
    expect(resolveDocumentedProjectSkillPath("zcode", "/Users/test/src/repo-a")).toBe(
      "/Users/test/src/repo-a/.zcode/skills",
    );
    expect(resolveDocumentedProjectSkillPath("codex", "   ")).toBeNull();
  });

  test("keeps icon metadata and documented slug aliases explicit", () => {
    expect(TARGET_ICON_ASSET_NAMES["claude-code"]).toBe("claude-code.svg");
    expect(TARGET_ICON_ASSET_NAMES["github-copilot"]).toBe("copilot.svg");
    expect(TARGET_ICON_ASSET_NAMES.openclaw).toBe("clawdbot.svg");
    expect(TARGET_ICON_ASSET_NAMES["hermes-agent"]).toBe("hermesagent.svg");
    expect(TARGET_ICON_ASSET_NAMES["minimax-code"]).toBe("minimax.svg");
    expect(TARGET_ICON_ASSET_NAMES["kimi-code"]).toBe("kimi.svg");
    expect(TARGET_ICON_ASSET_NAMES.workbuddy).toBe("codebuddy.svg");
    expect(TARGET_ICON_ASSET_NAMES.codebuddy).toBe("codebuddy.svg");
    expect(TARGET_ICON_ASSET_NAMES.trae).toBe("trae.svg");
    expect(TARGET_ICON_ASSET_NAMES["trae-cn"]).toBe("trae.svg");
    expect(TARGET_ICON_ASSET_NAMES.zcode).toBe("zcode.svg");
    expect(TARGET_ICON_ASSET_NAMES.pi).toBeUndefined();
    expect(TARGET_DEFINITIONS["roo-code"].documentedAgentIds).toEqual(["roo"]);
    expect(TARGET_DEFINITIONS["hermes-agent"].documentedAgentIds).toEqual(["hermes"]);
    expect(TARGET_DEFINITIONS["minimax-code"].documentedAgentIds).toEqual(["minimax"]);
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

  test("merges built-in and custom targets into one ordered catalog", () => {
    const customTargets: CustomTargetDefinition[] = [
      {
        id: "my-agent",
        name: "My Agent",
        globalPath: "/Users/test/.my-agent/skills",
        projectPathTemplate: ".my-agent/skills",
        strategy: "copy",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T00:00:00.000Z",
      },
      {
        id: "team-agent",
        name: "Team Agent",
        globalPath: "/Users/test/.team-agent/skills",
        projectPathTemplate: ".team-agent/skills",
        strategy: "symlink",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T00:00:00.000Z",
      },
    ];

    const merged = getMergedTargetDefinitions(customTargets, [
      "codex",
      "my-agent",
      "claude-code",
      "team-agent",
    ]);

    expect(merged.slice(0, 4).map((target) => target.id)).toEqual([
      "codex",
      "my-agent",
      "claude-code",
      "team-agent",
    ]);
    expect(merged.find((target) => target.id === "codex")).toMatchObject({
      label: "Codex",
      kind: "builtin",
      isMutable: false,
      globalPath: "~/.codex/skills/",
      projectPathTemplate: ".agents/skills/",
    });
    expect(merged.find((target) => target.id === "my-agent")).toMatchObject({
      label: "My Agent",
      kind: "custom",
      isMutable: true,
      globalPath: "/Users/test/.my-agent/skills",
      projectPathTemplate: ".my-agent/skills",
    });
  });

  test("looks up merged target definitions by id", () => {
    const customTarget: CustomTargetDefinition = {
      id: "my-agent",
      name: "My Agent",
      globalPath: "/Users/test/.my-agent/skills",
      projectPathTemplate: ".my-agent/skills",
      strategy: "copy",
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
    };

    expect(getMergedTargetDefinitionById("claude-code", [customTarget])).toMatchObject({
      id: "claude-code",
      label: "Claude Code",
      kind: "builtin",
      isMutable: false,
    });
    expect(getMergedTargetDefinitionById("my-agent", [customTarget])).toMatchObject({
      id: "my-agent",
      label: "My Agent",
      kind: "custom",
      isMutable: true,
    });
    expect(getMergedTargetDefinitionById("missing", [customTarget])).toBeUndefined();
  });
});

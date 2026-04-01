import os from "node:os";
import path from "node:path";
import type {
  DeploymentStrategy,
  DeploymentTargetName,
} from "@skill-flow/domain/types";

export const SCHEMA_VERSION = 1 as const;

export function getStateRoot(): string {
  return process.env.SKILL_FLOW_STATE_ROOT
    ? path.resolve(process.env.SKILL_FLOW_STATE_ROOT)
    : path.join(os.homedir(), ".skillflow");
}

export type TargetDefinition = {
  label: string;
  strategy: DeploymentStrategy;
  envVar: string;
  writerKey: string;
  writeRootCandidates: string[];
  compatReadRootCandidates: string[];
  // Reserved for future project-scope installs. Current runtime still writes via writeRootCandidates.
  documentedProjectPath?: string;
  // Mirrors the external README contract and may differ from today's runtime write root.
  documentedGlobalPath: string;
  iconAssetName?: string;
  documentedAgentIds?: string[];
};

export const TARGET_ORDER: DeploymentTargetName[] = [
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
];

export const TARGET_DEFINITIONS: Record<DeploymentTargetName, TargetDefinition> = {
  "claude-code": {
    label: "Claude Code",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_CLAUDE_CODE",
    writerKey: "claude-home",
    writeRootCandidates: [path.join(os.homedir(), ".claude", "skills")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".claude/skills/",
    documentedGlobalPath: "~/.claude/skills/",
    iconAssetName: "claude-code.svg",
  },
  codex: {
    label: "Codex",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_CODEX",
    writerKey: "agents-skills",
    writeRootCandidates: [
      path.join(os.homedir(), ".codex", "skills"),
    ],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".agents", "skills"),
      path.join(os.homedir(), ".codex", ".agents", "skills"),
      path.join("/etc", "codex", "skills"),
    ],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.codex/skills/",
    iconAssetName: "codex.svg",
  },
  cursor: {
    label: "Cursor",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_CURSOR",
    writerKey: "cursor-home",
    writeRootCandidates: [path.join(os.homedir(), ".cursor", "skills")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".agents", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".codex", "skills"),
    ],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.cursor/skills/",
    iconAssetName: "cursor.svg",
  },
  "github-copilot": {
    label: "GitHub Copilot",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_GITHUB_COPILOT",
    writerKey: "copilot-home",
    writeRootCandidates: [path.join(os.homedir(), ".copilot", "skills")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".agents", "skills"),
    ],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.copilot/skills/",
    iconAssetName: "copilot.svg",
  },
  "gemini-cli": {
    label: "Gemini CLI",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_GEMINI_CLI",
    writerKey: "gemini-home",
    writeRootCandidates: [path.join(os.homedir(), ".gemini", "skills")],
    compatReadRootCandidates: [path.join(os.homedir(), ".agents", "skills")],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.gemini/skills/",
    iconAssetName: "gemini.svg",
  },
  opencode: {
    label: "OpenCode",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_OPENCODE",
    writerKey: "opencode-home",
    writeRootCandidates: [
      path.join(os.homedir(), ".config", "opencode", "skills"),
    ],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".opencode", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".agents", "skills"),
    ],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.config/opencode/skills/",
    iconAssetName: "opencode.svg",
  },
  openclaw: {
    label: "OpenClaw",
    strategy: "copy",
    envVar: "SKILL_FLOW_TARGET_OPENCLAW",
    writerKey: "openclaw-home",
    writeRootCandidates: [path.join(os.homedir(), ".openclaw", "skills")],
    compatReadRootCandidates: [],
    documentedProjectPath: "skills/",
    documentedGlobalPath: "~/.openclaw/skills/",
    iconAssetName: "clawdbot.svg",
  },
  pi: {
    label: "Pi",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_PI",
    writerKey: "pi-home",
    writeRootCandidates: [path.join(os.homedir(), ".pi", "agent", "skills")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".agents", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".codex", "skills"),
    ],
    documentedProjectPath: ".pi/skills/",
    documentedGlobalPath: "~/.pi/agent/skills/",
  },
  windsurf: {
    label: "Windsurf",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_WINDSURF",
    writerKey: "windsurf-home",
    writeRootCandidates: [path.join(os.homedir(), ".codeium", "windsurf", "skills")],
    compatReadRootCandidates: [
      path.join("/Library", "Application Support", "Windsurf", "skills"),
    ],
    documentedProjectPath: ".windsurf/skills/",
    documentedGlobalPath: "~/.codeium/windsurf/skills/",
    iconAssetName: "windsurf.svg",
  },
  "roo-code": {
    label: "Roo Code",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_ROO_CODE",
    writerKey: "roo-home",
    writeRootCandidates: [path.join(os.homedir(), ".roo", "skills")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".roo/skills/",
    documentedGlobalPath: "~/.roo/skills/",
    iconAssetName: "roo.svg",
    documentedAgentIds: ["roo"],
  },
  cline: {
    label: "Cline",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_CLINE",
    writerKey: "cline-home",
    writeRootCandidates: [path.join(os.homedir(), ".agents", "skills")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".cline", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
    ],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.agents/skills/",
    iconAssetName: "cline.svg",
  },
  amp: {
    label: "Amp",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_AMP",
    writerKey: "amp-home",
    writeRootCandidates: [
      path.join(os.homedir(), ".config", "agents", "skills"),
    ],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".config", "amp", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
    ],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.config/agents/skills/",
    iconAssetName: "amp.svg",
  },
  kiro: {
    label: "Kiro",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_KIRO",
    writerKey: "kiro-home",
    writeRootCandidates: [path.join(os.homedir(), ".kiro", "skills")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".kiro/skills/",
    documentedGlobalPath: "~/.kiro/skills/",
    iconAssetName: "kiro-cli.svg",
    documentedAgentIds: ["kiro-cli"],
  },
};

export const TARGET_LABELS: Record<DeploymentTargetName, string> = Object.fromEntries(
  TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].label]),
) as Record<DeploymentTargetName, string>;

export const TARGET_STRATEGIES: Record<DeploymentTargetName, DeploymentStrategy> =
  Object.fromEntries(
    TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].strategy]),
  ) as Record<DeploymentTargetName, DeploymentStrategy>;

export const TARGET_ENV_VARS: Record<DeploymentTargetName, string> = Object.fromEntries(
  TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].envVar]),
) as Record<DeploymentTargetName, string>;

export const TARGET_WRITER_KEYS: Record<DeploymentTargetName, string> = Object.fromEntries(
  TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].writerKey]),
) as Record<DeploymentTargetName, string>;

export const TARGET_PATH_CANDIDATES: Record<DeploymentTargetName, string[]> =
  Object.fromEntries(
    TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].writeRootCandidates]),
  ) as Record<DeploymentTargetName, string[]>;

export const TARGET_COMPAT_READ_CANDIDATES: Record<DeploymentTargetName, string[]> =
  Object.fromEntries(
    TARGET_ORDER.map((target) => [
      target,
      TARGET_DEFINITIONS[target].compatReadRootCandidates,
    ]),
  ) as Record<DeploymentTargetName, string[]>;

export const TARGET_DOCUMENTED_PROJECT_PATHS: Record<DeploymentTargetName, string | undefined> =
  Object.fromEntries(
    TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].documentedProjectPath]),
  ) as Record<DeploymentTargetName, string | undefined>;

export const TARGET_DOCUMENTED_GLOBAL_PATHS: Record<DeploymentTargetName, string> =
  Object.fromEntries(
    TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].documentedGlobalPath]),
  ) as Record<DeploymentTargetName, string>;

export function resolveDocumentedProjectSkillPath(
  target: DeploymentTargetName,
  projectPath: string,
): string | null {
  const normalizedProjectPath = projectPath.trim();
  if (normalizedProjectPath.length === 0) {
    return null;
  }

  const documentedProjectPath = TARGET_DEFINITIONS[target].documentedProjectPath?.trim();
  if (!documentedProjectPath) {
    return null;
  }

  const resolvedPath = path.join(normalizedProjectPath, documentedProjectPath);
  return resolvedPath.endsWith(path.sep) ? resolvedPath.slice(0, -path.sep.length) : resolvedPath;
}

export const TARGET_ICON_ASSET_NAMES: Record<DeploymentTargetName, string | undefined> =
  Object.fromEntries(
    TARGET_ORDER.map((target) => [target, TARGET_DEFINITIONS[target].iconAssetName]),
  ) as Record<DeploymentTargetName, string | undefined>;

export function getExplicitTargetNames(): DeploymentTargetName[] {
  return TARGET_ORDER.filter((target) => {
    const value = process.env[TARGET_DEFINITIONS[target].envVar]?.trim();
    return Boolean(value);
  });
}

export function isExplicitTargetMode(): boolean {
  return getExplicitTargetNames().length > 0;
}

export function getTargetDetectionCandidates(target: DeploymentTargetName): string[] {
  const definition = TARGET_DEFINITIONS[target];
  const override = process.env[definition.envVar]?.trim();

  if (isExplicitTargetMode()) {
    return override ? [override] : [];
  }

  return override ? [override] : definition.writeRootCandidates;
}

export function getTargetScanRoots(target: DeploymentTargetName): string[] {
  const definition = TARGET_DEFINITIONS[target];
  const override = process.env[definition.envVar]?.trim();

  if (isExplicitTargetMode()) {
    return override ? [override] : [];
  }

  return [
    ...new Set([
      ...(override ? [override] : []),
      ...definition.writeRootCandidates,
      ...definition.compatReadRootCandidates,
    ]),
  ];
}

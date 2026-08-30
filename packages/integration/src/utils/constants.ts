import os from "node:os";
import path from "node:path";
import type {
  CustomTargetDefinition,
  DeploymentStrategy,
  DeploymentTargetName,
  MergedTargetDefinition,
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
  detectionRootCandidates?: string[];
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
  "zcode",
  "cursor",
  "grok-build",
  "pi",
  "workbuddy",
  "codebuddy",
  "trae",
  "trae-cn",
  "kimi-code",
  "opencode",
  "minimax-code",
  "hermes-agent",
  "openclaw",
  "github-copilot",
  "gemini-cli",
  "windsurf",
  "amp",
  "kiro",
  "roo-code",
  "cline",
  "deepseek-harness",
  "antigravity",
  "junie",
  "mistral-vibe",
  "openhands",
  "qoder",
  "qwen-code",
  "zencoder",
  "kilo-code",
  "goose",
];

export const TARGET_DEFINITIONS: Record<DeploymentTargetName, TargetDefinition> = {
  "claude-code": {
    label: "Claude Code",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_CLAUDE_CODE",
    writerKey: "claude-home",
    writeRootCandidates: [path.join(os.homedir(), ".claude", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".claude")],
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
    detectionRootCandidates: [path.join(os.homedir(), ".codex")],
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
    detectionRootCandidates: [path.join(os.homedir(), ".cursor")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".agents", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".codex", "skills"),
    ],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.cursor/skills/",
    iconAssetName: "cursor.svg",
  },
  "grok-build": {
    label: "Grok Build",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_GROK_BUILD",
    writerKey: "grok-home",
    writeRootCandidates: [path.join(os.homedir(), ".grok", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".grok")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".grok/skills/",
    documentedGlobalPath: "~/.grok/skills/",
    iconAssetName: "grok-build.svg",
    documentedAgentIds: ["grok"],
  },
  "github-copilot": {
    label: "GitHub Copilot",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_GITHUB_COPILOT",
    writerKey: "copilot-home",
    writeRootCandidates: [path.join(os.homedir(), ".copilot", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".copilot")],
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
    detectionRootCandidates: [path.join(os.homedir(), ".gemini")],
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
    detectionRootCandidates: [path.join(os.homedir(), ".config", "opencode")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".opencode", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".agents", "skills"),
    ],
    documentedProjectPath: ".opencode/skills/",
    documentedGlobalPath: "~/.config/opencode/skills/",
    iconAssetName: "opencode.svg",
  },
  openclaw: {
    label: "OpenClaw",
    strategy: "copy",
    envVar: "SKILL_FLOW_TARGET_OPENCLAW",
    writerKey: "openclaw-home",
    writeRootCandidates: [path.join(os.homedir(), ".openclaw", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".openclaw")],
    compatReadRootCandidates: [],
    documentedProjectPath: "skills/",
    documentedGlobalPath: "~/.openclaw/skills/",
    iconAssetName: "openclaw.svg",
  },
  "hermes-agent": {
    label: "Hermes Agent",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_HERMES_AGENT",
    writerKey: "hermes-home",
    writeRootCandidates: [path.join(os.homedir(), ".hermes", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".hermes")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".hermes/skills/",
    documentedGlobalPath: "~/.hermes/skills/",
    iconAssetName: "hermesagent.svg",
    documentedAgentIds: ["hermes"],
  },
  "minimax-code": {
    label: "MiniMax Code",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_MINIMAX_CODE",
    writerKey: "minimax-home",
    writeRootCandidates: [path.join(os.homedir(), ".minimax", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".minimax")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".mavis/skills/",
    documentedGlobalPath: "~/.minimax/skills/",
    iconAssetName: "minimax.svg",
    documentedAgentIds: ["minimax"],
  },
  "kimi-code": {
    label: "Kimi Code",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_KIMI_CODE",
    writerKey: "kimi-home",
    writeRootCandidates: [path.join(os.homedir(), ".kimi-code", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".kimi-code")],
    compatReadRootCandidates: [path.join(os.homedir(), ".agents", "skills")],
    documentedProjectPath: ".kimi-code/skills/",
    documentedGlobalPath: "~/.kimi-code/skills/",
    iconAssetName: "kimi.svg",
  },
  workbuddy: {
    label: "WorkBuddy",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_WORKBUDDY",
    writerKey: "workbuddy-home",
    writeRootCandidates: [path.join(os.homedir(), ".workbuddy", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".workbuddy")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".workbuddy/skills/",
    documentedGlobalPath: "~/.workbuddy/skills/",
    iconAssetName: "codebuddy.svg",
  },
  codebuddy: {
    label: "CodeBuddy",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_CODEBUDDY",
    writerKey: "codebuddy-home",
    writeRootCandidates: [path.join(os.homedir(), ".codebuddy", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".codebuddy")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".codebuddy/skills/",
    documentedGlobalPath: "~/.codebuddy/skills/",
    iconAssetName: "codebuddy.svg",
  },
  pi: {
    label: "Pi",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_PI",
    writerKey: "pi-home",
    writeRootCandidates: [path.join(os.homedir(), ".pi", "agent", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".pi", "agent")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".agents", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
      path.join(os.homedir(), ".codex", "skills"),
    ],
    documentedProjectPath: ".pi/skills/",
    documentedGlobalPath: "~/.pi/agent/skills/",
    iconAssetName: "pi.svg",
  },
  trae: {
    label: "Trae",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_TRAE",
    writerKey: "trae-home",
    writeRootCandidates: [path.join(os.homedir(), ".trae", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".trae")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".trae/skills/",
    documentedGlobalPath: "~/.trae/skills/",
    iconAssetName: "trae.svg",
  },
  "trae-cn": {
    label: "Trae CN",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_TRAE_CN",
    writerKey: "trae-cn-home",
    writeRootCandidates: [path.join(os.homedir(), ".trae-cn", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".trae-cn")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".trae/skills/",
    documentedGlobalPath: "~/.trae-cn/skills/",
    iconAssetName: "trae.svg",
  },
  windsurf: {
    label: "Windsurf",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_WINDSURF",
    writerKey: "windsurf-home",
    writeRootCandidates: [path.join(os.homedir(), ".codeium", "windsurf", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".codeium", "windsurf")],
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
    detectionRootCandidates: [path.join(os.homedir(), ".roo")],
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
    writeRootCandidates: [path.join(os.homedir(), ".cline", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".cline")],
    compatReadRootCandidates: [
      path.join(os.homedir(), ".claude", "skills"),
    ],
    documentedProjectPath: ".cline/skills/",
    documentedGlobalPath: "~/.cline/skills/",
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
    detectionRootCandidates: [path.join(os.homedir(), ".config", "agents")],
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
    detectionRootCandidates: [path.join(os.homedir(), ".kiro")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".kiro/skills/",
    documentedGlobalPath: "~/.kiro/skills/",
    iconAssetName: "kiro-cli.svg",
    documentedAgentIds: ["kiro-cli"],
  },
  zcode: {
    label: "ZCode",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_ZCODE",
    writerKey: "zcode-home",
    writeRootCandidates: [path.join(os.homedir(), ".zcode", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".zcode")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".zcode/skills/",
    documentedGlobalPath: "~/.zcode/skills/",
    iconAssetName: "zcode.svg",
  },
  "deepseek-harness": {
    label: "DeepSeek Harness",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_DEEPSEEK_HARNESS",
    writerKey: "deepseek-harness-home",
    writeRootCandidates: [path.join(os.homedir(), ".dsh", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".dsh")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".dsh/skills/",
    documentedGlobalPath: "~/.dsh/skills/",
    iconAssetName: "deepseek.svg",
  },
  antigravity: {
    label: "Antigravity",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_ANTIGRAVITY",
    writerKey: "antigravity-home",
    writeRootCandidates: [path.join(os.homedir(), ".gemini", "config", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".gemini", "config")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".agents/skills/",
    documentedGlobalPath: "~/.gemini/config/skills/",
    iconAssetName: "antigravity.svg",
  },
  junie: {
    label: "Junie",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_JUNIE",
    writerKey: "junie-home",
    writeRootCandidates: [path.join(os.homedir(), ".junie", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".junie")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".junie/skills/",
    documentedGlobalPath: "~/.junie/skills/",
    iconAssetName: "junie.svg",
  },
  "mistral-vibe": {
    label: "Mistral Vibe",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_MISTRAL_VIBE",
    writerKey: "mistral-vibe-home",
    writeRootCandidates: [path.join(os.homedir(), ".vibe", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".vibe")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".vibe/skills/",
    documentedGlobalPath: "~/.vibe/skills/",
    iconAssetName: "mistral.svg",
  },
  openhands: {
    label: "OpenHands",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_OPENHANDS",
    writerKey: "openhands-home",
    writeRootCandidates: [path.join(os.homedir(), ".openhands", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".openhands")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".openhands/skills/",
    documentedGlobalPath: "~/.openhands/skills/",
    iconAssetName: "openhands.svg",
  },
  qoder: {
    label: "Qoder",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_QODER",
    writerKey: "qoder-home",
    writeRootCandidates: [path.join(os.homedir(), ".qoder", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".qoder")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".qoder/skills/",
    documentedGlobalPath: "~/.qoder/skills/",
    iconAssetName: "qoder.svg",
  },
  "qwen-code": {
    label: "Qwen Code",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_QWEN_CODE",
    writerKey: "qwen-code-home",
    writeRootCandidates: [path.join(os.homedir(), ".qwen", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".qwen")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".qwen/skills/",
    documentedGlobalPath: "~/.qwen/skills/",
    iconAssetName: "qwen.svg",
  },
  zencoder: {
    label: "Zencoder",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_ZENCODER",
    writerKey: "zencoder-home",
    writeRootCandidates: [path.join(os.homedir(), ".zencoder", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".zencoder")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".zencoder/skills/",
    documentedGlobalPath: "~/.zencoder/skills/",
    iconAssetName: "zencoder.svg",
  },
  "kilo-code": {
    label: "Kilo Code",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_KILO_CODE",
    writerKey: "kilo-code-home",
    writeRootCandidates: [path.join(os.homedir(), ".kilocode", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".kilocode")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".kilocode/skills/",
    documentedGlobalPath: "~/.kilocode/skills/",
    iconAssetName: "kilocode.svg",
  },
  goose: {
    label: "Goose",
    strategy: "symlink",
    envVar: "SKILL_FLOW_TARGET_GOOSE",
    writerKey: "goose-home",
    writeRootCandidates: [path.join(os.homedir(), ".config", "goose", "skills")],
    detectionRootCandidates: [path.join(os.homedir(), ".config", "goose")],
    compatReadRootCandidates: [],
    documentedProjectPath: ".goose/skills/",
    documentedGlobalPath: "~/.config/goose/skills/",
    iconAssetName: "goose.svg",
  },
};

export function getBuiltInTargetDefinitions(): MergedTargetDefinition[] {
  return TARGET_ORDER.map((target) => {
    const definition = TARGET_DEFINITIONS[target];
    const mergedDefinition: MergedTargetDefinition = {
      id: target,
      label: definition.label,
      strategy: definition.strategy,
      kind: "builtin",
      isMutable: false,
      globalPath: definition.documentedGlobalPath,
    };

    if (definition.documentedProjectPath) {
      mergedDefinition.projectPathTemplate = definition.documentedProjectPath;
    }

    if (definition.iconAssetName) {
      mergedDefinition.iconAssetName = definition.iconAssetName;
    }

    return mergedDefinition;
  });
}

export function getMergedTargetDefinitions(
  customTargets: CustomTargetDefinition[] = [],
  agentDisplayOrder?: string[],
): MergedTargetDefinition[] {
  const builtIns = getBuiltInTargetDefinitions();
  const merged = [
    ...builtIns,
    ...customTargets.map<MergedTargetDefinition>((target) => {
      const mergedDefinition: MergedTargetDefinition = {
        id: target.id,
        label: target.name ?? target.id,
        strategy: target.strategy,
        kind: "custom",
        isMutable: true,
        globalPath: target.globalPath,
      };

      if (target.projectPathTemplate.length > 0) {
        mergedDefinition.projectPathTemplate = target.projectPathTemplate;
      }

      return mergedDefinition;
    }),
  ];

  const indexById = new Map<string, MergedTargetDefinition>(
    merged.map((definition) => [definition.id, definition]),
  );

  if (!agentDisplayOrder || agentDisplayOrder.length === 0) {
    return merged;
  }

  const ordered: MergedTargetDefinition[] = [];
  const seen = new Set<string>();

  for (const targetId of agentDisplayOrder) {
    const definition = indexById.get(targetId);
    if (!definition || seen.has(targetId)) {
      continue;
    }
    seen.add(targetId);
    ordered.push(definition);
  }

  for (const definition of merged) {
    if (!seen.has(definition.id)) {
      seen.add(definition.id);
      ordered.push(definition);
    }
  }

  return ordered;
}

export function getMergedTargetDefinitionById(
  targetId: string,
  customTargets: CustomTargetDefinition[] = [],
): MergedTargetDefinition | undefined {
  return getMergedTargetDefinitions(customTargets).find((target) => target.id === targetId);
}

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

  return override
    ? [override]
    : [
      ...new Set([
        ...definition.writeRootCandidates,
        ...(definition.detectionRootCandidates ?? []),
      ]),
    ];
}

export function getTargetWriteRootCandidates(target: DeploymentTargetName): string[] {
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

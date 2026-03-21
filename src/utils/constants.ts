import os from "node:os";
import path from "node:path";
import type {
  DeploymentStrategy,
  DeploymentTargetName,
} from "../domain/types.js";

export const SCHEMA_VERSION = 1 as const;

export function getStateRoot(): string {
  return process.env.SKILL_MANAGER_STATE_ROOT
    ? path.resolve(process.env.SKILL_MANAGER_STATE_ROOT)
    : path.join(os.homedir(), ".skillmanager");
}

export const TARGET_ORDER: DeploymentTargetName[] = [
  "claude-code",
  "codex",
  "cursor",
  "opencode",
  "openclaw",
  "pi",
];

export const TARGET_LABELS: Record<DeploymentTargetName, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  pi: "Pi",
};

export const TARGET_STRATEGIES: Record<DeploymentTargetName, DeploymentStrategy> =
  {
    "claude-code": "symlink",
    codex: "symlink",
    cursor: "symlink",
    opencode: "symlink",
    openclaw: "copy",
    pi: "symlink",
  };

export const TARGET_ENV_VARS: Record<DeploymentTargetName, string> = {
  "claude-code": "SKILL_MANAGER_TARGET_CLAUDE_CODE",
  codex: "SKILL_MANAGER_TARGET_CODEX",
  cursor: "SKILL_MANAGER_TARGET_CURSOR",
  opencode: "SKILL_MANAGER_TARGET_OPENCODE",
  openclaw: "SKILL_MANAGER_TARGET_OPENCLAW",
  pi: "SKILL_MANAGER_TARGET_PI",
};

export const TARGET_PATH_CANDIDATES: Record<DeploymentTargetName, string[]> = {
  "claude-code": [path.join(os.homedir(), ".claude", "skills")],
  codex: [
    path.join(os.homedir(), ".codex", ".agents", "skills"),
    path.join(os.homedir(), ".agents", "skills"),
  ],
  cursor: [path.join(os.homedir(), ".cursor", "skills")],
  opencode: [
    path.join(os.homedir(), ".config", "opencode", "skills"),
    path.join(os.homedir(), ".opencode", "skills"),
  ],
  openclaw: [path.join(os.homedir(), ".openclaw", "skills")],
  pi: [path.join(os.homedir(), ".pi", "agent", "skills")],
};

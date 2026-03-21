import path from "node:path";
import type {
  ChannelDetection,
  DeploymentStrategy,
  DeploymentTargetName,
  LeafRecord,
} from "../domain/types.js";
import {
  TARGET_ENV_VARS,
  TARGET_PATH_CANDIDATES,
  TARGET_STRATEGIES,
} from "../utils/constants.js";
import { pathExists } from "../utils/fs.js";

export interface ChannelAdapter {
  readonly target: DeploymentTargetName;
  readonly strategy: DeploymentStrategy;
  detect(): Promise<ChannelDetection>;
  resolveTargetPath(rootPath: string, leaf: LeafRecord): string;
}

class DefaultChannelAdapter implements ChannelAdapter {
  readonly strategy: DeploymentStrategy;

  constructor(readonly target: DeploymentTargetName) {
    this.strategy = TARGET_STRATEGIES[target];
  }

  async detect(): Promise<ChannelDetection> {
    const envVar = TARGET_ENV_VARS[this.target];
    const override = process.env[envVar];
    const candidates = override ? [override] : TARGET_PATH_CANDIDATES[this.target];

    for (const candidate of candidates) {
      const rootPath = path.resolve(candidate);
      if (await pathExists(rootPath)) {
        return {
          target: this.target,
          strategy: this.strategy,
          available: true,
          rootPath,
        };
      }
    }

    return {
      target: this.target,
      strategy: this.strategy,
      available: false,
      rootPath: path.resolve(candidates[0] ?? "."),
      reason: `Target directory not found. Set ${envVar} or create the agent directory first.`,
    };
  }

  resolveTargetPath(rootPath: string, leaf: LeafRecord): string {
    return path.join(rootPath, leaf.linkName);
  }
}

export function createChannelAdapters(): ChannelAdapter[] {
  return [
    new DefaultChannelAdapter("claude-code"),
    new DefaultChannelAdapter("codex"),
    new DefaultChannelAdapter("cursor"),
    new DefaultChannelAdapter("opencode"),
    new DefaultChannelAdapter("openclaw"),
    new DefaultChannelAdapter("pi"),
  ];
}

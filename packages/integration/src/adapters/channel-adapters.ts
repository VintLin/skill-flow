import path from "node:path";
import type {
  ChannelDetection,
  DeploymentStrategy,
  DeploymentTargetName,
  DeploymentTargetId,
  MergedTargetDefinition,
} from "@skill-flow/domain/types";
import {
  getTargetDetectionCandidates,
  getTargetWriteRootCandidates,
  getBuiltInTargetDefinitions,
} from "../utils/constants.js";
import { pathExists } from "../utils/fs.js";

export interface ChannelAdapter {
  readonly target: DeploymentTargetId;
  readonly strategy: DeploymentStrategy;
  detect(): Promise<ChannelDetection>;
  resolveTargetPath(rootPath: string, linkName: string): string;
}

class DefaultChannelAdapter implements ChannelAdapter {
  readonly strategy: DeploymentStrategy;
  private readonly definition: MergedTargetDefinition;

  constructor(definition: MergedTargetDefinition) {
    this.definition = definition;
    this.target = definition.id;
    this.strategy = definition.strategy;
  }

  readonly target: DeploymentTargetId;

  async detect(): Promise<ChannelDetection> {
    const candidates = this.definition.kind === "builtin"
      ? getTargetDetectionCandidates(this.definition.id as DeploymentTargetName)
      : [this.definition.globalPath];
    const writeRootCandidates = this.definition.kind === "builtin"
      ? getTargetWriteRootCandidates(this.definition.id as DeploymentTargetName)
      : [this.definition.globalPath];
    const envVar = this.definition.kind === "builtin"
      ? ` Set ${this.target} target env override to enable it.`
      : "";

    if (candidates.length === 0) {
      return {
        target: this.target,
        strategy: this.strategy,
        available: false,
        rootPath: path.resolve("."),
        reason: this.definition.kind === "builtin"
          ? "Target is disabled in explicit target mode."
          : "Custom target has no detection candidates.",
      };
    }

    for (const candidate of candidates) {
      const rootPath = path.resolve(candidate);
      if (await pathExists(rootPath)) {
        return {
          target: this.target,
          strategy: this.strategy,
          available: true,
          rootPath: path.resolve(writeRootCandidates[0] ?? rootPath),
        };
      }
    }

    return {
      target: this.target,
      strategy: this.strategy,
      available: false,
      rootPath: path.resolve(candidates[0] ?? "."),
      reason: this.definition.kind === "builtin"
        ? `Target directory not found.${envVar || " Create the agent directory first."}`
        : "Custom target directory not found. Create the configured global target directory first.",
    };
  }

  resolveTargetPath(rootPath: string, linkName: string): string {
    return path.join(rootPath, linkName);
  }
}

export function createChannelAdapters(
  targetDefinitions: MergedTargetDefinition[] = getBuiltInTargetDefinitions(),
): ChannelAdapter[] {
  return targetDefinitions.map((definition) => new DefaultChannelAdapter(definition));
}

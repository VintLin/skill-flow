import os from "node:os";
import path from "node:path";
import { readJsonFile } from "@skill-flow/integration/utils/fs";

export type AgentsLockFile = {
  skills?: Record<
    string,
    {
      source?: string;
      sourceType?: string;
      sourceUrl?: string;
      skillPath?: string;
      branch?: string;
      sourceBranch?: string;
    }
  >;
};

export type AgentsOrigin = {
  originLocator: string | undefined;
  originRequestedPath: string | undefined;
  originBranch: string | undefined;
};

export type AgentsOriginReader = {
  readAgentsLockOrigins(): Promise<Map<string, AgentsOrigin>>;
};

function resolveHomeDir(): string {
  return process.env.HOME ?? os.homedir();
}

export function agentsLockPath(homeDir: string = resolveHomeDir()): string {
  return path.join(homeDir, ".agents", ".skill-lock.json");
}

export function parseBranchFromSourceUrl(sourceUrl?: string): string | undefined {
  if (!sourceUrl) {
    return undefined;
  }
  const treeIndex = sourceUrl.indexOf("/tree/");
  if (treeIndex === -1) {
    return undefined;
  }
  const tail = sourceUrl.slice(treeIndex + "/tree/".length);
  return tail.split("/")[0] || undefined;
}

export function createAgentsOriginReader(
  lockPathFactory: () => string = () => agentsLockPath(),
): AgentsOriginReader {
  return {
    async readAgentsLockOrigins(): Promise<Map<string, AgentsOrigin>> {
      const lockFile = await readJsonFile<AgentsLockFile>(lockPathFactory(), {});
      const results = new Map<string, AgentsOrigin>();

      for (const [name, record] of Object.entries(lockFile.skills ?? {})) {
        if (!record || record.sourceType !== "github") {
          continue;
        }
        results.set(name, {
          originLocator: record.source ? `https://github.com/${record.source}.git` : undefined,
          originRequestedPath: record.skillPath,
          originBranch: record.branch ?? record.sourceBranch ?? parseBranchFromSourceUrl(record.sourceUrl),
        });
      }

      return results;
    },
  };
}

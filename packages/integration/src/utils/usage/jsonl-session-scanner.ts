import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { UsageCollectorObservation } from "@skill-flow/domain/types";
import type { UsageCollectorScanInput } from "../usage-collectors.js";

export type JsonlRecordParser<TState> = (args: {
  value: unknown;
  filePath: string;
  lineIndex: number;
  state: TState;
  fallbackTimestamp: string;
}) => {
  state: TState;
  observations: UsageCollectorObservation[];
};

export type JsonlSessionScanResult = {
  observations: UsageCollectorObservation[];
  filesScanned: number;
  bytesScanned: number;
  partial: boolean;
  invalidRecords: number;
};

export async function scanJsonlSessionRoots<TState>(args: {
  roots: string[];
  budget: UsageCollectorScanInput["budget"];
  scannedAt: string;
  createInitialState: () => TState;
  parseRecord: JsonlRecordParser<TState>;
  includeFile?: (filePath: string) => boolean;
}): Promise<JsonlSessionScanResult> {
  const startedAt = Date.now();
  const observations: UsageCollectorObservation[] = [];
  let filesScanned = 0;
  let bytesScanned = 0;
  let partial = false;
  let invalidRecords = 0;

  rootLoop:
  for (const root of args.roots) {
    const files = await collectJsonlFiles(root, args.budget.maxFiles, args.includeFile);
    for (const filePath of files) {
      if (filesScanned >= args.budget.maxFiles || bytesScanned >= args.budget.maxBytes) {
        partial = true;
        break rootLoop;
      }
      if (Date.now() - startedAt >= args.budget.perSourceBudgetMs) {
        partial = true;
        break rootLoop;
      }

      const stat = await fs.stat(filePath).catch(() => undefined);
      if (!stat?.isFile()) {
        invalidRecords += 1;
        continue;
      }
      if (filesScanned > 0 && bytesScanned + stat.size > args.budget.maxBytes) {
        partial = true;
        break rootLoop;
      }

      filesScanned += 1;
      bytesScanned += stat.size;
      if (bytesScanned > args.budget.maxBytes) {
        partial = true;
      }

      const fileFallbackTimestamp = stat.mtime.toISOString();
      let state = args.createInitialState();
      let lineIndex = 0;
      const input = createReadStream(filePath, { encoding: "utf8" });
      const reader = readline.createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const rawLine of reader) {
          const currentLineIndex = lineIndex;
          lineIndex += 1;
          if (Date.now() - startedAt >= args.budget.perSourceBudgetMs) {
            partial = true;
            reader.close();
            break;
          }
          const line = rawLine.trim();
          if (!line) {
            continue;
          }
          try {
            const value = JSON.parse(line) as unknown;
            const result = args.parseRecord({
              value,
              filePath,
              lineIndex: currentLineIndex,
              state,
              fallbackTimestamp: fileFallbackTimestamp,
            });
            state = result.state;
            observations.push(...result.observations);
          } catch {
            invalidRecords += 1;
          }
        }
      } catch {
        invalidRecords += 1;
      }
      if (partial) {
        break rootLoop;
      }
    }
  }

  return {
    observations,
    filesScanned,
    bytesScanned,
    partial,
    invalidRecords,
  };
}

async function collectJsonlFiles(
  root: string,
  maxFiles: number,
  includeFile: ((filePath: string) => boolean) | undefined,
): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    if (results.length >= maxFiles) {
      return;
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl") && (!includeFile || includeFile(entryPath))) {
        results.push(entryPath);
      }
    }
  }
  await walk(root);
  return results;
}

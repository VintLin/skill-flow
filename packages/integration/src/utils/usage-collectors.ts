import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  UsageAgent,
  UsageAgentCoverage,
  UsageCollectorObservation,
  UsageDiagnostic,
} from "@skill-flow/domain/types";
import { pathExists } from "./fs.js";

export type UsageCollectorScanInput = {
  now: Date;
  budget: {
    perSourceBudgetMs: number;
    maxFiles: number;
    maxBytes: number;
  };
};

export type UsageCollectorScanResult = {
  observations: UsageCollectorObservation[];
  coverage: UsageAgentCoverage;
  diagnostics: UsageDiagnostic[];
};

export type UsageCollector = {
  readonly agent: UsageAgent;
  readonly parserRevision: string;
  locateSources(): Promise<string[]>;
  scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult>;
};

export function createDefaultUsageCollectors(): UsageCollector[] {
  return [new ClaudeCodeUsageCollector()];
}

export class ClaudeCodeUsageCollector implements UsageCollector {
  readonly agent = "claude-code" as const;
  readonly parserRevision = "claude-code-session@1";

  constructor(private readonly roots = defaultClaudeCodeUsageRoots()) {}

  async locateSources(): Promise<string[]> {
    const existing: string[] = [];
    for (const root of this.roots) {
      if (await pathExists(root)) {
        existing.push(root);
      }
    }
    return existing;
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    const scannedAt = input.now.toISOString();
    const roots = await this.locateSources();
    if (roots.length === 0) {
      return {
        observations: [],
        coverage: this.coverage("not_found", scannedAt, 0, 0),
        diagnostics: [diagnostic("SOURCE_NOT_FOUND", this.agent, "info", scannedAt)],
      };
    }

    const startedAt = Date.now();
    const observations: UsageCollectorObservation[] = [];
    let filesScanned = 0;
    let bytesScanned = 0;
    let partial = false;
    let invalidRecords = 0;

    for (const root of roots) {
      const files = await collectJsonlFiles(root, input.budget.maxFiles);
      for (const filePath of files) {
        if (filesScanned >= input.budget.maxFiles || bytesScanned >= input.budget.maxBytes) {
          partial = true;
          break;
        }
        if (Date.now() - startedAt >= input.budget.perSourceBudgetMs) {
          partial = true;
          break;
        }
        const raw = await fs.readFile(filePath, "utf8").catch(() => undefined);
        if (raw === undefined) {
          invalidRecords += 1;
          continue;
        }
        filesScanned += 1;
        bytesScanned += Buffer.byteLength(raw, "utf8");
        const lines = raw.split("\n");
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index]?.trim();
          if (!line) {
            continue;
          }
          try {
            const parsed = JSON.parse(line) as unknown;
            observations.push(...extractClaudeSkillUses(parsed, filePath, index));
          } catch {
            invalidRecords += 1;
          }
        }
      }
    }

    const status = partial
      ? "partial"
      : observations.length > 0
        ? "scanned"
        : filesScanned > 0
          ? "no_skill_signals"
          : "no_records";
    const diagnostics: UsageDiagnostic[] = [];
    if (invalidRecords > 0) {
      diagnostics.push(diagnostic("INVALID_RECORD_DROPPED", this.agent, "warning", scannedAt, invalidRecords));
    }
    if (status === "no_records") {
      diagnostics.push(diagnostic("NO_RECORDS", this.agent, "info", scannedAt));
    }
    if (status === "no_skill_signals") {
      diagnostics.push(diagnostic("NO_SKILL_SIGNALS", this.agent, "info", scannedAt));
    }
    if (partial) {
      diagnostics.push(diagnostic("BUDGET_EXHAUSTED", this.agent, "warning", scannedAt));
    }

    return {
      observations,
      coverage: this.coverage(
        status,
        scannedAt,
        observations.filter((item) => item.confidence === "observed").length,
        observations.filter((item) => item.confidence === "inferred").length,
        diagnostics.length,
      ),
      diagnostics,
    };
  }

  private coverage(
    status: UsageAgentCoverage["status"],
    scannedAt: string,
    observedUses: number,
    inferredSignals: number,
    diagnosticsCount = 0,
  ): UsageAgentCoverage {
    return {
      agent: this.agent,
      sourceKind: "local-session",
      parserRevision: this.parserRevision,
      status,
      lastScannedAt: scannedAt,
      coverageFrom: null,
      coverageTo: null,
      observedUses,
      inferredSignals,
      diagnosticsCount,
    };
  }
}

function defaultClaudeCodeUsageRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_CLAUDE_PROJECTS_ROOT?.trim();
  return [override || path.join(os.homedir(), ".claude", "projects")];
}

async function collectJsonlFiles(root: string, maxFiles: number): Promise<string[]> {
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
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(entryPath);
      }
    }
  }
  await walk(root);
  return results;
}

function extractClaudeSkillUses(value: unknown, filePath: string, lineIndex: number): UsageCollectorObservation[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record = value as {
    timestamp?: unknown;
    cwd?: unknown;
    projectPath?: unknown;
    message?: {
      content?: unknown;
    };
  };
  const blocks = Array.isArray(record.message?.content) ? record.message.content : [];
  const observedAt = typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString();
  const rawProjectPath = typeof record.cwd === "string"
    ? record.cwd
    : typeof record.projectPath === "string"
      ? record.projectPath
      : undefined;

  return blocks.flatMap((block, blockIndex) => {
    if (typeof block !== "object" || block === null) {
      return [];
    }
    const candidate = block as {
      type?: unknown;
      name?: unknown;
      input?: {
        skill?: unknown;
      };
    };
    if (candidate.type !== "tool_use" || candidate.name !== "Skill") {
      return [];
    }
    const rawSkillName = typeof candidate.input?.skill === "string" && candidate.input.skill.length > 0
      ? candidate.input.skill
      : null;
    if (!rawSkillName) {
      return [];
    }
    const sourceEventId = sha256(`${filePath}:${lineIndex}:${blockIndex}:${observedAt}:${rawSkillName}`);
    return [{
      sourceEventId,
      observedAt,
      agent: "claude-code" as const,
      rawSkillName,
      evidenceKind: "tool_call" as const,
      confidence: "observed" as const,
      outcome: "unknown" as const,
      sourceKind: "local-session" as const,
      parserRevision: "claude-code-session@1",
      projectRef: null,
      projectLabel: "Unknown project",
      ...(rawProjectPath ? { rawProjectPath } : {}),
    }];
  });
}

function diagnostic(
  code: UsageDiagnostic["code"],
  agent: UsageAgent,
  severity: UsageDiagnostic["severity"],
  timestamp: string,
  count = 1,
): UsageDiagnostic {
  return {
    code,
    agent,
    severity,
    count,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
  };
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

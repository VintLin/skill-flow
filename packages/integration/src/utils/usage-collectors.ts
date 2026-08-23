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
import { TARGET_ORDER } from "./constants.js";
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
  return [
    new ClaudeCodeUsageCollector(),
    new CodexUsageCollector(),
    new GeminiTelemetryUsageCollector(),
  ];
}

export function createDefaultSupportedUsageAgents(): UsageAgent[] {
  return [...TARGET_ORDER];
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
        coverage: this.coverage("not_found", scannedAt, 0, 0, 1),
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

export class CodexUsageCollector implements UsageCollector {
  readonly agent = "codex" as const;
  readonly parserRevision = "codex-session@1";

  constructor(private readonly roots = defaultCodexUsageRoots()) {}

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
        coverage: this.coverage("not_found", scannedAt, 0, 0, 1),
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
        let currentProjectPath: string | undefined;
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index]?.trim();
          if (!line) {
            continue;
          }
          try {
            const parsed = JSON.parse(line) as unknown;
            const result = extractCodexSkillUses(parsed, filePath, index, currentProjectPath, scannedAt);
            currentProjectPath = result.currentProjectPath;
            observations.push(...result.observations);
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

function defaultCodexUsageRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_CODEX_SESSIONS_ROOT?.trim();
  if (override) {
    return [override];
  }
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    return [path.join(codexHome, "sessions")];
  }
  return [path.join(os.homedir(), ".codex", "sessions")];
}

export class GeminiTelemetryUsageCollector implements UsageCollector {
  readonly agent = "gemini-cli" as const;
  readonly parserRevision = "gemini-telemetry@1";

  constructor(private readonly files = defaultGeminiTelemetryFiles()) {}

  async locateSources(): Promise<string[]> {
    const existing: string[] = [];
    for (const filePath of this.files) {
      if (await pathExists(filePath)) {
        existing.push(filePath);
      }
    }
    return existing;
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    const scannedAt = input.now.toISOString();
    const files = await this.locateSources();
    if (files.length === 0) {
      return {
        observations: [],
        coverage: this.coverage("not_found", scannedAt, 0, 0, 1),
        diagnostics: [diagnostic("SOURCE_NOT_FOUND", this.agent, "info", scannedAt)],
      };
    }

    const startedAt = Date.now();
    const observations: UsageCollectorObservation[] = [];
    let filesScanned = 0;
    let bytesScanned = 0;
    let partial = false;
    let invalidRecords = 0;

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
          observations.push(...extractGeminiSkillUses(parsed, filePath, index, scannedAt));
        } catch {
          invalidRecords += 1;
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
      sourceKind: "direct-event",
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

function defaultGeminiTelemetryFiles(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_GEMINI_TELEMETRY_FILE?.trim()
    || process.env.GEMINI_TELEMETRY_OUTFILE?.trim();
  return [override || path.join(os.homedir(), ".gemini", "telemetry.log")];
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

function extractCodexSkillUses(
  value: unknown,
  filePath: string,
  lineIndex: number,
  currentProjectPath: string | undefined,
  fallbackTimestamp: string,
): { observations: UsageCollectorObservation[]; currentProjectPath: string | undefined } {
  if (typeof value !== "object" || value === null) {
    return { observations: [], currentProjectPath };
  }
  const record = value as {
    timestamp?: unknown;
    type?: unknown;
    payload?: unknown;
  };
  const payload = typeof record.payload === "object" && record.payload !== null ? record.payload : value;
  const sessionProjectPath = extractCodexProjectPath(record, payload);
  const nextProjectPath = sessionProjectPath ?? currentProjectPath;
  const observedAt = firstString([
    record.timestamp,
    objectField(payload, "timestamp"),
    objectField(payload, "created_at"),
    objectField(payload, "createdAt"),
  ]) ?? fallbackTimestamp;
  const blocks = collectPotentialToolCallBlocks(payload);

  return {
    currentProjectPath: nextProjectPath,
    observations: blocks.flatMap((block, blockIndex) => {
      const rawSkillName = extractRawSkillFromToolCall(block);
      if (!rawSkillName) {
        return [];
      }
      const sourceEventId = sha256(`${filePath}:${lineIndex}:${blockIndex}:${observedAt}:${rawSkillName}`);
      return [{
        sourceEventId,
        observedAt,
        agent: "codex" as const,
        rawSkillName,
        evidenceKind: "tool_call" as const,
        confidence: "observed" as const,
        outcome: "unknown" as const,
        sourceKind: "local-session" as const,
        parserRevision: "codex-session@1",
        projectRef: null,
        projectLabel: "Unknown project",
        ...(nextProjectPath ? { rawProjectPath: nextProjectPath } : {}),
      }];
    }),
  };
}

function extractGeminiSkillUses(
  value: unknown,
  filePath: string,
  lineIndex: number,
  fallbackTimestamp: string,
): UsageCollectorObservation[] {
  const functionName = findStringField(value, "function_name") ?? findStringField(value, "functionName");
  if (!functionName || !isSkillToolName(functionName)) {
    return [];
  }
  const functionArgs = findField(value, "function_args") ?? findField(value, "functionArgs");
  const parsedArgs = typeof functionArgs === "string"
    ? parseJsonObject(functionArgs)
    : typeof functionArgs === "object" && functionArgs !== null && !Array.isArray(functionArgs)
      ? functionArgs as Record<string, unknown>
      : null;
  const rawSkillName = parsedArgs
    ? firstString([
      objectField(parsedArgs, "skill"),
      objectField(parsedArgs, "skillName"),
      objectField(parsedArgs, "skill_name"),
      objectField(parsedArgs, "name"),
    ]) ?? null
    : null;
  if (!rawSkillName) {
    return [];
  }
  const observedAt = parseTelemetryTimestamp(value) ?? fallbackTimestamp;
  const sourceEventId = sha256(`${filePath}:${lineIndex}:${observedAt}:${rawSkillName}`);
  return [{
    sourceEventId,
    observedAt,
    agent: "gemini-cli" as const,
    rawSkillName,
    evidenceKind: "skill_activated" as const,
    confidence: "observed" as const,
    outcome: "unknown" as const,
    sourceKind: "direct-event" as const,
    parserRevision: "gemini-telemetry@1",
    projectRef: null,
    projectLabel: "Unknown project",
  }];
}

function extractCodexProjectPath(record: { type?: unknown }, payload: unknown): string | undefined {
  if (record.type !== "session_meta" || typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return firstString([
    objectField(payload, "cwd"),
    objectField(payload, "projectPath"),
    objectField(payload, "workspaceRoot"),
  ]);
}

function collectPotentialToolCallBlocks(value: unknown): unknown[] {
  const blocks: unknown[] = [];
  if (typeof value !== "object" || value === null) {
    return blocks;
  }
  blocks.push(value);
  const content = objectField(value, "content");
  if (Array.isArray(content)) {
    blocks.push(...content);
  }
  const message = objectField(value, "message");
  if (typeof message === "object" && message !== null) {
    const messageContent = objectField(message, "content");
    if (Array.isArray(messageContent)) {
      blocks.push(...messageContent);
    }
  }
  return blocks;
}

function extractRawSkillFromToolCall(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const toolName = firstString([
    objectField(value, "name"),
    objectField(value, "tool"),
    objectField(value, "toolName"),
    objectField(value, "function_name"),
  ]);
  if (!toolName || !isSkillToolName(toolName)) {
    return null;
  }

  const input = firstObject([
    objectField(value, "input"),
    objectField(value, "arguments"),
    objectField(value, "args"),
    objectField(value, "parameters"),
    objectField(value, "state"),
  ]);
  const parsedInput = typeof input === "string" ? parseJsonObject(input) : input;
  if (!parsedInput) {
    return null;
  }
  return firstString([
    objectField(parsedInput, "skill"),
    objectField(parsedInput, "skillName"),
    objectField(parsedInput, "skill_name"),
    objectField(parsedInput, "name"),
  ]) ?? null;
}

function isSkillToolName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "skill" || normalized === "activate_skill" || normalized.endsWith(".activate_skill");
}

function firstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function firstObject(values: unknown[]): Record<string, unknown> | string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function objectField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function findStringField(value: unknown, fieldName: string): string | undefined {
  const field = findField(value, fieldName);
  return typeof field === "string" && field.trim().length > 0 ? field : undefined;
}

function findField(value: unknown, fieldName: string, depth = 0): unknown {
  if (depth > 8 || typeof value !== "object" || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, fieldName)) {
    return (value as Record<string, unknown>)[fieldName];
  }
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    const matched = findField(child, fieldName, depth + 1);
    if (matched !== undefined) {
      return matched;
    }
  }
  return undefined;
}

function parseTelemetryTimestamp(value: unknown): string | undefined {
  const timestamp = firstString([
    findField(value, "timestamp"),
    findField(value, "time"),
    findField(value, "observedTimestamp"),
  ]);
  if (timestamp) {
    return timestamp;
  }
  const startTime = findField(value, "start_time") ?? findField(value, "startTime");
  if (typeof startTime !== "number" || !Number.isFinite(startTime)) {
    return undefined;
  }
  const milliseconds = startTime > 1_000_000_000_000 ? startTime : startTime * 1000;
  return new Date(milliseconds).toISOString();
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

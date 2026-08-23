import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  UsageAgent,
  UsageAgentCoverage,
  UsageCollectorObservation,
  UsageDiagnostic,
} from "@skill-flow/domain/types";
import { pathExists } from "./fs.js";
import {
  createCodexSessionState,
  createProjectSessionState,
  extractClaudeSkillUses,
  extractCodexSkillUses,
  extractCursorSkillUses,
  extractGrokBuildSkillUses,
  extractKimiCodeSkillUses,
  extractPiSkillUses,
} from "./usage/agent-jsonl-parsers.js";
import { createDefaultUsagePolicyAgents } from "./usage/agent-usage-policies.js";
import { scanJsonlSessionRoots } from "./usage/jsonl-session-scanner.js";
import {
  extractRawSkillFromToolCall,
  findField,
  findStringField,
  firstString,
  isSkillToolName,
  objectField,
  parseJsonObject,
  sha256,
} from "./usage/skill-signal-parser.js";

const execFileAsync = promisify(execFile);

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
    new ZCodeUsageCollector(),
    new CursorUsageCollector(),
    new GrokBuildUsageCollector(),
    new PiUsageCollector(),
    new WorkBuddyUsageCollector(),
    new KimiCodeUsageCollector(),
    new OpenCodeUsageCollector(),
    new GeminiTelemetryUsageCollector(),
  ];
}

export function createDefaultSupportedUsageAgents(): UsageAgent[] {
  return createDefaultUsagePolicyAgents();
}

type JsonlUsageCollectorConfig<TState> = {
  agent: UsageAgent;
  parserRevision: string;
  roots: string[];
  includeFile?: (filePath: string) => boolean;
  createInitialState: () => TState;
  parseRecord: Parameters<typeof scanJsonlSessionRoots<TState>>[0]["parseRecord"];
};

async function locateExistingPaths(paths: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const candidate of paths) {
    if (await pathExists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function scanJsonlUsageCollector<TState>(
  config: JsonlUsageCollectorConfig<TState>,
  input: UsageCollectorScanInput,
): Promise<UsageCollectorScanResult> {
  const scannedAt = input.now.toISOString();
  const roots = await locateExistingPaths(config.roots);
  if (roots.length === 0) {
    return {
      observations: [],
      coverage: usageCoverage(config.agent, "local-session", config.parserRevision, "not_found", scannedAt, 0, 0, 1),
      diagnostics: [diagnostic("SOURCE_NOT_FOUND", config.agent, "info", scannedAt)],
    };
  }

  const scanArgs = {
    roots,
    budget: input.budget,
    scannedAt,
    createInitialState: config.createInitialState,
    parseRecord: config.parseRecord,
    ...(config.includeFile ? { includeFile: config.includeFile } : {}),
  };
  const scan = await scanJsonlSessionRoots(scanArgs);
  const { observations, filesScanned, partial, invalidRecords } = scan;
  const status = jsonlScanStatus(partial, observations.length, filesScanned);
  const diagnostics = scanDiagnostics(config.agent, scannedAt, {
    invalidRecords,
    partial,
    status,
  });

  return {
    observations,
    coverage: usageCoverage(
      config.agent,
      "local-session",
      config.parserRevision,
      status,
      scannedAt,
      observations.filter((item) => item.confidence === "observed").length,
      observations.filter((item) => item.confidence === "inferred").length,
      diagnostics.length,
    ),
    diagnostics,
  };
}

function jsonlScanStatus(
  partial: boolean,
  observationsCount: number,
  filesScanned: number,
): UsageAgentCoverage["status"] {
  return partial
    ? "partial"
    : observationsCount > 0
      ? "scanned"
      : filesScanned > 0
        ? "no_skill_signals"
        : "no_records";
}

function scanDiagnostics(
  agent: UsageAgent,
  scannedAt: string,
  input: {
    invalidRecords: number;
    partial: boolean;
    status: UsageAgentCoverage["status"];
  },
): UsageDiagnostic[] {
  const diagnostics: UsageDiagnostic[] = [];
  if (input.invalidRecords > 0) {
    diagnostics.push(diagnostic("INVALID_RECORD_DROPPED", agent, "warning", scannedAt, input.invalidRecords));
  }
  if (input.status === "no_records") {
    diagnostics.push(diagnostic("NO_RECORDS", agent, "info", scannedAt));
  }
  if (input.status === "no_skill_signals") {
    diagnostics.push(diagnostic("NO_SKILL_SIGNALS", agent, "info", scannedAt));
  }
  if (input.partial) {
    diagnostics.push(diagnostic("BUDGET_EXHAUSTED", agent, "warning", scannedAt));
  }
  return diagnostics;
}

function usageCoverage(
  agent: UsageAgent,
  sourceKind: UsageAgentCoverage["sourceKind"],
  parserRevision: string,
  status: UsageAgentCoverage["status"],
  scannedAt: string,
  observedUses: number,
  inferredSignals: number,
  diagnosticsCount = 0,
): UsageAgentCoverage {
  return {
    agent,
    sourceKind,
    parserRevision,
    status,
    lastScannedAt: scannedAt,
    coverageFrom: null,
    coverageTo: null,
    observedUses,
    inferredSignals,
    diagnosticsCount,
  };
}

export class ClaudeCodeUsageCollector implements UsageCollector {
  readonly agent = "claude-code" as const;
  readonly parserRevision = "claude-code-session@1";

  constructor(private readonly roots = defaultClaudeCodeUsageRoots()) {}

  async locateSources(): Promise<string[]> {
    return locateExistingPaths(this.roots);
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return scanJsonlUsageCollector({
      agent: this.agent,
      parserRevision: this.parserRevision,
      roots: this.roots,
      createInitialState: () => undefined,
      parseRecord: ({ value, filePath, lineIndex, state }) => ({
        state,
        observations: extractClaudeSkillUses(value, filePath, lineIndex),
      }),
    }, input);
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
    return locateExistingPaths(this.roots);
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return scanJsonlUsageCollector({
      agent: this.agent,
      parserRevision: this.parserRevision,
      roots: this.roots,
      createInitialState: createCodexSessionState,
      parseRecord: ({ value, filePath, lineIndex, state, fallbackTimestamp }) => extractCodexSkillUses(
        value,
        filePath,
        lineIndex,
        state,
        fallbackTimestamp,
      ),
    }, input);
  }
}

function defaultCodexUsageRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_CODEX_SESSIONS_ROOT?.trim();
  if (override) {
    return [override];
  }
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    return [path.join(codexHome, "sessions"), path.join(codexHome, "archived_sessions")];
  }
  return [path.join(os.homedir(), ".codex", "sessions"), path.join(os.homedir(), ".codex", "archived_sessions")];
}

export class CursorUsageCollector implements UsageCollector {
  readonly agent = "cursor" as const;
  readonly parserRevision = "cursor-agent-transcript@1";

  constructor(private readonly roots = defaultCursorUsageRoots()) {}

  async locateSources(): Promise<string[]> {
    return locateExistingPaths(this.roots);
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return scanJsonlUsageCollector({
      agent: this.agent,
      parserRevision: this.parserRevision,
      roots: this.roots,
      includeFile: (filePath) => filePath.includes(`${path.sep}agent-transcripts${path.sep}`),
      createInitialState: () => undefined,
      parseRecord: ({ value, filePath, lineIndex, state, fallbackTimestamp }) => ({
        state,
        observations: extractCursorSkillUses(value, filePath, lineIndex, fallbackTimestamp),
      }),
    }, input);
  }
}

function defaultCursorUsageRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_CURSOR_PROJECTS_ROOT?.trim();
  return [override || path.join(os.homedir(), ".cursor", "projects")];
}

export class GrokBuildUsageCollector implements UsageCollector {
  readonly agent = "grok-build" as const;
  readonly parserRevision = "grok-build-session@1";

  constructor(private readonly roots = defaultGrokBuildUsageRoots()) {}

  async locateSources(): Promise<string[]> {
    return locateExistingPaths(this.roots);
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return scanJsonlUsageCollector({
      agent: this.agent,
      parserRevision: this.parserRevision,
      roots: this.roots,
      includeFile: (filePath) => filePath.endsWith(`${path.sep}chat_history.jsonl`),
      createInitialState: () => undefined,
      parseRecord: ({ value, filePath, lineIndex, state, fallbackTimestamp }) => ({
        state,
        observations: extractGrokBuildSkillUses(value, filePath, lineIndex, fallbackTimestamp),
      }),
    }, input);
  }
}

function defaultGrokBuildUsageRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_GROK_BUILD_SESSIONS_ROOT?.trim();
  return [override || path.join(os.homedir(), ".grok", "sessions")];
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

export class PiUsageCollector implements UsageCollector {
  readonly agent = "pi" as const;
  readonly parserRevision = "pi-session@1";

  constructor(private readonly roots = defaultPiUsageRoots()) {}

  async locateSources(): Promise<string[]> {
    return locateExistingPaths(this.roots);
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return scanJsonlUsageCollector({
      agent: this.agent,
      parserRevision: this.parserRevision,
      roots: this.roots,
      createInitialState: createProjectSessionState,
      parseRecord: ({ value, filePath, lineIndex, state, fallbackTimestamp }) => extractPiSkillUses(
        value,
        filePath,
        lineIndex,
        state,
        fallbackTimestamp,
      ),
    }, input);
  }
}

function defaultPiUsageRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_PI_SESSIONS_ROOT?.trim();
  return [override || path.join(os.homedir(), ".pi", "agent", "sessions")];
}

export class WorkBuddyUsageCollector implements UsageCollector {
  readonly agent = "workbuddy" as const;
  readonly parserRevision = "workbuddy-usage-log@1";

  constructor(private readonly files = defaultWorkBuddyUsageLogFiles()) {}

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
    let partial = false;
    let invalidRecords = 0;

    for (const filePath of files) {
      if (filesScanned >= input.budget.maxFiles) {
        partial = true;
        break;
      }
      if (Date.now() - startedAt >= input.budget.perSourceBudgetMs) {
        partial = true;
        break;
      }
      const raw = await fs.readFile(filePath, "utf8").catch(() => undefined);
      if (!raw) {
        invalidRecords += 1;
        continue;
      }
      if (Buffer.byteLength(raw, "utf8") > input.budget.maxBytes) {
        partial = true;
        break;
      }
      filesScanned += 1;
      const parsed = parseJsonObject(raw);
      if (!parsed) {
        invalidRecords += 1;
        continue;
      }
      observations.push(...extractWorkBuddyUsageLogSkillUses(parsed, filePath));
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

function defaultWorkBuddyUsageLogFiles(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_WORKBUDDY_USAGE_LOG_FILE?.trim();
  return [override || path.join(os.homedir(), ".workbuddy", "usage-log.json")];
}

export class OpenCodeUsageCollector implements UsageCollector {
  readonly agent = "opencode" as const;
  readonly parserRevision = "opencode-sqlite@1";

  constructor(private readonly dbPaths = defaultOpenCodeUsageDbPaths()) {}

  async locateSources(): Promise<string[]> {
    const existing: string[] = [];
    for (const dbPath of this.dbPaths) {
      if (await pathExists(dbPath)) {
        existing.push(dbPath);
      }
    }
    return existing;
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    const scannedAt = input.now.toISOString();
    const dbPaths = await this.locateSources();
    if (dbPaths.length === 0) {
      return {
        observations: [],
        coverage: this.coverage("not_found", scannedAt, 0, 0, 1),
        diagnostics: [diagnostic("SOURCE_NOT_FOUND", this.agent, "info", scannedAt)],
      };
    }

    const startedAt = Date.now();
    const observations: UsageCollectorObservation[] = [];
    let sourcesScanned = 0;
    let partial = false;
    let invalidRecords = 0;
    let readFailed = 0;

    for (const dbPath of dbPaths) {
      if (sourcesScanned >= input.budget.maxFiles) {
        partial = true;
        break;
      }
      if (Date.now() - startedAt >= input.budget.perSourceBudgetMs) {
        partial = true;
        break;
      }
      const rows = await readSqliteSkillToolRows(dbPath, input.budget.maxFiles).catch(() => undefined);
      if (!rows) {
        readFailed += 1;
        continue;
      }
      sourcesScanned += 1;
      for (const row of rows) {
        const parsed = parseJsonObject(row.data);
        if (!parsed) {
          invalidRecords += 1;
          continue;
        }
        const rawSkillName = extractRawSkillFromToolCall(parsed);
        if (!rawSkillName) {
          continue;
        }
        const observedAt = openCodeTimestamp(row.timeCreated, parsed) ?? scannedAt;
        observations.push({
          sourceEventId: sha256(`${dbPath}:${row.sessionId}:${row.partId}:${observedAt}:${rawSkillName}`),
          observedAt,
          agent: "opencode",
          rawSkillName,
          evidenceKind: "tool_call",
          confidence: "observed",
          outcome: "completed",
          sourceKind: "local-session",
          parserRevision: this.parserRevision,
          projectRef: null,
          projectLabel: "Unknown project",
          ...(row.directory ? { rawProjectPath: row.directory } : {}),
        });
      }
    }

    const status = readFailed > 0 && sourcesScanned === 0
      ? "read_failed"
      : partial
        ? "partial"
        : observations.length > 0
          ? "scanned"
          : sourcesScanned > 0
            ? "no_skill_signals"
            : "no_records";
    const diagnostics: UsageDiagnostic[] = [];
    if (readFailed > 0) {
      diagnostics.push(diagnostic("READ_FAILED", this.agent, "warning", scannedAt, readFailed));
    }
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

function defaultOpenCodeUsageDbPaths(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_OPENCODE_DB_PATH?.trim();
  return [override || path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")];
}

export class ZCodeUsageCollector implements UsageCollector {
  readonly agent = "zcode" as const;
  readonly parserRevision = "zcode-sqlite@1";

  constructor(private readonly dbPaths = defaultZCodeUsageDbPaths()) {}

  async locateSources(): Promise<string[]> {
    const existing: string[] = [];
    for (const dbPath of this.dbPaths) {
      if (await pathExists(dbPath)) {
        existing.push(dbPath);
      }
    }
    return existing;
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    const scannedAt = input.now.toISOString();
    const dbPaths = await this.locateSources();
    if (dbPaths.length === 0) {
      return {
        observations: [],
        coverage: this.coverage("not_found", scannedAt, 0, 0, 1),
        diagnostics: [diagnostic("SOURCE_NOT_FOUND", this.agent, "info", scannedAt)],
      };
    }

    const startedAt = Date.now();
    const observations: UsageCollectorObservation[] = [];
    let sourcesScanned = 0;
    let partial = false;
    let invalidRecords = 0;
    let readFailed = 0;

    for (const dbPath of dbPaths) {
      if (sourcesScanned >= input.budget.maxFiles) {
        partial = true;
        break;
      }
      if (Date.now() - startedAt >= input.budget.perSourceBudgetMs) {
        partial = true;
        break;
      }
      const rows = await readSqliteSkillToolRows(dbPath, input.budget.maxFiles).catch(() => undefined);
      if (!rows) {
        readFailed += 1;
        continue;
      }
      sourcesScanned += 1;
      for (const row of rows) {
        const parsed = parseJsonObject(row.data);
        if (!parsed) {
          invalidRecords += 1;
          continue;
        }
        const rawSkillName = extractRawSkillFromToolCall(parsed);
        if (!rawSkillName) {
          continue;
        }
        const observedAt = openCodeTimestamp(row.timeCreated, parsed) ?? scannedAt;
        observations.push({
          sourceEventId: sha256(`${dbPath}:${row.sessionId}:${row.partId}:${observedAt}:${rawSkillName}`),
          observedAt,
          agent: "zcode",
          rawSkillName,
          evidenceKind: "tool_call",
          confidence: "observed",
          outcome: "completed",
          sourceKind: "local-session",
          parserRevision: this.parserRevision,
          projectRef: null,
          projectLabel: "Unknown project",
          ...(row.directory ? { rawProjectPath: row.directory } : {}),
        });
      }
    }

    const status = readFailed > 0 && sourcesScanned === 0
      ? "read_failed"
      : partial
        ? "partial"
        : observations.length > 0
          ? "scanned"
          : sourcesScanned > 0
            ? "no_skill_signals"
            : "no_records";
    const diagnostics: UsageDiagnostic[] = [];
    if (readFailed > 0) {
      diagnostics.push(diagnostic("READ_FAILED", this.agent, "warning", scannedAt, readFailed));
    }
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

function defaultZCodeUsageDbPaths(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_ZCODE_DB_PATH?.trim();
  return [override || path.join(os.homedir(), ".zcode", "cli", "db", "db.sqlite")];
}

export class KimiCodeUsageCollector implements UsageCollector {
  readonly agent = "kimi-code" as const;
  readonly parserRevision = "kimi-code-session@1";

  constructor(private readonly roots = defaultKimiCodeUsageRoots()) {}

  async locateSources(): Promise<string[]> {
    return locateExistingPaths(this.roots);
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return scanJsonlUsageCollector({
      agent: this.agent,
      parserRevision: this.parserRevision,
      roots: this.roots,
      createInitialState: createProjectSessionState,
      parseRecord: ({ value, filePath, lineIndex, state, fallbackTimestamp }) => extractKimiCodeSkillUses(
        value,
        filePath,
        lineIndex,
        state,
        fallbackTimestamp,
      ),
    }, input);
  }
}

function defaultKimiCodeUsageRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_KIMI_CODE_SESSIONS_ROOT?.trim();
  return [override || path.join(os.homedir(), ".kimi-code", "sessions")];
}

function extractWorkBuddyUsageLogSkillUses(
  value: Record<string, unknown>,
  filePath: string,
): UsageCollectorObservation[] {
  const skills = objectField(value, "skills");
  if (typeof skills !== "object" || skills === null || Array.isArray(skills)) {
    return [];
  }
  const observations: UsageCollectorObservation[] = [];
  for (const [skillName, rawEntry] of Object.entries(skills as Record<string, unknown>)) {
    if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;
    if (objectField(entry, "type") !== "skill") {
      continue;
    }
    const rawSkillName = firstString([objectField(entry, "id"), skillName]);
    if (!rawSkillName) {
      continue;
    }
    const dates = uniqueIsoDateStrings(objectField(entry, "recentDates"));
    const observedDates = dates.length > 0
      ? dates
      : uniqueIsoDateStrings([objectField(entry, "lastUsedDate"), objectField(entry, "firstSeenDate")]);
    for (const date of observedDates) {
      const observedAt = `${date}T00:00:00.000Z`;
      observations.push({
        sourceEventId: sha256(`${filePath}:${rawSkillName}:${date}`),
        observedAt,
        agent: "workbuddy",
        rawSkillName,
        evidenceKind: "selected",
        confidence: "observed",
        outcome: "unknown",
        sourceKind: "direct-event",
        parserRevision: "workbuddy-usage-log@1",
        projectRef: null,
        projectLabel: "Unknown project",
      });
    }
  }
  return observations;
}

function uniqueIsoDateStrings(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item)) {
      continue;
    }
    seen.add(item);
  }
  return [...seen].sort();
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

type SqliteSkillToolRow = {
  sessionId: string;
  directory: string | null;
  partId: string;
  timeCreated: number | null;
  data: string;
};

async function readSqliteSkillToolRows(dbPath: string, limit: number): Promise<SqliteSkillToolRow[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 5000));
  const query = `
SELECT
  p.session_id AS sessionId,
  s.directory AS directory,
  p.id AS partId,
  p.time_created AS timeCreated,
  p.data AS data
FROM part p
LEFT JOIN session s ON s.id = p.session_id
WHERE json_extract(p.data, '$.type') = 'tool'
  AND lower(json_extract(p.data, '$.tool')) IN ('skill', 'activate_skill')
  AND json_extract(p.data, '$.state.status') = 'completed'
  AND (
    json_extract(p.data, '$.state.input.skill') IS NOT NULL
    OR json_extract(p.data, '$.state.input.name') IS NOT NULL
  )
LIMIT ${safeLimit};
`;
  const { stdout } = await execFileAsync("sqlite3", ["-json", dbPath, query], {
    timeout: 5000,
    maxBuffer: 1024 * 1024 * 16,
  });
  const parsed = JSON.parse(stdout.trim() || "[]") as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((row) => {
    if (typeof row !== "object" || row === null) {
      return [];
    }
    const candidate = row as Record<string, unknown>;
    const sessionId = firstString([candidate.sessionId, candidate.session_id]);
    const partId = firstString([candidate.partId, candidate.id]);
    const data = firstString([candidate.data]);
    if (!sessionId || !partId || !data) {
      return [];
    }
    const timeCreated = typeof candidate.timeCreated === "number"
      ? candidate.timeCreated
      : typeof candidate.time_created === "number"
        ? candidate.time_created
        : null;
    return [{
      sessionId,
      directory: firstString([candidate.directory]) ?? null,
      partId,
      timeCreated,
      data,
    }];
  });
}

function openCodeTimestamp(timeCreated: number | null, payload: Record<string, unknown>): string | undefined {
  const nestedStart = findField(payload, "start");
  const candidate = typeof nestedStart === "number" && Number.isFinite(nestedStart)
    ? nestedStart
    : timeCreated;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return undefined;
  }
  const milliseconds = candidate > 1_000_000_000_000 ? candidate : candidate * 1000;
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

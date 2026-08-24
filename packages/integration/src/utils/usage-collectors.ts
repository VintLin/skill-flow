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
  extractExplicitSkillCommands,
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
      coverage: usageCoverage(config.agent, "local-session", config.parserRevision, "not_found", scannedAt, 0, 0, 1, {
        sourcesFound: 0,
        sourceFilesScanned: 0,
        sourceBytesScanned: 0,
      }),
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
  const { observations, filesScanned, bytesScanned, partial, invalidRecords } = scan;
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
      {
        sourcesFound: roots.length,
        sourceFilesScanned: filesScanned,
        sourceBytesScanned: bytesScanned,
      },
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
  scanStats: Pick<UsageAgentCoverage, "sourcesFound" | "sourceFilesScanned" | "sourceBytesScanned"> = {},
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
    ...scanStats,
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

  constructor(private readonly sources: WorkBuddyUsageSources = defaultWorkBuddyUsageSources()) {}

  async locateSources(): Promise<string[]> {
    return locateExistingPaths([
      ...this.sources.traceRoots,
      ...this.sources.sessionFiles,
      ...this.sources.usageLogFiles,
    ]);
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    const scannedAt = input.now.toISOString();
    const locatedSources = await this.locateSources();
    if (locatedSources.length === 0) {
      return {
        observations: [],
        coverage: this.coverage("not_found", scannedAt, 0, 0, 1, {
          sourcesFound: 0,
          sourceFilesScanned: 0,
          sourceBytesScanned: 0,
        }),
        diagnostics: [diagnostic("SOURCE_NOT_FOUND", this.agent, "info", scannedAt)],
      };
    }

    const startedAt = Date.now();
    const observations: UsageCollectorObservation[] = [];
    let filesScanned = 0;
    let bytesScanned = 0;
    let partial = false;
    let invalidRecords = 0;

    const readJson = async (filePath: string): Promise<Record<string, unknown> | null> => {
      if (filesScanned >= input.budget.maxFiles || bytesScanned >= input.budget.maxBytes) {
        partial = true;
        return null;
      }
      if (Date.now() - startedAt >= input.budget.perSourceBudgetMs) {
        partial = true;
        return null;
      }
      const raw = await fs.readFile(filePath, "utf8").catch(() => undefined);
      if (raw === undefined) {
        invalidRecords += 1;
        return null;
      }
      const size = Buffer.byteLength(raw, "utf8");
      if (bytesScanned + size > input.budget.maxBytes) {
        partial = true;
        return null;
      }
      filesScanned += 1;
      bytesScanned += size;
      const parsed = parseJsonObject(raw);
      if (!parsed) {
        invalidRecords += 1;
        return null;
      }
      return parsed;
    };

    const sessionProjects = await readWorkBuddySessionProjects(this.sources.sessionFiles, readJson);
    const traceFiles = await listWorkBuddyTraceFiles(this.sources.traceRoots, input.budget.maxFiles);
    const traceObservations: UsageCollectorObservation[] = [];
    for (const filePath of traceFiles) {
      const parsed = await readJson(filePath);
      if (parsed) {
        traceObservations.push(...extractWorkBuddyTraceSkillUses(parsed, filePath, sessionProjects));
      }
      if (partial) {
        break;
      }
    }

    if (traceObservations.length > 0) {
      observations.push(...traceObservations);
    } else {
      for (const filePath of this.sources.usageLogFiles) {
        if (!(await pathExists(filePath))) {
          continue;
        }
        const parsed = await readJson(filePath);
        if (parsed) {
          observations.push(...extractWorkBuddyUsageLogSkillUses(parsed, filePath));
        }
        if (partial) {
          break;
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
        {
          sourcesFound: locatedSources.length,
          sourceFilesScanned: filesScanned,
          sourceBytesScanned: bytesScanned,
        },
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
    scanStats: Pick<UsageAgentCoverage, "sourcesFound" | "sourceFilesScanned" | "sourceBytesScanned"> = {},
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
      ...scanStats,
    };
  }
}

type WorkBuddyUsageSources = {
  usageLogFiles: string[];
  traceRoots: string[];
  sessionFiles: string[];
};

function defaultWorkBuddyUsageSources(): WorkBuddyUsageSources {
  const root = process.env.SKILL_FLOW_USAGE_WORKBUDDY_ROOT?.trim()
    || path.join(os.homedir(), ".workbuddy");
  const usageLogOverride = process.env.SKILL_FLOW_USAGE_WORKBUDDY_USAGE_LOG_FILE?.trim();
  const traceRootOverride = process.env.SKILL_FLOW_USAGE_WORKBUDDY_TRACES_ROOT?.trim();
  const sessionFileOverride = process.env.SKILL_FLOW_USAGE_WORKBUDDY_SESSIONS_FILE?.trim();
  return {
    usageLogFiles: [usageLogOverride || path.join(root, "usage-log.json")],
    traceRoots: [traceRootOverride || path.join(root, "traces")],
    sessionFiles: [sessionFileOverride || path.join(root, "app", "sessions.json")],
  };
}

export class OpenCodeUsageCollector implements UsageCollector {
  readonly agent = "opencode" as const;
  readonly parserRevision = "opencode-sqlite@1";

  constructor(
    private readonly dbPaths = defaultOpenCodeUsageDbPaths(),
    private readonly skillRoots = defaultOpenCodeSkillRoots(),
  ) {}

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
    let sourceBytesScanned = 0;
    let partial = false;
    let invalidRecords = 0;
    let readFailed = 0;
    const seenDedupeKeys = new Set<string>();
    const skillContentMatcher = await loadOpenCodeSkillContentMatcher(this.skillRoots, {
      startedAt,
      budget: input.budget,
    });
    partial = partial || skillContentMatcher.partial;

    for (const dbPath of dbPaths) {
      if (sourcesScanned >= input.budget.maxFiles) {
        partial = true;
        break;
      }
      if (Date.now() - startedAt >= input.budget.perSourceBudgetMs) {
        partial = true;
        break;
      }
      const rows = await readOpenCodeSqlitePartRows(dbPath, input.budget.maxFiles).catch(() => undefined);
      if (!rows) {
        readFailed += 1;
        continue;
      }
      sourcesScanned += 1;
      sourceBytesScanned += await fileSize(dbPath);
      for (const row of rows) {
        const parsed = parseJsonObject(row.data);
        if (!parsed) {
          invalidRecords += 1;
          continue;
        }
        const observedAt = openCodeTimestamp(row.timeCreated, parsed) ?? scannedAt;
        if (row.rowKind === "tool") {
          const rawSkillName = extractRawSkillFromToolCall(parsed);
          if (!rawSkillName) {
            continue;
          }
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
          continue;
        }

        const text = typeof objectField(parsed, "text") === "string" ? objectField(parsed, "text") as string : null;
        if (!text) {
          continue;
        }
        const injectedSkill = skillContentMatcher.match(text);
        if (injectedSkill) {
          observations.push({
            sourceEventId: sha256(`${dbPath}:${row.sessionId}:${row.partId}:${observedAt}:skill-content:${injectedSkill}`),
            observedAt,
            agent: "opencode",
            rawSkillName: injectedSkill,
            evidenceKind: "skill_activated",
            confidence: "observed",
            outcome: "completed",
            sourceKind: "local-session",
            parserRevision: this.parserRevision,
            projectRef: null,
            projectLabel: "Unknown project",
            ...(row.directory ? { rawProjectPath: row.directory } : {}),
          });
          continue;
        }
        observations.push(...extractExplicitSkillCommands({
          agent: "opencode",
          parserRevision: this.parserRevision,
          sourceKind: "local-session",
          filePath: dbPath,
          lineIndex: row.rowIndex,
          observedAt,
          texts: [text],
          rawProjectPath: row.directory ?? undefined,
          seenDedupeKeys,
          position: "leading",
        }));
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
        {
          sourcesFound: dbPaths.length + skillContentMatcher.sourcesFound,
          sourceFilesScanned: sourcesScanned + skillContentMatcher.sourceFilesScanned,
          sourceBytesScanned: sourceBytesScanned + skillContentMatcher.sourceBytesScanned,
        },
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
    scanStats: Pick<UsageAgentCoverage, "sourcesFound" | "sourceFilesScanned" | "sourceBytesScanned"> = {},
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
      ...scanStats,
    };
  }
}

function defaultOpenCodeUsageDbPaths(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_OPENCODE_DB_PATH?.trim();
  return [override || path.join(os.homedir(), ".local", "share", "opencode", "opencode.db")];
}

function defaultOpenCodeSkillRoots(): string[] {
  const override = process.env.SKILL_FLOW_USAGE_OPENCODE_SKILLS_ROOT?.trim();
  return [override || path.join(os.homedir(), ".config", "opencode", "skills")];
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
    let sourceBytesScanned = 0;
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
      sourceBytesScanned += await fileSize(dbPath);
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
        {
          sourcesFound: dbPaths.length,
          sourceFilesScanned: sourcesScanned,
          sourceBytesScanned,
        },
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
    scanStats: Pick<UsageAgentCoverage, "sourcesFound" | "sourceFilesScanned" | "sourceBytesScanned"> = {},
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
      ...scanStats,
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

async function listWorkBuddyTraceFiles(roots: string[], maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    if (files.length >= maxFiles) {
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        break;
      }
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(entryPath);
      }
    }
  };

  for (const root of roots) {
    if (await pathExists(root)) {
      await visit(root);
    }
  }
  return files.sort();
}

async function readWorkBuddySessionProjects(
  sessionFiles: string[],
  readJson: (filePath: string) => Promise<Record<string, unknown> | null>,
): Promise<Map<string, string>> {
  const projects = new Map<string, string>();
  for (const filePath of sessionFiles) {
    if (!(await pathExists(filePath))) {
      continue;
    }
    const parsed = await readJson(filePath);
    const sessions = Array.isArray(objectField(parsed, "sessions")) ? objectField(parsed, "sessions") as unknown[] : [];
    for (const rawSession of sessions) {
      if (typeof rawSession !== "object" || rawSession === null || Array.isArray(rawSession)) {
        continue;
      }
      const sessionId = firstString([objectField(rawSession, "conversationId"), objectField(rawSession, "sessionId")]);
      const workDir = firstString([objectField(rawSession, "workDir"), objectField(rawSession, "cwd")]);
      if (sessionId && workDir) {
        projects.set(sessionId, workDir);
      }
    }
  }
  return projects;
}

function extractWorkBuddyTraceSkillUses(
  value: Record<string, unknown>,
  filePath: string,
  sessionProjects: Map<string, string>,
): UsageCollectorObservation[] {
  const trace = objectField(value, "trace");
  const traceId = firstString([objectField(trace, "traceId"), path.basename(filePath)]);
  const sessionId = firstString([objectField(trace, "sessionId")]);
  const rawProjectPath = sessionId ? sessionProjects.get(sessionId) : undefined;
  const spans = objectField(value, "spans");
  if (!Array.isArray(spans)) {
    return [];
  }

  const observations: UsageCollectorObservation[] = [];
  for (const span of spans) {
    if (typeof span !== "object" || span === null || Array.isArray(span)) {
      continue;
    }
    const spanId = firstString([objectField(span, "spanId")]);
    const toolName = firstString([objectField(span, "toolName"), objectField(span, "name")]);
    if (!toolName || !isSkillToolName(toolName)) {
      continue;
    }
    const rawSkillName = extractRawSkillFromWorkBuddySpan(span);
    const observedAt = firstString([objectField(span, "startedAt"), objectField(trace, "startedAt")]);
    if (!rawSkillName || !observedAt || Number.isNaN(new Date(observedAt).getTime())) {
      continue;
    }
    const status = firstString([objectField(span, "status")])?.toLowerCase();
    if (status === "error" || status === "failed" || status === "aborted" || status === "cancelled") {
      continue;
    }
    observations.push({
      sourceEventId: sha256(`${filePath}:${traceId}:${spanId ?? ""}:${observedAt}:${rawSkillName}`),
      observedAt,
      agent: "workbuddy",
      rawSkillName,
      evidenceKind: "tool_call",
      confidence: "observed",
      outcome: status === "ok" || status === "completed" ? "completed" : "unknown",
      sourceKind: "direct-event",
      parserRevision: "workbuddy-usage-log@1",
      projectRef: null,
      projectLabel: "Unknown project",
      ...(rawProjectPath ? { rawProjectPath } : {}),
    });
  }
  return observations;
}

function extractRawSkillFromWorkBuddySpan(span: Record<string, unknown>): string | null {
  const parsedToolInput = parseWorkBuddyToolInput(objectField(span, "toolInput"));
  const direct = firstString([
    objectField(parsedToolInput, "skill"),
    objectField(parsedToolInput, "skillName"),
    objectField(parsedToolInput, "skill_name"),
    objectField(span, "skill"),
  ]);
  return direct ?? extractRawSkillFromToolCall(span);
}

function parseWorkBuddyToolInput(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return parseJsonObject(value);
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

type OpenCodeSqlitePartRow = SqliteSkillToolRow & {
  rowKind: "tool" | "user_text";
  rowIndex: number;
};

type OpenCodeSkillContentMatcher = {
  sourcesFound: number;
  sourceFilesScanned: number;
  sourceBytesScanned: number;
  partial: boolean;
  match: (text: string) => string | null;
};

async function readOpenCodeSqlitePartRows(dbPath: string, limit: number): Promise<OpenCodeSqlitePartRow[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 10000));
  const query = `
SELECT
  p.session_id AS sessionId,
  s.directory AS directory,
  p.id AS partId,
  p.time_created AS timeCreated,
  p.data AS data,
  CASE
    WHEN json_extract(p.data, '$.type') = 'tool' THEN 'tool'
    ELSE 'user_text'
  END AS rowKind,
  row_number() OVER (ORDER BY p.time_created, p.id) AS rowIndex
FROM part p
LEFT JOIN message m ON m.id = p.message_id
LEFT JOIN session s ON s.id = p.session_id
WHERE (
    json_extract(p.data, '$.type') = 'tool'
    AND lower(json_extract(p.data, '$.tool')) IN ('skill', 'activate_skill')
    AND json_extract(p.data, '$.state.status') = 'completed'
    AND (
      json_extract(p.data, '$.state.input.skill') IS NOT NULL
      OR json_extract(p.data, '$.state.input.name') IS NOT NULL
    )
  )
  OR (
    json_extract(m.data, '$.role') = 'user'
    AND json_extract(p.data, '$.type') = 'text'
    AND json_extract(p.data, '$.text') IS NOT NULL
  )
ORDER BY p.time_created, p.id
LIMIT ${safeLimit};
`;
  const { stdout } = await execFileAsync("sqlite3", ["-json", dbPath, query], {
    timeout: 5000,
    maxBuffer: 1024 * 1024 * 32,
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
    const rowKind = candidate.rowKind === "tool" || candidate.rowKind === "user_text" ? candidate.rowKind : null;
    if (!sessionId || !partId || !data || !rowKind) {
      return [];
    }
    const timeCreated = typeof candidate.timeCreated === "number"
      ? candidate.timeCreated
      : typeof candidate.time_created === "number"
        ? candidate.time_created
        : null;
    const rowIndex = typeof candidate.rowIndex === "number" && Number.isFinite(candidate.rowIndex)
      ? candidate.rowIndex
      : 0;
    return [{
      sessionId,
      directory: firstString([candidate.directory]) ?? null,
      partId,
      timeCreated,
      data,
      rowKind,
      rowIndex,
    }];
  });
}

async function loadOpenCodeSkillContentMatcher(
  roots: string[],
  args: {
    startedAt: number;
    budget: UsageCollectorScanInput["budget"];
  },
): Promise<OpenCodeSkillContentMatcher> {
  const existingRoots = await locateExistingPaths(roots);
  let sourceFilesScanned = 0;
  let sourceBytesScanned = 0;
  let partial = false;
  const entries: { skillName: string; prefix: string }[] = [];

  for (const root of existingRoots) {
    if (Date.now() - args.startedAt >= args.budget.perSourceBudgetMs) {
      partial = true;
      break;
    }
    const dirents = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const dirent of dirents) {
      if (!dirent.isDirectory() && !dirent.isSymbolicLink()) {
        continue;
      }
      if (sourceFilesScanned >= args.budget.maxFiles || sourceBytesScanned >= args.budget.maxBytes) {
        partial = true;
        break;
      }
      const skillFile = path.join(root, dirent.name, "SKILL.md");
      const raw = await fs.readFile(skillFile, "utf8").catch(() => undefined);
      if (!raw) {
        continue;
      }
      sourceFilesScanned += 1;
      sourceBytesScanned += Buffer.byteLength(raw, "utf8");
      const skillBody = stripYamlFrontmatter(raw).trimStart();
      const prefix = skillBody.slice(0, 160);
      if (prefix.length < 80) {
        continue;
      }
      entries.push({ skillName: dirent.name, prefix });
    }
    if (partial) {
      break;
    }
  }

  return {
    sourcesFound: existingRoots.length,
    sourceFilesScanned,
    sourceBytesScanned,
    partial,
    match(text: string): string | null {
      const normalizedText = text.trimStart();
      const matched = entries.find((entry) => normalizedText.startsWith(entry.prefix));
      return matched?.skillName ?? null;
    },
  };
}

function stripYamlFrontmatter(value: string): string {
  if (!value.startsWith("---")) {
    return value;
  }
  const end = value.indexOf("\n---", 3);
  if (end === -1) {
    return value;
  }
  return value.slice(end + 4).replace(/^\r?\n/, "");
}

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

async function fileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath).catch(() => undefined);
  return stats?.size ?? 0;
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

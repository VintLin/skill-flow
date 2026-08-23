import fs from "node:fs/promises";
import path from "node:path";
import type {
  UsageAgentCoverage,
  UsageConfidence,
  UsageDiagnostic,
  UsageObservationV1,
  UsageSnapshot,
  UsageSnapshotFilters,
} from "@skill-flow/domain/types";
import { getStateRoot } from "@skill-flow/integration/utils/constants";
import {
  ensureDir,
  readJsonFile,
  withFileLock,
  writeJsonFile,
} from "@skill-flow/integration/utils/fs";

export type UsageWriteResult = {
  accepted: number;
  duplicateSkipped: number;
  droppedInvalid: number;
  acceptedObservations: UsageObservationV1[];
};

export type UsageCoverageState = {
  schemaVersion: 1;
  updatedAt: string | null;
  coverage: UsageAgentCoverage[];
  diagnostics: UsageDiagnostic[];
};

const USAGE_SCHEMA_VERSION = 1 as const;
const DEFAULT_PROJECT_LABEL = "Unknown project";

export class UsageStore {
  constructor(private readonly stateRoot = getStateRoot()) {}

  get rootPath(): string {
    return path.join(this.stateRoot, "usage", "v1");
  }

  get observationsRoot(): string {
    return path.join(this.rootPath, "observations");
  }

  get coveragePath(): string {
    return path.join(this.rootPath, "coverage.json");
  }

  get lockPath(): string {
    return path.join(this.rootPath, ".lock");
  }

  async init(): Promise<void> {
    await ensureDir(this.observationsRoot);
  }

  async appendObservations(batch: UsageObservationV1[]): Promise<UsageWriteResult> {
    return this.withUsageLock(async () => {
      await this.init();
      const existingIds = new Set((await this.readAllObservationsUnlocked()).map((item) => item.observationId));
      const accepted: UsageObservationV1[] = [];
      let duplicateSkipped = 0;
      let droppedInvalid = 0;

      for (const observation of batch) {
        if (!isValidObservation(observation)) {
          droppedInvalid += 1;
          continue;
        }
        if (existingIds.has(observation.observationId)) {
          duplicateSkipped += 1;
          continue;
        }
        existingIds.add(observation.observationId);
        accepted.push(observation);
      }

      const byDate = new Map<string, UsageObservationV1[]>();
      for (const observation of accepted) {
        const date = observation.observedAt.slice(0, 10);
        byDate.set(date, [...(byDate.get(date) ?? []), observation]);
      }

      for (const [date, observations] of byDate) {
        const filePath = this.observationPath(date);
        await ensureDir(path.dirname(filePath));
        const lines = observations.map((observation) => JSON.stringify(observation)).join("\n");
        await fs.appendFile(filePath, `${lines}\n`, "utf8");
      }

      return {
        accepted: accepted.length,
        duplicateSkipped,
        droppedInvalid,
        acceptedObservations: accepted,
      };
    });
  }

  async readObservations(): Promise<UsageObservationV1[]> {
    await this.init();
    return this.readAllObservationsUnlocked();
  }

  async writeCoverageState(state: UsageCoverageState): Promise<void> {
    await this.withUsageLock(async () => {
      await this.init();
      await writeJsonFile(this.coveragePath, state);
    });
  }

  async readCoverageState(): Promise<UsageCoverageState> {
    await this.init();
    return normalizeCoverageState(await readJsonFile<unknown>(this.coveragePath, undefined));
  }

  async readSnapshot(filters: UsageSnapshotFilters = {}): Promise<UsageSnapshot> {
    const observations = await this.readObservations();
    const coverageState = await this.readCoverageState();
    return buildUsageSnapshot({
      observations,
      coverage: coverageState.coverage,
      diagnostics: coverageState.diagnostics,
      filters,
    });
  }

  async pruneIfDue(now = new Date()): Promise<{ removedFiles: number }> {
    await this.init();
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    let removedFiles = 0;

    for (const entry of await this.safeReadDir(this.observationsRoot)) {
      if (!entry.endsWith(".jsonl")) {
        continue;
      }
      const date = entry.slice(0, -".jsonl".length);
      if (date < cutoffDate) {
        await fs.rm(path.join(this.observationsRoot, entry), { force: true });
        removedFiles += 1;
      }
    }

    return { removedFiles };
  }

  private async withUsageLock<T>(task: () => Promise<T>): Promise<T> {
    await ensureDir(this.rootPath);
    return withFileLock(this.lockPath, task, {
      metadata: { command: "usage-store" },
    });
  }

  private observationPath(date: string): string {
    return path.join(this.observationsRoot, `${date}.jsonl`);
  }

  private async readAllObservationsUnlocked(): Promise<UsageObservationV1[]> {
    const observations: UsageObservationV1[] = [];
    for (const entry of await this.safeReadDir(this.observationsRoot)) {
      if (!entry.endsWith(".jsonl")) {
        continue;
      }
      const raw = await fs.readFile(path.join(this.observationsRoot, entry), "utf8").catch(() => "");
      for (const line of raw.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as unknown;
          if (isValidObservation(parsed)) {
            observations.push(parsed);
          }
        } catch {
          // Corrupt historical lines are ignored by snapshot reads; collectors record diagnostics separately.
        }
      }
    }
    observations.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
    return observations;
  }

  private async safeReadDir(directory: string): Promise<string[]> {
    try {
      return await fs.readdir(directory);
    } catch {
      return [];
    }
  }
}

function buildUsageSnapshot(input: {
  observations: UsageObservationV1[];
  coverage: UsageAgentCoverage[];
  diagnostics: UsageDiagnostic[];
  filters: UsageSnapshotFilters;
}): UsageSnapshot {
  const generatedAt = new Date().toISOString();
  const limits = normalizeLimits(input.filters.limits);
  const range = normalizeRange(input.filters.range);
  const confidence = input.filters.filters?.confidence ?? ["observed"];
  const includeInferred = input.filters.filters?.includeInferred ?? false;
  const agents = input.filters.filters?.agents ?? [];
  const skillRefs = input.filters.filters?.skillRefs ?? [];
  const projectRefs = input.filters.filters?.projectRefs ?? [];
  const filtered = input.observations.filter((observation) => {
    const date = observation.observedAt.slice(0, 10);
    if (date < range.from || date > range.to) return false;
    if (!confidence.includes(observation.confidence)) return false;
    if (agents.length > 0 && !agents.includes(observation.agent)) return false;
    if (skillRefs.length > 0 && (!observation.skillRef || !skillRefs.includes(observation.skillRef))) return false;
    if (projectRefs.length > 0 && (!observation.projectRef || !projectRefs.includes(observation.projectRef))) return false;
    return true;
  });
  const observed = filtered.filter((item) => item.confidence === "observed");
  const inferred = filtered.filter((item) => item.confidence === "inferred");
  const coverageDates = input.observations.map((item) => item.observedAt.slice(0, 10)).sort();

  return {
    schemaVersion: USAGE_SCHEMA_VERSION,
    generatedAt,
    range: {
      from: range.from,
      to: range.to,
      coverageFrom: coverageDates[0] ?? null,
      coverageTo: coverageDates[coverageDates.length - 1] ?? null,
      preset: range.preset,
    },
    appliedFilters: {
      agents,
      skillRefs,
      projectRefs,
      confidence,
      includeInferred,
    },
    kpis: {
      observedUses: observed.length,
      activeSkills: new Set(observed.map((item) => item.skillRef).filter(Boolean)).size,
      activeAgents: new Set(observed.map((item) => item.agent)).size,
      activeProjects: new Set(observed.map((item) => item.projectRef).filter(Boolean)).size,
      lastObservedAt: observed.at(-1)?.observedAt ?? null,
      inferredSignals: inferred.length,
    },
    dailySeries: buildDailySeries(filtered),
    topSkills: buildTopSkills(filtered).slice(0, limits.topSkills),
    projectBreakdown: buildProjectBreakdown(filtered).slice(0, limits.projects),
    agentCoverage: input.coverage,
    recentObservations: [...filtered]
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
      .slice(0, limits.recentObservations)
      .map((observation) => ({
        observedAt: observation.observedAt,
        agent: observation.agent,
        skillRef: observation.skillRef,
        skillLabel: observation.skillRef ?? "Unmatched skill",
        projectRef: observation.projectRef,
        projectLabel: observation.projectLabel || DEFAULT_PROJECT_LABEL,
        evidenceKind: observation.evidenceKind,
        confidence: observation.confidence,
        outcome: observation.outcome,
        sourceKind: observation.sourceKind,
      })),
    diagnostics: input.diagnostics,
    truncation: {
      topSkillsTruncated: buildTopSkills(filtered).length > limits.topSkills,
      projectsTruncated: buildProjectBreakdown(filtered).length > limits.projects,
      recentObservationsTruncated: filtered.length > limits.recentObservations,
    },
  };
}

function buildDailySeries(observations: UsageObservationV1[]): UsageSnapshot["dailySeries"] {
  const buckets = new Map<string, UsageObservationV1[]>();
  for (const observation of observations) {
    const date = observation.observedAt.slice(0, 10);
    buckets.set(date, [...(buckets.get(date) ?? []), observation]);
  }

  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, items]) => {
    const agents = new Map<string, UsageObservationV1[]>();
    for (const item of items) {
      agents.set(item.agent, [...(agents.get(item.agent) ?? []), item]);
    }
    return {
      date,
      observedUses: items.filter((item) => item.confidence === "observed").length,
      inferredSignals: items.filter((item) => item.confidence === "inferred").length,
      byAgent: [...agents.entries()].map(([agent, agentItems]) => ({
        agent: agent as UsageSnapshot["dailySeries"][number]["byAgent"][number]["agent"],
        observedUses: agentItems.filter((item) => item.confidence === "observed").length,
        inferredSignals: agentItems.filter((item) => item.confidence === "inferred").length,
      })),
    };
  });
}

function buildTopSkills(observations: UsageObservationV1[]): UsageSnapshot["topSkills"] {
  const buckets = new Map<string, UsageObservationV1[]>();
  for (const observation of observations) {
    const key = observation.skillRef ?? "__unmatched__";
    buckets.set(key, [...(buckets.get(key) ?? []), observation]);
  }
  return [...buckets.entries()].map(([key, items]) => ({
    skillRef: key === "__unmatched__" ? null : key,
    skillLabel: key === "__unmatched__" ? "Unmatched skill" : key,
    inventoryStatus: key === "__unmatched__" ? "unknown" as const : "installed" as const,
    observedUses: items.filter((item) => item.confidence === "observed").length,
    inferredSignals: items.filter((item) => item.confidence === "inferred").length,
    lastObservedAt: items.filter((item) => item.confidence === "observed").at(-1)?.observedAt ?? null,
    agents: [...new Set(items.map((item) => item.agent))],
    projects: uniqueProjects(items),
  })).sort((left, right) => right.observedUses - left.observedUses || right.inferredSignals - left.inferredSignals);
}

function buildProjectBreakdown(observations: UsageObservationV1[]): UsageSnapshot["projectBreakdown"] {
  const buckets = new Map<string, UsageObservationV1[]>();
  for (const observation of observations) {
    const key = observation.projectRef ?? "__unknown__";
    buckets.set(key, [...(buckets.get(key) ?? []), observation]);
  }
  return [...buckets.entries()].map(([key, items]) => ({
    projectRef: key === "__unknown__" ? null : key,
    projectLabel: items[0]?.projectLabel || DEFAULT_PROJECT_LABEL,
    observedUses: items.filter((item) => item.confidence === "observed").length,
    inferredSignals: items.filter((item) => item.confidence === "inferred").length,
    activeSkills: new Set(items.filter((item) => item.confidence === "observed").map((item) => item.skillRef).filter(Boolean)).size,
    activeAgents: new Set(items.filter((item) => item.confidence === "observed").map((item) => item.agent)).size,
    lastObservedAt: items.filter((item) => item.confidence === "observed").at(-1)?.observedAt ?? null,
  })).sort((left, right) => right.observedUses - left.observedUses || right.inferredSignals - left.inferredSignals);
}

function uniqueProjects(observations: UsageObservationV1[]) {
  const projects = new Map<string, { projectRef: string | null; projectLabel: string }>();
  for (const observation of observations) {
    const key = observation.projectRef ?? "__unknown__";
    if (!projects.has(key)) {
      projects.set(key, {
        projectRef: observation.projectRef,
        projectLabel: observation.projectLabel || DEFAULT_PROJECT_LABEL,
      });
    }
  }
  return [...projects.values()];
}

function normalizeRange(range: UsageSnapshotFilters["range"]): UsageSnapshot["range"] {
  const today = new Date().toISOString().slice(0, 10);
  if (range?.from && range.to) {
    return { from: range.from, to: range.to, coverageFrom: null, coverageTo: null, preset: "custom" };
  }
  const preset = range?.preset ?? "30d";
  if (preset === "available") {
    return { from: "0000-01-01", to: today, coverageFrom: null, coverageTo: null, preset };
  }
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const fromDate = new Date(`${today}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: fromDate.toISOString().slice(0, 10), to: today, coverageFrom: null, coverageTo: null, preset };
}

function normalizeLimits(limits: UsageSnapshotFilters["limits"]) {
  return {
    topSkills: clampLimit(limits?.topSkills, 20, 100),
    projects: clampLimit(limits?.projects, 20, 100),
    recentObservations: clampLimit(limits?.recentObservations, 50, 200),
  };
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const safeValue = typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
  return Math.max(0, Math.min(max, safeValue));
}

function normalizeCoverageState(input: unknown): UsageCoverageState {
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === USAGE_SCHEMA_VERSION
  ) {
    const candidate = input as Partial<UsageCoverageState>;
    return {
      schemaVersion: USAGE_SCHEMA_VERSION,
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
      coverage: Array.isArray(candidate.coverage) ? candidate.coverage : [],
      diagnostics: Array.isArray(candidate.diagnostics) ? candidate.diagnostics : [],
    };
  }
  return {
    schemaVersion: USAGE_SCHEMA_VERSION,
    updatedAt: null,
    coverage: [],
    diagnostics: [],
  };
}

function isValidObservation(value: unknown): value is UsageObservationV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<UsageObservationV1>;
  return candidate.schemaVersion === USAGE_SCHEMA_VERSION &&
    typeof candidate.observationId === "string" &&
    typeof candidate.observedAt === "string" &&
    typeof candidate.agent === "string" &&
    (typeof candidate.skillRef === "string" || candidate.skillRef === null) &&
    typeof candidate.evidenceKind === "string" &&
    (candidate.confidence === "observed" || candidate.confidence === "inferred") &&
    typeof candidate.outcome === "string" &&
    typeof candidate.sourceKind === "string" &&
    typeof candidate.parserRevision === "string" &&
    (typeof candidate.projectRef === "string" || candidate.projectRef === null) &&
    typeof candidate.projectLabel === "string" &&
    JSON.stringify(candidate).length <= 1024;
}

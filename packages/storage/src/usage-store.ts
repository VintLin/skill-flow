import fs from "node:fs/promises";
import path from "node:path";
import type {
  UsageAgent,
  UsageAgentCoverage,
  UsageConfidence,
  UsageDiagnostic,
  UsageObservationV1,
  UsageRangePreset,
  UsageSourceKind,
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
  removedStale: number;
  acceptedObservations: UsageObservationV1[];
};

export type UsageObservationReplacementScope = {
  agent: UsageAgent;
  sourceKind: UsageSourceKind;
  parserRevision: string;
};

export type UsageCoverageState = {
  schemaVersion: 1;
  updatedAt: string | null;
  coverage: UsageAgentCoverage[];
  diagnostics: UsageDiagnostic[];
};

const USAGE_SCHEMA_VERSION = 1 as const;
const DEFAULT_PROJECT_LABEL = "Unknown project";
const USAGE_OBSERVATION_RETENTION_DAYS = 365;

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
        removedStale: 0,
        acceptedObservations: accepted,
      };
    });
  }

  async replaceObservationsForScopes(
    scopes: UsageObservationReplacementScope[],
    batch: UsageObservationV1[],
  ): Promise<UsageWriteResult> {
    return this.withUsageLock(async () => {
      await this.init();
      const scopeKeys = new Set(scopes.map(observationScopeKey));
      const existing = await this.readAllObservationsUnlocked();
      const retainedExisting = existing.filter((observation) => !scopeKeys.has(observationScopeKey(observation)));
      const removedStale = existing.length - retainedExisting.length;
      const existingIds = new Set(retainedExisting.map((item) => item.observationId));
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

      await this.replaceAllObservationsUnlocked([...retainedExisting, ...accepted]);

      return {
        accepted: accepted.length,
        duplicateSkipped,
        droppedInvalid,
        removedStale,
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
    cutoff.setUTCDate(cutoff.getUTCDate() - USAGE_OBSERVATION_RETENTION_DAYS);
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

  private async replaceAllObservationsUnlocked(observations: UsageObservationV1[]): Promise<void> {
    await ensureDir(this.observationsRoot);
    for (const entry of await this.safeReadDir(this.observationsRoot)) {
      if (entry.endsWith(".jsonl")) {
        await fs.rm(path.join(this.observationsRoot, entry), { force: true });
      }
    }
    const byDate = new Map<string, UsageObservationV1[]>();
    for (const observation of observations.sort((left, right) => left.observedAt.localeCompare(right.observedAt))) {
      const date = observation.observedAt.slice(0, 10);
      byDate.set(date, [...(byDate.get(date) ?? []), observation]);
    }
    for (const [date, dateObservations] of byDate) {
      const filePath = this.observationPath(date);
      const lines = dateObservations.map((observation) => JSON.stringify(observation)).join("\n");
      await fs.writeFile(filePath, `${lines}\n`, "utf8");
    }
  }

  private async safeReadDir(directory: string): Promise<string[]> {
    try {
      return await fs.readdir(directory);
    } catch {
      return [];
    }
  }
}

function observationScopeKey(scope: UsageObservationReplacementScope): string;
function observationScopeKey(observation: UsageObservationV1): string;
function observationScopeKey(value: UsageObservationReplacementScope | UsageObservationV1): string {
  return `${value.agent}:${value.sourceKind}:${value.parserRevision}`;
}

function buildUsageSnapshot(input: {
  observations: UsageObservationV1[];
  coverage: UsageAgentCoverage[];
  diagnostics: UsageDiagnostic[];
  filters: UsageSnapshotFilters;
}): UsageSnapshot {
  const generatedAt = new Date().toISOString();
  const limits = normalizeLimits(input.filters.limits);
  const range = normalizeRange(input.filters.range, input.observations);
  const confidence = input.filters.filters?.confidence ?? ["observed"];
  const includeInferred = input.filters.filters?.includeInferred ?? confidence.includes("inferred");
  const agents = input.filters.filters?.agents ?? [];
  const skillRefs = input.filters.filters?.skillRefs ?? [];
  const projectRefs = input.filters.filters?.projectRefs ?? [];
  const filtered = input.observations.filter((observation) => {
    const timestamp = Date.parse(observation.observedAt);
    if (!Number.isFinite(timestamp) || timestamp < Date.parse(range.startAt) || timestamp > Date.parse(range.endAt)) {
      return false;
    }
    if (!confidence.includes(observation.confidence)) return false;
    if (observation.confidence === "inferred" && !includeInferred) return false;
    if (agents.length > 0 && !agents.includes(observation.agent)) return false;
    if (skillRefs.length > 0 && (!observation.skillRef || !skillRefs.includes(observation.skillRef))) return false;
    if (projectRefs.length > 0 && (!observation.projectRef || !projectRefs.includes(observation.projectRef))) return false;
    return true;
  });
  const observed = filtered.filter((item) => item.confidence === "observed");
  const inferred = filtered.filter((item) => item.confidence === "inferred");
  const coverageDates = input.observations.map((item) => item.observedAt.slice(0, 10)).sort();
  const allTopSkills = buildTopSkills(observed);
  const allTopAgents = buildTopAgents(observed);
  const matrix = buildSkillAgentMatrix(observed);
  const chartSkillKeys = new Set(allTopSkills.slice(0, limits.topSkills).map((item) => item.key));

  return {
    schemaVersion: USAGE_SCHEMA_VERSION,
    generatedAt,
    range: {
      from: range.from,
      to: range.to,
      coverageFrom: coverageDates[0] ?? null,
      coverageTo: coverageDates[coverageDates.length - 1] ?? null,
      startAt: range.startAt,
      endAt: range.endAt,
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
      activeSkills: new Set(observed.map(skillGroupKey).filter((item) => item !== "__unmatched__")).size,
      activeAgents: new Set(observed.map((item) => item.agent)).size,
      activeProjects: new Set(observed.map((item) => item.projectRef).filter(Boolean)).size,
      lastObservedAt: observed.at(-1)?.observedAt ?? null,
      inferredSignals: inferred.length,
      totalSkills: 0,
      usedSkills: new Set(observed.map(skillGroupKey).filter((item) => item !== "__unmatched__")).size,
      skillRuns: observed.length,
      chatRecords: filtered.length,
    },
    dailySeries: buildDailySeries(filtered),
    topSkills: allTopSkills.slice(0, limits.topSkills),
    topAgents: allTopAgents.slice(0, limits.topAgents),
    timeBuckets: buildTimeBuckets(observed, range, chartSkillKeys),
    hourlyActivity: buildHourlyActivity(observed),
    skillAgentMatrix: matrix.slice(0, limits.matrixEntries),
    projectBreakdown: buildProjectBreakdown(filtered).slice(0, limits.projects),
    agentCoverage: input.coverage,
    recentObservations: [...filtered]
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
      .slice(0, limits.recentObservations)
      .map((observation) => ({
        observedAt: observation.observedAt,
        agent: observation.agent,
        skillRef: observation.skillRef,
        skillLabel: observation.skillLabel ?? observation.skillRef ?? "Unmatched skill",
        projectRef: observation.projectRef,
        projectLabel: observation.projectLabel || DEFAULT_PROJECT_LABEL,
        evidenceKind: observation.evidenceKind,
        confidence: observation.confidence,
        outcome: observation.outcome,
        sourceKind: observation.sourceKind,
      })),
    diagnostics: input.diagnostics,
    truncation: {
      topSkillsTruncated: allTopSkills.length > limits.topSkills,
      topAgentsTruncated: allTopAgents.length > limits.topAgents,
      projectsTruncated: buildProjectBreakdown(filtered).length > limits.projects,
      matrixTruncated: matrix.length > limits.matrixEntries,
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
    const key = skillGroupKey(observation);
    buckets.set(key, [...(buckets.get(key) ?? []), observation]);
  }
  return [...buckets.entries()].map(([key, items]) => ({
    key,
    skillRef: items[0]?.skillRef ?? null,
    skillLabel: skillGroupLabel(items[0]),
    inventoryStatus: items[0]?.skillRef ? "installed" as const : "unknown" as const,
    observedUses: items.filter((item) => item.confidence === "observed").length,
    inferredSignals: items.filter((item) => item.confidence === "inferred").length,
    lastObservedAt: items.filter((item) => item.confidence === "observed").at(-1)?.observedAt ?? null,
    agents: [...new Set(items.map((item) => item.agent))],
    projects: uniqueProjects(items),
  })).sort((left, right) => right.observedUses - left.observedUses || right.inferredSignals - left.inferredSignals);
}

function buildTopAgents(observations: UsageObservationV1[]): UsageSnapshot["topAgents"] {
  const buckets = new Map<string, UsageObservationV1[]>();
  for (const observation of observations) {
    buckets.set(observation.agent, [...(buckets.get(observation.agent) ?? []), observation]);
  }
  return [...buckets.entries()]
    .map(([agent, items]) => ({
      agent: agent as UsageSnapshot["topAgents"][number]["agent"],
      observedUses: items.length,
      activeSkills: new Set(items.map(skillGroupKey).filter((item) => item !== "__unmatched__")).size,
      activeProjects: new Set(items.map((item) => item.projectRef).filter(Boolean)).size,
      lastObservedAt: items.at(-1)?.observedAt ?? null,
    }))
    .sort((left, right) => right.observedUses - left.observedUses || left.agent.localeCompare(right.agent));
}

function buildSkillAgentMatrix(observations: UsageObservationV1[]): UsageSnapshot["skillAgentMatrix"] {
  const buckets = new Map<string, UsageObservationV1[]>();
  for (const observation of observations) {
    const key = `${skillGroupKey(observation)}:${observation.agent}`;
    buckets.set(key, [...(buckets.get(key) ?? []), observation]);
  }
  return [...buckets.entries()]
    .map(([key, items]) => ({
      skillKey: skillGroupKey(items[0]! ),
      skillRef: items[0]?.skillRef ?? null,
      skillLabel: skillGroupLabel(items[0]),
      agent: items[0]!.agent,
      observedUses: items.length,
      _sortKey: key,
    }))
    .sort((left, right) => right.observedUses - left.observedUses || left._sortKey.localeCompare(right._sortKey))
    .map(({ _sortKey: _ignored, ...entry }) => entry);
}

type NormalizedUsageRange = {
  from: string;
  to: string;
  startAt: string;
  endAt: string;
  preset: UsageRangePreset;
  unit: "hour" | "day";
};

function buildTimeBuckets(
  observations: UsageObservationV1[],
  range: NormalizedUsageRange,
  chartSkillKeys: Set<string>,
): UsageSnapshot["timeBuckets"] {
  const starts = bucketStarts(range, observations);
  const identities = new Map<string, { skillRef: string | null; skillLabel: string }>();
  for (const observation of observations) {
    const key = skillGroupKey(observation);
    if (!identities.has(key)) {
      identities.set(key, {
        skillRef: observation.skillRef,
        skillLabel: skillGroupLabel(observation),
      });
    }
  }

  return starts.map((start, index) => {
    const nextStart = starts[index + 1] ?? new Date(range.endAt);
    const bucketEnd = new Date(Math.min(nextStart.getTime(), Date.parse(range.endAt)));
    const items = observations.filter((observation) => {
      const timestamp = Date.parse(observation.observedAt);
      return timestamp >= start.getTime() && timestamp < bucketEnd.getTime();
    });
    const bySkill = countBy(items, skillGroupKey);
    const byAgent = countBy(items, (item) => item.agent);
    const bySkillAgent = countBy(items, (item) => `${skillGroupKey(item)}:${item.agent}`);
    return {
      key: bucketKey(start, range.unit),
      label: formatBucketLabel(start, range.unit),
      startAt: start.toISOString(),
      endAt: bucketEnd.toISOString(),
      observedUses: items.length,
      bySkill: [...bySkill.entries()]
        .filter(([key]) => chartSkillKeys.has(key))
        .map(([key, count]) => ({
          key,
          skillRef: identities.get(key)?.skillRef ?? null,
          skillLabel: identities.get(key)?.skillLabel ?? "Unmatched skill",
          observedUses: count,
        }))
        .sort((left, right) => right.observedUses - left.observedUses || left.key.localeCompare(right.key)),
      byAgent: [...byAgent.entries()]
        .map(([agent, count]) => ({ agent: agent as UsageSnapshot["topAgents"][number]["agent"], observedUses: count }))
        .sort((left, right) => right.observedUses - left.observedUses || left.agent.localeCompare(right.agent)),
      bySkillAgent: [...bySkillAgent.entries()]
        .map(([key, count]) => {
          const separator = key.lastIndexOf(":");
          return {
            skillKey: key.slice(0, separator),
            agent: key.slice(separator + 1) as UsageSnapshot["topAgents"][number]["agent"],
            observedUses: count,
          };
        })
        .sort((left, right) => right.observedUses - left.observedUses || left.skillKey.localeCompare(right.skillKey)),
    };
  });
}

function buildHourlyActivity(observations: UsageObservationV1[]): UsageSnapshot["hourlyActivity"] {
  const counts = new Map<string, number>();
  for (const observation of observations) {
    const date = new Date(observation.observedAt);
    const key = `${date.getDay()}:${date.getHours()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: 7 * 24 }, (_, index) => {
    const weekday = Math.floor(index / 24);
    const hour = index % 24;
    return { weekday, hour, observedUses: counts.get(`${weekday}:${hour}`) ?? 0 };
  });
}

function countBy<T>(items: UsageObservationV1[], keyFor: (item: UsageObservationV1) => T): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function bucketStarts(range: NormalizedUsageRange, observations: UsageObservationV1[]): Date[] {
  if (range.preset === "available") {
    const keys = [...new Set(observations.map((item) => localDateKey(new Date(item.observedAt))))].sort();
    return (keys.length > 0 ? keys : [range.from]).map(localDateStart);
  }
  const starts: Date[] = [];
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  for (let cursor = start; cursor <= end && starts.length < 3660; cursor = nextBucket(cursor, range.unit)) {
    starts.push(new Date(cursor));
  }
  return starts;
}

function nextBucket(value: Date, unit: "hour" | "day"): Date {
  const next = new Date(value);
  if (unit === "hour") next.setHours(next.getHours() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

function bucketKey(value: Date, unit: "hour" | "day"): string {
  return unit === "hour" ? `${localDateKey(value)}T${String(value.getHours()).padStart(2, "0")}:00` : localDateKey(value);
}

function formatBucketLabel(value: Date, unit: "hour" | "day"): string {
  if (unit === "hour") return `${String(value.getHours()).padStart(2, "0")}:00`;
  return `${value.getMonth() + 1}/${value.getDate()}`;
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
    activeSkills: new Set(items.filter((item) => item.confidence === "observed").map(skillGroupKey).filter((item) => item !== "__unmatched__")).size,
    activeAgents: new Set(items.filter((item) => item.confidence === "observed").map((item) => item.agent)).size,
    lastObservedAt: items.filter((item) => item.confidence === "observed").at(-1)?.observedAt ?? null,
  })).sort((left, right) => right.observedUses - left.observedUses || right.inferredSignals - left.inferredSignals);
}

function skillGroupKey(observation: UsageObservationV1): string {
  if (observation.skillRef) {
    return `ref:${observation.skillRef}`;
  }
  const label = observation.skillLabel?.trim();
  return label ? `label:${label.toLowerCase()}` : "__unmatched__";
}

function skillGroupLabel(observation: UsageObservationV1 | undefined): string {
  if (!observation) {
    return "Unmatched skill";
  }
  return observation.skillLabel ?? observation.skillRef ?? "Unmatched skill";
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

function normalizeRange(
  range: UsageSnapshotFilters["range"],
  observations: UsageObservationV1[],
): NormalizedUsageRange {
  const now = new Date();
  const today = localDateKey(now);
  if (range?.from && range.to) {
    const start = localDateStart(range.from);
    const end = localDateEnd(range.to);
    return {
      from: localDateKey(start),
      to: localDateKey(end),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      preset: "custom",
      unit: "day",
    };
  }

  const preset = range?.preset ?? "30d";
  if (preset === "available") {
    const observationDates = observations
      .map((item) => new Date(item.observedAt))
      .filter((item) => Number.isFinite(item.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());
    const start = observationDates[0] ? localDateStart(localDateKey(observationDates[0])) : localDateStart(today);
    return {
      from: localDateKey(start),
      to: today,
      startAt: start.toISOString(),
      endAt: now.toISOString(),
      preset,
      unit: "day",
    };
  }

  if (preset === "24h") {
    const endHour = new Date(now);
    endHour.setMinutes(0, 0, 0);
    const startHour = new Date(endHour);
    startHour.setHours(startHour.getHours() - 23);
    return {
      from: localDateKey(startHour),
      to: today,
      startAt: startHour.toISOString(),
      endAt: now.toISOString(),
      preset,
      unit: "hour",
    };
  }

  const days = preset === "today" ? 1 : preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const start = localDateStart(today);
  start.setDate(start.getDate() - (days - 1));
  return {
    from: localDateKey(start),
    to: today,
    startAt: start.toISOString(),
    endAt: now.toISOString(),
    preset,
    unit: "day",
  };
}

function normalizeLimits(limits: UsageSnapshotFilters["limits"]) {
  return {
    topSkills: clampLimit(limits?.topSkills, 20, 100),
    topAgents: clampLimit(limits?.topAgents, 20, 100),
    projects: clampLimit(limits?.projects, 20, 100),
    matrixEntries: clampLimit(limits?.matrixEntries, 400, 5000),
    recentObservations: clampLimit(limits?.recentObservations, 50, 200),
  };
}

function localDateStart(value: string): Date {
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined || ![year, month, day].every(Number.isFinite)) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function localDateEnd(value: string): Date {
  const date = localDateStart(value);
  date.setDate(date.getDate() + 1);
  date.setMilliseconds(date.getMilliseconds() - 1);
  return date;
}

function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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
    (candidate.skillLabel === undefined || typeof candidate.skillLabel === "string") &&
    typeof candidate.evidenceKind === "string" &&
    (candidate.confidence === "observed" || candidate.confidence === "inferred") &&
    typeof candidate.outcome === "string" &&
    typeof candidate.sourceKind === "string" &&
    typeof candidate.parserRevision === "string" &&
    (typeof candidate.projectRef === "string" || candidate.projectRef === null) &&
    typeof candidate.projectLabel === "string" &&
    JSON.stringify(candidate).length <= 1024;
}

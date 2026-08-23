import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  LeafRecord,
  UsageAgent,
  UsageAgentCoverage,
  UsageCollectorObservation,
  UsageDiagnostic,
  UsageObservationV1,
  UsageRefreshBudget,
  UsageRefreshSummary,
  UsageRefreshTrigger,
  UsageSnapshot,
  UsageSnapshotFilters,
} from "@skill-flow/domain/types";
import type { UsageCoverageState, UsageStore } from "@skill-flow/storage/usage-store";
import type { UsageCollector } from "@skill-flow/integration/utils/usage-collectors";

const USAGE_SCHEMA_VERSION = 1 as const;
const DEFAULT_PROJECT_LABEL = "Unknown project";
const USAGE_OBSERVATION_RETENTION_DAYS = 365;

export const DEFAULT_USAGE_REFRESH_BUDGET: UsageRefreshBudget = {
  globalBudgetMs: 30000,
  perSourceBudgetMs: 5000,
  maxFiles: 500,
  maxBytes: 536870912,
  cooldownSeconds: 900,
};

export type SkillUsageServiceOptions = {
  store: UsageStore;
  collectors: UsageCollector[];
  supportedAgents?: UsageAgent[];
  readLeafInventory: () => Promise<LeafRecord[]>;
  localSalt: string;
  budget?: UsageRefreshBudget;
};

export class SkillUsageService {
  private readonly budget: UsageRefreshBudget;

  constructor(private readonly options: SkillUsageServiceOptions) {
    this.budget = options.budget ?? DEFAULT_USAGE_REFRESH_BUDGET;
  }

  async refreshUsageObservations(args: {
    trigger?: UsageRefreshTrigger;
    now?: Date;
  } = {}): Promise<UsageRefreshSummary> {
    const now = args.now ?? new Date();
    const refreshedAt = now.toISOString();
    const trigger = args.trigger ?? "scheduled";
    const existingCoverage = await this.options.store.readCoverageState();
    if (this.isCooldownActive(existingCoverage, now)) {
      return {
        schemaVersion: USAGE_SCHEMA_VERSION,
        refreshedAt,
        trigger,
        status: "skipped",
        skippedReason: "cooldown_active",
        budget: this.budget,
        totals: {
          sourcesFound: 0,
          sourcesScanned: 0,
          observedAccepted: 0,
          inferredAccepted: 0,
          duplicateSkipped: 0,
          droppedInvalid: 0,
          diagnosticsCount: existingCoverage.diagnostics.length,
        },
        coverage: existingCoverage.coverage,
        diagnostics: existingCoverage.diagnostics,
      };
    }

    const skillIndex = buildSkillIndex(await this.options.readLeafInventory());
    const startedAt = Date.now();
    const coverage: UsageAgentCoverage[] = [];
    const diagnostics: UsageDiagnostic[] = [];
    const collected: UsageObservationV1[] = [];
    let sourcesFound = 0;
    let sourcesScanned = 0;

    for (const collector of this.options.collectors) {
      if (Date.now() - startedAt >= this.budget.globalBudgetMs) {
        coverage.push({
          agent: collector.agent,
          sourceKind: "local-session",
          parserRevision: collector.parserRevision,
          status: "budget_exhausted",
          lastScannedAt: refreshedAt,
          coverageFrom: null,
          coverageTo: null,
          observedUses: 0,
          inferredSignals: 0,
          diagnosticsCount: 1,
        });
        diagnostics.push(diagnostic("BUDGET_EXHAUSTED", collector.agent, "warning", refreshedAt));
        continue;
      }

      const locatedSources = await collector.locateSources();
      sourcesFound += locatedSources.length;
      const result = await collector.scan({
        now,
        budget: {
          perSourceBudgetMs: this.budget.perSourceBudgetMs,
          maxFiles: this.budget.maxFiles,
          maxBytes: this.budget.maxBytes,
        },
      });
      if (result.coverage.status !== "not_found") {
        sourcesScanned += 1;
      }
      const mappedObservations = await Promise.all(
        result.observations.map((observation) => this.toStoredObservation(observation, skillIndex)),
      );
      const acceptedMappedObservations = mappedObservations.filter((item): item is UsageObservationV1 => Boolean(item));
      collected.push(...acceptedMappedObservations);
      coverage.push(withCoverageRange(result.coverage, acceptedMappedObservations));
      diagnostics.push(...result.diagnostics);
      diagnostics.push(...buildUnmatchedSkillDiagnostics(result.observations, mappedObservations, refreshedAt));
    }

    appendUnsupportedAgentCoverage({
      coverage,
      diagnostics,
      supportedAgents: this.options.supportedAgents ?? [],
      implementedAgents: this.options.collectors.map((collector) => collector.agent),
      timestamp: refreshedAt,
    });

    const retainedObservations = collected.filter((observation) => isWithinRetentionWindow(observation, now));
    const writeResult = await this.options.store.appendObservations(retainedObservations);
    const storedDiagnostics = compactDiagnostics(diagnostics);
    await this.options.store.writeCoverageState({
      schemaVersion: USAGE_SCHEMA_VERSION,
      updatedAt: refreshedAt,
      coverage,
      diagnostics: storedDiagnostics,
    });
    await this.options.store.pruneIfDue(now);

    return {
      schemaVersion: USAGE_SCHEMA_VERSION,
      refreshedAt,
      trigger,
      status: coverage.some((item) => item.status === "partial" || item.status === "budget_exhausted")
        ? "partial"
        : "completed",
      budget: this.budget,
      totals: {
        sourcesFound,
        sourcesScanned,
        observedAccepted: writeResult.acceptedObservations.filter((item) => item.confidence === "observed").length,
        inferredAccepted: writeResult.acceptedObservations.filter((item) => item.confidence === "inferred").length,
        duplicateSkipped: writeResult.duplicateSkipped,
        droppedInvalid: writeResult.droppedInvalid,
        diagnosticsCount: storedDiagnostics.length,
      },
      coverage,
      diagnostics: storedDiagnostics,
    };
  }

  async getUsageSnapshot(filters: UsageSnapshotFilters = {}): Promise<UsageSnapshot> {
    const [snapshot, leafInventory] = await Promise.all([
      this.options.store.readSnapshot(filters),
      this.options.readLeafInventory(),
    ]);
    return applySkillLabels(snapshot, leafInventory);
  }

  private isCooldownActive(state: UsageCoverageState, now: Date): boolean {
    if (!state.updatedAt) {
      return false;
    }
    const updatedAt = new Date(state.updatedAt).getTime();
    if (!Number.isFinite(updatedAt)) {
      return false;
    }
    return now.getTime() - updatedAt < this.budget.cooldownSeconds * 1000;
  }

  private async toStoredObservation(
    observation: UsageCollectorObservation,
    skillIndex: Map<string, LeafRecord>,
  ): Promise<UsageObservationV1 | null> {
    const skill = observation.rawSkillName ? findSkill(skillIndex, observation.rawSkillName) : null;
    if (observation.requiresKnownSkillMatch && !skill) {
      return null;
    }
    const skillLabel = sanitizedSkillLabel(observation.rawSkillName);
    const project = await anonymizeProject(observation.rawProjectPath, this.options.localSalt);
    const observationId = hashStable([
      this.options.localSalt,
      observation.agent,
      observation.parserRevision,
      observation.sourceEventId,
      skill?.id ?? "unmatched",
      project.projectRef ?? "unknown-project",
    ]);
    return {
      schemaVersion: USAGE_SCHEMA_VERSION,
      observationId,
      observedAt: observation.observedAt,
      agent: observation.agent,
      skillRef: skill?.id ?? null,
      ...(skillLabel ? { skillLabel } : {}),
      evidenceKind: observation.evidenceKind,
      confidence: observation.confidence,
      outcome: observation.outcome,
      sourceKind: observation.sourceKind,
      parserRevision: observation.parserRevision,
      projectRef: project.projectRef,
      projectLabel: project.projectLabel,
    };
  }
}

function appendUnsupportedAgentCoverage(args: {
  coverage: UsageAgentCoverage[];
  diagnostics: UsageDiagnostic[];
  supportedAgents: UsageAgent[];
  implementedAgents: UsageAgent[];
  timestamp: string;
}): void {
  const coveredAgents = new Set(args.coverage.map((item) => item.agent));
  const implementedAgents = new Set(args.implementedAgents);
  for (const agent of args.supportedAgents) {
    if (coveredAgents.has(agent) || implementedAgents.has(agent)) {
      continue;
    }
    args.coverage.push({
      agent,
      sourceKind: null,
      parserRevision: null,
      status: "parser_unsupported",
      lastScannedAt: args.timestamp,
      coverageFrom: null,
      coverageTo: null,
      observedUses: 0,
      inferredSignals: 0,
      diagnosticsCount: 1,
    });
    args.diagnostics.push(diagnostic("PARSER_UNSUPPORTED", agent, "info", args.timestamp));
  }
}

function sanitizedSkillLabel(value: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 120);
}

function buildSkillIndex(leafInventory: LeafRecord[]): Map<string, LeafRecord> {
  const index = new Map<string, LeafRecord>();
  for (const leaf of leafInventory) {
    if (leaf.valid === false) {
      continue;
    }
    for (const value of [
      leaf.id,
      leaf.name,
      leaf.linkName,
      leaf.title,
      leaf.selectors?.providerSkillId,
      ...(leaf.selectors?.aliases ?? []),
    ]) {
      const key = normalizeSkillKey(value);
      if (key && !index.has(key)) {
        index.set(key, leaf);
      }
    }
  }
  return index;
}

function findSkill(index: Map<string, LeafRecord>, rawSkillName: string): LeafRecord | null {
  for (const candidate of skillNameCandidates(rawSkillName)) {
    const matched = index.get(candidate);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function skillNameCandidates(rawSkillName: string): string[] {
  const trimmed = rawSkillName.trim();
  const withoutPrefix = trimmed.includes(":") ? trimmed.split(":").at(-1) ?? trimmed : trimmed;
  const withoutPath = path.basename(withoutPrefix);
  const values = [
    trimmed,
    withoutPrefix,
    withoutPath,
    withoutPath.replace(/\.md$/i, ""),
    trimmed.replace(/^\$/, ""),
    withoutPrefix.replace(/^\$/, ""),
  ];
  return [...new Set(values.map(normalizeSkillKey).filter((value): value is string => Boolean(value)))];
}

function normalizeSkillKey(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\\/g, "/").replace(/^skills\//, "");
  return normalized || null;
}

async function anonymizeProject(
  rawProjectPath: string | undefined,
  localSalt: string,
): Promise<{ projectRef: string | null; projectLabel: string }> {
  const trimmed = rawProjectPath?.trim();
  if (!trimmed) {
    return { projectRef: null, projectLabel: DEFAULT_PROJECT_LABEL };
  }
  const resolved = await fs.realpath(trimmed).catch(() => path.resolve(trimmed));
  return {
    projectRef: hashStable([localSalt, "project", resolved]),
    projectLabel: path.basename(resolved) || DEFAULT_PROJECT_LABEL,
  };
}

function withCoverageRange(
  coverage: UsageAgentCoverage,
  observations: UsageObservationV1[],
): UsageAgentCoverage {
  const dates = observations.map((item) => item.observedAt).sort();
  return {
    ...coverage,
    coverageFrom: dates[0] ?? coverage.coverageFrom,
    coverageTo: dates[dates.length - 1] ?? coverage.coverageTo,
    observedUses: observations.filter((item) => item.confidence === "observed").length,
    inferredSignals: observations.filter((item) => item.confidence === "inferred").length,
  };
}

function buildUnmatchedSkillDiagnostics(
  rawObservations: UsageCollectorObservation[],
  storedObservations: Array<UsageObservationV1 | null>,
  timestamp: string,
): UsageDiagnostic[] {
  const unmatchedCount = storedObservations.filter((item, index) =>
    item && !item.skillRef && Boolean(rawObservations[index]?.rawSkillName)
  ).length;
  return unmatchedCount > 0
    ? [diagnostic("UNMATCHED_SKILL", rawObservations[0]?.agent ?? "unknown", "warning", timestamp, unmatchedCount)]
    : [];
}

function isWithinRetentionWindow(observation: UsageObservationV1, now: Date): boolean {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - USAGE_OBSERVATION_RETENTION_DAYS);
  return observation.observedAt.slice(0, 10) >= cutoff.toISOString().slice(0, 10);
}

function compactDiagnostics(diagnostics: UsageDiagnostic[]): UsageDiagnostic[] {
  const groups = new Map<string, UsageDiagnostic>();
  for (const item of diagnostics) {
    const key = `${item.code}:${item.agent ?? "all"}:${item.severity}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...item });
      continue;
    }
    existing.count += item.count;
    existing.firstSeenAt = minNullableIso(existing.firstSeenAt, item.firstSeenAt);
    existing.lastSeenAt = maxNullableIso(existing.lastSeenAt, item.lastSeenAt);
  }
  return [...groups.values()];
}

function minNullableIso(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function maxNullableIso(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function applySkillLabels(snapshot: UsageSnapshot, leafInventory: LeafRecord[]): UsageSnapshot {
  const leafsById = new Map(leafInventory.map((leaf) => [leaf.id, leaf]));
  const labelFor = (skillRef: string | null, fallback: string) => {
    if (!skillRef) return fallback;
    const leaf = leafsById.get(skillRef);
    return leaf?.title || leaf?.linkName || fallback;
  };
  return {
    ...snapshot,
    topSkills: snapshot.topSkills.map((item) => ({
      ...item,
      skillLabel: labelFor(item.skillRef, item.skillLabel),
      inventoryStatus: item.skillRef && leafsById.has(item.skillRef) ? "installed" : item.inventoryStatus,
    })),
    recentObservations: snapshot.recentObservations.map((item) => ({
      ...item,
      skillLabel: labelFor(item.skillRef, item.skillLabel),
    })),
  };
}

function diagnostic(
  code: UsageDiagnostic["code"],
  agent: UsageDiagnostic["agent"],
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

function hashStable(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

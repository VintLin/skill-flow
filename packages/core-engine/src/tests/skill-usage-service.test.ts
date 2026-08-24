import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type {
  LeafRecord,
  UsageAgentCoverage,
  UsageCollectorObservation,
  UsageDiagnostic,
} from "@skill-flow/domain/types";
import type {
  UsageCollector,
  UsageCollectorScanInput,
  UsageCollectorScanResult,
} from "@skill-flow/integration/utils/usage-collectors";
import { TARGET_ORDER } from "@skill-flow/integration/utils/constants";
import { UsageStore } from "@skill-flow/storage/usage-store";
import { SkillUsageService } from "../services/skill-usage-service.js";

describe("SkillUsageService", () => {
  test("maps observed skill calls to installed leafs and anonymizes project paths", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-"));
    const projectPath = path.join(stateRoot, "private", "client-project");
    await fs.mkdir(projectPath, { recursive: true });
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([{
          sourceEventId: "event-1",
          observedAt: "2026-08-23T00:00:00.000Z",
          agent: "claude-code",
          rawSkillName: "$wayfinder",
          rawProjectPath: projectPath,
          evidenceKind: "tool_call",
          confidence: "observed",
          outcome: "unknown",
          sourceKind: "local-session",
          parserRevision: "test@1",
          projectRef: null,
          projectLabel: "Unknown project",
        }]),
      ],
      readLeafInventory: async () => [leaf("leaf-wayfinder", "wayfinder", "Wayfinder")],
      localSalt: stateRoot,
    });

    const summary = await service.refreshUsageObservations({
      trigger: "bootstrap",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });
    const observations = await store.readObservations();
    const persisted = await fs.readFile(path.join(store.observationsRoot, "2026-08-23.jsonl"), "utf8");

    expect(summary.totals).toMatchObject({
      observedAccepted: 1,
      inferredAccepted: 0,
      duplicateSkipped: 0,
    });
    expect(observations[0]).toMatchObject({
      skillRef: "leaf-wayfinder",
      skillLabel: "$wayfinder",
      projectLabel: "client-project",
    });
    expect(observations[0]?.projectRef).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted).not.toContain(projectPath);
    expect(persisted).not.toContain("sourceEventId");
    expect(persisted).not.toContain("rawSkillName");
  });

  test("records unmatched skill diagnostics without counting lifecycle events", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-unmatched-"));
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([{
          sourceEventId: "event-1",
          observedAt: "2026-08-23T00:00:00.000Z",
          agent: "claude-code",
          rawSkillName: "missing-skill",
          evidenceKind: "tool_call",
          confidence: "observed",
          outcome: "unknown",
          sourceKind: "local-session",
          parserRevision: "test@1",
          projectRef: null,
          projectLabel: "Unknown project",
        }]),
      ],
      readLeafInventory: async () => [],
      localSalt: stateRoot,
    });

    const summary = await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });
    const snapshot = await service.getUsageSnapshot({ range: { preset: "available" } });

    expect(summary.diagnostics).toContainEqual(expect.objectContaining({
      code: "UNMATCHED_SKILL",
      count: 1,
    }));
    expect(snapshot.kpis.observedUses).toBe(1);
    expect(snapshot.topSkills[0]).toMatchObject({
      skillRef: null,
      skillLabel: "missing-skill",
      inventoryStatus: "unknown",
    });
  });

  test("drops explicit skill commands that do not match installed inventory", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-explicit-drop-"));
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([{
          sourceEventId: "event-1",
          observedAt: "2026-08-23T00:00:00.000Z",
          agent: "codex",
          rawSkillName: "not-a-known-skill",
          evidenceKind: "explicit_command",
          confidence: "observed",
          outcome: "unknown",
          sourceKind: "local-session",
          parserRevision: "test@1",
          projectRef: null,
          projectLabel: "Unknown project",
          requiresKnownSkillMatch: true,
        }], "codex"),
      ],
      readLeafInventory: async () => [leaf("leaf-wayfinder", "wayfinder", "Wayfinder")],
      localSalt: stateRoot,
    });

    const summary = await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });
    const snapshot = await service.getUsageSnapshot({ range: { preset: "available" } });

    expect(summary.totals.observedAccepted).toBe(0);
    expect(summary.coverage[0]).toMatchObject({ agent: "codex", observedUses: 0 });
    expect(summary.diagnostics).not.toContainEqual(expect.objectContaining({ code: "UNMATCHED_SKILL" }));
    expect(snapshot.kpis.observedUses).toBe(0);
  });

  test("accepts explicit skill commands that match installed inventory", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-explicit-accept-"));
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([{
          sourceEventId: "event-1",
          observedAt: "2026-08-23T00:00:00.000Z",
          agent: "codex",
          rawSkillName: "$wayfinder",
          evidenceKind: "explicit_command",
          confidence: "observed",
          outcome: "unknown",
          sourceKind: "local-session",
          parserRevision: "test@1",
          projectRef: null,
          projectLabel: "Unknown project",
          requiresKnownSkillMatch: true,
        }], "codex"),
      ],
      readLeafInventory: async () => [leaf("leaf-wayfinder", "wayfinder", "Wayfinder")],
      localSalt: stateRoot,
    });

    const summary = await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });
    const snapshot = await service.getUsageSnapshot({ range: { preset: "available" } });

    expect(summary.totals.observedAccepted).toBe(1);
    expect(snapshot.kpis.observedUses).toBe(1);
    expect(snapshot.topSkills[0]).toMatchObject({
      skillRef: "leaf-wayfinder",
      skillLabel: "Wayfinder",
      inventoryStatus: "installed",
    });
  });

  test("uses a de-duplicated valid inventory count without changing usage totals", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-kpis-"));
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([
          {
            sourceEventId: "event-1",
            observedAt: "2026-08-23T00:00:00.000Z",
            agent: "codex",
            rawSkillName: "wayfinder",
            evidenceKind: "explicit_command",
            confidence: "observed",
            outcome: "unknown",
            sourceKind: "local-session",
            parserRevision: "test@1",
            projectRef: null,
            projectLabel: "Unknown project",
          },
          {
            sourceEventId: "event-2",
            observedAt: "2026-08-23T00:01:00.000Z",
            agent: "codex",
            rawSkillName: "wayfinder",
            evidenceKind: "explicit_command",
            confidence: "observed",
            outcome: "unknown",
            sourceKind: "local-session",
            parserRevision: "test@1",
            projectRef: null,
            projectLabel: "Unknown project",
          },
        ]),
      ],
      readLeafInventory: async () => [
        leaf("leaf-wayfinder", "wayfinder", "Wayfinder"),
        leaf("leaf-wayfinder", "wayfinder-copy", "Wayfinder duplicate"),
        { ...leaf("leaf-invalid", "invalid", "Invalid"), valid: false },
      ],
      localSalt: stateRoot,
    });

    await service.refreshUsageObservations({
      trigger: "bootstrap",
      now: new Date("2026-08-23T00:02:00.000Z"),
    });
    const snapshot = await service.getUsageSnapshot({ range: { preset: "available" } });

    expect(snapshot.kpis).toMatchObject({
      totalSkills: 1,
      usedSkills: 1,
      skillRuns: 2,
      observedUses: 2,
    });
    expect(snapshot.timeBuckets.flatMap((bucket) => bucket.bySkill)).toEqual([
      expect.objectContaining({ skillRef: "leaf-wayfinder", skillLabel: "Wayfinder", observedUses: 2 }),
    ]);
  });

  test("does not report expired observations as accepted after retention pruning", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-retention-"));
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([{
          sourceEventId: "event-old",
          observedAt: "2025-03-03T00:00:00.000Z",
          agent: "claude-code",
          rawSkillName: "wayfinder",
          evidenceKind: "tool_call",
          confidence: "observed",
          outcome: "unknown",
          sourceKind: "local-session",
          parserRevision: "test@1",
          projectRef: null,
          projectLabel: "Unknown project",
        }]),
      ],
      readLeafInventory: async () => [leaf("leaf-wayfinder", "wayfinder", "Wayfinder")],
      localSalt: stateRoot,
    });

    const summary = await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:00:00.000Z"),
    });

    expect(summary.coverage[0]).toMatchObject({ observedUses: 1 });
    expect(summary.totals.observedAccepted).toBe(0);
    expect(await store.readObservations()).toEqual([]);
  });

  test("reports unsupported agents in coverage without treating them as zero-use scans", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-coverage-"));
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([{
          sourceEventId: "event-1",
          observedAt: "2026-08-23T00:00:00.000Z",
          agent: "codex",
          rawSkillName: "wayfinder",
          evidenceKind: "tool_call",
          confidence: "observed",
          outcome: "unknown",
          sourceKind: "local-session",
          parserRevision: "test@1",
          projectRef: null,
          projectLabel: "Unknown project",
        }], "codex"),
      ],
      supportedAgents: ["codex", "opencode", "zcode"],
      readLeafInventory: async () => [leaf("leaf-wayfinder", "wayfinder", "Wayfinder")],
      localSalt: stateRoot,
    });

    const summary = await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });

    expect(summary.coverage).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent: "codex", status: "scanned", observedUses: 1 }),
      expect.objectContaining({
        agent: "opencode",
        status: "parser_unsupported",
        sourceKind: null,
        parserRevision: null,
        observedUses: 0,
      }),
      expect.objectContaining({
        agent: "zcode",
        status: "parser_unsupported",
        sourceKind: null,
        parserRevision: null,
        observedUses: 0,
      }),
    ]));
    expect(summary.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent: "opencode", code: "PARSER_UNSUPPORTED" }),
      expect.objectContaining({ agent: "zcode", code: "PARSER_UNSUPPORTED" }),
    ]));
    expect(summary.totals.observedAccepted).toBe(1);
  });

  test("reports every supported agent without a collector as parser_unsupported", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-all-coverage-"));
    const store = new UsageStore(stateRoot);
    const service = new SkillUsageService({
      store,
      collectors: [
        new StaticUsageCollector([{
          sourceEventId: "event-1",
          observedAt: "2026-08-23T00:00:00.000Z",
          agent: "codex",
          rawSkillName: "wayfinder",
          evidenceKind: "tool_call",
          confidence: "observed",
          outcome: "unknown",
          sourceKind: "local-session",
          parserRevision: "test@1",
          projectRef: null,
          projectLabel: "Unknown project",
        }], "codex"),
      ],
      supportedAgents: TARGET_ORDER,
      readLeafInventory: async () => [leaf("leaf-wayfinder", "wayfinder", "Wayfinder")],
      localSalt: stateRoot,
    });

    const summary = await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });
    const coverageByAgent = new Map(summary.coverage.map((item) => [item.agent, item]));
    const unsupportedCoverage = summary.coverage.filter((item) => item.agent !== "codex");

    expect(summary.coverage.map((item) => item.agent)).toEqual(TARGET_ORDER);
    expect(coverageByAgent.get("codex")).toMatchObject({ status: "scanned", observedUses: 1 });
    expect(unsupportedCoverage).toHaveLength(TARGET_ORDER.length - 1);
    expect(unsupportedCoverage.every((item) =>
      item.status === "parser_unsupported"
      && item.sourceKind === null
      && item.parserRevision === null
      && item.observedUses === 0
      && item.inferredSignals === 0
    )).toBe(true);
    expect(summary.diagnostics.filter((item) => item.code === "PARSER_UNSUPPORTED")).toHaveLength(
      TARGET_ORDER.length - 1,
    );
  });

  test("manual refresh bypasses cooldown and scans latest local usage", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-service-manual-refresh-"));
    const store = new UsageStore(stateRoot);
    const collector = new MutableUsageCollector([{
      sourceEventId: "event-1",
      observedAt: "2026-08-23T00:00:00.000Z",
      agent: "codex",
      rawSkillName: "wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "test@1",
      projectRef: null,
      projectLabel: "Unknown project",
    }]);
    const service = new SkillUsageService({
      store,
      collectors: [collector],
      readLeafInventory: async () => [leaf("leaf-wayfinder", "wayfinder", "Wayfinder")],
      localSalt: stateRoot,
    });

    await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:01:00.000Z"),
    });
    collector.observations = [{
      ...collector.observations[0]!,
      sourceEventId: "event-2",
      observedAt: "2026-08-23T00:02:00.000Z",
    }];

    const scheduled = await service.refreshUsageObservations({
      trigger: "scheduled",
      now: new Date("2026-08-23T00:02:30.000Z"),
    });
    const manual = await service.refreshUsageObservations({
      trigger: "manual",
      now: new Date("2026-08-23T00:03:00.000Z"),
    });

    expect(scheduled.status).toBe("skipped");
    expect(scheduled.skippedReason).toBe("cooldown_active");
    expect(manual.status).toBe("completed");
    expect(manual.totals.observedAccepted).toBe(1);
    expect(await store.readObservations()).toEqual([
      expect.objectContaining({ observedAt: "2026-08-23T00:02:00.000Z" }),
    ]);
  });
});

class StaticUsageCollector implements UsageCollector {
  readonly agent: UsageCollector["agent"];
  readonly parserRevision = "test@1";

  constructor(
    private readonly observations: UsageCollectorObservation[],
    agent: UsageCollector["agent"] = "claude-code",
  ) {
    this.agent = agent;
  }

  async locateSources(): Promise<string[]> {
    return ["/tmp/fake-claude"];
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return {
      observations: this.observations,
      coverage: coverage(input.now.toISOString(), this.observations.length, this.agent),
      diagnostics: [],
    };
  }
}

class MutableUsageCollector implements UsageCollector {
  readonly agent = "codex" as const;
  readonly parserRevision = "test@1";

  constructor(public observations: UsageCollectorObservation[]) {}

  async locateSources(): Promise<string[]> {
    return ["/tmp/fake-codex"];
  }

  async scan(input: UsageCollectorScanInput): Promise<UsageCollectorScanResult> {
    return {
      observations: this.observations,
      coverage: coverage(input.now.toISOString(), this.observations.length, this.agent),
      diagnostics: [],
    };
  }
}

function coverage(
  scannedAt: string,
  observedUses: number,
  agent: UsageCollector["agent"] = "claude-code",
): UsageAgentCoverage {
  return {
    agent,
    sourceKind: "local-session",
    parserRevision: "test@1",
    status: "scanned",
    lastScannedAt: scannedAt,
    coverageFrom: null,
    coverageTo: null,
    observedUses,
    inferredSignals: 0,
    diagnosticsCount: 0,
  };
}

function leaf(id: string, linkName: string, title: string): LeafRecord {
  return {
    id,
    sourceId: "source-1",
    name: linkName,
    relativePath: `skills/${linkName}`,
    linkName,
    title,
    description: `${title} description.`,
    absolutePath: `/tmp/source/skills/${linkName}`,
    skillFilePath: `/tmp/source/skills/${linkName}/SKILL.md`,
    contentHash: "hash",
    selectors: { aliases: [linkName] },
    valid: true,
  };
}

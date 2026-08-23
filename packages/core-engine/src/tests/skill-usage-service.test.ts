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

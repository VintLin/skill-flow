import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { UsageObservationV1 } from "@skill-flow/domain/types";
import { UsageStore } from "../usage-store.js";

describe("UsageStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("deduplicates observations and builds a bounded snapshot", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-store-"));
    const store = new UsageStore(stateRoot);
    const observation: UsageObservationV1 = {
      schemaVersion: 1,
      observationId: "obs-1",
      observedAt: "2026-08-23T00:00:00.000Z",
      agent: "claude-code",
      skillRef: "leaf-wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "test@1",
      projectRef: "project-hash",
      projectLabel: "project-a",
    };

    const firstWrite = await store.appendObservations([observation]);
    const secondWrite = await store.appendObservations([observation]);
    const snapshot = await store.readSnapshot({ range: { preset: "available" } });

    expect(firstWrite).toMatchObject({ accepted: 1, duplicateSkipped: 0, droppedInvalid: 0 });
    expect(secondWrite).toMatchObject({ accepted: 0, duplicateSkipped: 1, droppedInvalid: 0 });
    expect(snapshot.kpis).toMatchObject({
      observedUses: 1,
      activeSkills: 1,
      activeAgents: 1,
      activeProjects: 1,
    });
    expect(snapshot.topSkills[0]).toMatchObject({
      skillRef: "leaf-wayfinder",
      observedUses: 1,
    });
  });

  test("groups unmatched observations by stored skill labels", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-store-labels-"));
    const store = new UsageStore(stateRoot);
    const baseObservation: UsageObservationV1 = {
      schemaVersion: 1,
      observationId: "obs-raw-1",
      observedAt: "2026-08-23T00:00:00.000Z",
      agent: "opencode",
      skillRef: null,
      skillLabel: "browse",
      evidenceKind: "tool_call",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "test@1",
      projectRef: "project-hash",
      projectLabel: "project-a",
    };

    await store.appendObservations([
      baseObservation,
      { ...baseObservation, observationId: "obs-raw-2", skillLabel: "Browse" },
      { ...baseObservation, observationId: "obs-raw-3", skillLabel: "pdf" },
    ]);
    const snapshot = await store.readSnapshot({ range: { preset: "available" } });

    expect(snapshot.kpis.activeSkills).toBe(2);
    expect(snapshot.topSkills).toEqual([
      expect.objectContaining({ skillRef: null, skillLabel: "browse", observedUses: 2 }),
      expect.objectContaining({ skillRef: null, skillLabel: "pdf", observedUses: 1 }),
    ]);
    expect(snapshot.recentObservations[0]?.skillLabel).toBe("browse");
  });

  test("replaces observations only for completed collector scopes", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-store-replace-"));
    const store = new UsageStore(stateRoot);
    const codexOld: UsageObservationV1 = {
      schemaVersion: 1,
      observationId: "codex-old",
      observedAt: "2026-08-22T00:00:00.000Z",
      agent: "codex",
      skillRef: "leaf-old",
      evidenceKind: "explicit_command",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "codex-session@1",
      projectRef: "project-hash",
      projectLabel: "project-a",
    };
    const codexNew: UsageObservationV1 = {
      ...codexOld,
      observationId: "codex-new",
      observedAt: "2026-08-23T00:00:00.000Z",
      skillRef: "leaf-new",
    };
    const claudeOld: UsageObservationV1 = {
      ...codexOld,
      observationId: "claude-old",
      agent: "claude-code",
      parserRevision: "claude-code-session@1",
    };

    await store.appendObservations([codexOld, claudeOld]);
    const write = await store.replaceObservationsForScopes(
      [{ agent: "codex", sourceKind: "local-session", parserRevision: "codex-session@1" }],
      [codexNew],
    );
    const observations = await store.readObservations();

    expect(write).toMatchObject({ accepted: 1, duplicateSkipped: 0, droppedInvalid: 0, removedStale: 1 });
    expect(observations.map((item) => item.observationId)).toEqual(["claude-old", "codex-new"]);
  });

  test("rejects observations that include unexpected oversized data", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-store-invalid-"));
    const store = new UsageStore(stateRoot);
    const invalidObservation = {
      schemaVersion: 1,
      observationId: "obs-invalid",
      observedAt: "2026-08-23T00:00:00.000Z",
      agent: "claude-code",
      skillRef: "leaf-wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "test@1",
      projectRef: "project-hash",
      projectLabel: "project-a",
      leakedPrompt: "x".repeat(2000),
    };

    const write = await store.appendObservations([invalidObservation as UsageObservationV1]);

    expect(write).toMatchObject({ accepted: 0, droppedInvalid: 1 });
    expect(await store.readObservations()).toEqual([]);
  });

  test("builds dashboard buckets, top agents, and a reconciliable skill-agent matrix", async () => {
    vi.useFakeTimers();
    const now = new Date(2026, 7, 24, 10, 35, 0, 0);
    vi.setSystemTime(now);
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-store-dashboard-"));
    const store = new UsageStore(stateRoot);
    const today = (hour: number) => new Date(2026, 7, 24, hour, 0, 0, 0).toISOString();
    const observation = (input: Partial<UsageObservationV1> & Pick<UsageObservationV1, "observationId" | "observedAt" | "agent">): UsageObservationV1 => ({
      schemaVersion: 1,
      skillRef: "leaf-wayfinder",
      skillLabel: "Wayfinder",
      evidenceKind: "explicit_command",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "test@1",
      projectRef: "project-hash",
      projectLabel: "project-a",
      ...input,
    });

    await store.appendObservations([
      observation({ observationId: "codex-1", observedAt: today(8), agent: "codex" }),
      observation({ observationId: "zcode-1", observedAt: today(9), agent: "zcode" }),
      observation({ observationId: "other-skill-1", observedAt: today(9), agent: "zcode", skillRef: "leaf-other", skillLabel: "Other" }),
      observation({
        observationId: "browse-1",
        observedAt: new Date(2026, 7, 23, 9, 0, 0, 0).toISOString(),
        agent: "opencode",
        skillRef: null,
        skillLabel: "browse",
      }),
    ]);

    const snapshot = await store.readSnapshot({ range: { preset: "today" }, limits: { topSkills: 1 } });

    expect(snapshot.kpis).toMatchObject({
      observedUses: 3,
      usedSkills: 2,
      skillRuns: 3,
      chatRecords: 3,
    });
    expect(snapshot.range.preset).toBe("today");
    expect(snapshot.timeBuckets).toHaveLength(1);
    expect(snapshot.timeBuckets[0]).toMatchObject({ observedUses: 3 });
    expect(snapshot.topAgents.map((item) => [item.agent, item.observedUses])).toEqual([
      ["zcode", 2],
      ["codex", 1],
    ]);
    expect(snapshot.skillAgentMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillKey: "ref:leaf-wayfinder", agent: "codex", observedUses: 1 }),
      expect.objectContaining({ skillKey: "ref:leaf-wayfinder", agent: "zcode", observedUses: 1 }),
      expect.objectContaining({ skillKey: "ref:leaf-other", agent: "zcode", observedUses: 1 }),
    ]));
    expect(snapshot.skillAgentMatrix).toHaveLength(3);
    expect(snapshot.timeBuckets[0]?.bySkillAgent).toEqual(expect.arrayContaining([
      { skillKey: "ref:leaf-wayfinder", agent: "codex", observedUses: 1 },
      { skillKey: "ref:leaf-wayfinder", agent: "zcode", observedUses: 1 },
      { skillKey: "ref:leaf-other", agent: "zcode", observedUses: 1 },
    ]));
    expect(snapshot.timeBuckets[0]?.bySkillAgent).toHaveLength(3);
    expect(snapshot.topSkills).toHaveLength(1);
    expect(snapshot.timeBuckets[0]?.bySkill.map((item) => item.key)).toEqual(expect.arrayContaining(["ref:leaf-wayfinder", "ref:leaf-other"]));
    expect(snapshot.hourlyActivity.filter((item) => item.observedUses > 0)).toEqual([
      expect.objectContaining({ hour: 8, observedUses: 1 }),
      expect.objectContaining({ hour: 9, observedUses: 2 }),
    ]);
  });

  test("uses local clock labels for the rolling 24 hour range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 24, 10, 35, 0, 0));
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-store-24h-"));
    const store = new UsageStore(stateRoot);
    const observation: UsageObservationV1 = {
      schemaVersion: 1,
      observationId: "obs-24h",
      observedAt: new Date(2026, 7, 24, 10, 0, 0, 0).toISOString(),
      agent: "codex",
      skillRef: "leaf-wayfinder",
      skillLabel: "Wayfinder",
      evidenceKind: "explicit_command",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "test@1",
      projectRef: null,
      projectLabel: "Unknown project",
    };
    await store.appendObservations([observation]);

    const snapshot = await store.readSnapshot({ range: { preset: "24h" } });

    expect(snapshot.timeBuckets).toHaveLength(24);
    expect(snapshot.timeBuckets[0]?.label).toMatch(/^\d{2}:00$/);
    expect(snapshot.timeBuckets.at(-1)?.label).toBe("10:00");
    expect(snapshot.timeBuckets.at(-1)?.observedUses).toBe(1);
    expect(snapshot.range.endAt).toBe(new Date(2026, 7, 24, 10, 0, 0, 0).toISOString());
    expect(snapshot.timeBuckets.some((item) => item.label.startsWith("-"))).toBe(false);
  });

  test("bounds chart skill series without changing the raw run total", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-store-chart-limit-"));
    const store = new UsageStore(stateRoot);
    const observations: UsageObservationV1[] = Array.from({ length: 101 }, (_, index) => ({
      schemaVersion: 1,
      observationId: `chart-skill-${index}`,
      observedAt: `2026-08-23T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
      agent: "codex",
      skillRef: `leaf-chart-${index}`,
      skillLabel: `Chart skill ${index}`,
      evidenceKind: "explicit_command",
      confidence: "observed",
      outcome: "unknown",
      sourceKind: "local-session",
      parserRevision: "test@1",
      projectRef: null,
      projectLabel: "Unknown project",
    }));

    await store.appendObservations(observations);
    const snapshot = await store.readSnapshot({ range: { preset: "available" }, limits: { chartSkills: 100 } });

    expect(snapshot.kpis.skillRuns).toBe(101);
    expect(snapshot.timeBuckets.flatMap((bucket) => bucket.bySkill)).toHaveLength(100);
    expect(snapshot.truncation.chartSkillsTruncated).toBe(true);
  });
});

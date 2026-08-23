import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { UsageObservationV1 } from "@skill-flow/domain/types";
import { UsageStore } from "../usage-store.js";

describe("UsageStore", () => {
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
});

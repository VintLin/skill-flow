import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { RecoveryJournalStore } from "../recovery-journal-store.js";

describe("RecoveryJournalStore", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  test("rejects a journal transaction id that escapes the recovery root", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-store-"));
    roots.push(parent);
    const stateRoot = path.join(parent, "state");
    const store = new RecoveryJournalStore(stateRoot);
    const sentinel = path.join(parent, "keep.txt");
    await fs.mkdir(path.dirname(store.journalPath), { recursive: true });
    await fs.writeFile(sentinel, "keep\n", "utf8");
    await fs.writeFile(store.journalPath, JSON.stringify({
      schemaVersion: 1,
      transactionId: "../..",
      kind: "update",
      sourceId: "repo",
      startedAt: "2026-08-22T00:00:00.000Z",
      phase: "prepared",
      authorityBefore: {},
      targets: [],
    }), "utf8");

    await expect(store.read()).rejects.toThrow(/invalid recovery journal/i);
    await expect(fs.readFile(sentinel, "utf8")).resolves.toBe("keep\n");
  });

  test("rejects an experimental v1 journal that lacks semantic ownership fields", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-store-"));
    roots.push(stateRoot);
    const store = new RecoveryJournalStore(stateRoot);
    await fs.mkdir(path.dirname(store.journalPath), { recursive: true });
    await fs.writeFile(store.journalPath, JSON.stringify({
      schemaVersion: 1,
      transactionId: "recovery-123-12345678-1234-4123-8123-123456789abc",
      kind: "update",
      sourceId: "repo",
      startedAt: "2026-08-22T00:00:00.000Z",
      phase: "prepared",
      authorityBefore: {},
      targets: [],
    }), "utf8");

    await expect(store.read()).rejects.toThrow(/invalid sourceKind/i);
  });

  test("rejects target snapshots without required fingerprints", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-store-"));
    roots.push(stateRoot);
    const store = new RecoveryJournalStore(stateRoot);
    await fs.mkdir(path.dirname(store.journalPath), { recursive: true });
    await fs.writeFile(store.journalPath, JSON.stringify({
      schemaVersion: 1,
      transactionId: "recovery-123-12345678-1234-4123-8123-123456789abc",
      kind: "update",
      sourceId: "repo",
      sourceKind: "git",
      startedAt: "2026-08-22T00:00:00.000Z",
      phase: "mutated",
      authorityBefore: {},
      checkout: checkoutSnapshot(stateRoot),
      targets: [{
        role: "target",
        sourceId: "repo",
        target: "codex",
        path: path.join(stateRoot, "targets", "codex", "review"),
        existed: true,
        backupName: "target-0",
      }],
    }), "utf8");

    await expect(store.read()).rejects.toThrow(/missing snapshot before fingerprint/i);
  });

  test("rejects target snapshots without a mutation fingerprint", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-store-"));
    roots.push(stateRoot);
    const store = new RecoveryJournalStore(stateRoot);
    await fs.mkdir(path.dirname(store.journalPath), { recursive: true });
    await fs.writeFile(store.journalPath, JSON.stringify({
      schemaVersion: 1,
      transactionId: "recovery-123-12345678-1234-4123-8123-123456789abc",
      kind: "update",
      sourceId: "repo",
      sourceKind: "git",
      startedAt: "2026-08-22T00:00:00.000Z",
      phase: "mutated",
      authorityBefore: {},
      checkout: checkoutSnapshot(stateRoot),
      targets: [{
        role: "target",
        sourceId: "repo",
        target: "codex",
        path: path.join(stateRoot, "targets", "codex", "review"),
        existed: true,
        backupName: "target-0",
        beforeFingerprint: "before",
      }],
    }), "utf8");

    await expect(store.read()).rejects.toThrow(/missing target mutation fingerprint/i);
  });

  test("rejects update journals without a checkout snapshot", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-store-"));
    roots.push(stateRoot);
    const store = new RecoveryJournalStore(stateRoot);
    await fs.mkdir(path.dirname(store.journalPath), { recursive: true });
    await fs.writeFile(store.journalPath, JSON.stringify({
      schemaVersion: 1,
      transactionId: "recovery-123-12345678-1234-4123-8123-123456789abc",
      kind: "update",
      sourceId: "repo",
      sourceKind: "git",
      startedAt: "2026-08-22T00:00:00.000Z",
      phase: "prepared",
      authorityBefore: {},
      targets: [],
    }), "utf8");

    await expect(store.read()).rejects.toThrow(/missing checkout snapshot/i);
  });

  test("rejects import journals without a preparation snapshot", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-recovery-store-"));
    roots.push(stateRoot);
    const store = new RecoveryJournalStore(stateRoot);
    await fs.mkdir(path.dirname(store.journalPath), { recursive: true });
    await fs.writeFile(store.journalPath, JSON.stringify({
      schemaVersion: 1,
      transactionId: "recovery-123-12345678-1234-4123-8123-123456789abc",
      kind: "import",
      sourceId: "repo",
      sourceKind: "git",
      startedAt: "2026-08-22T00:00:00.000Z",
      phase: "prepared",
      authorityBefore: {},
      checkout: checkoutSnapshot(stateRoot),
      targets: [],
    }), "utf8");

    await expect(store.read()).rejects.toThrow(/missing import preparation snapshot/i);
  });
});

function checkoutSnapshot(stateRoot: string): Record<string, unknown> {
  return {
    role: "checkout",
    sourceId: "repo",
    sourceKind: "git",
    path: path.join(stateRoot, "source", "git", "repo"),
    existed: true,
    backupName: "checkout",
    beforeFingerprint: "before",
  };
}

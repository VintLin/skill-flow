import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "../runtime.js";
import { StateStore } from "@skill-flow/storage/state-store";
import { useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("state migration runtime", () => {
  const sandbox = useSkillFlowSandbox();

  test("runtime exposes migration status", async () => {
    await seedV1BasicState(sandbox.stateRoot);
    const app = new SkillFlowApp();

    const status = await app.inspectStateMigration();

    expect(status.status).toBe("migration-required");
  });

  test("runtime warms seed import recommendations after migration", async () => {
    await seedV1BasicState(sandbox.stateRoot);
    const app = new SkillFlowApp();

    const result = await app.migrateState({ to: 2, backup: false });

    expect(result.status).toBe("migrated");
    const cache = await app.store.readImportDataCache();
    expect(cache.recommendations.seed?.groups).toEqual([
      "anthropics/skills",
      "garrytan/gstack",
      "vercel-labs/agent-skills",
    ]);
  });

  test("non-dry-run migration blocks an inconsistent V1 authority plus recovery journal", async () => {
    await seedV1BasicState(sandbox.stateRoot);
    const journalPath = path.join(sandbox.stateRoot, "recovery", "active.json");
    await writeJsonFile(journalPath, { stale: true });
    const app = new SkillFlowApp();

    await expect(app.migrateState({ to: 2, backup: false })).rejects.toMatchObject({
      reasonCode: "RECOVERY_STATE_INCONSISTENT",
    });

    expect(JSON.parse(await fs.readFile(path.join(sandbox.stateRoot, "manifest.json"), "utf8")))
      .toMatchObject({ schemaVersion: 1 });
    await expect(fs.access(journalPath)).resolves.toBeUndefined();
  });

  test("dry-run migration remains read-only when a recovery journal is present", async () => {
    await seedV1BasicState(sandbox.stateRoot);
    const journalPath = path.join(sandbox.stateRoot, "recovery", "active.json");
    await writeJsonFile(journalPath, { stale: true });
    const before = await fs.readFile(path.join(sandbox.stateRoot, "manifest.json"), "utf8");
    const app = new SkillFlowApp();

    const result = await app.migrateState({ to: 2, dryRun: true, backup: false });

    expect(result.status).toBe("dry-run");
    expect(await fs.readFile(path.join(sandbox.stateRoot, "manifest.json"), "utf8")).toBe(before);
    await expect(fs.access(journalPath)).resolves.toBeUndefined();
  });

  test("current-state migration recovers an active journal before returning current", async () => {
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutPath = path.join(sandbox.stateRoot, "source", "git", "repo");
    await fs.mkdir(checkoutPath, { recursive: true });
    await fs.writeFile(path.join(checkoutPath, "version.txt"), "old\n", "utf8");
    const state = await stateStore.readState();
    state.manifest.sources.push({
      id: "repo",
      kind: "git",
      locator: "owner/repo",
      canonicalLocator: "owner/repo",
      displayName: "repo",
      enabled: true,
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    });
    state.lockFile.sources.repo = {
      sourceId: "repo",
      canonicalLocator: "owner/repo",
      revision: { provider: "git", commit: "old", capturedAt: "2026-08-22T00:00:00.000Z" },
      localPath: checkoutPath,
      leafIds: [],
    };
    await stateStore.writeState(state);
    const app = new SkillFlowApp();
    const transaction = await app.operationRecoveryService.begin({
      kind: "update",
      sourceId: "repo",
      sourceKind: "git",
    });
    await fs.rename(checkoutPath, transaction.checkoutBackupPath!);
    await fs.mkdir(checkoutPath, { recursive: true });
    await fs.writeFile(path.join(checkoutPath, "version.txt"), "new\n", "utf8");

    const result = await app.migrateState({ to: 2, backup: false });

    expect(result.status).toBe("current");
    expect(await fs.readFile(path.join(checkoutPath, "version.txt"), "utf8")).toBe("old\n");
    await expect(fs.access(path.join(sandbox.stateRoot, "recovery", "active.json"))).rejects.toThrow();
  });
});

async function seedV1BasicState(stateRoot: string) {
  await writeJsonFile(path.join(stateRoot, "manifest.json"), {
    schemaVersion: 1,
    sources: [],
    bindings: {},
  });
  await writeJsonFile(path.join(stateRoot, "lock.json"), {
    schemaVersion: 1,
    sources: [],
    leafInventory: [],
    deployments: [],
  });
  await writeJsonFile(path.join(stateRoot, "preferences.json"), {
    pinnedSourceIds: [],
    projectDrafts: {},
  });
  await writeJsonFile(path.join(stateRoot, "collections.json"), {
    collections: {},
  });
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

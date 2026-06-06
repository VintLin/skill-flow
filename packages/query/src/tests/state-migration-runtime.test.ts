import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "../runtime.js";
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

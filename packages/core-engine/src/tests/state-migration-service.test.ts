import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { StateMigrationService } from "../services/state-migration-service.js";

describe("state migration service", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-state-migration-"));
  });

  afterEach(async () => {
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("dry-run reports rewrite and prune actions without modifying files", async () => {
    await seedV1BasicState();
    const service = new StateMigrationService({ stateRoot });
    const before = await readJsonFile(path.join(stateRoot, "manifest.json"), {});

    const result = await service.migrate({ to: 2, dryRun: true, backup: true });
    const after = await readJsonFile(path.join(stateRoot, "manifest.json"), {});

    expect(result.status).toBe("dry-run");
    expect(result.actions).toContainEqual(expect.objectContaining({ action: "rewrite" }));
    expect(result.actions).toContainEqual(expect.objectContaining({ action: "prune" }));
    expect(after).toEqual(before);
  });

  async function seedV1BasicState() {
    await writeJsonFile(path.join(stateRoot, "manifest.json"), {
      schemaVersion: 1,
      sources: [],
      bindings: {},
      targets: {},
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
    await writeJsonFile(path.join(stateRoot, "catalog", "import-data.json"), {
      schemaVersion: 1,
      sources: {},
    });
  }
});

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

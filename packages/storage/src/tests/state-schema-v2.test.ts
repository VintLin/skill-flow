import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  writeLock,
  writeManifest,
} from "../state-schema.js";

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

describe("state schema v2", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-state-v2-"));
  });

  afterEach(async () => {
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("writes schemaVersion 2 and migrationGeneration to authority files", async () => {
    await writeManifest(stateRoot, {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: [],
      bindings: {},
    });
    await writeLock(stateRoot, {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: {},
      leafInventory: [],
      projections: [],
    });

    const manifest = await readJsonFile<Record<string, unknown>>(
      path.join(stateRoot, "manifest.json"),
    );
    const lock = await readJsonFile<Record<string, unknown>>(
      path.join(stateRoot, "lock.json"),
    );

    expect(manifest.schemaVersion).toBe(2);
    expect(lock.schemaVersion).toBe(2);
    expect(lock.migrationGeneration).toBe(manifest.migrationGeneration);
  });
});

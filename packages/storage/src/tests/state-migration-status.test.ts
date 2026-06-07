import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  CURRENT_MIGRATION_MARKER_VERSION,
  inspectStateMigrationStatus,
} from "../state-schema.js";

describe("state migration status", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-migration-status-"));
  });

  afterEach(async () => {
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("detects v1 state as migration required", async () => {
    await writeJson("manifest.json", {
      schemaVersion: 1,
      sources: [],
      bindings: {},
    });
    await writeJson("lock.json", {
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      deployments: [],
    });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "migration-required",
      fromVersion: 1,
      toVersion: 2,
    });
  });

  test("detects deprecated github source kind in v2 state as migration required", async () => {
    const migrationGeneration = "mg_test";
    await writeJson("manifest.json", {
      schemaVersion: 2,
      migrationGeneration,
      sources: [
        {
          id: "repo",
          kind: "github",
          locator: "https://github.com/acme/skills.git",
          canonicalLocator: "https://github.com/acme/skills.git",
          displayName: "Skills",
          enabled: true,
          createdAt: "2026-06-07T00:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ],
      bindings: {},
    });
    await writeJson("lock.json", {
      schemaVersion: 2,
      migrationGeneration,
      sources: {
        repo: {
          sourceId: "repo",
          canonicalLocator: "https://github.com/acme/skills.git",
          revision: {
            provider: "github",
            commit: "abc123",
            capturedAt: "2026-06-07T00:00:00.000Z",
          },
          localPath: path.join(stateRoot, "source", "github", "repo"),
          leafIds: [],
        },
      },
      leafInventory: [],
      projections: [],
    });
    await writeJson("preferences.json", {
      schemaVersion: 2,
      migrationGeneration,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
    });
    await writeJson("collections.json", {
      schemaVersion: 2,
      migrationGeneration,
      collections: {},
    });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "migration-required",
      fromVersion: 2,
      toVersion: 2,
    });
  });

  test("detects v2 state with missing generation as incomplete", async () => {
    await writeJson("manifest.json", {
      schemaVersion: 2,
      sources: [],
      bindings: {},
    });
    await writeV2AuthorityFiles({ migrationGeneration: "mg_test", skipManifest: true });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
    });
    if (status.status !== "incomplete") {
      throw new Error(`Expected incomplete status, received ${status.status}`);
    }
    expect(status.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "STATE_MIGRATION_GENERATION_MISSING",
        path: expect.stringContaining("manifest.json"),
      }),
    );
  });

  test("detects collection marker generation mismatch as incomplete", async () => {
    await writeV2AuthorityFiles({
      migrationGeneration: "mg_authority",
      collections: {
        "group-1": {
          id: "group-1",
          displayName: "Group",
          materializedSourceId: "group-1",
          members: [],
          hiddenSourceIds: [],
          restoreSelections: {},
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      },
    });
    await writeJson("source/collection/group-1/.skillflow-generation.json", {
      schemaVersion: 2,
      migrationGeneration: "mg_other",
      collectionId: "group-1",
      createdAt: "2026-06-04T00:00:00.000Z",
      diagnostics: [],
    });
    await writeText("source/collection/group-1/.skillflow-complete", "");

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
    });
    if (status.status !== "incomplete") {
      throw new Error(`Expected incomplete status, received ${status.status}`);
    }
    expect(status.diagnostics).toContainEqual(
      expect.objectContaining({
        path: expect.stringContaining("source/collection/group-1/.skillflow-generation.json"),
      }),
    );
  });

  test("detects collection without completion marker as incomplete", async () => {
    await writeV2AuthorityFiles({
      migrationGeneration: "mg_authority",
      collections: {
        "group-1": {
          id: "group-1",
          displayName: "Group",
          materializedSourceId: "group-1",
          members: [],
          hiddenSourceIds: [],
          restoreSelections: {},
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      },
    });
    await writeJson("source/collection/group-1/.skillflow-generation.json", {
      schemaVersion: 2,
      migrationGeneration: "mg_authority",
      collectionId: "group-1",
      createdAt: "2026-06-04T00:00:00.000Z",
      diagnostics: [],
    });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
    });
    if (status.status !== "incomplete") {
      throw new Error(`Expected incomplete status, received ${status.status}`);
    }
    expect(status.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "STATE_MIGRATION_COLLECTION_INCOMPLETE",
        path: expect.stringContaining("source/collection/group-1/.skillflow-complete"),
      }),
    );
  });

  test("treats leftover migration marker as current after authority replace completed", async () => {
    await writeV2AuthorityFiles({ migrationGeneration: "mg_replaced" });
    await writeJson(".skillflow-migration.json", {
      schemaVersion: 2,
      version: CURRENT_MIGRATION_MARKER_VERSION,
      migrationGeneration: "mg_replaced",
      status: "running",
      startedAt: "2026-06-04T00:00:00.000Z",
      stagingRoot: path.join(stateRoot, ".migration-staging-test"),
      diagnostics: [],
    });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "current",
      version: 2,
      migrationGeneration: "mg_replaced",
    });
  });

  test("keeps marker as incomplete when marker generation differs from authority", async () => {
    await writeV2AuthorityFiles({ migrationGeneration: "mg_authority" });
    await writeJson(".skillflow-migration.json", {
      schemaVersion: 2,
      version: CURRENT_MIGRATION_MARKER_VERSION,
      migrationGeneration: "mg_other",
      status: "running",
      startedAt: "2026-06-04T00:00:00.000Z",
      stagingRoot: path.join(stateRoot, ".migration-staging-test"),
      diagnostics: [],
    });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
    });
    if (status.status !== "incomplete") {
      throw new Error(`Expected incomplete status, received ${status.status}`);
    }
    expect(status.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "STATE_MIGRATION_MARKER_GENERATION_MISMATCH",
        path: expect.stringContaining(".skillflow-migration.json"),
      }),
    );
  });

  test("keeps marker as incomplete when marker version is from another CLI", async () => {
    await writeV2AuthorityFiles({ migrationGeneration: "mg_replaced" });
    await writeJson(".skillflow-migration.json", {
      schemaVersion: 2,
      version: "0.0.0",
      migrationGeneration: "mg_replaced",
      status: "running",
      startedAt: "2026-06-04T00:00:00.000Z",
      stagingRoot: path.join(stateRoot, ".migration-staging-test"),
      diagnostics: [],
    });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
    });
    if (status.status !== "incomplete") {
      throw new Error(`Expected incomplete status, received ${status.status}`);
    }
    expect(status.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "STATE_MIGRATION_MARKER_VERSION_UNSUPPORTED",
        path: expect.stringContaining(".skillflow-migration.json"),
        details: expect.objectContaining({
          expectedVersion: CURRENT_MIGRATION_MARKER_VERSION,
          actualVersion: "0.0.0",
        }),
      }),
    );
  });

  test("keeps marker as incomplete when marker version is missing", async () => {
    await writeV2AuthorityFiles({ migrationGeneration: "mg_replaced" });
    await writeJson(".skillflow-migration.json", {
      schemaVersion: 2,
      migrationGeneration: "mg_replaced",
      status: "running",
      startedAt: "2026-06-04T00:00:00.000Z",
      stagingRoot: path.join(stateRoot, ".migration-staging-test"),
      diagnostics: [],
    });

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "incomplete",
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
    });
    if (status.status !== "incomplete") {
      throw new Error(`Expected incomplete status, received ${status.status}`);
    }
    expect(status.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "STATE_MIGRATION_MARKER_VERSION_MISSING",
        path: expect.stringContaining(".skillflow-migration.json"),
      }),
    );
  });

  test.each([
    ["manifest.json", "{", "STATE_FILE_PARSE_FAILED"],
    ["manifest.json", { schemaVersion: 999 }, "STATE_SCHEMA_UNSUPPORTED"],
    ["lock.json", "{", "STATE_FILE_PARSE_FAILED"],
  ])("blocks migration for invalid %s", async (filePath, payload, expectedCode) => {
    if (typeof payload === "string") {
      await writeText(filePath, payload);
    } else {
      await writeJson(filePath, payload);
    }

    if (filePath !== "manifest.json") {
      await writeJson("manifest.json", {
        schemaVersion: 2,
        migrationGeneration: "mg_test",
        sources: [],
        bindings: {},
      });
    }

    const status = await inspectStateMigrationStatus(stateRoot);

    expect(status).toMatchObject({
      status: "invalid",
      reasonCode: "STATE_MIGRATION_BLOCKED",
    });
    if (status.status !== "invalid") {
      throw new Error(`Expected invalid status, received ${status.status}`);
    }
    expect(status.diagnostics).toContainEqual(
      expect.objectContaining({
        path: expect.stringContaining(filePath),
        code: expectedCode,
      }),
    );
  });

  async function writeV2AuthorityFiles(options: {
    migrationGeneration: `mg_${string}`;
    skipManifest?: boolean;
    collections?: Record<string, unknown>;
  }) {
    if (!options.skipManifest) {
      await writeJson("manifest.json", {
        schemaVersion: 2,
        migrationGeneration: options.migrationGeneration,
        sources: [],
        bindings: {},
      });
    }
    await writeJson("lock.json", {
      schemaVersion: 2,
      migrationGeneration: options.migrationGeneration,
      sources: {},
      leafInventory: [],
      projections: [],
    });
    await writeJson("preferences.json", {
      schemaVersion: 2,
      migrationGeneration: options.migrationGeneration,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
    });
    await writeJson("collections.json", {
      schemaVersion: 2,
      migrationGeneration: options.migrationGeneration,
      collections: options.collections ?? {},
    });
  }

  async function writeJson(filePath: string, value: unknown) {
    await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async function writeText(filePath: string, value: string) {
    const absolutePath = path.join(stateRoot, filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, value, "utf8");
  }
});

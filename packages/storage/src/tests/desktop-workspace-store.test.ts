import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  DesktopWorkspaceStore,
  type DesktopWorkspaceFile,
  type DesktopWorkspaceLegacyCandidate,
} from "../desktop-workspace-store.js";

function tags(title: string) {
  return {
    schemaVersion: 3 as const,
    tagsByGroupKey: {
      "source:alpha": [{ title, accentRawValue: "blue", tagId: title.toLowerCase() }],
    },
    orderedTagKeys: [],
    orderingMode: "defaultCount" as const,
  };
}

function candidate(
  source: DesktopWorkspaceLegacyCandidate["source"],
  priority: number,
  overrides: Partial<DesktopWorkspaceLegacyCandidate> = {},
): DesktopWorkspaceLegacyCandidate {
  return {
    source,
    priority,
    agentDisplayPreferences: [{ targetId: "codex", isVisible: false, sortOrder: 0 }],
    groupTags: tags(source),
    ...overrides,
  };
}

describe("DesktopWorkspaceStore", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-desktop-workspace-"));
  });

  afterEach(async () => {
    await fs.rm(stateRoot, { recursive: true, force: true });
  });

  test("creates an explicit empty file and one migration generation", async () => {
    const store = new DesktopWorkspaceStore(stateRoot);

    const file = await store.ensureMigrated([]);

    expect(file).toEqual({
      schemaVersion: 1,
      migrationGeneration: file.migrationGeneration,
      agentDisplayVisibility: {},
      groupTags: {
        schemaVersion: 3,
        tagsByGroupKey: {},
        orderedTagKeys: [],
        orderingMode: "defaultCount",
      },
    });
    expect(file.migrationGeneration).toMatch(/^mg_/);
    expect(JSON.parse(await fs.readFile(store.filePath, "utf8"))).toEqual(file);
  });

  test("merges legacy candidates by priority and never lets empty data erase content", async () => {
    const store = new DesktopWorkspaceStore(stateRoot);
    const production = candidate("production", 200, {
      agentDisplayPreferences: [{ targetId: "cursor", isVisible: true, sortOrder: 1 }],
      groupTags: {
        ...tags("production"),
        tagsByGroupKey: {
          "source:alpha": [{ title: "Production", accentRawValue: "blue", tagId: "production" }],
          "source:production": [{ title: "Only production", accentRawValue: "green", tagId: "prod-only" }],
        },
      },
    });
    const development = candidate("development", 100, {
      agentDisplayPreferences: [{ targetId: "codex", isVisible: true, sortOrder: 0 }],
      groupTags: {
        ...tags("development"),
        tagsByGroupKey: {
          "source:alpha": [{ title: "Development", accentRawValue: "orange", tagId: "dev" }],
          "source:development": [{ title: "Only development", accentRawValue: "purple", tagId: "dev-only" }],
        },
      },
    });
    const file = await store.ensureMigrated([production, development]);

    expect(file.agentDisplayVisibility).toEqual({ cursor: true, codex: true });
    expect(file.groupTags.tagsByGroupKey).toEqual({
      "source:alpha": [{ title: "Production", accentRawValue: "blue", tagId: "production" }],
      "source:production": [{ title: "Only production", accentRawValue: "green", tagId: "prod-only" }],
      "source:development": [{ title: "Only development", accentRawValue: "purple", tagId: "dev-only" }],
    });
  });

  test("does not rerun migration or overwrite a valid file", async () => {
    const store = new DesktopWorkspaceStore(stateRoot);
    const first = await store.ensureMigrated([candidate("production", 200)]);
    const second = await store.ensureMigrated([candidate("production", 200, {
      agentDisplayPreferences: [{ targetId: "cursor", isVisible: false, sortOrder: 0 }],
    })]);

    expect(second).toEqual(first);
  });

  test("serializes read-modify-write updates under the desktop lock", async () => {
    const store = new DesktopWorkspaceStore(stateRoot);
    await store.ensureMigrated([]);

    await Promise.all(
      ["codex", "cursor", "claude-code"].map((targetId) => store.update((current) => ({
        ...current,
        agentDisplayVisibility: {
          ...current.agentDisplayVisibility,
          [targetId]: false,
        },
      }))),
    );

    const result = await store.read();
    expect(result?.agentDisplayVisibility).toEqual({
      codex: false,
      cursor: false,
      "claude-code": false,
    });
  });

  test("backs up malformed desktop.json and refuses to replace it with empty state", async () => {
    const store = new DesktopWorkspaceStore(stateRoot);
    await fs.writeFile(store.filePath, "{broken", "utf8");

    await expect(store.ensureMigrated([])).rejects.toMatchObject({
      code: "DESKTOP_WORKSPACE_INVALID",
    });

    const entries = await fs.readdir(stateRoot);
    const backup = entries.find((entry) => entry.startsWith("desktop.json.invalid-") && entry.endsWith(".bak"));
    expect(backup).toBeDefined();
    expect(await fs.readFile(path.join(stateRoot, backup ?? ""), "utf8")).toBe("{broken");
    await expect(fs.access(store.filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

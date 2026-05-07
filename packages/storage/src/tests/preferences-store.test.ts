import { describe, expect, test } from "vitest";
import type { SharedPreferences } from "@skill-flow/domain/types";
import {
  createEmptySharedPreferences,
  normalizeSharedPreferences,
} from "../preferences-store.js";

describe("preferences-store", () => {
  test("creates empty shared preferences with no pinned sources", () => {
    expect(createEmptySharedPreferences()).toEqual({
      schemaVersion: 1,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectDrafts: {},
      customTargets: [],
      agentDisplayOrder: [
        "claude-code",
        "codex",
        "cursor",
        "github-copilot",
        "gemini-cli",
        "opencode",
        "openclaw",
        "hermes-agent",
        "pi",
        "trae",
        "windsurf",
        "roo-code",
        "cline",
        "amp",
        "kiro",
      ],
    });
  });

  test("normalizes invalid preferences payloads to an empty shape", () => {
    expect(normalizeSharedPreferences(null)).toEqual(createEmptySharedPreferences());
    expect(normalizeSharedPreferences({})).toEqual(createEmptySharedPreferences());
    expect(
      normalizeSharedPreferences({
        schemaVersion: 999,
        pinnedSourceIds: ["alpha"],
      }),
    ).toEqual(createEmptySharedPreferences());
  });

  test("deduplicates pinned ids and drops invalid entries", () => {
    expect(
      normalizeSharedPreferences({
        schemaVersion: 1,
        pinnedSourceIds: ["alpha", "", "beta", "alpha", 42],
      }),
    ).toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "beta"],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectDrafts: {},
      customTargets: [],
      agentDisplayOrder: [
        "claude-code",
        "codex",
        "cursor",
        "github-copilot",
        "gemini-cli",
        "opencode",
        "openclaw",
        "hermes-agent",
        "pi",
        "trae",
        "windsurf",
        "roo-code",
        "cline",
        "amp",
        "kiro",
      ],
    });
  });

  test("normalizes selected project scope and drops invalid recent projects", () => {
    const prefs: SharedPreferences = {
      schemaVersion: 1,
      pinnedSourceIds: ["alpha"],
      selectedProjectScope: { kind: "project", projectId: "repo-a" },
      recentProjects: [
        {
          projectId: "repo-a",
          title: "Repo A",
          lastActivityAt: "2026-03-30T00:00:00.000Z",
          projectPath: "/Users/test/src/repo-a",
          tools: ["codex"],
        },
        { projectId: "", title: "Trash", lastActivityAt: "2021-01-01T00:00:00.000Z" },
      ],
      projectDrafts: {
        "repo-a": {
          alpha: { enabledTargets: ["codex"], selectedLeafIds: [] },
        },
      },
      customTargets: [],
      agentDisplayOrder: [
        "claude-code",
        "codex",
        "cursor",
        "github-copilot",
        "gemini-cli",
        "opencode",
        "openclaw",
        "hermes-agent",
        "pi",
        "trae",
        "windsurf",
        "roo-code",
        "cline",
        "amp",
        "kiro",
      ],
    };

    const normalized = normalizeSharedPreferences(prefs);

    expect(normalized.selectedProjectScope).toEqual({ kind: "project", projectId: "repo-a" });
    expect(normalized.recentProjects.map((project) => project.projectId)).toEqual(["repo-a"]);
    expect(normalized.recentProjects[0]?.projectPath).toBe("/Users/test/src/repo-a");
    expect(normalized.projectDrafts["repo-a"]?.alpha?.enabledTargets).toEqual(["codex"]);
  });

  test("falls back to global scope when the selected project is missing", () => {
    const prefs: SharedPreferences = {
      schemaVersion: 1,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "project", projectId: "missing-repo" },
      recentProjects: [],
      projectDrafts: {},
      customTargets: [],
      agentDisplayOrder: ["codex"],
    };

    const normalized = normalizeSharedPreferences(prefs);

    expect(normalized.selectedProjectScope).toEqual({ kind: "global" });
    expect(normalized.agentDisplayOrder).toEqual([
      "codex",
      "claude-code",
      "cursor",
      "github-copilot",
      "gemini-cli",
      "opencode",
      "openclaw",
      "hermes-agent",
      "pi",
      "trae",
      "windsurf",
      "roo-code",
      "cline",
      "amp",
      "kiro",
    ]);
  });

  test("keeps valid custom targets and appends them to normalized display order", () => {
    const prefs = normalizeSharedPreferences({
      schemaVersion: 1,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectDrafts: {},
      customTargets: [
        {
          id: "my-agent",
          name: "My Agent",
          globalPath: "  /Users/test/.my-agent/skills  ",
          projectPathTemplate: "./.my-agent/skills",
          strategy: "copy",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T01:00:00.000Z",
        },
      ],
      agentDisplayOrder: ["codex"],
    });

    expect(prefs.customTargets).toEqual([
      {
        id: "my-agent",
        name: "My Agent",
        globalPath: "/Users/test/.my-agent/skills",
        projectPathTemplate: ".my-agent/skills",
        strategy: "copy",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T01:00:00.000Z",
      },
    ]);
    expect(prefs.agentDisplayOrder).toEqual([
      "codex",
      "claude-code",
      "cursor",
      "github-copilot",
      "gemini-cli",
      "opencode",
      "openclaw",
      "hermes-agent",
      "pi",
      "trae",
      "windsurf",
      "roo-code",
      "cline",
      "amp",
      "kiro",
      "my-agent",
    ]);
  });

  test("prunes invalid and colliding custom targets during normalization", () => {
    const prefs = normalizeSharedPreferences({
      schemaVersion: 1,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectDrafts: {},
      customTargets: [
        {
          id: "my-agent",
          name: "My Agent",
          globalPath: "/Users/test/.my-agent/skills",
          projectPathTemplate: ".my-agent/skills",
          strategy: "symlink",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T01:00:00.000Z",
        },
        {
          id: "codex",
          name: "Collides Builtin",
          globalPath: "/Users/test/.codex-alt/skills",
          projectPathTemplate: ".codex-alt/skills",
          strategy: "symlink",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T01:00:00.000Z",
        },
        {
          id: "my-agent",
          name: "Duplicate Id",
          globalPath: "/Users/test/.dupe/skills",
          projectPathTemplate: ".dupe/skills",
          strategy: "symlink",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T01:00:00.000Z",
        },
        {
          id: "absolute-project",
          name: "Absolute Project",
          globalPath: "/Users/test/.absolute/skills",
          projectPathTemplate: "/Users/test/project/skills",
          strategy: "symlink",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T01:00:00.000Z",
        },
      ],
      agentDisplayOrder: ["missing-target", "my-agent", "codex", "my-agent"],
    });

    expect(prefs.customTargets).toEqual([
      {
        id: "my-agent",
        name: "My Agent",
        globalPath: "/Users/test/.my-agent/skills",
        projectPathTemplate: ".my-agent/skills",
        strategy: "symlink",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T01:00:00.000Z",
      },
    ]);
    expect(prefs.agentDisplayOrder).toEqual([
      "my-agent",
      "codex",
      "claude-code",
      "cursor",
      "github-copilot",
      "gemini-cli",
      "opencode",
      "openclaw",
      "hermes-agent",
      "pi",
      "trae",
      "windsurf",
      "roo-code",
      "cline",
      "amp",
      "kiro",
    ]);
  });
});

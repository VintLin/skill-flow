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
    };

    const normalized = normalizeSharedPreferences(prefs);

    expect(normalized.selectedProjectScope).toEqual({ kind: "global" });
  });
});

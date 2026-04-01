import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  collectProjectObservations,
  collectProjectObservationsFromCodexSessions,
} from "../project-observations.js";

describe("project observations", () => {
  test("collectProjectObservations prefers codex repository_url and falls back to unique cwd project roots", () => {
    const observations = collectProjectObservationsFromCodexSessions([
      {
        session_meta: {
          payload: {
            cwd: "/Users/test/src/skill-flow",
            git: { repository_url: "https://github.com/acme/skill-flow" },
          },
        },
      },
      { session_meta: { payload: { cwd: "/tmp/fallback-project" } } },
    ]);

    expect(observations.map((observation) => observation.projectId)).toEqual([
      "acme/skill-flow",
      "/tmp/fallback-project",
    ]);
    expect(observations.map((observation) => observation.projectPath)).toEqual([
      "/Users/test/src/skill-flow",
      "/tmp/fallback-project",
    ]);
    expect(observations.map((observation) => observation.title)).toEqual([
      "skill-flow",
      "fallback-project",
    ]);
  });

  test("collectProjectObservations normalizes git suffix from codex repository_url", () => {
    const observations = collectProjectObservationsFromCodexSessions([
      {
        session_meta: {
          payload: { git: { repository_url: "git@github.com:acme/skill-flow.git" } },
        },
      },
    ]);

    expect(observations[0]?.projectId).toBe("acme/skill-flow");
  });

  test("collectProjectObservations keeps cwd fallback project ids unique per project root", () => {
    const observations = collectProjectObservationsFromCodexSessions([
      { session_meta: { payload: { cwd: "/work/client-a/app" } } },
      { session_meta: { payload: { cwd: "/work/client-b/app" } } },
    ]);

    expect(observations.map((observation) => observation.projectId)).toEqual([
      "/work/client-a/app",
      "/work/client-b/app",
    ]);
    expect(observations.map((observation) => observation.title)).toEqual(["app", "app"]);
  });

  test("collectProjectObservations preserves projectPath for claude, gemini, and opencode", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-project-observations-"));
    const claudeProjectPath = path.join(homeDir, "src", "claude-repo");
    const geminiProjectPath = path.join(homeDir, "src", "gemini-repo");
    const opencodeProjectPath = path.join(homeDir, "src", "opencode-repo");

    await fs.mkdir(path.join(homeDir, ".claude", "projects", "claude-repo"), { recursive: true });
    await fs.mkdir(path.join(homeDir, ".gemini", "history", "gemini-repo"), { recursive: true });
    await fs.mkdir(path.join(homeDir, ".opencode", "history", "workspace"), { recursive: true });

    await fs.writeFile(
      path.join(homeDir, ".claude", "projects", "claude-repo", "session.jsonl"),
      `${JSON.stringify({
        timestamp: "2026-03-30T00:00:00.000Z",
        cwd: claudeProjectPath,
      })}\n`,
    );
    await fs.writeFile(
      path.join(homeDir, ".gemini", "history", "gemini-repo", ".project_root"),
      `${geminiProjectPath}\n`,
    );
    await fs.writeFile(
      path.join(homeDir, ".opencode", "history", "workspace", ".project_root"),
      `${opencodeProjectPath}\n`,
    );

    const observations = await collectProjectObservations(homeDir);
    const byTool = new Map(observations.map((observation) => [observation.tool, observation]));

    expect(byTool.get("claude-code")?.projectPath).toBe(claudeProjectPath);
    expect(byTool.get("gemini-cli")?.projectPath).toBe(geminiProjectPath);
    expect(byTool.get("opencode")?.projectPath).toBe(opencodeProjectPath);
  });
});

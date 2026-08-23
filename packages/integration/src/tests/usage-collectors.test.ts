import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  ClaudeCodeUsageCollector,
  CodexUsageCollector,
  GeminiTelemetryUsageCollector,
  KimiCodeUsageCollector,
  OpenCodeUsageCollector,
  PiUsageCollector,
  ZCodeUsageCollector,
  createDefaultSupportedUsageAgents,
  createDefaultUsageCollectors,
} from "../utils/usage-collectors.js";

describe("usage collectors", () => {
  test("extracts Claude Code Skill tool calls from local session jsonl", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-usage-collector-"));
    const projectPath = path.join(root, "project");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(
      path.join(root, "sessions", "session.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-08-23T00:00:00.000Z",
          cwd: projectPath,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Use /Users/test/skills/wayfinder/SKILL.md" },
              { type: "tool_use", name: "Skill", input: { skill: "mattpocock-skills:wayfinder" } },
            ],
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:01:00.000Z",
          message: {
            content: [
              { type: "tool_use", name: "Read", input: { file_path: "/tmp/SKILL.md" } },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new ClaudeCodeUsageCollector([root]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "claude-code",
      rawSkillName: "mattpocock-skills:wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      rawProjectPath: projectPath,
    });
  });

  test("reports missing Claude Code source root without throwing", async () => {
    const root = path.join(os.tmpdir(), "skill-flow-usage-missing", cryptoRandomSuffix());
    const result = await new ClaudeCodeUsageCollector([root]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("not_found");
    expect(result.coverage.diagnosticsCount).toBe(1);
    expect(result.diagnostics[0]?.code).toBe("SOURCE_NOT_FOUND");
  });

  test("extracts Codex Skill tool calls from local rollout jsonl without matching SKILL.md text", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-codex-collector-"));
    const projectPath = path.join(root, "project");
    await fs.mkdir(path.join(root, "2026", "08", "23"), { recursive: true });
    await fs.writeFile(
      path.join(root, "2026", "08", "23", "rollout-test.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-08-23T00:00:00.000Z",
          type: "session_meta",
          payload: { cwd: projectPath },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:01:00.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "Skill",
            arguments: JSON.stringify({ skill: "mattpocock-skills:wayfinder" }),
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:02:00.000Z",
          type: "response_item",
          payload: {
            role: "assistant",
            content: [{ type: "output_text", text: "Read /tmp/skills/wayfinder/SKILL.md" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new CodexUsageCollector([root]).scan({
      now: new Date("2026-08-23T00:03:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "codex",
      rawSkillName: "mattpocock-skills:wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      rawProjectPath: projectPath,
    });
  });

  test("extracts explicit skill commands from user-authored Codex text only as inventory-match candidates", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-codex-explicit-collector-"));
    const projectPath = path.join(root, "project");
    await fs.mkdir(path.join(root, "2026", "08", "23"), { recursive: true });
    await fs.writeFile(
      path.join(root, "2026", "08", "23", "rollout-test.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-08-23T00:00:00.000Z",
          type: "session_meta",
          payload: { cwd: projectPath },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:01:00.000Z",
          type: "response_item",
          payload: {
            role: "user",
            content: [{ type: "input_text", text: "Run $wayfinder and /mattpocock-skills:tdd." }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:02:00.000Z",
          type: "response_item",
          payload: {
            role: "assistant",
            content: [{ type: "output_text", text: "Mentioned $impeccable in assistant output." }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:03:00.000Z",
          type: "response_item",
          payload: {
            role: "user",
            content: [{ type: "input_text", text: "Do not match /tmp/SKILL.md or paths/with/slash." }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new CodexUsageCollector([root]).scan({
      now: new Date("2026-08-23T00:04:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(2);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: "codex",
        rawSkillName: "wayfinder",
        evidenceKind: "explicit_command",
        requiresKnownSkillMatch: true,
        rawProjectPath: projectPath,
      }),
      expect.objectContaining({
        agent: "codex",
        rawSkillName: "mattpocock-skills:tdd",
        evidenceKind: "explicit_command",
        requiresKnownSkillMatch: true,
        rawProjectPath: projectPath,
      }),
    ]));
  });

  test("default collectors scan implemented sources while supported agents mirrors builtin targets", () => {
    expect(createDefaultUsageCollectors().map((collector) => collector.agent)).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
      "pi",
      "opencode",
      "kimi-code",
      "zcode",
    ]);
    expect(createDefaultSupportedUsageAgents()).toEqual(expect.arrayContaining([
      "claude-code",
      "codex",
      "gemini-cli",
      "pi",
      "opencode",
      "kimi-code",
      "zcode",
      "grok-build",
    ]));
  });

  test("extracts Gemini activate_skill calls from local telemetry outfile", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-gemini-collector-"));
    const telemetryFile = path.join(root, "telemetry.log");
    await fs.writeFile(
      telemetryFile,
      [
        JSON.stringify({
          timestamp: "2026-08-23T00:00:00.000Z",
          name: "gemini_cli.tool_call",
          attributes: {
            function_name: "activate_skill",
            function_args: JSON.stringify({ skill: "mattpocock-skills:wayfinder" }),
            tool_type: "native",
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:01:00.000Z",
          name: "gemini_cli.tool_call",
          attributes: {
            function_name: "read_file",
            function_args: JSON.stringify({ path: "/tmp/SKILL.md" }),
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new GeminiTelemetryUsageCollector([telemetryFile]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "gemini-cli",
      rawSkillName: "mattpocock-skills:wayfinder",
      evidenceKind: "skill_activated",
      confidence: "observed",
      sourceKind: "direct-event",
    });
  });

  test("extracts Pi Skill tool calls from local session jsonl", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-pi-collector-"));
    const projectPath = path.join(root, "project");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(
      path.join(root, "sessions", "session.jsonl"),
      [
        JSON.stringify({
          type: "session",
          timestamp: "2026-08-23T00:00:00.000Z",
          cwd: projectPath,
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-08-23T00:01:00.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", name: "Skill", input: { skill: "mattpocock-skills:wayfinder" } },
              { type: "text", text: "Mention /tmp/SKILL.md only." },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new PiUsageCollector([root]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "pi",
      rawSkillName: "mattpocock-skills:wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      rawProjectPath: projectPath,
    });
  });

  test.skipIf(!hasSqlite3())("extracts OpenCode skill tool calls from sqlite part rows", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-opencode-collector-"));
    const dbPath = path.join(root, "opencode.db");
    const projectPath = path.join(root, "project");
    const skillPart = JSON.stringify({
      type: "tool",
      callID: "call-1",
      tool: "skill",
      state: {
        status: "completed",
        input: { skill: "mattpocock-skills:wayfinder" },
        time: { start: 1787443200000 },
      },
    });
    const readPart = JSON.stringify({
      type: "tool",
      callID: "call-2",
      tool: "read",
      state: {
        status: "completed",
        input: { filePath: "/tmp/SKILL.md" },
        time: { start: 1787443200001 },
      },
    });
    const failedSkillPart = JSON.stringify({
      type: "tool",
      callID: "call-3",
      tool: "skill",
      state: {
        status: "error",
        input: { skill: "mattpocock-skills:tdd" },
        time: { start: 1787443200002 },
      },
    });
    execFileSync("sqlite3", [dbPath, `
CREATE TABLE session (id text PRIMARY KEY, directory text);
CREATE TABLE part (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, data text NOT NULL);
INSERT INTO session (id, directory) VALUES ('session-1', '${projectPath.replaceAll("'", "''")}');
INSERT INTO part (id, session_id, time_created, data) VALUES ('part-1', 'session-1', 1787443200000, '${skillPart.replaceAll("'", "''")}');
INSERT INTO part (id, session_id, time_created, data) VALUES ('part-2', 'session-1', 1787443200001, '${readPart.replaceAll("'", "''")}');
INSERT INTO part (id, session_id, time_created, data) VALUES ('part-3', 'session-1', 1787443200002, '${failedSkillPart.replaceAll("'", "''")}');
`]);

    const result = await new OpenCodeUsageCollector([dbPath]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "opencode",
      rawSkillName: "mattpocock-skills:wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      outcome: "completed",
      rawProjectPath: projectPath,
    });
  });

  test.skipIf(!hasSqlite3())("extracts ZCode completed skill tool calls from sqlite part rows", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-zcode-collector-"));
    const dbPath = path.join(root, "zcode.db");
    const projectPath = path.join(root, "project");
    const skillPart = JSON.stringify({
      type: "tool",
      callID: "call-1",
      tool: "Skill",
      state: {
        status: "completed",
        input: { name: "mattpocock-skills:wayfinder" },
        time: { start: 1787443200000 },
      },
    });
    const failedSkillPart = JSON.stringify({
      type: "tool",
      callID: "call-2",
      tool: "Skill",
      state: {
        status: "error",
        input: { skill: "mattpocock-skills:tdd" },
        time: { start: 1787443200001 },
      },
    });
    execFileSync("sqlite3", [dbPath, `
CREATE TABLE session (id text PRIMARY KEY, directory text);
CREATE TABLE part (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, data text NOT NULL);
INSERT INTO session (id, directory) VALUES ('session-1', '${projectPath.replaceAll("'", "''")}');
INSERT INTO part (id, session_id, time_created, data) VALUES ('part-1', 'session-1', 1787443200000, '${skillPart.replaceAll("'", "''")}');
INSERT INTO part (id, session_id, time_created, data) VALUES ('part-2', 'session-1', 1787443200001, '${failedSkillPart.replaceAll("'", "''")}');
`]);

    const result = await new ZCodeUsageCollector([dbPath]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "zcode",
      rawSkillName: "mattpocock-skills:wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      outcome: "completed",
      rawProjectPath: projectPath,
    });
  });

  test("extracts Kimi Code Skill tool calls from local session jsonl", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-kimi-collector-"));
    const projectPath = path.join(root, "project");
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(
      path.join(root, "sessions", "session.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-08-23T00:00:00.000Z",
          workingDirectory: projectPath,
          message: {
            content: [
              { type: "tool_use", name: "activate_skill", input: { name: "mattpocock-skills:wayfinder" } },
            ],
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:01:00.000Z",
          message: {
            content: [
              { type: "tool_use", name: "Read", input: { file_path: "/tmp/SKILL.md" } },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new KimiCodeUsageCollector([root]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "kimi-code",
      rawSkillName: "mattpocock-skills:wayfinder",
      evidenceKind: "tool_call",
      confidence: "observed",
      rawProjectPath: projectPath,
    });
  });
});

function cryptoRandomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasSqlite3(): boolean {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  ClaudeCodeUsageCollector,
  CodexUsageCollector,
  GeminiTelemetryUsageCollector,
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

  test("default collectors scan implemented sources while supported agents mirrors builtin targets", () => {
    expect(createDefaultUsageCollectors().map((collector) => collector.agent)).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
    ]);
    expect(createDefaultSupportedUsageAgents()).toEqual(expect.arrayContaining([
      "claude-code",
      "codex",
      "gemini-cli",
      "opencode",
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
});

function cryptoRandomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

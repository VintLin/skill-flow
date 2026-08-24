import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { TARGET_ORDER } from "../utils/constants.js";
import {
  USAGE_AGENT_POLICIES,
  createDefaultUsageAgentPolicies,
  createImplementedUsageAgentPolicies,
} from "../utils/usage/agent-usage-policies.js";
import {
  ClaudeCodeUsageCollector,
  CodexUsageCollector,
  CursorUsageCollector,
  GeminiTelemetryUsageCollector,
  GrokBuildUsageCollector,
  KimiCodeUsageCollector,
  OpenCodeUsageCollector,
  PiUsageCollector,
  WorkBuddyUsageCollector,
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
    expect(result.coverage).toMatchObject({
      sourcesFound: 1,
      sourceFilesScanned: 1,
    });
    expect(result.coverage.sourceBytesScanned).toBeGreaterThan(0);
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
        rawProjectPath: projectPath,
      }),
      expect.objectContaining({
        agent: "codex",
        rawSkillName: "mattpocock-skills:tdd",
        evidenceKind: "explicit_command",
        rawProjectPath: projectPath,
      }),
    ]));
  });

  test("extracts Codex explicit commands from active and archived rollout roots", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-codex-archived-collector-"));
    const activeRoot = path.join(root, "sessions");
    const archivedRoot = path.join(root, "archived_sessions");
    const projectPath = path.join(root, "project");
    await fs.mkdir(path.join(activeRoot, "2026", "08", "23"), { recursive: true });
    await fs.mkdir(path.join(archivedRoot, "2026", "08", "22"), { recursive: true });
    await fs.writeFile(
      path.join(activeRoot, "2026", "08", "23", "rollout-active.jsonl"),
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
            content: [{ type: "input_text", text: "Run $wayfinder." }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(archivedRoot, "2026", "08", "22", "rollout-archived.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-08-22T00:00:00.000Z",
          type: "session_meta",
          payload: { cwd: projectPath },
        }),
        JSON.stringify({
          timestamp: "2026-08-22T00:01:00.000Z",
          type: "response_item",
          payload: {
            role: "user",
            content: [{ type: "input_text", text: "Run /mattpocock-skills:tdd." }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new CodexUsageCollector([activeRoot, archivedRoot]).scan({
      now: new Date("2026-08-23T00:04:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rawSkillName: "wayfinder",
        evidenceKind: "explicit_command",
        rawProjectPath: projectPath,
      }),
      expect.objectContaining({
        rawSkillName: "mattpocock-skills:tdd",
        evidenceKind: "explicit_command",
        rawProjectPath: projectPath,
      }),
    ]));
  });

  test("extracts Codex explicit commands from user_message payloads without double-counting mirrored user records", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-codex-user-message-collector-"));
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
            content: [{ type: "input_text", text: "Use $wayfinder now." }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:01:00.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "Use $wayfinder now.",
            text_elements: [{ type: "text", text: "Use $wayfinder now." }],
          },
        }),
        JSON.stringify({
          timestamp: "2026-08-23T00:02:00.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "Now invoke /mattpocock-skills:tdd.",
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
    expect(result.observations.map((observation) => observation.rawSkillName).sort()).toEqual([
      "mattpocock-skills:tdd",
      "wayfinder",
    ]);
  });

  test("extracts Cursor explicit skill commands from agent transcripts only", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-cursor-collector-"));
    const transcriptDir = path.join(root, "project-a", "agent-transcripts", "session-1");
    await fs.mkdir(transcriptDir, { recursive: true });
    await fs.writeFile(
      path.join(transcriptDir, "session-1.jsonl"),
      [
        JSON.stringify({
          role: "user",
          message: {
            content: [{ type: "text", text: "Use $wayfinder and /mattpocock-skills:tdd." }],
          },
        }),
        JSON.stringify({
          role: "assistant",
          message: {
            content: [{ type: "text", text: "Assistant mentions $impeccable but it must not count." }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await new CursorUsageCollector([root]).scan({
      now: new Date("2026-08-23T00:04:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.observations).toHaveLength(2);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent: "cursor", rawSkillName: "wayfinder", evidenceKind: "explicit_command" }),
      expect.objectContaining({ agent: "cursor", rawSkillName: "mattpocock-skills:tdd", evidenceKind: "explicit_command" }),
    ]));
  });

  test("extracts Grok Build explicit skill commands from chat history with project context", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-grok-collector-"));
    const sessionsRoot = path.join(root, "sessions");
    const projectPath = path.join(root, "project");
    const encodedProject = encodeURIComponent(projectPath);
    const sessionDir = path.join(sessionsRoot, encodedProject, "session-1");
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, "chat_history.jsonl"),
      [
        JSON.stringify({
          type: "user",
          content: [{ type: "text", text: "$wayfinder run this." }],
        }),
        JSON.stringify({
          type: "user",
          content: [{ type: "text", text: "Run $mattpocock-skills:tdd inline and inspect /tmp/project." }],
        }),
        JSON.stringify({
          type: "assistant",
          content: [{ type: "text", text: "Assistant mentions /mattpocock-skills:tdd but it must not count." }],
        }),
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(sessionDir, "events.jsonl"),
      JSON.stringify({ type: "tool_completed", tool_name: "read_file" }),
      "utf8",
    );

    const result = await new GrokBuildUsageCollector([sessionsRoot]).scan({
      now: new Date("2026-08-23T00:04:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.coverage).toMatchObject({
      sourcesFound: 1,
      sourceFilesScanned: 1,
    });
    expect(result.coverage.sourceBytesScanned).toBeGreaterThan(0);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      agent: "grok-build",
      rawSkillName: "wayfinder",
      evidenceKind: "explicit_command",
      rawProjectPath: projectPath,
    });
  });

  test("extracts WorkBuddy Skill tool spans from traces with session project mapping", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-workbuddy-collector-"));
    const traceRoot = path.join(root, "traces");
    const sessionFile = path.join(root, "app", "sessions.json");
    const traceDir = path.join(traceRoot, "12345");
    const usageLog = path.join(root, "usage-log.json");
    const projectPath = path.join(root, "project");
    await fs.mkdir(traceDir, { recursive: true });
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    await fs.writeFile(
      sessionFile,
      JSON.stringify({
        version: 1,
        sessions: [{
          conversationId: "session-1",
          workDir: projectPath,
          startedAt: "2026-08-23T00:00:00.000Z",
        }],
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(traceDir, "trace-1.json"),
      JSON.stringify({
        trace: {
          traceId: "trace-1",
          sessionId: "session-1",
          startedAt: "2026-08-23T00:00:00.000Z",
        },
        spans: [
          {
            spanId: "span-1",
            name: "Skill",
            type: "function",
            toolName: "Skill",
            status: "ok",
            startedAt: "2026-08-23T00:01:00.000Z",
            toolInput: JSON.stringify({ skill: "wayfinder" }),
          },
          {
            spanId: "span-2",
            name: "Skill",
            type: "function",
            toolName: "Skill",
            status: "error",
            startedAt: "2026-08-23T00:02:00.000Z",
            toolInput: { skill: "code-review" },
          },
          {
            spanId: "span-3",
            name: "Read",
            type: "function",
            toolName: "Read",
            status: "ok",
            startedAt: "2026-08-23T00:03:00.000Z",
            toolInput: JSON.stringify({ file_path: "/tmp/SKILL.md" }),
          },
        ],
      }),
      "utf8",
    );
    await fs.writeFile(
      usageLog,
      JSON.stringify({
        version: 1,
        skills: {
          stale: {
            id: "stale",
            type: "skill",
            recentDates: ["2026-08-22"],
          },
        },
      }),
      "utf8",
    );

    const result = await new WorkBuddyUsageCollector({
      traceRoots: [traceRoot],
      sessionFiles: [sessionFile],
      usageLogFiles: [usageLog],
    }).scan({
      now: new Date("2026-08-24T00:04:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.coverage).toMatchObject({
      sourcesFound: 3,
      sourceFilesScanned: 2,
    });
    expect(result.coverage.sourceBytesScanned).toBeGreaterThan(0);
    expect(result.observations).toHaveLength(1);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: "workbuddy",
        rawSkillName: "wayfinder",
        observedAt: "2026-08-23T00:01:00.000Z",
        evidenceKind: "tool_call",
        outcome: "completed",
        sourceKind: "direct-event",
        rawProjectPath: projectPath,
      }),
    ]));
    expect(result.observations.map((item) => item.rawSkillName)).not.toContain("stale");
    expect(result.observations.map((item) => item.rawSkillName)).not.toContain("code-review");
  });

  test("falls back to WorkBuddy usage-log aggregate dates when traces have no Skill spans", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-workbuddy-collector-"));
    const traceRoot = path.join(root, "traces");
    const usageLog = path.join(root, "usage-log.json");
    await fs.mkdir(traceRoot, { recursive: true });
    await fs.writeFile(
      usageLog,
      JSON.stringify({
        version: 1,
        skills: {
          wayfinder: {
            id: "wayfinder",
            type: "skill",
            firstSeenDate: "2026-08-21",
            lastUsedDate: "2026-08-23",
            recentDates: ["2026-08-22", "2026-08-23", "2026-08-23"],
          },
          connector: {
            id: "connector",
            type: "mcp",
            recentDates: ["2026-08-23"],
          },
        },
        mcps: {
          browser: { lastUsedDate: "2026-08-23" },
        },
      }),
      "utf8",
    );

    const result = await new WorkBuddyUsageCollector({
      traceRoots: [traceRoot],
      sessionFiles: [],
      usageLogFiles: [usageLog],
    }).scan({
      now: new Date("2026-08-24T00:04:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.coverage).toMatchObject({
      sourcesFound: 2,
      sourceFilesScanned: 1,
    });
    expect(result.coverage.sourceBytesScanned).toBeGreaterThan(0);
    expect(result.observations).toHaveLength(2);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: "workbuddy",
        rawSkillName: "wayfinder",
        observedAt: "2026-08-22T00:00:00.000Z",
        evidenceKind: "selected",
        sourceKind: "direct-event",
      }),
      expect.objectContaining({
        agent: "workbuddy",
        rawSkillName: "wayfinder",
        observedAt: "2026-08-23T00:00:00.000Z",
        evidenceKind: "selected",
        sourceKind: "direct-event",
      }),
    ]));
  });

  test("default collectors scan implemented sources while supported agents mirrors builtin targets", () => {
    const collectorAgents = createDefaultUsageCollectors().map((collector) => collector.agent);
    expect(collectorAgents).toEqual([
      "claude-code",
      "codex",
      "zcode",
      "cursor",
      "grok-build",
      "pi",
      "workbuddy",
      "kimi-code",
      "opencode",
      "gemini-cli",
    ]);
    expect(createDefaultSupportedUsageAgents()).toEqual(TARGET_ORDER);
    expect(createImplementedUsageAgentPolicies().map((policy) => policy.agent)).toEqual(collectorAgents);
  });

  test("usage agent policies cover every builtin target with explicit counting boundaries", () => {
    expect(Object.keys(USAGE_AGENT_POLICIES).sort()).toEqual([...TARGET_ORDER].sort());
    expect(createDefaultUsageAgentPolicies().map((policy) => policy.agent)).toEqual(TARGET_ORDER);

    for (const policy of createDefaultUsageAgentPolicies()) {
      expect(policy.sourceCandidates.length, `${policy.agent} sourceCandidates`).toBeGreaterThan(0);
      expect(policy.acceptedSignals.length, `${policy.agent} acceptedSignals`).toBeGreaterThan(0);
      expect(policy.rejectedSignals.length, `${policy.agent} rejectedSignals`).toBeGreaterThan(0);
      expect(policy.privacyBoundary.length, `${policy.agent} privacyBoundary`).toBeGreaterThan(0);
      expect(policy.planNote.length, `${policy.agent} planNote`).toBeGreaterThan(0);
      if (policy.status === "implemented") {
        expect(policy.collector, `${policy.agent} collector`).toBeDefined();
      } else {
        expect(policy.collector, `${policy.agent} collector`).toBeUndefined();
      }
    }
  });

  test("implemented usage policies match default collector parser revisions", () => {
    const collectorsByAgent = new Map(createDefaultUsageCollectors().map((collector) => [
      collector.agent,
      collector.parserRevision,
    ]));

    for (const policy of createDefaultUsageAgentPolicies()) {
      if (policy.status !== "implemented") {
        expect(collectorsByAgent.has(policy.agent), `${policy.agent} should not have default collector`).toBe(false);
        continue;
      }
      expect(collectorsByAgent.get(policy.agent)).toBe(policy.collector?.parserRevision);
    }
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
    expect(result.coverage).toMatchObject({
      sourcesFound: 1,
      sourceFilesScanned: 1,
    });
    expect(result.coverage.sourceBytesScanned).toBeGreaterThan(0);
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
    const skillRoot = path.join(root, "skills");
    await fs.mkdir(path.join(skillRoot, "impeccable"), { recursive: true });
    await fs.writeFile(
      path.join(skillRoot, "impeccable", "SKILL.md"),
      [
        "---",
        "name: impeccable",
        "---",
        "",
        "This skill gives you the tools and permission to create design that earns to be called out-of-distribution craft.",
        "Use it for UI critique.",
      ].join("\n"),
      "utf8",
    );
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
    const injectedSkillPart = JSON.stringify({
      type: "text",
      text: "This skill gives you the tools and permission to create design that earns to be called out-of-distribution craft.\nUse it for UI critique.",
    });
    const explicitSkillPart = JSON.stringify({
      type: "text",
      text: "/mattpocock-skills:tdd drive this change.",
    });
    const pathTextPart = JSON.stringify({
      type: "text",
      text: "Do not count /tmp/SKILL.md or https://example.com/path.",
    });
    execFileSync("sqlite3", [dbPath, `
CREATE TABLE session (id text PRIMARY KEY, directory text);
CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, data text NOT NULL);
CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL, data text NOT NULL);
INSERT INTO session (id, directory) VALUES ('session-1', '${projectPath.replaceAll("'", "''")}');
INSERT INTO message (id, session_id, time_created, data) VALUES ('message-1', 'session-1', 1787443200000, '{"role":"assistant"}');
INSERT INTO message (id, session_id, time_created, data) VALUES ('message-2', 'session-1', 1787443200003, '{"role":"user"}');
INSERT INTO message (id, session_id, time_created, data) VALUES ('message-3', 'session-1', 1787443200004, '{"role":"user"}');
INSERT INTO part (id, message_id, session_id, time_created, data) VALUES ('part-1', 'message-1', 'session-1', 1787443200000, '${skillPart.replaceAll("'", "''")}');
INSERT INTO part (id, message_id, session_id, time_created, data) VALUES ('part-2', 'message-1', 'session-1', 1787443200001, '${readPart.replaceAll("'", "''")}');
INSERT INTO part (id, message_id, session_id, time_created, data) VALUES ('part-3', 'message-1', 'session-1', 1787443200002, '${failedSkillPart.replaceAll("'", "''")}');
INSERT INTO part (id, message_id, session_id, time_created, data) VALUES ('part-4', 'message-2', 'session-1', 1787443200003, '${injectedSkillPart.replaceAll("'", "''")}');
INSERT INTO part (id, message_id, session_id, time_created, data) VALUES ('part-5', 'message-3', 'session-1', 1787443200004, '${explicitSkillPart.replaceAll("'", "''")}');
INSERT INTO part (id, message_id, session_id, time_created, data) VALUES ('part-6', 'message-3', 'session-1', 1787443200005, '${pathTextPart.replaceAll("'", "''")}');
`]);

    const result = await new OpenCodeUsageCollector([dbPath], [skillRoot]).scan({
      now: new Date("2026-08-23T00:02:00.000Z"),
      budget: { perSourceBudgetMs: 5000, maxFiles: 500, maxBytes: 536870912 },
    });

    expect(result.coverage.status).toBe("scanned");
    expect(result.coverage).toMatchObject({
      sourcesFound: 2,
      sourceFilesScanned: 2,
    });
    expect(result.coverage.sourceBytesScanned).toBeGreaterThan(0);
    expect(result.observations).toHaveLength(3);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: "opencode",
        rawSkillName: "mattpocock-skills:wayfinder",
        evidenceKind: "tool_call",
        confidence: "observed",
        outcome: "completed",
        rawProjectPath: projectPath,
      }),
      expect.objectContaining({
        agent: "opencode",
        rawSkillName: "impeccable",
        evidenceKind: "skill_activated",
        confidence: "observed",
        outcome: "completed",
        rawProjectPath: projectPath,
      }),
      expect.objectContaining({
        agent: "opencode",
        rawSkillName: "mattpocock-skills:tdd",
        evidenceKind: "explicit_command",
        confidence: "observed",
        outcome: "unknown",
        rawProjectPath: projectPath,
      }),
    ]));
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
    expect(result.coverage).toMatchObject({
      sourcesFound: 1,
      sourceFilesScanned: 1,
    });
    expect(result.coverage.sourceBytesScanned).toBeGreaterThan(0);
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

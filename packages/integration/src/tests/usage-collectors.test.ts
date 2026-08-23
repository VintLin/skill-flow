import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ClaudeCodeUsageCollector } from "../utils/usage-collectors.js";

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
    expect(result.diagnostics[0]?.code).toBe("SOURCE_NOT_FOUND");
  });
});

function cryptoRandomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  inspectClawHubSkill,
  installClawHubSkill,
  searchClawHubSkills,
} from "../utils/clawhub.js";

const execFileMock = vi.hoisted(() => vi.fn());
const originalBundledNpx = process.env.SKILL_FLOW_BUNDLED_NPX;
vi.mock("node:child_process", () => ({
  execFile: Object.assign(execFileMock, {
    [Symbol.for("nodejs.util.promisify.custom")](
      _command: string,
      _args: string[],
      _options: { cwd?: string; encoding?: string; env?: NodeJS.ProcessEnv },
    ) {
      return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFileMock(
          _command,
          _args,
          _options,
          (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              reject(error);
              return;
            }
            resolve({ stdout, stderr });
          },
        );
      });
    },
  }),
}));

describe("clawhub utils", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalBundledNpx === undefined) {
      delete process.env.SKILL_FLOW_BUNDLED_NPX;
    } else {
      process.env.SKILL_FLOW_BUNDLED_NPX = originalBundledNpx;
    }
  });

  test("parses the actual clawhub search output shape", async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: { cwd?: string; encoding?: string; env?: NodeJS.ProcessEnv },
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(
          null,
          [
            "- Searching",
            "summarize  Summarize  (4.030)",
            "20206-02-10-clawhub-summarize-1-0-0  20206 02 10 Clawhub Summarize 1.0.0  (3.596)",
            "summarize-pro  Summarize Pro  (3.579)",
            "summarize-file  Summarize File  (3.551)",
            "summarize-1-0-0  Summarize 1.0.0  (3.540)",
          ].join("\n"),
          "",
        );
      },
    );

    await expect(searchClawHubSkills("summarize", 5)).resolves.toEqual([
      { slug: "summarize", title: "Summarize", score: 4.03 },
      {
        slug: "20206-02-10-clawhub-summarize-1-0-0",
        title: "20206 02 10 Clawhub Summarize 1.0.0",
        score: 3.596,
      },
      { slug: "summarize-pro", title: "Summarize Pro", score: 3.579 },
      { slug: "summarize-file", title: "Summarize File", score: 3.551 },
      { slug: "summarize-1-0-0", title: "Summarize 1.0.0", score: 3.54 },
    ]);
  });

  test("uses bundled npx override when provided", async () => {
    const bundledNpx =
      "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin/npx";
    process.env.SKILL_FLOW_BUNDLED_NPX = bundledNpx;
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: { cwd?: string; encoding?: string; env?: NodeJS.ProcessEnv },
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "summarize  Summarize  (4.030)", "");
      },
    );

    await expect(searchClawHubSkills("summarize", 1)).resolves.toEqual([
      { slug: "summarize", title: "Summarize", score: 4.03 },
    ]);
    expect(execFileMock).toHaveBeenCalledWith(
      bundledNpx,
      ["-y", "clawhub@latest", "search", "summarize", "--limit", "1"],
      expect.objectContaining({ encoding: "utf8", env: process.env }),
      expect.any(Function),
    );
  });

  test("surfaces suspicious install failures as an explicit security block", async () => {
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: { cwd?: string; encoding?: string; env?: NodeJS.ProcessEnv },
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const error = Object.assign(new Error("Command failed"), {
          stderr: [
            "Error: Use --force to install suspicious skills in non-interactive mode",
            '⚠️  Warning: "agent-browser" is flagged as suspicious by VirusTotal Code Insight.',
          ].join("\n"),
        });
        callback(error, "", error.stderr);
      },
    );

    const result = installClawHubSkill("agent-browser");

    await expect(result).rejects.toMatchObject({
      name: "ClawHubSecurityBlockError",
      message:
        "ClawHub security block: 'agent-browser' is flagged as suspicious. Use --force to install suspicious skills in non-interactive mode.",
    });
  });

  test("times out when ClawHub inspect response body hangs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: vi.fn(() => new Promise(() => {})),
    })));

    const inspected = inspectClawHubSkill("find-skills");
    const assertion = expect(inspected).rejects.toMatchObject({
      name: "FetchTimeoutError",
      code: "FETCH_TIMEOUT",
      timeoutMs: 30_000,
      url: "https://clawhub.ai/api/v1/skills/find-skills",
    });
    await vi.advanceTimersByTimeAsync(30_000);

    await assertion;
  });
});

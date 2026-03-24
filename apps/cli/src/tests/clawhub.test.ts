import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  installClawHubSkill,
  searchClawHubSkills,
} from "@skill-flow/core/utils/clawhub.js";

const execFileMock = vi.hoisted(() => vi.fn());
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
      message: "ClawHub security block: 'agent-browser' is flagged as suspicious. Use --force to install suspicious skills in non-interactive mode.",
    });
  });
});

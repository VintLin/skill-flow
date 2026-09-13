import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("doctor CLI", () => {
  const sandbox = useSkillFlowSandbox();
  const run = (args: string[]) => execFileSync(process.execPath, ["--import", "tsx", "src/cli.tsx", "doctor", ...args], {
    cwd: path.resolve(import.meta.dirname, "../.."), env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });

  test("checks unregistered explicit project path without initializing shared state", async () => {
    const projectPath = path.join(sandbox.sandboxRoot, "unregistered project");
    await fs.mkdir(projectPath);
    const output = run(["--project", projectPath]);
    expect(output).toContain("PARTIAL");
    expect(output).toContain(`Project: ${await fs.realpath(projectPath)}`);
    expect(output).toContain("Baseline: unavailable");
    expect(output).toContain("Coverage: incomplete");
    expect(output).toContain("External Skills:");
    expect(await fs.readdir(projectPath)).toEqual([]);
    await expect(fs.stat(sandbox.stateRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("omitted project retains global doctor output", () => {
    const output = run([]);
    expect(output).toMatch(/HEALTHY|PARTIAL|BLOCKED/);
    expect(output).not.toContain("Project:");
    expect(output).not.toContain("Deployment baseline:");
  });
});

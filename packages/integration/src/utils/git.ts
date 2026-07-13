import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Default wall-clock budget for network-bound git operations (clone/fetch). */
export const DEFAULT_GIT_COMMAND_TIMEOUT_MS = 300_000;

export async function isGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"], {
      encoding: "utf8",
      env: process.env,
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function git(
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<string> {
  const timeout = options.timeoutMs ?? DEFAULT_GIT_COMMAND_TIMEOUT_MS;
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: process.env,
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
    if (err.killed || err.signal === "SIGTERM") {
      throw new Error(
        `Git command timed out after ${timeout}ms: git ${args.join(" ")}`,
      );
    }
    throw error;
  }
}

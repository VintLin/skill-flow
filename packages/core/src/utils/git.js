import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export async function git(args, options = {}) {
    const { stdout } = await execFileAsync("git", args, {
        cwd: options.cwd,
        encoding: "utf8",
        env: process.env,
    });
    return stdout.trim();
}
//# sourceMappingURL=git.js.map
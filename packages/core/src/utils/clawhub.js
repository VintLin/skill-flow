import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export class ClawHubSecurityBlockError extends Error {
    constructor(message) {
        super(message);
        this.name = "ClawHubSecurityBlockError";
    }
}
export async function clawhub(args, options = {}) {
    const { stdout } = await execFileAsync("npx", ["-y", "clawhub@latest", ...args], {
        cwd: options.cwd,
        encoding: "utf8",
        env: process.env,
    });
    return stdout.trim();
}
export async function installClawHubSkill(slug, version) {
    const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-clawhub-"));
    const args = ["--workdir", workdir, "install", slug];
    if (version) {
        args.push("--version", version);
    }
    try {
        await clawhub(args);
    }
    catch (error) {
        if (isSuspiciousClawHubInstallError(error)) {
            throw new ClawHubSecurityBlockError(`ClawHub security block: '${slug}' is flagged as suspicious. Use --force to install suspicious skills in non-interactive mode.`);
        }
        throw error;
    }
    const installedPath = path.join(workdir, "skills", slug);
    const origin = JSON.parse(await fs.readFile(path.join(installedPath, ".clawhub", "origin.json"), "utf8"));
    return {
        workdir,
        installedPath,
        slug: origin.slug,
        resolvedVersion: origin.installedVersion,
    };
}
export async function inspectClawHubSkill(slug, options = {}) {
    const args = ["inspect", slug, "--json"];
    if (options.version) {
        args.push("--version", options.version);
    }
    if (options.files) {
        args.push("--files");
    }
    const output = await clawhub(args);
    const jsonStart = output.indexOf("{");
    if (jsonStart < 0) {
        throw new Error(`Unable to parse clawhub inspect output for '${slug}'.`);
    }
    return JSON.parse(output.slice(jsonStart));
}
export async function searchClawHubSkills(query, limit = 10) {
    const output = await clawhub(["search", query, "--limit", String(limit)]);
    return output
        .split("\n")
        .map((line) => line.trim())
        .map((line) => {
        const match = line.match(/^(?:-\s+)?([^\s]+)\s{2,}(.+?)\s+\(([0-9.]+)\)$/);
        if (!match) {
            return null;
        }
        return {
            slug: match[1],
            title: match[2].trim(),
            score: Number(match[3]),
        };
    })
        .filter((item) => item !== null);
}
function isSuspiciousClawHubInstallError(error) {
    const message = getClawHubErrorMessage(error);
    return /use --force to install suspicious skills/i.test(message);
}
function getClawHubErrorMessage(error) {
    if (error instanceof Error) {
        const stderr = Reflect.get(error, "stderr");
        if (typeof stderr === "string" && stderr.trim().length > 0) {
            return stderr.trim();
        }
        if (error.message.trim().length > 0) {
            return error.message.trim();
        }
    }
    return String(error);
}
//# sourceMappingURL=clawhub.js.map
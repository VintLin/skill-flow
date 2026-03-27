import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ClawHubOrigin = {
  slug: string;
  installedVersion: string;
};

export class ClawHubSecurityBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClawHubSecurityBlockError";
  }
}

export type ClawHubInstallResult = {
  workdir: string;
  installedPath: string;
  slug: string;
  resolvedVersion: string;
};

export type ClawHubSearchResult = {
  slug: string;
  title: string;
  score: number;
};

export type ClawHubInspectResult = {
  skill: {
    slug: string;
    displayName: string;
    summary: string;
    stats?: {
      installsAllTime?: number;
      installsCurrent?: number;
      downloads?: number;
      stars?: number;
    };
  };
  owner?: {
    handle?: string;
    displayName?: string;
  };
  latestVersion?: {
    version: string;
  } | null;
  version?: {
    version: string;
  } | null;
};

export async function clawhub(
  args: string[],
  options: { cwd?: string } = {},
): Promise<string> {
  const { stdout } = await execFileAsync(
    "npx",
    ["-y", "clawhub@latest", ...args],
    {
      cwd: options.cwd,
      encoding: "utf8",
      env: process.env,
    },
  );

  return stdout.trim();
}

export async function installClawHubSkill(
  slug: string,
  version?: string,
): Promise<ClawHubInstallResult> {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-clawhub-"));
  const args = ["--workdir", workdir, "install", slug];
  if (version) {
    args.push("--version", version);
  }

  try {
    await clawhub(args);
  } catch (error) {
    if (isSuspiciousClawHubInstallError(error)) {
      throw new ClawHubSecurityBlockError(
        `ClawHub security block: '${slug}' is flagged as suspicious. Use --force to install suspicious skills in non-interactive mode.`,
      );
    }
    throw error;
  }

  const installedPath = path.join(workdir, "skills", slug);
  const origin = JSON.parse(
    await fs.readFile(path.join(installedPath, ".clawhub", "origin.json"), "utf8"),
  ) as ClawHubOrigin;

  return {
    workdir,
    installedPath,
    slug: origin.slug,
    resolvedVersion: origin.installedVersion,
  };
}

export async function inspectClawHubSkill(
  slug: string,
  options: { version?: string; files?: boolean } = {},
): Promise<ClawHubInspectResult> {
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

  return JSON.parse(output.slice(jsonStart)) as ClawHubInspectResult;
}

export async function searchClawHubSkills(
  query: string,
  limit = 10,
): Promise<ClawHubSearchResult[]> {
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
        slug: match[1]!,
        title: match[2]!.trim(),
        score: Number(match[3]!),
      };
    })
    .filter((item): item is ClawHubSearchResult => item !== null);
}

function isSuspiciousClawHubInstallError(error: unknown): boolean {
  const message = getClawHubErrorMessage(error);
  return /use --force to install suspicious skills/i.test(message);
}

function getClawHubErrorMessage(error: unknown): string {
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

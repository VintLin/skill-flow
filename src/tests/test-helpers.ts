import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, vi } from "vitest";
import * as builtinGitSources from "../utils/builtin-git-sources.js";
import { deriveSourceId } from "../utils/source-id.js";
import type { SkillFlowApp } from "../services/skill-flow.js";

export type SandboxContext = {
  sandboxRoot: string;
  stateRoot: string;
  targetsRoot: string;
};

export function useSkillFlowSandbox() {
  const context = {
    sandboxRoot: "",
    stateRoot: "",
    targetsRoot: "",
  } satisfies SandboxContext;

  beforeEach(async () => {
    context.sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-test-"));
    context.stateRoot = path.join(context.sandboxRoot, "state");
    context.targetsRoot = path.join(context.sandboxRoot, "targets");
    await fs.mkdir(context.targetsRoot, { recursive: true });

    process.env.SKILL_FLOW_STATE_ROOT = context.stateRoot;
    process.env.SKILL_FLOW_TARGET_CLAUDE_CODE = path.join(context.targetsRoot, "claude");
    process.env.SKILL_FLOW_TARGET_CODEX = path.join(context.targetsRoot, "codex");
    process.env.SKILL_FLOW_TARGET_CURSOR = path.join(context.targetsRoot, "cursor");
    process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT = path.join(context.targetsRoot, "github-copilot");
    process.env.SKILL_FLOW_TARGET_GEMINI_CLI = path.join(context.targetsRoot, "gemini-cli");
    process.env.SKILL_FLOW_TARGET_OPENCODE = path.join(context.targetsRoot, "opencode");
    process.env.SKILL_FLOW_TARGET_OPENCLAW = path.join(context.targetsRoot, "openclaw");
    process.env.SKILL_FLOW_TARGET_PI = path.join(context.targetsRoot, "pi");
    process.env.SKILL_FLOW_TARGET_WINDSURF = path.join(context.targetsRoot, "windsurf");
    process.env.SKILL_FLOW_TARGET_ROO_CODE = path.join(context.targetsRoot, "roo-code");
    process.env.SKILL_FLOW_TARGET_CLINE = path.join(context.targetsRoot, "cline");
    process.env.SKILL_FLOW_TARGET_AMP = path.join(context.targetsRoot, "amp");
    process.env.SKILL_FLOW_TARGET_KIRO = path.join(context.targetsRoot, "kiro");

    await Promise.all([
      fs.mkdir(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_CODEX!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_CURSOR!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_GEMINI_CLI!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_OPENCODE!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_OPENCLAW!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_PI!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_WINDSURF!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_ROO_CODE!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_CLINE!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_AMP!, { recursive: true }),
      fs.mkdir(process.env.SKILL_FLOW_TARGET_KIRO!, { recursive: true }),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.SKILL_FLOW_STATE_ROOT;
    delete process.env.SKILL_FLOW_TARGET_CLAUDE_CODE;
    delete process.env.SKILL_FLOW_TARGET_CODEX;
    delete process.env.SKILL_FLOW_TARGET_CURSOR;
    delete process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT;
    delete process.env.SKILL_FLOW_TARGET_GEMINI_CLI;
    delete process.env.SKILL_FLOW_TARGET_OPENCODE;
    delete process.env.SKILL_FLOW_TARGET_OPENCLAW;
    delete process.env.SKILL_FLOW_TARGET_PI;
    delete process.env.SKILL_FLOW_TARGET_WINDSURF;
    delete process.env.SKILL_FLOW_TARGET_ROO_CODE;
    delete process.env.SKILL_FLOW_TARGET_CLINE;
    delete process.env.SKILL_FLOW_TARGET_AMP;
    delete process.env.SKILL_FLOW_TARGET_KIRO;
    if (context.sandboxRoot) {
      await fs.rm(context.sandboxRoot, { recursive: true, force: true });
    }
  });

  return context;
}

export async function createRepo(
  root: string,
  files: Record<string, string>,
): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(root, "repo-"));
  git(repoPath, ["init"]);
  git(repoPath, ["config", "user.email", "test@example.com"]);
  git(repoPath, ["config", "user.name", "Skill Flow Test"]);
  await writeRepoFiles(repoPath, files);
  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", "initial"]);
  return repoPath;
}

export async function createBareRemote(repoPath: string, root: string): Promise<string> {
  const remotePath = await fs.mkdtemp(path.join(root, "remote-"));
  git(remotePath, ["init", "--bare"]);
  git(repoPath, ["remote", "add", "origin", remotePath]);
  git(repoPath, ["push", "-u", "origin", "HEAD"]);
  return remotePath;
}

export async function seedBuiltinCatalog(app: SkillFlowApp): Promise<void> {
  for (const builtin of builtinGitSources.getBuiltinGitSources()) {
    await fs.mkdir(app.store.getCatalogCheckoutPath(deriveSourceId(builtin.locator)), {
      recursive: true,
    });
  }
}

export async function writeRepoFiles(root: string, files: Record<string, string>) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  }
}

export function skillDoc(name: string, description: string, heading?: string) {
  return `---
name: ${name}
description: |
  ${description}
---
${heading ? `\n# ${heading}\n` : ""}
`;
}

export function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

export async function pathExists(targetPath: string) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "@skill-flow/query/runtime";
import { buildFindCommand } from "@skill-flow/integration/utils/find-command";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";
import { StateStore } from "@skill-flow/storage/state-store";

const v2 = (app: { store: { rootPath: string } }): StateStore => new StateStore(app.store.rootPath);

describe.sequential("add selection and find command regression", () => {
  const sandbox = useSkillFlowSandbox();

  test("normalizes subpath imports and warns when only part of a group is preselected", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath, { path: "./skills/find-skills/" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.manifest.requestedPath).toBe("skills/find-skills");
    expect(result.data.leafCount).toBe(2);
    expect(result.warnings).toEqual([
      {
        code: "ADD_SELECTION_PRESELECTED",
        message:
          "Preselected 1 of 2 skills under 'skills/find-skills'; the full skills group was imported.",
      },
    ]);

    const manifest = await v2(app).readManifest();
    expect(manifest.sources[0]?.requestedPath).toBe("skills/find-skills");
    expect(manifest.bindings[result.data.manifest.id]).toMatchObject({
      sourceId: result.data.manifest.id,
      selectionMode: "selected",
      selectedLeafIds: [`${result.data.manifest.id}:skills/find-skills`],
    });
    expect(manifest.bindings[result.data.manifest.id]?.enabledTargets).toContain("claude-code");
  });

  test("treats no-op root paths as a full-group import", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("root", "Root skill."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath, { path: "." });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.manifest.requestedPath).toBeUndefined();
    expect(
      result.warnings.some((warning) => warning.code === "ADD_SELECTION_PRESELECTED"),
    ).toBe(false);

    const manifest = await v2(app).readManifest();
    expect(manifest.sources[0]?.requestedPath).toBeUndefined();
    expect(manifest.bindings[result.data.manifest.id]).toMatchObject({
      sourceId: result.data.manifest.id,
      selectionMode: "all",
      selectedLeafIds: [],
    });
    expect(manifest.bindings[result.data.manifest.id]?.enabledTargets).toContain("claude-code");
  });

  test("reports progress for non-interactive CLI add", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("root", "Root skill."),
    });

    const output = runCli(["add", repoPath, "--yes"]);
    const lines = output.split(/\r?\n/);

    expect(output).toContain("Added ");
    expect(lines).toContain("Preparing source");
    expect(lines).toContain("Source prepared");
    expect(lines).toContain("Applying projections");
    await expect(v2({ store: { rootPath: sandbox.stateRoot } }).readManifest())
      .resolves.toMatchObject({ sources: [expect.any(Object)] });
  });

  test("builds predictable follow-up add commands from search candidates", () => {
    expect(
      buildFindCommand({
        id: "builtin:root",
        title: "skills",
        description: "Root skills",
        source: "builtin-git",
        sourceLabel: "skills(@anthropics)",
        sourceId: "anthropics-skills",
        sourceKind: "git",
        locator: "https://github.com/anthropics/skills.git",
        installed: false,
        action: {
          type: "add-git",
          locator: "https://github.com/anthropics/skills.git",
          requestedPath: ".",
        },
      }),
    ).toBe("skill-flow add https://github.com/anthropics/skills.git");

    expect(
      buildFindCommand({
        id: "builtin:path",
        title: "find-skills",
        description: "Find skills",
        source: "builtin-git",
        sourceLabel: "skills(@anthropics)",
        sourceId: "anthropics-skills",
        sourceKind: "git",
        locator: "https://github.com/anthropics/skills.git",
        installed: false,
        action: {
          type: "add-git",
          locator: "https://github.com/anthropics/skills.git",
          requestedPath: "./skills/find-skills/",
        },
      }),
    ).toBe("skill-flow add https://github.com/anthropics/skills.git --path skills/find-skills");
  });
});

function runCli(args: string[]): string {
  return execFileSync("node", [
    "--import",
    "tsx",
    "src/cli.tsx",
    ...args,
  ], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

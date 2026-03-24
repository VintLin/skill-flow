import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "@skill-flow/core/services/skill-flow.js";
import { buildFindCommand } from "@skill-flow/core/utils/find-command.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

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
    expect(result.data.manifest.selectionMode).toBe("partial");
    expect(result.data.leafCount).toBe(2);
    expect(result.warnings).toEqual([
      {
        code: "ADD_SELECTION_PRESELECTED",
        message:
          "Preselected 1 of 2 skills under 'skills/find-skills'; the full skills group was imported.",
      },
    ]);

    const manifest = await app.store.readManifest();
    expect(manifest.sources[0]?.requestedPath).toBe("skills/find-skills");
    expect(manifest.sources[0]?.selectionMode).toBe("partial");
    expect(manifest.bindings[result.data.manifest.id]?.targets["claude-code"]?.leafIds).toEqual([
      `${result.data.manifest.id}:skills/find-skills`,
    ]);
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
    expect(result.data.manifest.selectionMode).toBe("all");
    expect(
      result.warnings.some((warning) => warning.code === "ADD_SELECTION_PRESELECTED"),
    ).toBe(false);

    const manifest = await app.store.readManifest();
    expect(manifest.sources[0]?.requestedPath).toBeUndefined();
    expect(manifest.sources[0]?.selectionMode).toBe("all");
    expect(manifest.bindings[result.data.manifest.id]?.targets["claude-code"]?.leafIds).toEqual([
      `${result.data.manifest.id}:.`,
    ]);
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

import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "../services/skill-flow.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("add prepare flow", () => {
  const sandbox = useSkillFlowSandbox();

  test("prepareAddSource imports the source without binding all detected agents", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
      "review/SKILL.md": skillDoc("review", "Review flow."),
    });
    const app = new SkillFlowApp();

    const result = await app.prepareAddSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.projected).toBe(false);
    expect(result.data.availableTargets).toContain("claude-code");
    expect(result.data.draft.enabledTargets).toContain("claude-code");
    expect(result.data.draft.selectedLeafIds).toEqual([
      `${result.data.sourceId}:browse`,
      `${result.data.sourceId}:review`,
    ]);

    const manifest = await app.store.readManifest();
    expect(manifest.bindings[result.data.sourceId]?.targets).toEqual({});
  });

  test("prepareAddSource keeps path as a preselection boundary only", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const result = await app.prepareAddSource(repoPath, { path: "./skills/find-skills/" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.leafs.map((leaf) => leaf.relativePath)).toEqual([
      "skills/find-skills",
      "skills/review",
    ]);
    expect(result.data.draft.selectedLeafIds).toEqual([
      `${result.data.sourceId}:skills/find-skills`,
    ]);
  });

  test("prepareAddSource supports explicit skill and agent preselection", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const result = await app.prepareAddSource(repoPath, {
      skillNames: ["review"],
      agentTargets: ["codex", "openclaw"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.draft.enabledTargets).toEqual(["codex", "openclaw"]);
    expect(result.data.draft.selectedLeafIds).toEqual([
      `${result.data.sourceId}:skills/review`,
    ]);
  });

  test("rollbackPreparedSource removes a prepared source before any deployment exists", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();

    const prepared = await app.prepareAddSource(repoPath);

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const rollback = await app.rollbackPreparedSource(prepared.data.sourceId);

    expect(rollback.ok).toBe(true);
    if (!rollback.ok) {
      return;
    }

    const manifest = await app.store.readManifest();
    expect(manifest.sources).toHaveLength(0);
    expect(manifest.bindings[prepared.data.sourceId]).toBeUndefined();
  });

  test("prepareAddSource rejects ambiguous skill selectors", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review flow."),
      "nested/review/SKILL.md": skillDoc("review", "Another review flow."),
    });
    const app = new SkillFlowApp();

    const result = await app.prepareAddSource(repoPath, {
      skillNames: ["review"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors[0]?.code).toBe("ADD_SKILL_SELECTOR_AMBIGUOUS");
  });

  test("prepareAddSource rejects unavailable agent selectors", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "review/SKILL.md": skillDoc("review", "Review flow."),
    });
    const app = new SkillFlowApp();

    const result = await app.prepareAddSource(repoPath, {
      agentTargets: ["not-real" as never],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors[0]?.code).toBe("ADD_AGENT_NOT_AVAILABLE");
  });
});

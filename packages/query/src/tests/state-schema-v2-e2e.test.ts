import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { SourceCheckoutService } from "@skill-flow/core-engine/services/source-checkout-service";
import { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("state schema v2 provider e2e", () => {
  const sandbox = useSkillFlowSandbox();

  test.each([
    ["anthropics/skills", "skills/frontend-design", {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
      "skills/skill-creator/SKILL.md": skillDoc("skill-creator", "Create skills."),
    }],
    ["vercel-labs/agent-skills", "skills/frontend-design", {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
      "skills/debugging/SKILL.md": skillDoc("debugging", "Debug apps."),
    }],
    ["garrytan/gstack", "skills/gstack", {
      "skills/gstack/SKILL.md": skillDoc("gstack", "Use the gstack workflow."),
      "skills/review/SKILL.md": skillDoc("review", "Review changes."),
    }],
  ])("%s imports through preview prepare commit with repoPath selector", async (locator, repoPath, files) => {
    const repo = await createRepo(sandbox.sandboxRoot, files);
    mockProviderCheckout(new Map([[locator, repo]]));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("provider unavailable in deterministic e2e");
    }));

    const app = new SkillFlowApp();
    const preview = await app.previewImportSource(locator);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }
    const skill = preview.data.skills.find((candidate) => candidate.selector?.path === repoPath);
    expect(skill).toEqual(expect.objectContaining({
      providerSkillId: repoPath,
      selector: { kind: "repoPath", path: repoPath },
      origin: expect.objectContaining({
        repoPath,
      }),
    }));
    expect(skill?.uiId).toMatch(/^skill_/);
    expect(skill?.origin?.providerSkillId ?? "").not.toBe(skill?.uiId);

    const prepared = await app.prepareImportSource(locator);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }
    const preparationCache = await new ImportPreparationCacheStore(app.store.rootPath)
      .readImportPreparationCache();
    const preparation = preparationCache.records[prepared.data.preparationId];
    expect(preparation).toEqual(expect.objectContaining({
      schemaVersion: 2,
      sourceSelectionKey: `${locator}#.`,
    }));
    expect(preparation?.skillRefs).toContainEqual(expect.objectContaining({
      uiId: skill?.uiId,
      selector: { kind: "repoPath", path: repoPath },
      repoPath,
    }));

    const committed = await app.commitPreparedImportSource(prepared.data.preparationId, {
      selectedSkills: [{ uiId: skill!.uiId!, selector: skill!.selector! }],
      enabledTargets: ["codex"],
    });

    expect(committed.ok).toBe(true);
    if (!committed.ok || committed.data.status !== "ready") {
      return;
    }
    const state = await new StateStore(app.store.rootPath).readState();
    const binding = state.manifest.bindings[committed.data.sourceId];
    expect(binding?.selectionMode).toBe("selected");
    const selectedLeaf = state.lockFile.leafInventory.find((leaf) =>
      leaf.id === binding?.selectedLeafIds[0]
    );
    expect(selectedLeaf?.relativePath).toBe(repoPath);
    await expect(
      fs.lstat(path.join(process.env.SKILL_FLOW_TARGET_CODEX!, path.basename(repoPath))),
    ).resolves.toBeDefined();
  });
});

function mockProviderCheckout(repos: Map<string, string>) {
  const previewSource = SourceCheckoutService.prototype.previewSource;
  const prepareSourceCheckout = SourceCheckoutService.prototype.prepareSourceCheckout;
  vi.spyOn(SourceCheckoutService.prototype, "previewSource").mockImplementation(
    async function (locator, options) {
      const repoPath = repoFixtureForLocator(repos, locator);
      return previewSource.call(this, repoPath, options);
    },
  );
  vi.spyOn(SourceCheckoutService.prototype, "prepareSourceCheckout").mockImplementation(
    async function (locator, input) {
      const repoPath = repoFixtureForLocator(repos, locator);
      return prepareSourceCheckout.call(this, repoPath, input);
    },
  );
}

function repoFixtureForLocator(repos: Map<string, string>, locator: string): string {
  const normalized = locator
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/i, "");
  const repoPath = repos.get(normalized);
  if (!repoPath) {
    throw new Error(`Unexpected provider locator: ${locator}`);
  }
  return repoPath;
}

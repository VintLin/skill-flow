import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, pathExists, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("skill collection diagnostics", () => {
  const sandbox = useSkillFlowSandbox();

  test("collection reports origin hash changed without mutating snapshot", async () => {
    const app = await seedCollection();
    const store = new StateStore(app.store.rootPath);
    const before = await store.readState();
    const originLeaf = before.lockFile.leafInventory.find((leaf) =>
      leaf.id === "writing-source:skills/frontend-design"
    );
    expect(originLeaf).toBeDefined();
    await fs.writeFile(
      originLeaf!.skillFilePath,
      skillDoc("frontend-design", "Updated origin.", "# Updated Origin"),
      "utf8",
    );

    const inspected = await app.inspectCollection("writing-stack");

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.diagnostics).toContainEqual(expect.objectContaining({
      code: "COLLECTION_ORIGIN_HASH_CHANGED",
      details: expect.objectContaining({
        sourceId: "writing-source",
        leafId: "writing-source:skills/frontend-design",
        repoPath: "skills/frontend-design",
        capturedHash: expect.any(String),
        currentHash: expect.any(String),
      }),
    }));
    const snapshot = await fs.readFile(
      path.join(app.store.rootPath, "source", "collection", "writing-stack", "member-1", "SKILL.md"),
      "utf8",
    );
    expect(snapshot).toContain("Design frontends.");
    expect(snapshot).not.toContain("Updated origin.");
  });

  test("collection projection hash comes from materialized snapshot after origin changes", async () => {
    const app = await seedCollection();
    const store = new StateStore(app.store.rootPath);
    const before = await store.readState();
    const originLeaf = before.lockFile.leafInventory.find((leaf) =>
      leaf.id === "writing-source:skills/frontend-design"
    );
    const collectionLeaf = before.lockFile.leafInventory.find((leaf) =>
      leaf.id === "writing-stack:member-1"
    );
    expect(originLeaf).toBeDefined();
    expect(collectionLeaf).toBeDefined();
    await fs.writeFile(
      originLeaf!.skillFilePath,
      skillDoc("frontend-design", "Updated origin.", "# Updated Origin"),
      "utf8",
    );
    await fs.rm(path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "member-1"), {
      recursive: true,
      force: true,
    });

    const repaired = await app.repairTargets(["writing-stack"]);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }
    expect(repaired.data.actions).toContainEqual(expect.objectContaining({
      sourceId: "writing-stack",
      leafId: "writing-stack:member-1",
      target: "codex",
      contentHash: collectionLeaf!.contentHash,
    }));
    const targetSkill = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "member-1", "SKILL.md");
    expect(await pathExists(targetSkill)).toBe(true);
    const targetContent = await fs.readFile(targetSkill, "utf8");
    expect(targetContent).toContain("Design frontends.");
    expect(targetContent).not.toContain("Updated origin.");
    const after = await store.readState();
    expect(after.lockFile.projections).toContainEqual(expect.objectContaining({
      sourceId: "writing-stack",
      leafId: "writing-stack:member-1",
      target: "codex",
      contentHash: collectionLeaf!.contentHash,
      status: "active",
    }));
  });

  async function seedCollection(): Promise<SkillFlowApp> {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, {
      sourceIdOverride: "writing-source",
      project: false,
    });
    const editing = await app.addSource(editingRepo, {
      sourceIdOverride: "editing-source",
      project: false,
    });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    const created = await app.createCollection({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: "writing-source:skills/frontend-design" },
        { sourceId: "editing-source", leafId: "editing-source:skills/revision" },
      ],
      enabledTargets: ["codex"],
    });
    expect(created.ok).toBe(true);
    return app;
  }
});

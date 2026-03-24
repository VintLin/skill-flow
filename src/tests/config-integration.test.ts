import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { DraftBinding } from "../domain/types.js";
import { SkillFlowApp } from "../services/skill-flow.js";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

describe.sequential("config integration", () => {
  const sandbox = useSkillFlowSandbox();

  test("store init is safe under concurrent callers", async () => {
    const app = new SkillFlowApp();

    await Promise.all(
      Array.from({ length: 12 }, () => app.store.init()),
    );

    expect(await pathExists(app.store.manifestPath)).toBe(true);
    expect(await pathExists(app.store.lockPath)).toBe(true);
    expect(await app.store.readManifest()).toEqual({
      schemaVersion: 1,
      sources: [],
      bindings: {},
    });
    expect(await app.store.readLock()).toEqual({
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      deployments: [],
    });
  });

  test("bootstrap detects symlinked skills inside agent roots", async () => {
    const app = new SkillFlowApp();
    const externalRoot = path.join(sandbox.sandboxRoot, "external-skill");
    await writeRepoFiles(externalRoot, {
      "SKILL.md": skillDoc("linked-skill", "Symlinked external skill."),
    });

    await fs.symlink(
      externalRoot,
      path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "linked-skill"),
      "junction",
    );

    await app.store.init();
    const manifest = await app.store.readManifest();
    const lock = await app.store.readLock();
    const detected = await app.workspaceBootstrapService.detectUnmanagedExternalSkills(
      manifest,
      lock,
    );

    expect(detected.some((item) => item.displayName === "linked-skill")).toBe(true);
    expect(await app.store.readManifest()).toEqual(manifest);
    expect(await app.store.readLock()).toEqual(lock);
  });

  test("config boot prunes groups whose local checkout is missing", async () => {
    const liveRepo = await createRepo(sandbox.sandboxRoot, {
      "slides/SKILL.md": skillDoc("slides", "Slides flow."),
    });
    const staleRepo = await createRepo(sandbox.sandboxRoot, {
      "eval/SKILL.md": skillDoc("eval", "Eval flow."),
    });
    const app = new SkillFlowApp();

    const live = await app.addSource(liveRepo, { project: false });
    const stale = await app.addSource(staleRepo, { project: false });
    expect(live.ok).toBe(true);
    expect(stale.ok).toBe(true);
    if (!live.ok || !stale.ok) {
      return;
    }

    await app.applyDraft(stale.data.manifest.id, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [`${stale.data.manifest.id}:eval`],
    });
    await fs.rm(stale.data.lock.checkoutPath, { recursive: true, force: true });

    const boot = await app.configCoordinator.bootstrapWorkspaceState();

    expect(boot.ok).toBe(true);
    if (!boot.ok) {
      return;
    }
    expect(boot.data.summaries.map((summary) => summary.source.id)).toEqual([
      live.data.manifest.id,
    ]);
    expect(boot.data.bootStatus.failedSources).toEqual([]);

    const manifest = await app.store.readManifest();
    expect(manifest.sources.map((source) => source.id)).toEqual([live.data.manifest.id]);
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_OPENCLAW!, "eval"))).toBe(
      false,
    );
  });

  test("previewDraft is read-only and does not reconcile inventory on its own", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const lockPath = path.join(sandbox.stateRoot, "lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      sources: Array<{ id: string; leafIds: string[] }>;
      leafInventory: Array<Record<string, unknown>>;
    };
    const existingLeaf = lock.leafInventory[0] as {
      id: string;
      absolutePath: string;
      linkName: string;
      name: string;
      relativePath: string;
      skillFilePath: string;
      sourceId: string;
      title: string;
    };
    const generatedLeafId = `${sourceId}:.agents/skills/generated`;
    lock.sources[0]!.leafIds.push(generatedLeafId);
    lock.leafInventory.push({
      ...existingLeaf,
      id: generatedLeafId,
      relativePath: ".agents/skills/generated",
      absolutePath: path.join(
        sandbox.stateRoot,
        "source",
        "git",
        sourceId,
        ".agents/skills/generated",
      ),
      skillFilePath: path.join(
        sandbox.stateRoot,
        "source",
        "git",
        sourceId,
        ".agents/skills/generated/SKILL.md",
      ),
      linkName: "generated",
      name: "generated",
      title: "generated",
    });
    const mutatedLock = `${JSON.stringify(lock, null, 2)}\n`;
    await fs.writeFile(lockPath, mutatedLock, "utf8");

    const preview = await app.previewDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [`${sourceId}:browse`],
    });

    expect(preview.ok).toBe(true);
    expect(await fs.readFile(lockPath, "utf8")).toBe(mutatedLock);
  });

  test("getConfigData normalizes per-target bindings to the config draft model", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
      "review/SKILL.md": skillDoc("review", "Review flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const manifest = await app.store.readManifest();
    manifest.bindings[sourceId] = {
      targets: {
        "claude-code": {
          enabled: true,
          leafIds: [`${sourceId}:browse`],
        },
        codex: {
          enabled: true,
          leafIds: [`${sourceId}:review`],
        },
      },
    };
    await app.store.writeManifest(manifest);

    const result = await app.getConfigData();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const normalizedManifest = await app.store.readManifest();
    expect(normalizedManifest.bindings[sourceId]).toEqual({
      selectedLeafIds: [`${sourceId}:browse`, `${sourceId}:review`],
      targets: {
        "claude-code": {
          enabled: true,
          leafIds: [`${sourceId}:browse`, `${sourceId}:review`],
        },
        codex: {
          enabled: true,
          leafIds: [`${sourceId}:browse`, `${sourceId}:review`],
        },
      },
    });
    expect(
      result.data.summaries.find((summary) => summary.source.id === sourceId)?.bindings,
    ).toEqual(normalizedManifest.bindings[sourceId]);
  });

  test("preview and apply can run concurrently without corrupting state files", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const nextDraft: DraftBinding = {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [`${sourceId}:browse`],
    };

    const results = await Promise.all([
      app.previewDraft(sourceId, nextDraft),
      app.applyDraft(sourceId, nextDraft),
      app.previewDraft(sourceId, nextDraft),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);

    const manifest = await app.store.readManifest();
    const lock = await app.store.readLock();
    expect(manifest.bindings[sourceId]?.targets["claude-code"]?.leafIds).toEqual([
      `${sourceId}:browse`,
    ]);
    expect(lock.sources.map((source) => source.id)).toEqual([sourceId]);
  });

  test("concurrent applyDraft calls are serialized and keep the last draft", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:browse`;

    const [first, second] = await Promise.all([
      app.applyDraft(sourceId, {
        enabledTargets: ["claude-code"],
        selectedLeafIds: [leafId],
      }),
      app.applyDraft(sourceId, {
        enabledTargets: ["codex"],
        selectedLeafIds: [leafId],
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const manifest = await app.store.readManifest();
    expect(manifest.bindings[sourceId]).toEqual({
      selectedLeafIds: [leafId],
      targets: {
        codex: {
          enabled: true,
          leafIds: [leafId],
        },
      },
    });
  });

  test("concurrent app instances do not lose sources while mutating the same state root", async () => {
    const repoA = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow A."),
    });
    const repoB = await createRepo(sandbox.sandboxRoot, {
      "review/SKILL.md": skillDoc("review", "Review flow B."),
    });
    const appA = new SkillFlowApp();
    const appB = new SkillFlowApp();

    const [addedA, addedB] = await Promise.all([
      appA.addSource(repoA, { project: false }),
      appB.addSource(repoB, { project: false }),
    ]);

    expect(addedA.ok).toBe(true);
    expect(addedB.ok).toBe(true);
    if (!addedA.ok || !addedB.ok) {
      return;
    }

    const manifest = await appA.store.readManifest();
    expect(manifest.sources.map((source) => source.id).sort()).toEqual(
      [addedA.data.manifest.id, addedB.data.manifest.id].sort(),
    );
  });
});

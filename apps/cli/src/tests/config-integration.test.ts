import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { DraftBinding } from "@skill-flow/domain/types";
import { createLegacyAgentsOriginReader } from "@skill-flow/core-engine/services/legacy-agents-lock";
import { SkillFlowApp } from "@skill-flow/query/runtime";
import { StateStore } from "@skill-flow/storage/state-store";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

const v2 = (app: { store: { rootPath: string } }): StateStore => new StateStore(app.store.rootPath);
const v2State = async (app: { store: { rootPath: string } }) =>
  v2(app).readState();

describe.sequential("config integration", () => {
  const sandbox = useSkillFlowSandbox();

  test("store init is safe under concurrent callers", async () => {
    const app = new SkillFlowApp();

    await Promise.all(
      Array.from({ length: 12 }, () => v2(app).init()),
    );

    expect(await pathExists(v2(app).manifestPath)).toBe(true);
    expect(await pathExists(v2(app).lockPath)).toBe(true);
    expect(await v2(app).readManifest()).toMatchObject({
      schemaVersion: 2,
      sources: [],
      bindings: {},
    });
    expect(await v2(app).readLock()).toMatchObject({
      schemaVersion: 2,
      sources: {},
      leafInventory: [],
      projections: [],
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


    const { manifest, lockFile: lock } = await v2State(app);
    const detected = await app.workspaceBootstrapService.detectUnmanagedExternalSkills(
      manifest,
      lock,
    );

    expect(detected.some((item) => item.displayName === "linked-skill")).toBe(true);
    expect(
      detected.find((item) => item.displayName === "linked-skill")?.observedTargets,
    ).toEqual([
      {
        target: "codex",
        rootPath: process.env.SKILL_FLOW_TARGET_CODEX!,
        targetPath: path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "linked-skill"),
      },
    ]);
    expect((await v2State(app)).manifest).toEqual(manifest);
    expect((await v2State(app)).lockFile).toEqual(lock);
  });

  test("bootstrap ignores target paths already owned by managed projections even without deployments", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "linked-skill/SKILL.md": skillDoc("linked-skill", "Managed linked skill."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:linked-skill`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["codex"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const { manifest, lockFile } = await v2State(app);
    const lockWithoutProjections = { ...lockFile, projections: [] };

    const detected = await app.workspaceBootstrapService.detectUnmanagedExternalSkills(
      manifest,
      lockWithoutProjections,
    );

    expect(detected.some((item) => item.sourceId === sourceId)).toBe(false);
  });

  test("bootstrap collapses the same realpath discovered under different target entry names", async () => {
    const app = new SkillFlowApp();
    const externalRoot = path.join(sandbox.sandboxRoot, "external-skill-shared");
    await writeRepoFiles(externalRoot, {
      "SKILL.md": skillDoc("shared-skill", "Shared external skill."),
    });

    await fs.symlink(
      externalRoot,
      path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "shared-skill"),
      "junction",
    );
    await fs.symlink(
      externalRoot,
      path.join(process.env.SKILL_FLOW_TARGET_GEMINI_CLI!, "renamed-shared-skill"),
      "junction",
    );


    const { manifest, lockFile: lock } = await v2State(app);
    const detected = await app.workspaceBootstrapService.detectUnmanagedExternalSkills(
      manifest,
      lock,
    );
    const externalRealPath = await fs.realpath(externalRoot);

    expect(detected).toHaveLength(1);
    expect(detected[0]?.path).toBe(externalRealPath);
    expect(detected[0]?.importedFromTargets).toEqual(["codex", "gemini-cli"]);
    expect(detected[0]?.observedTargets).toEqual([
      {
        target: "codex",
        rootPath: process.env.SKILL_FLOW_TARGET_CODEX!,
        targetPath: path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "shared-skill"),
      },
      {
        target: "gemini-cli",
        rootPath: process.env.SKILL_FLOW_TARGET_GEMINI_CLI!,
        targetPath: path.join(process.env.SKILL_FLOW_TARGET_GEMINI_CLI!, "renamed-shared-skill"),
      },
    ]);

    const imported = await app.addSource(detected[0]!.path, {
      project: false,
      importedFromTargets: detected[0]!.importedFromTargets,
      observedTargets: detected[0]!.observedTargets,
      importMode: "bootstrap-detected",
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const lockAfter = await v2(app).readLock();
    expect(
      lockAfter.sources[imported.data.manifest.id]?.observedTargets,
    ).toEqual(detected[0]!.observedTargets);
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

    const manifest = await v2(app).readManifest();
    expect(manifest.sources.map((source) => source.id)).toEqual([live.data.manifest.id]);
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_OPENCLAW!, "eval"))).toBe(
      false,
    );
  });

  test("config boot skips unmanaged deployment paths while pruning missing checkouts", async () => {
    const staleRepo = await createRepo(sandbox.sandboxRoot, {
      "eval/SKILL.md": skillDoc("eval", "Eval flow."),
    });
    const app = new SkillFlowApp();

    const stale = await app.addSource(staleRepo, { project: false });
    expect(stale.ok).toBe(true);
    if (!stale.ok) {
      return;
    }

    await app.applyDraft(stale.data.manifest.id, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [`${stale.data.manifest.id}:eval`],
    });

    const externalPath = path.join(sandbox.sandboxRoot, "prune-external");
    await writeRepoFiles(externalPath, {
      "SKILL.md": skillDoc("external", "Keep external content."),
    });

    const lock = await v2(app).readLock();
    const deployment = lock.projections.find(
      (item) => item.sourceId === stale.data.manifest.id && item.target === "openclaw",
    );
    expect(deployment).toBeTruthy();
    if (!deployment) {
      return;
    }
    deployment.targetPath = externalPath;
    await v2(app).writeState({ ...(await v2(app).readState()), lockFile: lock });

    await fs.rm(stale.data.lock.checkoutPath, { recursive: true, force: true });

    const boot = await app.configCoordinator.bootstrapWorkspaceState();

    expect(boot.ok).toBe(true);
    if (!boot.ok) {
      return;
    }
    expect(await pathExists(externalPath)).toBe(true);

    const manifest = await v2(app).readManifest();
    expect(manifest.sources).toHaveLength(0);
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
      sources: Record<string, { sourceId: string; leafIds: string[] }>;
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
    lock.sources[sourceId]!.leafIds.push(generatedLeafId);
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

  test("previewDraft tolerates legacy lock files without deployments", async () => {
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
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as Record<string, unknown>;
    delete lock.deployments;
    await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

    const preview = await app.previewDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [`${sourceId}:browse`],
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.data.plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId,
          leafId: `${sourceId}:browse`,
          target: "claude-code",
        }),
      ]),
    );
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
    const manifest = await v2(app).readManifest();
    manifest.bindings[sourceId] = {
      sourceId,
      selectionMode: "selected",
      selectedLeafIds: [`${sourceId}:browse`, `${sourceId}:review`],
      enabledTargets: ["claude-code", "codex"],
    };
    await v2(app).writeState({ ...(await v2(app).readState()), manifest: manifest });

    const result = await app.getConfigData();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const normalizedManifest = await v2(app).readManifest();
    expect(normalizedManifest.bindings[sourceId]).toEqual({
      sourceId,
      selectionMode: "selected",
      selectedLeafIds: [`${sourceId}:browse`, `${sourceId}:review`],
      enabledTargets: ["claude-code", "codex"],
    });
    expect(
      result.data.summaries.find((summary) => summary.source.id === sourceId)?.bindings,
    ).toEqual({
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

    const { manifest, lockFile: lock } = await v2State(app);
    expect(manifest.bindings[sourceId]).toEqual({
      sourceId,
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["claude-code"],
    });
    expect(Object.keys(lock.sources)).toEqual([sourceId]);
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

    const { manifest } = await v2State(app);
    expect(manifest.bindings[sourceId]).toEqual({
      sourceId,
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
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

    const manifest = await v2(appA).readManifest();
    expect(manifest.sources.map((source) => source.id).sort()).toEqual(
      [addedA.data.manifest.id, addedB.data.manifest.id].sort(),
    );
  });

  test("local import scan reads unmanaged local skill metadata", async () => {
    const app = new SkillFlowApp();
    const localSkillPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "local-writer");
    await writeRepoFiles(localSkillPath, {
      "SKILL.md": skillDoc("local-writer", "Writes local drafts.").replace(/\n/g, "\r\n"),
    });


    const { manifest, lockFile } = await v2State(app);
    const detected = await app.workspaceBootstrapService.detectUnmanagedExternalSkills(
      manifest,
      lockFile,
    );
    const scanned = await app.workspaceBootstrapService.scanUnmanagedLocalSkills(
      manifest,
      lockFile,
    );

    expect(scanned).toHaveLength(1);
    expect(scanned[0]).toMatchObject({
      displayName: "local-writer",
      title: "local-writer",
      description: "Writes local drafts.",
      importedFromTargets: ["codex"],
    });
    expect(detected[0]?.contentHash).toEqual(expect.any(String));
    expect(scanned[0]?.contentHash).toBe(detected[0]?.contentHash);
    expect(scanned[0]?.contentHash).toEqual(expect.any(String));
  });

  test("local import scan preserves agents lock origin metadata", async () => {
    const agentsRoot = path.join(sandbox.sandboxRoot, "home", ".agents");
    const oldHome = process.env.HOME;

    try {
      process.env.HOME = path.join(sandbox.sandboxRoot, "home");
      const app = new SkillFlowApp({
        agentsOriginReader: createLegacyAgentsOriginReader(),
      });
      await writeRepoFiles(
        path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "resume-bullet-writer"),
        {
          "SKILL.md": skillDoc("resume-bullet-writer", "Write resume bullets."),
        },
      );
      await writeRepoFiles(agentsRoot, {
        ".skill-lock.json": JSON.stringify({
          skills: {
            "resume-bullet-writer": {
              source: "paramchoudhary/resumeskills",
              sourceType: "github",
              skillPath: "skills/resume-bullet-writer",
              branch: "main",
            },
          },
        }),
      });


      const { manifest, lockFile } = await v2State(app);
      const scanned = await app.workspaceBootstrapService.scanUnmanagedLocalSkills(
        manifest,
        lockFile,
      );

      expect(scanned[0]).toMatchObject({
        originLocator: "https://github.com/paramchoudhary/resumeskills.git",
        originRequestedPath: "skills/resume-bullet-writer",
        originBranch: "main",
      });
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = oldHome;
      }
    }
  });
});

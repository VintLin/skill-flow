import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { PreferencesFile } from "@skill-flow/domain/types";
import { DoctorService } from "@skill-flow/core-engine/services/doctor-service";
import { StateStore } from "@skill-flow/storage/state-store";
import { SkillFlowApp } from "@skill-flow/query/runtime";
import {
  createBareRemote,
  createRepo,
  git,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

const v2 = (app: { store: { rootPath: string } }): StateStore => new StateStore(app.store.rootPath);
const v2State = async (app: { store: { rootPath: string } }) =>
  v2(app).readState();

describe.sequential("skill-flow", () => {
  const sandbox = useSkillFlowSandbox();

  async function installCustomTarget(
    app: SkillFlowApp,
    customTarget: PreferencesFile["customTargets"][number],
    recentProjects: PreferencesFile["recentProjects"] = [],
  ) {
    const preferences = await v2(app).readPreferences();
    await v2(app).writeState({ ...(await v2(app).readState()), preferences: {
      ...preferences,
      recentProjects,
      customTargets: [customTarget],
      agentDisplayOrder: [...preferences.agentDisplayOrder, customTarget.id],
    } });
  }

  test("applyDraft deploys to a custom global target", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const customRoot = path.join(sandbox.targetsRoot, "my-agent-global");
    await fs.mkdir(customRoot, { recursive: true });

    const app = new SkillFlowApp();
    await installCustomTarget(app, {
      id: "my-agent",
      name: "My Agent",
      globalPath: customRoot,
      projectPathTemplate: ".my-agent/skills",
      strategy: "copy",
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
    });

    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.sourceId;
    const leafId = `${sourceId}:browse`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["my-agent"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const lock = (await v2State(app)).lockFile;
    const deployment = lock.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "my-agent",
    );
    expect(deployment?.targetRootPath).toBe(customRoot);
    expect(deployment?.targetPath).toBe(path.join(customRoot, "browse"));
    expect(await pathExists(path.join(customRoot, "browse", "SKILL.md"))).toBe(true);
  });

  test("applyDraft deploys to a custom project target using the project-relative template", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const customRoot = path.join(sandbox.targetsRoot, "my-agent-global");
    await fs.mkdir(customRoot, { recursive: true });

    const app = new SkillFlowApp();
    await installCustomTarget(
      app,
      {
        id: "my-agent",
        name: "My Agent",
        globalPath: customRoot,
        projectPathTemplate: ".my-agent/project-skills",
        strategy: "copy",
        createdAt: "2026-04-08T00:00:00.000Z",
        updatedAt: "2026-04-08T00:00:00.000Z",
      },
      [
        {
          projectId: "repo-a",
          title: "Repo A",
          lastActivityAt: "2026-04-08T00:00:00.000Z",
          projectPath: repoPath,
          tools: [],
        },
      ],
    );

    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.sourceId;
    const leafId = `${sourceId}:browse`;
    const applied = await app.applyDraft(
      sourceId,
      {
        enabledTargets: ["my-agent"],
        selectedLeafIds: [leafId],
      },
      { kind: "project", projectId: "repo-a" },
    );
    expect(applied.ok).toBe(true);
    const projectRoot = path.join(repoPath, ".my-agent", "project-skills");
    expect(await pathExists(path.join(projectRoot, "browse", "SKILL.md"))).toBe(true);
  });

  test("uninstall removes managed copied projections even when they drifted", async () => {
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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const lock = (await v2State(app)).lockFile;
    const deployment = lock.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "openclaw",
    );
    expect(deployment).toBeTruthy();
    if (!deployment) {
      return;
    }

    await writeRepoFiles(path.dirname(deployment.targetPath), {
      [`${path.basename(deployment.targetPath)}/SKILL.md`]: "# Drifted\nChanged content.",
    });

    const removed = await app.uninstall([sourceId]);
    expect(removed.ok).toBe(true);
    expect(await pathExists(deployment.targetPath)).toBe(false);
  });

  test("uninstall refuses to delete deployment paths outside the managed target root", async () => {
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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const externalPath = path.join(sandbox.sandboxRoot, "external-target");
    await writeRepoFiles(externalPath, {
      "SKILL.md": skillDoc("external", "Keep external content."),
    });

    const lock = await v2(app).readLock();
    const deployment = lock.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "openclaw",
    );
    expect(deployment).toBeTruthy();
    if (!deployment) {
      return;
    }
    deployment.targetPath = externalPath;
    const projection = lock.projections.find(
      (item) =>
        item.sourceId === sourceId &&
        item.leafId === leafId &&
        item.target === "openclaw",
    );
    if (!projection) {
      throw new Error("expected managed projection for openclaw");
    }
    projection.targetPath = externalPath;
    await v2(app).writeState({ ...(await v2(app).readState()), lockFile: lock });

    const removed = await app.uninstall([sourceId]);
    expect(removed.ok).toBe(false);
    if (removed.ok) {
      return;
    }

    expect(removed.errors[0]?.code).toBe("GROUP_DELETE_INCOMPLETE");
    expect(await pathExists(externalPath)).toBe(true);

    const manifest = (await v2State(app)).manifest;
    expect(manifest.sources.some((source) => source.id === sourceId)).toBe(true);
  });

  test("uninstall refuses to delete the managed target root itself", async () => {
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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const lock = await v2(app).readLock();
    const deployment = lock.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "openclaw",
    );
    expect(deployment).toBeTruthy();
    if (!deployment) {
      return;
    }
    deployment.targetPath = process.env.SKILL_FLOW_TARGET_OPENCLAW!;
    deployment.targetRootPath = process.env.SKILL_FLOW_TARGET_OPENCLAW!;
    const projection = lock.projections.find(
      (item) =>
        item.sourceId === sourceId &&
        item.leafId === leafId &&
        item.target === "openclaw",
    );
    if (!projection) {
      throw new Error("expected managed projection for openclaw");
    }
    projection.targetPath = process.env.SKILL_FLOW_TARGET_OPENCLAW!;
    projection.targetRootPath = process.env.SKILL_FLOW_TARGET_OPENCLAW!;
    await v2(app).writeState({ ...(await v2(app).readState()), lockFile: lock });

    const removed = await app.uninstall([sourceId]);
    expect(removed.ok).toBe(false);
    if (removed.ok) {
      return;
    }

    expect(removed.errors[0]?.code).toBe("GROUP_DELETE_INCOMPLETE");
    expect(await pathExists(process.env.SKILL_FLOW_TARGET_OPENCLAW!)).toBe(true);
  });

  test("applyDraft removes an existing deployment after the target root changes", async () => {
    const oldRoot = path.join(sandbox.targetsRoot, "openclaw-old");
    const newRoot = path.join(sandbox.targetsRoot, "openclaw-new");
    await fs.mkdir(oldRoot, { recursive: true });
    await fs.mkdir(newRoot, { recursive: true });
    process.env.SKILL_FLOW_TARGET_OPENCLAW = oldRoot;

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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const lockBefore = (await v2State(app)).lockFile;
    const deployment = lockBefore.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "openclaw",
    );
    expect(deployment).toBeTruthy();
    if (!deployment) {
      return;
    }
    expect(deployment.targetRootPath).toBe(oldRoot);
    expect(await pathExists(deployment.targetPath)).toBe(true);

    process.env.SKILL_FLOW_TARGET_OPENCLAW = newRoot;

    const removed = await app.applyDraft(sourceId, {
      enabledTargets: [],
      selectedLeafIds: [],
    });
    expect(removed.ok).toBe(true);
    expect(await pathExists(deployment.targetPath)).toBe(false);
  });

  test("uninstall removes an existing deployment after the target root changes", async () => {
    const oldRoot = path.join(sandbox.targetsRoot, "codex-old");
    const newRoot = path.join(sandbox.targetsRoot, "codex-new");
    await fs.mkdir(oldRoot, { recursive: true });
    await fs.mkdir(newRoot, { recursive: true });
    process.env.SKILL_FLOW_TARGET_CODEX = oldRoot;

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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["codex"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const lockBefore = (await v2State(app)).lockFile;
    const deployment = lockBefore.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "codex",
    );
    expect(deployment).toBeTruthy();
    if (!deployment) {
      return;
    }
    expect(deployment.targetRootPath).toBe(oldRoot);
    expect(await pathExists(deployment.targetPath)).toBe(true);

    process.env.SKILL_FLOW_TARGET_CODEX = newRoot;

    const removed = await app.uninstall([sourceId]);
    expect(removed.ok).toBe(true);
    expect(await pathExists(deployment.targetPath)).toBe(false);
  });

  test("uninstall removes bootstrap-detected codex projections without deployment records", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "gstack");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      importMode: "bootstrap-detected",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack");
    await fs.symlink(externalSkillPath, targetPath, "junction");

    const removed = await app.uninstall([sourceId]);
    expect(removed.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
  });

  test("applyDraft removes bootstrap-detected codex projections without deployment records", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "gstack");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      importMode: "bootstrap-detected",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = added.data.leafs[0]?.id;
    expect(leafId).toBeTruthy();
    if (!leafId) {
      return;
    }
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack");
    await fs.symlink(externalSkillPath, targetPath, "junction");

    const removed = await app.applyDraft(sourceId, {
      enabledTargets: [],
      selectedLeafIds: [leafId],
    });
    expect(removed.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
  });

  test("applyDraft removes orphan codex symlinks that point to source checkout after projection state drifts away", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "dbs/SKILL.md": skillDoc("dbs", "Business toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:dbs`;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "dbs");
    await fs.symlink(path.join(added.data.lock.checkoutPath, "dbs"), targetPath, "junction");

    const manifest = await v2(app).readManifest();
    manifest.bindings[sourceId] = {
      sourceId,
      selectionMode: "selected",
      selectedLeafIds: [leafId],
      enabledTargets: [],
    };
    const lock = await v2(app).readLock();
    lock.projections = (lock.projections ?? []).filter((projection) => projection.sourceId !== sourceId);
    await v2(app).writeState({ ...(await v2(app).readState()), manifest: manifest, lockFile: lock });

    const removed = await app.applyDraft(sourceId, {
      enabledTargets: [],
      selectedLeafIds: [leafId],
    });
    expect(removed.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
    expect(
      removed.warnings.some((warning) => warning.code === "DETACHED_TARGET_SYMLINK_REMOVED"),
    ).toBe(true);
  });

  test("applyDraft keeps a shared target path while another enabled target still points to the same root", async () => {
    const sharedRoot = path.join(sandbox.targetsRoot, "shared-agents");
    await fs.mkdir(sharedRoot, { recursive: true });
    process.env.SKILL_FLOW_TARGET_CODEX = sharedRoot;
    process.env.SKILL_FLOW_TARGET_GEMINI_CLI = sharedRoot;

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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["codex", "gemini-cli"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const targetPath = path.join(sharedRoot, "browse");
    expect(await pathExists(targetPath)).toBe(true);

    const disabledFirst = await app.applyDraft(sourceId, {
      enabledTargets: ["gemini-cli"],
      selectedLeafIds: [leafId],
    });
    expect(disabledFirst.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);

    const disabledFinal = await app.applyDraft(sourceId, {
      enabledTargets: [],
      selectedLeafIds: [],
    });
    expect(disabledFinal.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
  });

  test("applyDraft keeps a shared target path when bootstrap-imported and managed ownership converge", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "browse");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("browse", "External browse skill."),
    });
    const managedRepoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Managed browse skill."),
    });
    const app = new SkillFlowApp();

    const managedAdded = await app.addSource(managedRepoPath, { project: false });
    const bootstrapAdded = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      importMode: "bootstrap-detected",
    });
    expect(managedAdded.ok).toBe(true);
    expect(bootstrapAdded.ok).toBe(true);
    if (!managedAdded.ok || !bootstrapAdded.ok) {
      return;
    }

    const managedSourceId = managedAdded.data.manifest.id;
    const managedLeafId = `${managedSourceId}:browse`;
    const bootstrapSourceId = bootstrapAdded.data.manifest.id;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "browse");

    const managedApplied = await app.applyDraft(managedSourceId, {
      enabledTargets: ["codex"],
      selectedLeafIds: [managedLeafId],
    });
    expect(managedApplied.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);

    const bootstrapDisabled = await app.applyDraft(bootstrapSourceId, {
      enabledTargets: [],
      selectedLeafIds: [`${bootstrapSourceId}:.`],
    });
    expect(bootstrapDisabled.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);
  });

  test("applyDraft turning off a bootstrap-detected target succeeds when the mounted path was already deleted", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "gstack-missing-off");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      importMode: "bootstrap-detected",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack");
    await fs.symlink(externalSkillPath, targetPath, "junction");
    await fs.rm(targetPath, { recursive: true, force: true });

    const removed = await app.applyDraft(sourceId, {
      enabledTargets: [],
      selectedLeafIds: [`${sourceId}:.`],
    });
    expect(removed.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
  });

  test("uninstall succeeds when a bootstrap-detected mounted path was already deleted by the user", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "gstack-missing-uninstall");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      importMode: "bootstrap-detected",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack");
    await fs.symlink(externalSkillPath, targetPath, "junction");
    await fs.rm(targetPath, { recursive: true, force: true });

    const removed = await app.uninstall([sourceId]);
    expect(removed.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
  });

  test("doctor prunes bootstrap-detected imported paths when the checkout is missing", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "gstack-prune");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      importMode: "bootstrap-detected",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack-prune");
    const checkoutPath = app.store.getSourceCheckoutPath("local", sourceId);
    await fs.symlink(externalSkillPath, targetPath, "junction");
    await fs.rm(checkoutPath, { recursive: true, force: true });

    const doctor = await app.doctor();
    expect(doctor.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);

    const { manifest, lockFile: lock } = await v2State(app);
    expect(manifest.sources.some((source) => source.id === sourceId)).toBe(false);
    expect(lock.sources[sourceId]).toBeUndefined();
  });

  test("repairTargets explicitly warns when asked to repair an imported-only bootstrap source", async () => {
    const externalSkillPath = path.join(sandbox.sandboxRoot, "gstack-repair-bootstrap");
    await writeRepoFiles(externalSkillPath, {
      "SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(externalSkillPath, {
      project: false,
      importedFromTargets: ["codex"],
      importMode: "bootstrap-detected",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack-repair-bootstrap");
    await fs.rm(targetPath, { recursive: true, force: true });

    const repaired = await app.repairTargets([sourceId]);

    expect(repaired.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
    expect(
      repaired.warnings.some((warning) => warning.code === "REPAIR_TARGETS_SKIPPED_BOOTSTRAP_IMPORTED"),
    ).toBe(true);
  });

  test("repairTargets restores managed paths from projections when deployments are empty", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "gstack/SKILL.md": skillDoc("gstack", "Workflow toolkit."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:gstack`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["codex"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "gstack");
    const { manifest, lockFile } = await v2(app).readState();
    await v2(app).writeState({ ...(await v2(app).readState()), manifest, lockFile });
    await fs.rm(targetPath, { recursive: true, force: true });

    const repaired = await app.repairTargets([sourceId]);

    expect(repaired.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);
  });

  test("renames preview target when foreign content already exists at target path", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    await fs.mkdir(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "good"), {
      recursive: true,
    });

    const preview = await app.previewDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.data.plan.blocked).toHaveLength(0);
    const action = preview.data.plan.actions.find((item) => item.leafId === leafId);
    expect(action?.targetPath).not.toBe(
      path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "good"),
    );
  });

  test("replaces identical external directory content at target path", async () => {
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
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse");
    await writeRepoFiles(targetPath, {
      "SKILL.md": skillDoc("browse", "Browser flow."),
      "local.txt": "external",
    });

    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(await fs.lstat(targetPath)).toSatisfy((stats: { isSymbolicLink(): boolean }) =>
      stats.isSymbolicLink(),
    );
    expect(await pathExists(path.join(targetPath, "local.txt"))).toBe(false);
  });

  test("replaces identical external symlink content at target path", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const externalRepo = await createRepo(sandbox.sandboxRoot, {
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
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse");
    await fs.symlink(path.join(externalRepo, "browse"), targetPath, "junction");

    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(path.resolve(await fs.readlink(targetPath))).toBe(
      path.join(added.data.lock.checkoutPath, "browse"),
    );
  });

  test("keeps external different-content skill and renames our projection instead", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Managed browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:browse`;
    const targetRoot = process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!;
    await writeRepoFiles(path.join(targetRoot, "browse"), {
      "SKILL.md": skillDoc("browse", "External browser flow."),
    });

    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(await fs.lstat(path.join(targetRoot, "browse"))).toSatisfy(
      (stats: { isSymbolicLink(): boolean }) => !stats.isSymbolicLink(),
    );

    const lock = (await v2State(app)).lockFile;
    const deployment = lock.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "claude-code",
    );
    expect(deployment).toBeTruthy();
    expect(deployment?.targetPath).not.toBe(path.join(targetRoot, "browse"));
    expect(await pathExists(deployment?.targetPath ?? "")).toBe(true);
  });

  test("repairState clamps removed deployment count at zero when rebuilding records", async () => {
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
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    const lock = await v2(app).readLock();
    lock.projections = lock.projections.filter(
      (deployment) =>
        !(deployment.sourceId === sourceId &&
          deployment.leafId === leafId &&
          deployment.target === "claude-code"),
    );
    await v2(app).writeState({ ...(await v2(app).readState()), lockFile: lock });

    const repaired = await app.repairState([sourceId]);
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }

    expect(repaired.data.removedDeploymentCount).toBe(0);

    const nextLock = (await v2State(app)).lockFile;
    expect(
      nextLock.projections.some(
        (deployment) =>
          deployment.sourceId === sourceId &&
          deployment.leafId === leafId &&
          deployment.target === "claude-code",
      ),
    ).toBe(true);
  });

  test("relocates external skill when our fallback names are fully occupied", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Managed browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const source = added.data.manifest;
    const leafId = `${sourceId}:browse`;
    const targetRoot = process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!;
    await writeRepoFiles(path.join(targetRoot, "browse"), {
      "SKILL.md": skillDoc("browse", "External browser flow."),
      "external.txt": "keep me",
    });
    await writeRepoFiles(path.join(targetRoot, `${source.displayName}-browse`), {
      "SKILL.md": skillDoc("other", "Occupy first fallback."),
    });
    if (`${source.displayName}-browse` !== `${sourceId}-browse`) {
      await writeRepoFiles(path.join(targetRoot, `${sourceId}-browse`), {
        "SKILL.md": skillDoc("other-two", "Occupy second fallback."),
      });
    }

    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(await fs.lstat(path.join(targetRoot, "browse"))).toSatisfy(
      (stats: { isSymbolicLink(): boolean }) => stats.isSymbolicLink(),
    );
    expect(
      await fs.readFile(path.join(targetRoot, "browse-external", "external.txt"), "utf8"),
    ).toBe("keep me");
  });

  test("doctor detects broken symlinks", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);

    await fs.rm(path.join(added.data.lock.checkoutPath, "good"), {
      recursive: true,
      force: true,
    });

    const doctor = await app.doctor();
    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(doctor.data.issues.some((issue) => issue.code === "BROKEN_SYMLINK")).toBe(true);
  });

  test("doctor removes orphan target symlinks that point into skillflow state without a matching projection", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "orphan-good");
    await fs.symlink(path.join(added.data.lock.checkoutPath, "good"), targetPath, "junction");

    const doctor = await app.doctor();
    expect(doctor.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(false);
    expect(
      doctor.warnings.some((warning) => warning.code === "ORPHAN_TARGET_SYMLINK_REMOVED"),
    ).toBe(true);
  });

  test("doctor reports invalidated selected leafs as errors", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
      "broken/SKILL.md": "broken",
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const stateStore = new StateStore(app.store.rootPath);
    const state = await stateStore.readState();
    state.manifest.bindings[sourceId] = {
      sourceId,
      selectionMode: "selected",
      selectedLeafIds: [`${sourceId}:broken`],
      enabledTargets: ["claude-code"],
    };
    const baseLeaf = state.lockFile.leafInventory.find((leaf) => leaf.sourceId === sourceId);
    expect(baseLeaf).toBeDefined();
    if (!baseLeaf) {
      return;
    }
    state.lockFile.leafInventory.push({
      ...baseLeaf,
      id: `${sourceId}:broken`,
      relativePath: "broken",
      linkName: "broken",
      title: "broken",
      displayName: "broken",
      valid: false,
      diagnostics: [{
        code: "INVALID_SKILL",
        message: "forced invalid leaf",
        path: "broken/SKILL.md",
        retryable: false,
      }],
    });
    await stateStore.writeState(state);

    const view = await stateStore.readState();
    const doctor = await new DoctorService().run(
      view.manifest,
      view.lockFile,
      view.preferences,
    );
    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(
      doctor.data.issues.some(
        (issue) =>
          issue.code === "INVALIDATED_SELECTED_LEAF" &&
          issue.severity === "error" &&
          issue.sourceId === sourceId,
      ),
    ).toBe(true);
  });

  test("refresh keeps mounted direct child skills for sources that also have a root SKILL", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("gstack", "Root skill."),
      "browse/SKILL.md": skillDoc("browse", "Browse skill."),
      "investigate/SKILL.md": skillDoc("investigate", "Investigate skill."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:browse`;
    const targetPath = path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse");

    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });
    expect(applied.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);

    const listed = await app.listWorkflows();
    expect(listed.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);

    const configData = await app.getConfigData();
    expect(configData.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);

    const doctor = await app.doctor();
    expect(doctor.ok).toBe(true);
    expect(await pathExists(targetPath)).toBe(true);
  });

  test("doctor reports unmanaged external target skills", async () => {
    const unmanagedRoot = path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "unmanaged");
    await writeRepoFiles(unmanagedRoot, {
      "SKILL.md": skillDoc("unmanaged", "Unmanaged skill."),
    });

    const app = new SkillFlowApp();
    const doctor = await app.doctor();

    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(
      doctor.data.issues.some(
        (issue) =>
          issue.code === "UNMANAGED_EXTERNAL_TARGET_SKILL" &&
          issue.severity === "warning" &&
          issue.target === "claude-code",
      ),
    ).toBe(true);
  });

  test("repairTargets recreates missing managed projections without touching unmanaged content", async () => {
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
    const managedTargetPath = path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse");
    const unmanagedTargetPath = path.join(
      process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!,
      "unmanaged",
    );

    await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });
    await fs.rm(managedTargetPath, { recursive: true, force: true });
    await writeRepoFiles(unmanagedTargetPath, {
      "SKILL.md": skillDoc("unmanaged", "Unmanaged skill."),
    });

    const repaired = await app.repairTargets([sourceId]);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }
    expect(await pathExists(managedTargetPath)).toBe(true);
    expect(await pathExists(unmanagedTargetPath)).toBe(true);
  });

  test("repairState rebuilds source-side lock data and keeps unmanaged target content intact", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
      "extra/SKILL.md": skillDoc("extra", "Extra flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { project: false });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const checkoutPath = app.store.getSourceCheckoutPath("local", sourceId);
    const unmanagedTargetPath = path.join(
      process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!,
      "unmanaged",
    );

    await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [`${sourceId}:browse`],
    });
    const lockWithManaged = await v2(app).readLock();
    const managedDeployment = lockWithManaged.projections.find(
      (deployment) =>
        deployment.sourceId === sourceId &&
        deployment.leafId === `${sourceId}:browse` &&
        deployment.target === "openclaw",
    );
    expect(managedDeployment).toBeTruthy();
    if (!managedDeployment) {
      return;
    }
    await fs.rm(path.join(checkoutPath, "extra"), { recursive: true, force: true });
    await writeRepoFiles(unmanagedTargetPath, {
      "SKILL.md": skillDoc("unmanaged", "Unmanaged skill."),
    });

    lockWithManaged.projections = lockWithManaged.projections.filter(
      (deployment) =>
        !(
          deployment.sourceId === sourceId &&
          deployment.leafId === `${sourceId}:browse` &&
          deployment.target === "openclaw"
        ),
    );
    lockWithManaged.projections.push({
      sourceId,
      leafId: `${sourceId}:ghost`,
      target: "claude-code",
      targetPath: path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "ghost"),
      strategy: "symlink",
      status: "active",
      contentHash: "ghost",
      updatedAt: "2026-03-23T00:00:00.000Z",
    });
    await v2(app).writeState({ ...(await v2(app).readState()), lockFile: lockWithManaged });

    const repaired = await app.repairState();

    expect(repaired.ok).toBe(true);
    const lockAfter = (await v2State(app)).lockFile;
    expect(lockAfter.leafInventory.map((leaf) => leaf.id)).not.toContain(
      `${sourceId}:extra`,
    );
    expect(
      lockAfter.projections.some(
        (deployment) => deployment.leafId === `${sourceId}:ghost` && deployment.status === "active",
      ),
    ).toBe(false);
    expect(
      lockAfter.projections.some(
        (deployment) =>
          deployment.sourceId === sourceId &&
          deployment.leafId === `${sourceId}:browse` &&
          deployment.target === "openclaw" &&
          deployment.targetPath === managedDeployment.targetPath,
      ),
    ).toBe(true);
    expect(await pathExists(unmanagedTargetPath)).toBe(true);
  });

  test("returns only the root skill when a root SKILL.md exists", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("browse", "Browser flow."),
      ".agents/skills/gstack-browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs.map((leaf) => leaf.relativePath)).toEqual([
      ".",
    ]);
    expect(list.data.summaries[0]?.lock?.invalidLeafs).toEqual([]);
  });

  test("reports when a source has no SKILL.md files at all", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "engineering/engineering-senior-developer.md": "# Agent",
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe("NO_VALID_LEAFS");
    expect(result.errors[0]?.message).toContain("No SKILL.md files were found");
  });

  test("discovers a unique skill from a host directory when no earlier duplicate exists", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      ".agents/skills/gstack-browse/SKILL.md": skillDoc("gstack-browse", "Host directory skill."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs[0]?.relativePath).toBe(".agents/skills/gstack-browse");
  });

  test("prefers visible second-level skill directories before hidden second-level directories", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "catalog/browse/SKILL.md": skillDoc("browse", "Browser flow."),
      "catalog/.generated/browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    const list = await app.listWorkflows();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.data.summaries[0]?.leafs[0]?.relativePath).toBe("catalog/browse");
    expect(
      result.warnings.some((warning) =>
        warning.message.includes("catalog/.generated/browse"),
      ),
    ).toBe(true);
  });

  test("dedupes skills by metadata name", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": `---
name: browse
description: |
  Canonical browse skill.
---
## Body
`,
      "copy-of-browse/SKILL.md": `---
name: browse
description: |
  Canonical browse skill.
---
## Body
`,
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    expect(
      result.warnings.some((warning) =>
        warning.message.includes("Duplicate skill content"),
      ),
    ).toBe(true);
  });

  test("dedupes same-name skills even when descriptions differ", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Canonical browse skill."),
      "copy-of-browse/SKILL.md": skillDoc("browse", "Different browse skill."),
    });
    const app = new SkillFlowApp();

    const result = await app.addSource(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    expect(
      result.warnings.some((warning) =>
        warning.message.includes("Duplicate skill content"),
      ),
    ).toBe(true);
  });

  test("apply uses natural skill names and removes legacy prefixed paths", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(`file://${repoPath}`);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:browse`;
    const legacyPath = path.join(
      process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!,
      `${sourceId}--browse`,
    );

    await fs.symlink(
      path.join(sandbox.stateRoot, "source", "git", sourceId, "browse"),
      legacyPath,
      "junction",
    );

    const lockPath = path.join(sandbox.stateRoot, "lock.json");
    const lockFile = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      projections?: Array<Record<string, string>>;
    };
    lockFile.projections = [
      ...(lockFile.projections ?? []),
      {
        sourceId,
        leafId,
        target: "claude-code",
        targetPath: legacyPath,
        targetRootPath: process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!,
        strategy: "symlink",
        status: "active",
        contentHash: "legacy",
        updatedAt: new Date().toISOString(),
      },
    ];
    await fs.writeFile(lockPath, `${JSON.stringify(lockFile, null, 2)}\n`, "utf8");

    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(await pathExists(legacyPath)).toBe(false);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(true);
  });

  test("keeps the earlier selected cross-group duplicate when linkName name and description all match", async () => {
    const repoA = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const repoB = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    });
    const app = new SkillFlowApp();
    const addedA = await app.addSource(repoA);
    const addedB = await app.addSource(repoB);
    expect(addedA.ok).toBe(true);
    expect(addedB.ok).toBe(true);
    if (!addedA.ok || !addedB.ok) {
      return;
    }

    const sourceA = addedA.data.manifest.id;
    const sourceB = addedB.data.manifest.id;
    const leafA = `${sourceA}:browse`;
    const leafB = `${sourceB}:browse`;
    const manifest = await v2(app).readManifest();
    manifest.bindings[sourceA] = {
      sourceId: sourceA,
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    manifest.bindings[sourceB] = {
      sourceId: sourceB,
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    await v2(app).writeState({ ...(await v2(app).readState()), manifest: manifest });

    const firstApply = await app.applyDraft(sourceA, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafA],
    });
    expect(firstApply.ok).toBe(true);

    const secondApply = await app.applyDraft(sourceB, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafB],
    });
    expect(secondApply.ok).toBe(true);
    if (!secondApply.ok) {
      return;
    }

    expect(secondApply.data.draft.selectedLeafIds).toEqual([]);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(true);

    const lockPath = path.join(sandbox.stateRoot, "lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      projections?: Array<{ sourceId: string; targetPath: string; mode?: string }>;
    };
    const managedBrowseProjections = (lock.projections ?? []).filter((deployment) =>
      deployment.status === "active" &&
      deployment.targetPath.endsWith(path.join("claude", "browse")),
    );
    expect(managedBrowseProjections).toHaveLength(1);
    expect(managedBrowseProjections[0]?.sourceId).toBe(sourceA);
  });

  test("renames cross-group projections when linkName matches but content differs", async () => {
    const repoA = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from A."),
    });
    const repoB = await createRepo(sandbox.sandboxRoot, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow from B."),
    });
    const app = new SkillFlowApp();
    const addedA = await app.addSource(repoA);
    const addedB = await app.addSource(repoB);
    expect(addedA.ok).toBe(true);
    expect(addedB.ok).toBe(true);
    if (!addedA.ok || !addedB.ok) {
      return;
    }

    const sourceA = addedA.data.manifest.id;
    const sourceB = addedB.data.manifest.id;
    const leafA = `${sourceA}:browse`;
    const leafB = `${sourceB}:browse`;
    const manifest = await v2(app).readManifest();
    manifest.bindings[sourceA] = {
      sourceId: sourceA,
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    manifest.bindings[sourceB] = {
      sourceId: sourceB,
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    };
    await v2(app).writeState({ ...(await v2(app).readState()), manifest: manifest });

    const firstApply = await app.applyDraft(sourceA, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafA],
    });
    expect(firstApply.ok).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(true);

    const secondApply = await app.applyDraft(sourceB, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafB],
    });
    expect(secondApply.ok).toBe(true);

    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "browse")),
    ).toBe(false);
    expect(
      await pathExists(
        path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, `${sourceA}-browse`),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, `${sourceB}-browse`),
      ),
    ).toBe(true);
  });

  test("doctor reports unavailable target paths", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(`file://${repoPath}`);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await fs.rm(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, {
      recursive: true,
      force: true,
    });

    const doctor = await app.previewDraft(added.data.manifest.id, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [`${added.data.manifest.id}:good`],
    });

    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(doctor.data.plan.blocked[0]?.reason).toContain("Target directory not found");
  });

  test("update detects added skills", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const remotePath = await createBareRemote(repoPath, sandbox.sandboxRoot);
    const app = new SkillFlowApp();
    const added = await app.addSource(`file://${remotePath}`);
    expect(added.ok).toBe(true);

    await writeRepoFiles(repoPath, {
      "extra/SKILL.md": skillDoc("extra", "Extra description."),
    });
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "add extra"]);
    git(repoPath, ["push", "origin", "HEAD"]);

    const updated = await app.updateSources([added.ok ? added.data.manifest.id : ""]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]?.addedLeafIds.some((id) => id.endsWith(":extra"))).toBe(true);
  });

  test("local source update re-copies owned checkout from the original locator", async () => {
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
    const checkoutPath = app.store.getSourceCheckoutPath("local", sourceId);
    await writeRepoFiles(repoPath, {
      "browse/SKILL.md": skillDoc("browse", "Browser flow, updated upstream."),
    });
    await writeRepoFiles(checkoutPath, {
      "browse/SKILL.md": skillDoc("browse", "Stale checkout content."),
    });

    const updated = await app.updateSources([sourceId]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    expect(updated.data.updated[0]?.changed).toBe(true);
    expect(
      await fs.readFile(path.join(checkoutPath, "browse", "SKILL.md"), "utf8"),
    ).toContain("Browser flow, updated upstream.");
  });

  test("update removes projections for deleted skills", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const remotePath = await createBareRemote(repoPath, sandbox.sandboxRoot);
    const app = new SkillFlowApp();
    const added = await app.addSource(`file://${remotePath}`);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    await app.applyDraft(sourceId, {
      enabledTargets: ["claude-code"],
      selectedLeafIds: [leafId],
    });

    await fs.rm(path.join(repoPath, "good"), { recursive: true, force: true });
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "remove good"]);
    git(repoPath, ["push", "origin", "HEAD"]);

    const updated = await app.updateSources([sourceId]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]?.removedLeafIds).toEqual([leafId]);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLAUDE_CODE!, "good")),
    ).toBe(false);
  });

  test("update surfaces invalidated skills", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const remotePath = await createBareRemote(repoPath, sandbox.sandboxRoot);
    const app = new SkillFlowApp();
    const added = await app.addSource(`file://${remotePath}`);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await writeRepoFiles(repoPath, {
      "good/SKILL.md": "Broken now",
    });
    git(repoPath, ["add", "."]);
    git(repoPath, ["commit", "-m", "invalidate"]);
    git(repoPath, ["push", "origin", "HEAD"]);

    const updated = await app.updateSources([added.data.manifest.id]);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]?.invalidatedLeafIds).toHaveLength(1);
  });

  test("doctor detects drift in copied projections", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "good/SKILL.md": skillDoc("good", "Good description."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const sourceId = added.data.manifest.id;
    const leafId = `${sourceId}:good`;
    await app.applyDraft(sourceId, {
      enabledTargets: ["openclaw"],
      selectedLeafIds: [leafId],
    });

    const lock = (await v2State(app)).lockFile;
    const deployment = lock.projections.find(
      (item) => item.sourceId === sourceId && item.leafId === leafId && item.target === "openclaw",
    );
    if (!deployment) {
      throw new Error("expected deployment for openclaw");
    }
    await writeRepoFiles(path.dirname(deployment.targetPath), {
      [`${path.basename(deployment.targetPath)}/SKILL.md`]: "# Good\nMutated copy.",
    });

    const doctor = await app.doctor();
    expect(doctor.ok).toBe(true);
    if (!doctor.ok) {
      return;
    }
    expect(doctor.data.issues.some((issue) => issue.code === "DRIFT_COPY")).toBe(true);
  });

  test("supports cursor and pi target projections", async () => {
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
    const leafId = `${sourceId}:browse`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: ["cursor", "pi"],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CURSOR!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_PI!, "browse"))).toBe(
      true,
    );
  });

  test("supports additional global agent target projections", async () => {
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
    const leafId = `${sourceId}:browse`;
    const applied = await app.applyDraft(sourceId, {
      enabledTargets: [
        "github-copilot",
        "gemini-cli",
        "hermes-agent",
        "minimax-code",
        "windsurf",
        "roo-code",
        "cline",
        "amp",
        "kiro",
      ],
      selectedLeafIds: [leafId],
    });

    expect(applied.ok).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT!, "browse")),
    ).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_GEMINI_CLI!, "browse")),
    ).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_HERMES_AGENT!, "browse")),
    ).toBe(true);
    expect(
      await pathExists(path.join(process.env.SKILL_FLOW_TARGET_MINIMAX_CODE!, "browse")),
    ).toBe(true);
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_WINDSURF!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_ROO_CODE!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_CLINE!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_AMP!, "browse"))).toBe(
      true,
    );
    expect(await pathExists(path.join(process.env.SKILL_FLOW_TARGET_KIRO!, "browse"))).toBe(
      true,
    );
  });

  test("discovers all configured global targets with isolated roots", async () => {
    const app = new SkillFlowApp();

    const targets = await app.getAvailableTargets();

    expect(targets).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "github-copilot",
      "gemini-cli",
      "opencode",
      "openclaw",
      "hermes-agent",
      "minimax-code",
      "pi",
      "trae",
      "windsurf",
      "roo-code",
      "cline",
      "amp",
      "kiro",
      "zcode",
    ]);
  });

  test("explicit target mode ignores non-overridden targets even when default roots exist", async () => {
    const previousTargets = {
      claude: process.env.SKILL_FLOW_TARGET_CLAUDE_CODE,
      codex: process.env.SKILL_FLOW_TARGET_CODEX,
      cursor: process.env.SKILL_FLOW_TARGET_CURSOR,
      githubCopilot: process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT,
      geminiCli: process.env.SKILL_FLOW_TARGET_GEMINI_CLI,
      opencode: process.env.SKILL_FLOW_TARGET_OPENCODE,
      openclaw: process.env.SKILL_FLOW_TARGET_OPENCLAW,
      hermesAgent: process.env.SKILL_FLOW_TARGET_HERMES_AGENT,
      minimaxCode: process.env.SKILL_FLOW_TARGET_MINIMAX_CODE,
      pi: process.env.SKILL_FLOW_TARGET_PI,
      trae: process.env.SKILL_FLOW_TARGET_TRAE,
      windsurf: process.env.SKILL_FLOW_TARGET_WINDSURF,
      rooCode: process.env.SKILL_FLOW_TARGET_ROO_CODE,
      cline: process.env.SKILL_FLOW_TARGET_CLINE,
      amp: process.env.SKILL_FLOW_TARGET_AMP,
      kiro: process.env.SKILL_FLOW_TARGET_KIRO,
      zcode: process.env.SKILL_FLOW_TARGET_ZCODE,
    };
    const previousHome = process.env.HOME;
    try {
      process.env.HOME = sandbox.sandboxRoot;
      delete process.env.SKILL_FLOW_TARGET_CODEX;
      delete process.env.SKILL_FLOW_TARGET_CURSOR;
      delete process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT;
      delete process.env.SKILL_FLOW_TARGET_GEMINI_CLI;
      delete process.env.SKILL_FLOW_TARGET_OPENCODE;
      delete process.env.SKILL_FLOW_TARGET_OPENCLAW;
      delete process.env.SKILL_FLOW_TARGET_HERMES_AGENT;
      delete process.env.SKILL_FLOW_TARGET_MINIMAX_CODE;
      delete process.env.SKILL_FLOW_TARGET_PI;
      delete process.env.SKILL_FLOW_TARGET_TRAE;
      delete process.env.SKILL_FLOW_TARGET_WINDSURF;
      delete process.env.SKILL_FLOW_TARGET_ROO_CODE;
      delete process.env.SKILL_FLOW_TARGET_CLINE;
      delete process.env.SKILL_FLOW_TARGET_AMP;
      delete process.env.SKILL_FLOW_TARGET_KIRO;
      delete process.env.SKILL_FLOW_TARGET_ZCODE;
      await fs.mkdir(path.join(sandbox.sandboxRoot, ".agents", "skills"), { recursive: true });

      const app = new SkillFlowApp();
      const targets = await app.getAvailableTargets();

      expect(targets).toEqual(["claude-code"]);
    } finally {
      process.env.HOME = previousHome;
      process.env.SKILL_FLOW_TARGET_CLAUDE_CODE = previousTargets.claude;
      process.env.SKILL_FLOW_TARGET_CODEX = previousTargets.codex;
      process.env.SKILL_FLOW_TARGET_CURSOR = previousTargets.cursor;
      process.env.SKILL_FLOW_TARGET_GITHUB_COPILOT = previousTargets.githubCopilot;
      process.env.SKILL_FLOW_TARGET_GEMINI_CLI = previousTargets.geminiCli;
      process.env.SKILL_FLOW_TARGET_OPENCODE = previousTargets.opencode;
      process.env.SKILL_FLOW_TARGET_OPENCLAW = previousTargets.openclaw;
      process.env.SKILL_FLOW_TARGET_HERMES_AGENT = previousTargets.hermesAgent;
      process.env.SKILL_FLOW_TARGET_MINIMAX_CODE = previousTargets.minimaxCode;
      process.env.SKILL_FLOW_TARGET_PI = previousTargets.pi;
      process.env.SKILL_FLOW_TARGET_TRAE = previousTargets.trae;
      process.env.SKILL_FLOW_TARGET_WINDSURF = previousTargets.windsurf;
      process.env.SKILL_FLOW_TARGET_ROO_CODE = previousTargets.rooCode;
      process.env.SKILL_FLOW_TARGET_CLINE = previousTargets.cline;
      process.env.SKILL_FLOW_TARGET_AMP = previousTargets.amp;
      process.env.SKILL_FLOW_TARGET_KIRO = previousTargets.kiro;
      process.env.SKILL_FLOW_TARGET_ZCODE = previousTargets.zcode;
    }
  });
});

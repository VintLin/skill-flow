import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStore } from "@skill-flow/storage/state-store";
import { hashDirectory } from "@skill-flow/integration/utils/fs";
import { InventoryService } from "../services/inventory-service.js";
import { SourceAuthorityService } from "../services/source-authority-service.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
  writeRepoFiles,
} from "./test-helpers.js";

describe.sequential("SourceAuthorityService", () => {
  const sandbox = useSkillFlowSandbox();

  test("adds a prepared source by writing only v2 authority files", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });

    const added = await service.addSource(repoPath, {
      sourceIdOverride: "design-source",
      checkoutPath: path.join(sandbox.stateRoot, "source", "local", ".prepared-design-source"),
    });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const state = await stateStore.readState();
    expect(state.manifest.sources).toEqual([
      expect.objectContaining({
        id: "design-source",
        kind: "local",
        locator: repoPath,
        canonicalLocator: repoPath,
        displayName: path.basename(repoPath),
        enabled: true,
      }),
    ]);
    expect(state.manifest.bindings["design-source"]).toEqual({
      sourceId: "design-source",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    });
    expect(state.lockFile.sources["design-source"]).toEqual(expect.objectContaining({
      sourceId: "design-source",
      canonicalLocator: repoPath,
      localPath: path.join(sandbox.stateRoot, "source", "local", "design-source"),
      leafIds: ["design-source:skills/frontend-design"],
    }));
    expect(state.lockFile.leafInventory).toEqual([
      expect.objectContaining({
        id: "design-source:skills/frontend-design",
        sourceId: "design-source",
        relativePath: "skills/frontend-design",
        linkName: "frontend-design",
        valid: true,
      }),
    ]);
    const rawLock = JSON.parse(await fs.readFile(path.join(sandbox.stateRoot, "lock.json"), "utf8")) as Record<string, unknown>;
    expect(rawLock.deployments).toBeUndefined();
    await expect(fs.access(path.join(sandbox.stateRoot, "virtual-groups.json"))).rejects.toThrow();
    await expect(fs.stat(path.join(
      sandbox.stateRoot,
      "source",
      "local",
      "design-source",
      "skills",
      "frontend-design",
      "SKILL.md",
    ))).resolves.toBeTruthy();
  });

  test("commits prepared sources through the state mutation lock", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const prepared = await checkoutService.prepareSourceCheckout(repoPath, {
      options: { sourceIdOverride: "locked-source" },
      suffix: "add",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    let lockCalls = 0;
    const originalWithMutationLock = stateStore.withMutationLock.bind(stateStore);
    stateStore.withMutationLock = async (task) => {
      lockCalls += 1;
      return originalWithMutationLock(task);
    };
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });

    const committed = await service.commitPreparedSource({
      preparedCheckout: prepared.data,
      removePreparedOnFailure: true,
    });

    expect(committed.ok).toBe(true);
    expect(lockCalls).toBe(1);
  });

  test.each(["source-root", "kind-root"] as const)(
    "refuses to commit through a managed %s symbolic link",
    async (symlinkLevel) => {
      const repoPath = await createRepo(sandbox.sandboxRoot, {
        "skills/one/SKILL.md": skillDoc("one", "One."),
      });
      const stateStore = new StateStore(sandbox.stateRoot);
      await stateStore.init();
      const checkoutService = new SourceCheckoutService({
        sourceRoot: path.join(sandbox.stateRoot, "source"),
        inventoryService: new InventoryService(),
      });
      const preparedPath = path.join(sandbox.sandboxRoot, `prepared-${symlinkLevel}`);
      const prepared = await checkoutService.prepareSourceCheckout(repoPath, {
        options: { sourceIdOverride: `commit-${symlinkLevel}` },
        checkoutPath: preparedPath,
      });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) {
        return;
      }

      const sourceRoot = path.join(sandbox.stateRoot, "source");
      const externalRoot = path.join(sandbox.sandboxRoot, `external-${symlinkLevel}`);
      await fs.mkdir(externalRoot, { recursive: true });
      const symlinkPath = symlinkLevel === "source-root"
        ? sourceRoot
        : path.join(sourceRoot, "local");
      if (symlinkLevel === "kind-root") {
        await fs.mkdir(sourceRoot, { recursive: true });
      }
      await fs.symlink(externalRoot, symlinkPath);
      const service = new SourceAuthorityService({ stateStore, checkoutService });

      const committed = await service.commitPreparedSource({
        preparedCheckout: prepared.data,
        removePreparedOnFailure: false,
      });

      expect(committed.ok).toBe(false);
      if (committed.ok) {
        return;
      }
      expect(committed.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
      await expect(fs.stat(prepared.data.checkoutPath)).resolves.toBeTruthy();
      const externalCheckoutPath = symlinkLevel === "source-root"
        ? path.join(externalRoot, "local", prepared.data.sourceId)
        : path.join(externalRoot, prepared.data.sourceId);
      await expect(fs.access(externalCheckoutPath)).rejects.toThrow();
      expect((await stateStore.readState()).manifest.sources).toEqual([]);
    },
  );

  test("refuses to remove a source whose checkout path does not match its v2 identity", async () => {
    const alphaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/alpha/SKILL.md": skillDoc("alpha", "Alpha skill."),
    });
    const betaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/beta/SKILL.md": skillDoc("beta", "Beta skill."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });
    const alpha = await service.addSource(alphaRepo, { sourceIdOverride: "alpha-source" });
    const beta = await service.addSource(betaRepo, { sourceIdOverride: "beta-source" });
    expect(alpha.ok).toBe(true);
    expect(beta.ok).toBe(true);

    const state = await stateStore.readState();
    state.lockFile.sources["alpha-source"] = {
      ...state.lockFile.sources["alpha-source"]!,
      localPath: state.lockFile.sources["beta-source"]!.localPath,
    };
    await stateStore.writeState(state);

    const removed = await service.removeSource(["alpha-source"]);

    expect(removed.ok).toBe(false);
    if (removed.ok) {
      return;
    }
    expect(removed.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
    const after = await stateStore.readState();
    expect(after.manifest.sources.map((source) => source.id).sort()).toEqual([
      "alpha-source",
      "beta-source",
    ]);
    await expect(fs.stat(path.join(
      sandbox.stateRoot,
      "source",
      "local",
      "beta-source",
      "skills",
      "beta",
      "SKILL.md",
    ))).resolves.toBeTruthy();
  });

  test.each(["source-root", "kind-root"] as const)(
    "refuses remove and update through a managed %s symbolic link",
    async (symlinkLevel) => {
      const repoPath = await createRepo(sandbox.sandboxRoot, {
        "skills/one/SKILL.md": skillDoc("one", "One."),
      });
      const stateStore = new StateStore(sandbox.stateRoot);
      await stateStore.init();
      const checkoutService = new SourceCheckoutService({
        sourceRoot: path.join(sandbox.stateRoot, "source"),
        inventoryService: new InventoryService(),
      });
      const service = new SourceAuthorityService({ stateStore, checkoutService });
      const added = await service.addSource(repoPath, {
        sourceIdOverride: `managed-${symlinkLevel}`,
      });
      expect(added.ok).toBe(true);
      if (!added.ok) {
        return;
      }

      const sourceRoot = path.join(sandbox.stateRoot, "source");
      const kindRoot = path.dirname(added.data.lock.localPath);
      const symlinkPath = symlinkLevel === "source-root" ? sourceRoot : kindRoot;
      const externalRoot = path.join(sandbox.sandboxRoot, `moved-${symlinkLevel}`);
      await fs.rename(symlinkPath, externalRoot);
      await fs.symlink(externalRoot, symlinkPath);
      const externalCheckoutPath = symlinkLevel === "source-root"
        ? path.join(externalRoot, "local", added.data.manifest.id)
        : path.join(externalRoot, added.data.manifest.id);
      const sentinelPath = path.join(externalCheckoutPath, "sentinel.txt");
      await fs.writeFile(sentinelPath, "keep", "utf8");

      const removed = await service.removeSource([added.data.manifest.id]);
      const updated = await service.updateSources([added.data.manifest.id]);

      expect(removed.ok).toBe(false);
      if (!removed.ok) {
        expect(removed.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
      }
      expect(updated.ok).toBe(false);
      if (!updated.ok) {
        expect(updated.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
      }
      await expect(fs.readFile(sentinelPath, "utf8")).resolves.toBe("keep");
      expect((await stateStore.readState()).manifest.sources.map((source) => source.id))
        .toContain(added.data.manifest.id);
    },
  );

  test("refuses to remove a managed checkout that is a symbolic link", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    const added = await service.addSource(repoPath, { sourceIdOverride: "remove-symlink" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const externalPath = path.join(sandbox.sandboxRoot, "remove-symlink-external");
    await fs.mkdir(externalPath, { recursive: true });
    await fs.writeFile(path.join(externalPath, "sentinel.txt"), "keep", "utf8");
    await fs.rm(added.data.lock.localPath, { recursive: true, force: true });
    await fs.symlink(externalPath, added.data.lock.localPath);

    const removed = await service.removeSource([added.data.manifest.id]);

    expect(removed.ok).toBe(false);
    if (!removed.ok) {
      expect(removed.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
    }
    await expect(fs.readFile(path.join(externalPath, "sentinel.txt"), "utf8"))
      .resolves.toBe("keep");
    expect((await stateStore.readState()).manifest.sources.map((source) => source.id))
      .toContain(added.data.manifest.id);
  });

  test("removes external authority without deleting the observed checkout", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    const added = await service.addSource(repoPath, { sourceIdOverride: "external-remove" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const observedPath = path.join(sandbox.sandboxRoot, "externally-owned-checkout");
    await fs.mkdir(observedPath, { recursive: true });
    await fs.writeFile(path.join(observedPath, "sentinel.txt"), "keep", "utf8");
    const state = await stateStore.readState();
    const observedPaths = [{
      path: observedPath,
      realPath: observedPath,
      observedAt: "2026-08-21T00:00:00.000Z",
    }];
    state.manifest.sources[0] = {
      ...state.manifest.sources[0]!,
      ownership: "external",
      observedPaths,
    };
    state.lockFile.sources["external-remove"] = {
      ...state.lockFile.sources["external-remove"]!,
      ownership: "external",
      localPath: observedPath,
      observedPaths,
    };
    await stateStore.writeState(state);

    const removed = await service.removeSource(["external-remove"]);

    expect(removed.ok).toBe(true);
    await expect(fs.readFile(path.join(observedPath, "sentinel.txt"), "utf8"))
      .resolves.toBe("keep");
    expect((await stateStore.readState()).manifest.sources).toEqual([]);
  });

  test("updates v2 leaf inventory from source origin", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });
    const added = await service.addSource(repoPath, {
      sourceIdOverride: "update-source",
    });
    expect(added.ok).toBe(true);
    await writeRepoFiles(repoPath, {
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });

    const updated = await service.updateSources(["update-source"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.updated[0]).toEqual(expect.objectContaining({
      sourceId: "update-source",
      changed: true,
      addedLeafIds: ["update-source:skills/two"],
    }));
    const state = await stateStore.readState();
    expect(state.lockFile.sources["update-source"]?.leafIds).toEqual([
      "update-source:skills/one",
      "update-source:skills/two",
    ]);
  });

  test("refuses to update a source whose checkout path does not match its v2 identity", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const externalPath = path.join(sandbox.sandboxRoot, "external-checkout");
    await fs.mkdir(externalPath, { recursive: true });
    await fs.writeFile(path.join(externalPath, "sentinel.txt"), "keep", "utf8");
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    const added = await service.addSource(repoPath, {
      sourceIdOverride: "unsafe-update-source",
    });
    expect(added.ok).toBe(true);

    const state = await stateStore.readState();
    state.lockFile.sources["unsafe-update-source"] = {
      ...state.lockFile.sources["unsafe-update-source"]!,
      localPath: externalPath,
    };
    await stateStore.writeState(state);
    const prepareSourceCheckout = vi.spyOn(checkoutService, "prepareSourceCheckout");

    const updated = await service.updateSources(["unsafe-update-source"]);

    expect(updated.ok).toBe(false);
    if (updated.ok) {
      return;
    }
    expect(updated.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
    expect(prepareSourceCheckout).not.toHaveBeenCalled();
    await expect(fs.readFile(path.join(externalPath, "sentinel.txt"), "utf8"))
      .resolves.toBe("keep");
  });

  test("refuses to update a canonical checkout path that is a symbolic link", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const externalPath = path.join(sandbox.sandboxRoot, "external-symlink-target");
    await fs.mkdir(externalPath, { recursive: true });
    await fs.writeFile(path.join(externalPath, "sentinel.txt"), "keep", "utf8");
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    const added = await service.addSource(repoPath, {
      sourceIdOverride: "symlink-update-source",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    await fs.rm(added.data.lock.localPath, { recursive: true, force: true });
    await fs.symlink(externalPath, added.data.lock.localPath);
    const prepareSourceCheckout = vi.spyOn(checkoutService, "prepareSourceCheckout");

    const updated = await service.updateSources(["symlink-update-source"]);

    expect(updated.ok).toBe(false);
    if (updated.ok) {
      return;
    }
    expect(updated.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
    expect(prepareSourceCheckout).not.toHaveBeenCalled();
    await expect(fs.readFile(path.join(externalPath, "sentinel.txt"), "utf8"))
      .resolves.toBe("keep");
  });

  test("updateSources skips healthy git sources and repairs a missing managed directory or local drift", async () => {
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });

    const preparedCheckoutPath = path.join(
      sandbox.stateRoot,
      "source",
      "git",
      ".prepared-git-unchanged",
    );
    await fs.mkdir(path.join(preparedCheckoutPath, "skills", "one"), { recursive: true });
    await fs.writeFile(
      path.join(preparedCheckoutPath, "skills", "one", "SKILL.md"),
      skillDoc("one", "One."),
      "utf8",
    );
    const contentHash = await hashDirectory(path.join(preparedCheckoutPath, "skills", "one"));
    const committed = await service.commitPreparedSource({
      preparedCheckout: {
        locator: "https://github.com/acme/skills.git",
        displayName: "Skills",
        kind: "git",
        sourceId: "git-unchanged",
        checkoutPath: preparedCheckoutPath,
        leafs: [{
          id: "git-unchanged:skills/one",
          sourceId: "git-unchanged",
          name: "one",
          linkName: "one",
          title: "one",
          description: "One.",
          relativePath: "skills/one",
          absolutePath: path.join(preparedCheckoutPath, "skills", "one"),
          skillFilePath: path.join(preparedCheckoutPath, "skills", "one", "SKILL.md"),
          contentHash,
          diagnostics: [],
          valid: true,
        }],
        invalidLeafs: [],
        commitSha: "same-sha",
        originBranch: "release",
      },
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }

    const recoveryRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    checkoutService.readGitRemoteHeadCommit = vi.fn(async () => "same-sha");
    const originalPrepareSourceCheckout = checkoutService.prepareSourceCheckout.bind(checkoutService);
    const prepareSourceCheckout = vi.spyOn(checkoutService, "prepareSourceCheckout")
      .mockImplementation((_locator, options) => originalPrepareSourceCheckout(recoveryRepo, options));

    const updated = await service.updateSources(["git-unchanged"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(prepareSourceCheckout).not.toHaveBeenCalled();
    expect(checkoutService.readGitRemoteHeadCommit).toHaveBeenCalledWith(
      "https://github.com/acme/skills.git",
      { branch: "release" },
    );
    expect(updated.data.updated).toEqual([
      expect.objectContaining({
        sourceId: "git-unchanged",
        changed: false,
      }),
    ]);
    const state = await stateStore.readState();
    expect(state.lockFile.sources["git-unchanged"]?.leafIds).toEqual([
      "git-unchanged:skills/one",
    ]);

    await fs.rm(path.dirname(state.lockFile.sources["git-unchanged"]!.localPath), {
      recursive: true,
      force: true,
    });

    const restored = await service.updateSources(["git-unchanged"]);

    expect(restored.ok).toBe(true);
    expect(prepareSourceCheckout).toHaveBeenCalledTimes(1);
    if (!restored.ok) {
      return;
    }
    expect(restored.data.updated[0]).toEqual(expect.objectContaining({
      sourceId: "git-unchanged",
      changed: false,
      repaired: true,
      repairReason: "missing-checkout",
    }));
    await expect(fs.stat(path.join(
      sandbox.stateRoot,
      "source",
      "git",
      "git-unchanged",
      "skills",
      "one",
      "SKILL.md",
    ))).resolves.toBeTruthy();

    await fs.rm(path.join(
      sandbox.stateRoot,
      "source",
      "git",
      "git-unchanged",
      "skills",
      "one",
      "SKILL.md",
    ));
    const repairedSkillFile = await service.updateSources(["git-unchanged"]);
    expect(repairedSkillFile.ok).toBe(true);
    if (!repairedSkillFile.ok) {
      return;
    }
    expect(repairedSkillFile.data.updated[0]).toEqual(expect.objectContaining({
      repaired: true,
      repairReason: "missing-skill-file",
    }));

    await fs.appendFile(path.join(
      sandbox.stateRoot,
      "source",
      "git",
      "git-unchanged",
      "skills",
      "one",
      "SKILL.md",
    ), "\nlocal drift\n");
    const repairedContent = await service.updateSources(["git-unchanged"]);
    expect(repairedContent.ok).toBe(true);
    if (!repairedContent.ok) {
      return;
    }
    expect(repairedContent.data.updated[0]).toEqual(expect.objectContaining({
      repaired: true,
      repairReason: "content-drift",
    }));
    expect(prepareSourceCheckout).toHaveBeenCalledTimes(3);
  });

  test("updateSources falls back to a full update when remote HEAD preflight is unavailable", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    const added = await service.addSource(repoPath, { sourceIdOverride: "git-fallback" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const state = await stateStore.readState();
    const gitCheckoutPath = path.join(
      sandbox.stateRoot,
      "source",
      "git",
      "git-fallback",
    );
    await fs.mkdir(path.dirname(gitCheckoutPath), { recursive: true });
    await fs.rename(
      state.lockFile.sources["git-fallback"]!.localPath,
      gitCheckoutPath,
    );
    state.manifest.sources[0] = {
      ...state.manifest.sources[0]!,
      kind: "git",
      locator: "https://github.com/acme/skills.git",
    };
    state.lockFile.sources["git-fallback"] = {
      ...state.lockFile.sources["git-fallback"]!,
      localPath: gitCheckoutPath,
      revision: { provider: "git", commit: "same-sha", capturedAt: new Date().toISOString() },
    };
    await stateStore.writeState(state);

    checkoutService.readGitRemoteHeadCommit = vi.fn(async () => undefined);
    const originalPrepareSourceCheckout = checkoutService.prepareSourceCheckout.bind(checkoutService);
    const prepareSourceCheckout = vi.spyOn(checkoutService, "prepareSourceCheckout")
      .mockImplementation((_locator, options) => originalPrepareSourceCheckout(repoPath, options));

    const updated = await service.updateSources(["git-fallback"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(prepareSourceCheckout).toHaveBeenCalledTimes(1);
    expect(updated.data.precheckFallbackSourceIds).toEqual(["git-fallback"]);
    expect(updated.warnings).toContainEqual(expect.objectContaining({
      code: "SOURCE_REMOTE_PRECHECK_FALLBACK",
    }));
    expect(updated.data.updated[0]).toEqual(expect.objectContaining({ changed: false }));
    expect(updated.data.updated[0]?.repaired).toBeUndefined();
  });

  test("updateSources keeps successful groups when another group fails mid-batch", async () => {
    const goodRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/good/SKILL.md": skillDoc("good", "Good."),
    });
    const badRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/bad/SKILL.md": skillDoc("bad", "Bad."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });
    expect((await service.addSource(goodRepo, { sourceIdOverride: "good-source" })).ok).toBe(true);
    expect((await service.addSource(badRepo, { sourceIdOverride: "bad-source" })).ok).toBe(true);

    await writeRepoFiles(goodRepo, {
      "skills/good-two/SKILL.md": skillDoc("good-two", "Good two."),
    });
    // Break the bad origin so prepare fails while good origin still works.
    await fs.rm(badRepo, { recursive: true, force: true });

    const updated = await service.updateSources(["good-source", "bad-source"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.status).toBe("partial");
    expect(updated.data.updated.map((item) => item.sourceId)).toEqual(["good-source"]);
    expect(updated.data.failed).toEqual([
      expect.objectContaining({
        sourceId: "bad-source",
      }),
    ]);
    expect(updated.warnings.some((warning) => warning.code === "SOURCE_UPDATE_FAILED")).toBe(true);

    const state = await stateStore.readState();
    expect(state.lockFile.sources["good-source"]?.leafIds).toEqual([
      "good-source:skills/good",
      "good-source:skills/good-two",
    ]);
    // Failed source retains previous lock metadata.
    expect(state.lockFile.sources["bad-source"]?.leafIds).toEqual([
      "bad-source:skills/bad",
    ]);
  });

  test("preflights every managed checkout before mutating a batch", async () => {
    const goodRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/good/SKILL.md": skillDoc("good", "Good."),
    });
    const badRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/bad/SKILL.md": skillDoc("bad", "Bad."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    expect((await service.addSource(goodRepo, { sourceIdOverride: "preflight-good" })).ok)
      .toBe(true);
    expect((await service.addSource(badRepo, { sourceIdOverride: "preflight-bad" })).ok)
      .toBe(true);

    await writeRepoFiles(goodRepo, {
      "skills/good-two/SKILL.md": skillDoc("good-two", "Good two."),
    });
    const before = await stateStore.readState();
    const goodCheckoutPath = before.lockFile.sources["preflight-good"]!.localPath;
    const externalPath = path.join(sandbox.sandboxRoot, "invalid-managed-checkout");
    await fs.mkdir(externalPath, { recursive: true });
    before.lockFile.sources["preflight-bad"] = {
      ...before.lockFile.sources["preflight-bad"]!,
      localPath: externalPath,
    };
    await stateStore.writeState(before);
    const prepareSourceCheckout = vi.spyOn(checkoutService, "prepareSourceCheckout");

    const updated = await service.updateSources(["preflight-good", "preflight-bad"]);

    expect(updated.ok).toBe(false);
    if (updated.ok) {
      return;
    }
    expect(updated.errors[0]?.code).toBe("SOURCE_CHECKOUT_PATH_INVALID");
    expect(prepareSourceCheckout).not.toHaveBeenCalled();
    const after = await stateStore.readState();
    expect(after.lockFile.sources["preflight-good"]?.leafIds).toEqual([
      "preflight-good:skills/good",
    ]);
    await expect(fs.access(path.join(
      goodCheckoutPath,
      "skills",
      "good-two",
      "SKILL.md",
    ))).rejects.toThrow();
  });

  test("persists each successful source before preparing the next batch item", async () => {
    const goodRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/good/SKILL.md": skillDoc("good", "Good."),
    });
    const badRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/bad/SKILL.md": skillDoc("bad", "Bad."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    expect((await service.addSource(goodRepo, { sourceIdOverride: "durable-good" })).ok)
      .toBe(true);
    expect((await service.addSource(badRepo, { sourceIdOverride: "durable-bad" })).ok)
      .toBe(true);

    await writeRepoFiles(goodRepo, {
      "skills/good-two/SKILL.md": skillDoc("good-two", "Good two."),
    });
    await fs.rm(badRepo, { recursive: true, force: true });
    const originalPrepareSourceCheckout = checkoutService.prepareSourceCheckout
      .bind(checkoutService);
    let goodLeafIdsObservedBeforeBadPrepare: string[] | undefined;
    vi.spyOn(checkoutService, "prepareSourceCheckout")
      .mockImplementation(async (locator, options) => {
        if (options?.options?.sourceIdOverride === "durable-bad") {
          const state = await stateStore.readState();
          goodLeafIdsObservedBeforeBadPrepare = state.lockFile.sources["durable-good"]?.leafIds;
        }
        return originalPrepareSourceCheckout(locator, options);
      });

    const updated = await service.updateSources(["durable-good", "durable-bad"]);

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.data.status).toBe("partial");
    expect(goodLeafIdsObservedBeforeBadPrepare).toEqual([
      "durable-good:skills/good",
      "durable-good:skills/good-two",
    ]);
  });

  test("rolls back a replaced checkout when lock persistence fails", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({ stateStore, checkoutService });
    const added = await service.addSource(repoPath, { sourceIdOverride: "persist-failure" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    await writeRepoFiles(repoPath, {
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });

    const originalWriteLock = stateStore.writeLock.bind(stateStore);
    vi.spyOn(stateStore, "writeLock").mockImplementationOnce(async () => {
      throw new Error("injected lock persistence failure");
    }).mockImplementation(originalWriteLock);

    const updated = await service.updateSources(["persist-failure"]);

    expect(updated.ok).toBe(false);
    if (updated.ok) {
      return;
    }
    expect(updated.errors[0]?.code).toBe("SOURCE_UPDATE_STATE_WRITE_FAILED");
    const after = await stateStore.readState();
    expect(after.lockFile.sources["persist-failure"]?.leafIds).toEqual([
      "persist-failure:skills/one",
    ]);
    await expect(fs.stat(path.join(
      added.data.lock.localPath,
      "skills",
      "one",
      "SKILL.md",
    ))).resolves.toBeTruthy();
    await expect(fs.access(path.join(
      added.data.lock.localPath,
      "skills",
      "two",
      "SKILL.md",
    ))).rejects.toThrow();
  });

  test("reconciles v2 leaf inventory from managed checkout", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/one/SKILL.md": skillDoc("one", "One."),
      "skills/two/SKILL.md": skillDoc("two", "Two."),
    });
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });
    const added = await service.addSource(repoPath, {
      sourceIdOverride: "reconcile-source",
    });
    expect(added.ok).toBe(true);

    const state = await stateStore.readState();
    state.manifest.bindings["reconcile-source"] = {
      sourceId: "reconcile-source",
      selectionMode: "selected",
      selectedLeafIds: [
        "reconcile-source:skills/one",
        "reconcile-source:skills/two",
      ],
      enabledTargets: ["codex"],
    };
    await stateStore.writeState(state);
    const checkoutPath = state.lockFile.sources["reconcile-source"]!.localPath;
    await fs.rm(path.join(checkoutPath, "skills", "two"), {
      recursive: true,
      force: true,
    });
    await writeRepoFiles(checkoutPath, {
      "skills/three/SKILL.md": skillDoc("three", "Three."),
    });

    const reconciled = await service.reconcileInventory(["reconcile-source"], {
      force: true,
    });

    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) {
      return;
    }
    expect(reconciled.data.updatedSourceIds).toEqual(["reconcile-source"]);
    const nextState = await stateStore.readState();
    expect(nextState.lockFile.sources["reconcile-source"]?.leafIds).toEqual([
      "reconcile-source:skills/one",
      "reconcile-source:skills/three",
    ]);
    expect(nextState.manifest.bindings["reconcile-source"]?.selectedLeafIds).toEqual([
      "reconcile-source:skills/one",
    ]);
  });

  test("reconciles GitHub locators as git checkout kind", async () => {
    const stateStore = new StateStore(sandbox.stateRoot);
    await stateStore.init();
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityService({
      stateStore,
      checkoutService,
    });
    const preparedCheckoutPath = path.join(
      sandbox.stateRoot,
      "source",
      "git",
      ".prepared-github-source",
    );
    await fs.mkdir(path.join(preparedCheckoutPath, "skills", "one"), { recursive: true });
    await fs.writeFile(
      path.join(preparedCheckoutPath, "skills", "one", "SKILL.md"),
      skillDoc("one", "One."),
      "utf8",
    );
    const committed = await service.commitPreparedSource({
      preparedCheckout: {
        locator: "https://github.com/acme/skills.git",
        displayName: "Skills",
        kind: "git",
        sourceId: "github-source",
        checkoutPath: preparedCheckoutPath,
        leafs: [{
          id: "github-source:skills/one",
          sourceId: "github-source",
          name: "one",
          linkName: "one",
          title: "one",
          description: "One.",
          relativePath: "skills/one",
          absolutePath: path.join(preparedCheckoutPath, "skills", "one"),
          skillFilePath: path.join(preparedCheckoutPath, "skills", "one", "SKILL.md"),
          contentHash: "hash-one",
          diagnostics: [],
          valid: true,
        }],
        invalidLeafs: [],
        commitSha: "initial-sha",
      },
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }

    let snapshotKind: string | undefined;
    checkoutService.buildUpdateSnapshot = async (input) => {
      snapshotKind = input.kind;
      return {
        ok: true,
        data: {
          leafs: [{
            id: "github-source:skills/one",
            sourceId: "github-source",
            name: "one",
            linkName: "one",
            title: "one",
            description: "One.",
            relativePath: "skills/one",
            absolutePath: path.join(committed.data.lock.localPath, "skills", "one"),
            skillFilePath: path.join(committed.data.lock.localPath, "skills", "one", "SKILL.md"),
            contentHash: "hash-two",
            metadataWarnings: [],
            valid: true,
          }],
          invalidLeafs: [],
          commitSha: "updated-sha",
        },
        warnings: [],
        errors: [],
      };
    };

    const reconciled = await service.reconcileInventory(["github-source"], { force: true });

    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) {
      return;
    }
    expect(snapshotKind).toBe("git");
    const state = await stateStore.readState();
    expect(state.manifest.sources.find((source) => source.id === "github-source")?.kind)
      .toBe("git");
    expect(state.lockFile.sources["github-source"]?.revision.provider).toBe("git");
    expect(state.lockFile.sources["github-source"]?.localPath).toBe(
      path.join(sandbox.stateRoot, "source", "git", "github-source"),
    );
  });
});

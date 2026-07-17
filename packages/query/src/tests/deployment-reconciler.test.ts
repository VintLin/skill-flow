import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { ChannelAdapter } from "@skill-flow/integration/adapters/channel-adapters";
import type { LockFile, ManifestFile } from "@skill-flow/domain/types";
import { DeploymentReconciler } from "../deployment-reconciler.js";

describe("DeploymentReconciler", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  test("plans and applies multiple source projections through one interface", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-reconciler-"));
    temporaryRoots.push(root);
    const targetRoot = path.join(root, "targets", "codex");
    const alphaPath = path.join(root, "sources", "alpha", "review");
    const betaPath = path.join(root, "sources", "beta", "write");
    await Promise.all([
      fs.mkdir(targetRoot, { recursive: true }),
      fs.mkdir(alphaPath, { recursive: true }),
      fs.mkdir(betaPath, { recursive: true }),
    ]);

    const manifest: ManifestFile = {
      schemaVersion: 2,
      migrationGeneration: "test",
      sources: [source("alpha"), source("beta")],
      bindings: {
        alpha: binding("alpha", "alpha:review"),
        beta: binding("beta", "beta:write"),
      },
    };
    const lockFile: LockFile = {
      schemaVersion: 2,
      migrationGeneration: "test",
      sources: {
        alpha: sourceLock("alpha", alphaPath, "alpha:review"),
        beta: sourceLock("beta", betaPath, "beta:write"),
      },
      leafInventory: [
        leaf("alpha", "alpha:review", "review", alphaPath),
        leaf("beta", "beta:write", "write", betaPath),
      ],
      projections: [],
    };
    const adapter: ChannelAdapter = {
      target: "codex",
      strategy: "symlink",
      detect: async () => ({ target: "codex", strategy: "symlink", available: true, rootPath: targetRoot }),
      resolveTargetPath: (rootPath, linkName) => path.join(rootPath, linkName),
    };

    const reconciler = new DeploymentReconciler();
    const reconciled = await reconciler.reconcile({
      manifest,
      lockFile,
      sourceIds: ["alpha", "beta"],
      adapters: [adapter],
    });

    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) {
      return;
    }
    expect(reconciled.data.actions).toEqual([
      expect.objectContaining({ kind: "create", sourceId: "alpha", leafId: "alpha:review", targetPath: path.join(targetRoot, "review") }),
      expect.objectContaining({ kind: "create", sourceId: "beta", leafId: "beta:write", targetPath: path.join(targetRoot, "write") }),
    ]);
    expect(lockFile.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "alpha", leafId: "alpha:review", status: "active" }),
      expect.objectContaining({ sourceId: "beta", leafId: "beta:write", status: "active" }),
    ]));
    expect((await fs.lstat(path.join(targetRoot, "review"))).isSymbolicLink()).toBe(true);
  });

  test("removes a detached target symlink through the reconciliation cleanup", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-reconciler-"));
    temporaryRoots.push(root);
    const targetRoot = path.join(root, "targets", "codex");
    const sourcePath = path.join(root, "sources", "alpha", "review");
    const detachedPath = path.join(targetRoot, "review");
    await Promise.all([
      fs.mkdir(targetRoot, { recursive: true }),
      fs.mkdir(sourcePath, { recursive: true }),
    ]);
    await fs.symlink(sourcePath, detachedPath);

    const lockFile: LockFile = {
      schemaVersion: 2,
      migrationGeneration: "test",
      sources: { alpha: sourceLock("alpha", sourcePath, "alpha:review") },
      leafInventory: [],
      projections: [],
    };
    const adapter = testAdapter(targetRoot);

    const warnings = await new DeploymentReconciler().cleanupDetachedTargetSymlinks({
      lockFile,
      sourceIds: ["alpha"],
      adapters: [adapter],
    });

    expect(warnings).toContainEqual(expect.objectContaining({ code: "DETACHED_TARGET_SYMLINK_REMOVED" }));
    await expect(fs.lstat(detachedPath)).rejects.toThrow();
  });

  test("rebuilds and removes bootstrap-imported target paths without a prior projection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-reconciler-"));
    temporaryRoots.push(root);
    const targetRoot = path.join(root, "targets", "codex");
    const sourcePath = path.join(root, "sources", "gstack");
    const targetPath = path.join(targetRoot, "gstack");
    await Promise.all([
      fs.mkdir(targetRoot, { recursive: true }),
      fs.mkdir(sourcePath, { recursive: true }),
    ]);
    await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\\nname: gstack\\n---\\n");
    await fs.symlink(sourcePath, targetPath);

    const manifest: ManifestFile = {
      schemaVersion: 2,
      migrationGeneration: "test",
      sources: [source("gstack")],
      bindings: { gstack: { ...binding("gstack", "gstack:."), enabledTargets: [] } },
    };
    const lockFile: LockFile = {
      schemaVersion: 2,
      migrationGeneration: "test",
      sources: {
        gstack: {
          ...sourceLock("gstack", sourcePath, "gstack:."),
          importedFromTargets: ["codex"],
          importMode: "bootstrap-detected",
          observedTargets: [{ target: "codex", rootPath: targetRoot, targetPath }],
        },
      },
      leafInventory: [leaf("gstack", "gstack:.", "gstack", sourcePath)],
      projections: [],
    };

    const warnings = await new DeploymentReconciler().cleanupImportedTargetPaths({
      manifest,
      lockFile,
      sourceIds: ["gstack"],
      adapters: [testAdapter(targetRoot)],
    });

    expect(warnings).toEqual([]);
    await expect(fs.lstat(targetPath)).rejects.toThrow();
    expect(lockFile.projections).toEqual([]);
  });

  test("removes orphan symlinks that point into managed state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-reconciler-"));
    temporaryRoots.push(root);
    const targetRoot = path.join(root, "targets", "codex");
    const stateRoot = path.join(root, "state");
    const orphanPath = path.join(targetRoot, "orphan");
    const orphanTarget = path.join(stateRoot, "checkouts", "orphan");
    await Promise.all([
      fs.mkdir(targetRoot, { recursive: true }),
      fs.mkdir(orphanTarget, { recursive: true }),
    ]);
    await fs.symlink(orphanTarget, orphanPath);

    const lockFile: LockFile = {
      schemaVersion: 2,
      migrationGeneration: "test",
      sources: {},
      leafInventory: [],
      projections: [],
    };
    const warnings = await new DeploymentReconciler().cleanupOrphanTargetSymlinks({
      manifest: { schemaVersion: 2, migrationGeneration: "test", sources: [], bindings: {} },
      lockFile,
      adapters: [testAdapter(targetRoot)],
      stateRoot,
    });

    expect(warnings).toContainEqual(expect.objectContaining({ code: "ORPHAN_TARGET_SYMLINK_REMOVED" }));
    await expect(fs.lstat(orphanPath)).rejects.toThrow();
  });
});

function testAdapter(targetRoot: string): ChannelAdapter {
  return {
    target: "codex",
    strategy: "symlink",
    detect: async () => ({ target: "codex", strategy: "symlink", available: true, rootPath: targetRoot }),
    resolveTargetPath: (rootPath, linkName) => path.join(rootPath, linkName),
  };
}

function source(id: string): ManifestFile["sources"][number] {
  return {
    id,
    kind: "local",
    locator: `/tmp/${id}`,
    canonicalLocator: `/tmp/${id}`,
    displayName: id,
    enabled: true,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function binding(sourceId: string, leafId: string): ManifestFile["bindings"][string] {
  return {
    sourceId,
    selectionMode: "selected",
    selectedLeafIds: [leafId],
    enabledTargets: ["codex"],
  };
}

function sourceLock(sourceId: string, localPath: string, leafId: string): LockFile["sources"][string] {
  return {
    sourceId,
    canonicalLocator: `/tmp/${sourceId}`,
    revision: { provider: "local", capturedAt: "2026-07-17T00:00:00.000Z" },
    localPath,
    leafIds: [leafId],
  };
}

function leaf(sourceId: string, id: string, linkName: string, absolutePath: string): LockFile["leafInventory"][number] {
  return {
    id,
    sourceId,
    displayName: linkName,
    linkName,
    title: linkName,
    description: linkName,
    relativePath: linkName,
    absolutePath,
    skillFilePath: path.join(absolutePath, "SKILL.md"),
    contentHash: `${id}-hash`,
    selectors: { aliases: [] },
    diagnostics: [],
    valid: true,
  };
}

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { LockFileV2 } from "@skill-flow/domain/types";
import { DeploymentApplierV2 } from "../services/deployment-applier-v2.js";
import { useSkillFlowSandbox, writeRepoFiles } from "./test-helpers.js";

describe.sequential("deployment applier v2", () => {
  const sandbox = useSkillFlowSandbox();

  test("writes V2 projections for create and update actions without legacy mode or deployments", async () => {
    const rootPath = process.env.SKILL_FLOW_TARGET_CODEX!;
    const sourceOnePath = path.join(sandbox.sandboxRoot, "source-a", "one");
    const sourceTwoPath = path.join(sandbox.sandboxRoot, "source-a", "two");
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:two",
          targetPath: path.join(rootPath, "two"),
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "old-hash-two",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });

    await writeRepoFiles(sourceOnePath, {
      "SKILL.md": `---
name: one
description: One.
---
`,
    });
    await writeRepoFiles(sourceTwoPath, {
      "SKILL.md": `---
name: two
description: Two.
---
`,
    });

    const applier = new DeploymentApplierV2();
    const result = await applier.applyPlan(lockFile, [
      {
        kind: "create",
        sourceId: "source-a",
        leafId: "source-a:one",
        target: "codex",
        strategy: "symlink",
        sourcePath: sourceOnePath,
        targetPath: path.join(rootPath, "one"),
        targetRootPath: rootPath,
        contentHash: "hash-one",
      },
      {
        kind: "update",
        sourceId: "source-a",
        leafId: "source-a:two",
        target: "codex",
        strategy: "symlink",
        sourcePath: sourceTwoPath,
        targetPath: path.join(rootPath, "two"),
        targetRootPath: rootPath,
        contentHash: "hash-two",
      },
    ]);

    expect(result.ok).toBe(true);
    expect(lockFile.projections).toEqual([
      expect.objectContaining({
        target: "codex",
        sourceId: "source-a",
        leafId: "source-a:one",
        targetPath: path.join(rootPath, "one"),
        targetRootPath: rootPath,
        strategy: "symlink",
        contentHash: "hash-one",
        status: "active",
        updatedAt: expect.any(String),
      }),
      expect.objectContaining({
        target: "codex",
        sourceId: "source-a",
        leafId: "source-a:two",
        targetPath: path.join(rootPath, "two"),
        targetRootPath: rootPath,
        strategy: "symlink",
        contentHash: "hash-two",
        status: "active",
        updatedAt: expect.any(String),
      }),
    ]);
    expect(lockFile.projections.every((projection) => !("mode" in projection))).toBe(true);
    expect("deployments" in lockFile).toBe(false);
    expect(await pathExists(path.join(rootPath, "one"))).toBe(true);
    expect(await pathExists(path.join(rootPath, "two"))).toBe(true);
  });

  test("removes matching V2 projections from the lock file", async () => {
    const rootPath = process.env.SKILL_FLOW_TARGET_CODEX!;
    const targetPath = path.join(rootPath, "one");
    const sourcePath = path.join(sandbox.sandboxRoot, "source-a", "one");
    const lockFile = createLockFile({
      projections: [
        {
          target: "codex",
          sourceId: "source-a",
          leafId: "source-a:one",
          targetPath,
          targetRootPath: rootPath,
          strategy: "symlink",
          contentHash: "hash-one",
          status: "active",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      ],
    });

    await writeRepoFiles(sourcePath, {
      "SKILL.md": `---
name: one
description: One.
---
`,
    });
    await fs.symlink(sourcePath, targetPath, "junction");

    const applier = new DeploymentApplierV2();
    const result = await applier.applyPlan(lockFile, [
      {
        kind: "remove",
        sourceId: "source-a",
        leafId: "source-a:one",
        target: "codex",
        strategy: "symlink",
        sourcePath: "",
        targetPath,
        targetRootPath: rootPath,
        contentHash: "hash-one",
      },
    ]);

    expect(result.ok).toBe(true);
    expect(lockFile.projections).toEqual([]);
    expect(await pathExists(targetPath)).toBe(false);
  });
});

function createLockFile(options: {
  projections: LockFileV2["projections"];
}): LockFileV2 {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: {},
    leafInventory: [],
    projections: options.projections,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

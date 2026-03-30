import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { LockFile } from "@skill-flow/domain/types";
import { DeploymentApplier } from "../services/deployment-applier.js";
import { useSkillFlowSandbox, writeRepoFiles } from "./test-helpers.js";

describe.sequential("deployment applier", () => {
  const sandbox = useSkillFlowSandbox();

  test("keeps previousTargetPath when another deployment still owns it", async () => {
    const rootPath = process.env.SKILL_FLOW_TARGET_CODEX!;
    const previousTargetPath = path.join(rootPath, "browse");
    const nextTargetPath = path.join(rootPath, "source-a-browse");
    const sourcePath = path.join(sandbox.sandboxRoot, "source-a", "browse");

    await writeRepoFiles(sourcePath, {
      "SKILL.md": `---
name: browse
description: |
  Source A browse.
---
`,
    });
    await fs.symlink(sourcePath, previousTargetPath, "junction");

    const lockFile: LockFile = {
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      deployments: [
        {
          sourceId: "source-a",
          leafId: "source-a:browse",
          target: "codex",
          targetPath: previousTargetPath,
          targetRootPath: rootPath,
          strategy: "symlink",
          status: "active",
          contentHash: "hash-a",
          appliedAt: "2026-03-30T00:00:00.000Z",
        },
        {
          sourceId: "source-a",
          leafId: "source-a:browse",
          target: "gemini-cli",
          targetPath: previousTargetPath,
          targetRootPath: rootPath,
          strategy: "symlink",
          status: "active",
          contentHash: "hash-a",
          appliedAt: "2026-03-30T00:00:00.000Z",
        },
      ],
    };

    const applier = new DeploymentApplier();
    const result = await applier.applyPlan(lockFile, [
      {
        kind: "update",
        sourceId: "source-a",
        leafId: "source-a:browse",
        target: "codex",
        strategy: "symlink",
        sourcePath,
        targetPath: nextTargetPath,
        targetRootPath: rootPath,
        previousTargetPath,
        previousTargetRootPath: rootPath,
        contentHash: "hash-a",
      },
    ]);

    expect(result.ok).toBe(true);
    expect(await fs.lstat(previousTargetPath).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.lstat(nextTargetPath).then(() => true).catch(() => false)).toBe(true);
  });
});

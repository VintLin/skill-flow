import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "@skill-flow/query/runtime";
import { useSkillFlowSandbox } from "./test-helpers.js";

describe("source parsing compatibility", () => {
  const sandbox = useSkillFlowSandbox();

  test("treats file URLs to local skill directories as local sources", async () => {
    const tempRoot = await fs.mkdtemp(path.join(sandbox.sandboxRoot, "skill-flow-file-url-"));
    const repoPath = path.join(tempRoot, "local-skill");
    await fs.mkdir(path.join(repoPath, "browse"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "browse", "SKILL.md"),
      `---
name: browse
description: Browse flow.
---
# Browse
`,
      "utf8",
    );

    const app = new SkillFlowApp();
    const result = await app.addSource(`file://${repoPath}`, { project: false });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.manifest.kind).toBe("local");
    expect(result.data.manifest.locator).toBe(repoPath);
    expect(result.data.leafCount).toBe(1);
  });
});

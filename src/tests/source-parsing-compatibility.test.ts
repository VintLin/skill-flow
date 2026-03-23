import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { InventoryService } from "../services/inventory-service.js";
import { SourceService } from "../services/source-service.js";
import { StateStore } from "../state/store.js";
import { SkillFlowApp } from "../services/skill-flow.js";
import { resolveAddSourceLocator } from "../utils/cli.js";

type ResolvedSource = {
  kind: string;
  locator: string;
  displayName: string;
  sourceId: string;
  gitLocator?: string;
  requestedPath?: string;
};

function createSourceService() {
  return new SourceService(new StateStore(), new InventoryService());
}

async function resolveSource(locator: string): Promise<ResolvedSource> {
  const service = createSourceService();
  return (service as unknown as {
    resolveSource(locator: string, options: { path?: string }): Promise<ResolvedSource>;
  }).resolveSource(locator, {});
}

describe("source parsing compatibility", () => {
  test("keeps GitHub shorthand subpaths intact at the CLI layer", () => {
    expect(resolveAddSourceLocator("JimLiu/baoyu-skills/skills/find-skills")).toBe(
      "JimLiu/baoyu-skills/skills/find-skills",
    );
  });

  test("resolves GitHub shorthand subpaths as repo locators with requested paths", async () => {
    await expect(resolveSource("JimLiu/baoyu-skills/skills/find-skills")).resolves.toEqual({
      kind: "git",
      locator: "https://github.com/JimLiu/baoyu-skills.git",
      displayName: "baoyu-skills",
      sourceId: "jimliu-baoyu-skills",
      gitLocator: "https://github.com/JimLiu/baoyu-skills.git",
      requestedPath: "skills/find-skills",
    });
  });

  test("resolves GitLab tree URLs as repo locators with requested paths", async () => {
    await expect(
      resolveSource("https://gitlab.com/group/project/-/tree/main/skills/find-skills"),
    ).resolves.toEqual({
      kind: "git",
      locator: "https://gitlab.com/group/project.git",
      displayName: "project",
      sourceId: "project",
      gitLocator: "https://gitlab.com/group/project.git",
      requestedPath: "skills/find-skills",
    });
  });

  test("resolves GitLab tree URLs without subpaths as repo locators", async () => {
    await expect(
      resolveSource("https://gitlab.com/group/project/-/tree/main"),
    ).resolves.toEqual({
      kind: "git",
      locator: "https://gitlab.com/group/project.git",
      displayName: "project",
      sourceId: "project",
      gitLocator: "https://gitlab.com/group/project.git",
    });
  });

  test("treats file URLs to local skill directories as local sources", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-file-url-"));
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

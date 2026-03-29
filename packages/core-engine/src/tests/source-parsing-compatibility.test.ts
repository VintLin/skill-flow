import { describe, expect, test } from "vitest";
import { StateStore } from "@skill-flow/storage/store";
import { resolveAddSourceLocator } from "@skill-flow/integration/utils/cli";
import { InventoryService } from "../services/inventory-service.js";
import { SourceService } from "../services/source-service.js";

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
});

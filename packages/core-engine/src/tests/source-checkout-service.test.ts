import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import * as gitUtils from "@skill-flow/integration/utils/git";
import { InventoryService } from "../services/inventory-service.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("SourceCheckoutService", () => {
  const sandbox = useSkillFlowSandbox();

  test("classifies GitHub git locators as git checkout kind", async () => {
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    await expect(service.resolveSource("https://github.com/acme/skills.git", {}))
      .resolves.toMatchObject({
        kind: "git",
        gitLocator: "https://github.com/acme/skills.git",
      });
    await expect(service.resolveSource("acme/skills/path/to/skill", {}))
      .resolves.toMatchObject({
        kind: "git",
        locator: "https://github.com/acme/skills.git",
        requestedPath: "path/to/skill",
      });
    await expect(service.resolveSource("https://gitlab.com/acme/skills.git", {}))
      .resolves.toMatchObject({
        kind: "git",
        gitLocator: "https://gitlab.com/acme/skills.git",
      });
  });

  test("prepares a checkout snapshot without writing authority files", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const checkoutPath = path.join(
      sandbox.stateRoot,
      "catalog",
      "import-preparations",
      "prep-1",
      "checkout",
    );
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(repoPath, {
      checkoutPath,
      options: { sourceIdOverride: "design-source" },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data).toEqual(expect.objectContaining({
      sourceId: "design-source",
      kind: "local",
      locator: repoPath,
      displayName: path.basename(repoPath),
      checkoutPath,
    }));
    expect(prepared.data.leafs).toEqual([
      expect.objectContaining({
        id: "design-source:skills/frontend-design",
        sourceId: "design-source",
        relativePath: "skills/frontend-design",
        linkName: "frontend-design",
        valid: true,
      }),
    ]);
    await expect(fs.stat(path.join(checkoutPath, "skills", "frontend-design", "SKILL.md")))
      .resolves.toBeTruthy();
    await expect(fs.access(path.join(sandbox.stateRoot, "manifest.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "lock.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "preferences.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "collections.json"))).rejects.toThrow();
  });

  test("prepares GitHub tree locators under the git source root", async () => {
    const upstreamRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/find-skills/SKILL.md": skillDoc("find-skills", "Find skills."),
    });
    vi.spyOn(gitUtils, "isGitAvailable").mockResolvedValue(true);
    vi.spyOn(gitUtils, "git").mockImplementation(async (args) => {
      if (args[0] === "clone" && args[3] === "https://github.com/vercel-labs/skills.git") {
        await fs.cp(upstreamRepo, args[4]!, { recursive: true });
        return "";
      }

      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return "test-commit-sha";
      }

      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(
      "https://github.com/vercel-labs/skills/tree/main/skills/find-skills",
      { options: { sourceIdOverride: "vercel-labs-skills" } },
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data.kind).toBe("git");
    expect(prepared.data.requestedPath).toBe("skills/find-skills");
    expect(prepared.data.checkoutPath).toContain(`${path.sep}source${path.sep}git${path.sep}`);
    expect(prepared.data.leafs.map((leaf) => leaf.id)).toEqual([
      "vercel-labs-skills:skills/find-skills",
    ]);
  });
});

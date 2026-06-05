import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { InventoryService } from "../services/inventory-service.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("SourceCheckoutService", () => {
  const sandbox = useSkillFlowSandbox();

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
});

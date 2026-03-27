import { describe, expect, test } from "vitest";
import { InventoryService } from "../services/inventory-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("inventory discovery precedence", () => {
  const sandbox = useSkillFlowSandbox();

  test("keeps a root skill ahead of matching duplicates in other buckets", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("browse", "Root browse skill."),
      "alpha/browse/SKILL.md": skillDoc("browse", "Root browse skill."),
      "skills/browse/SKILL.md": skillDoc("browse", "Root browse skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs).toHaveLength(1);
    expect(scanned.leafs[0]?.relativePath).toBe(".");
    expect(
      scanned.duplicateLeafs.some(
        (duplicate) => duplicate.path === "alpha/browse" && duplicate.keptPath === ".",
      ),
    ).toBe(true);
  });

  test("prefers standard skill buckets over alphabetically earlier recursive matches", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "alpha/browse/SKILL.md": skillDoc("browse", "Shared browse skill."),
      "skills/browse/SKILL.md": skillDoc("browse", "Shared browse skill."),
      "skills/.curated/browse/SKILL.md": skillDoc("browse", "Shared browse skill."),
      "skills/.experimental/browse/SKILL.md": skillDoc("browse", "Shared browse skill."),
      "skills/.system/browse/SKILL.md": skillDoc("browse", "Shared browse skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs).toHaveLength(1);
    expect(scanned.leafs[0]?.relativePath).toBe("skills/browse");
    expect(
      scanned.duplicateLeafs.some(
        (duplicate) => duplicate.path === "alpha/browse" && duplicate.keptPath === "skills/browse",
      ),
    ).toBe(true);
  });

  test("preserves recursive fallback for hidden host directories", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      ".agents/skills/gstack-browse/SKILL.md": skillDoc("gstack-browse", "Host directory skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs).toHaveLength(1);
    expect(scanned.leafs[0]?.relativePath).toBe(".agents/skills/gstack-browse");
  });

  test("uses repository display name for a root-level skill link name", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("gstack", "Root skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("garrytan-gstack", repoPath, "gstack");

    expect(scanned.leafs[0]?.linkName).toBe("gstack");
  });
});

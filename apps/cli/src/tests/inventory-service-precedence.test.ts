import { describe, expect, test } from "vitest";
import { InventoryService } from "@skill-flow/core-engine/services/inventory-service";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("inventory discovery precedence", () => {
  const sandbox = useSkillFlowSandbox();

  test("returns only the root skill when a root SKILL.md exists", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("browse", "Root browse skill."),
      "alpha/browse/SKILL.md": skillDoc("browse", "Root browse skill."),
      "skills/browse/SKILL.md": skillDoc("browse", "Root browse skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs).toHaveLength(1);
    expect(scanned.leafs[0]?.relativePath).toBe(".");
    expect(scanned.duplicateLeafs).toEqual([]);
    expect(scanned.skillFileCount).toBe(1);
  });

  test("uses standard skill buckets before recursive fallback", async () => {
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
    expect(scanned.duplicateLeafs).toEqual([
      { path: "skills/.curated/browse", keptPath: "skills/browse" },
      { path: "skills/.experimental/browse", keptPath: "skills/browse" },
      { path: "skills/.system/browse", keptPath: "skills/browse" },
    ]);
    expect(scanned.skillFileCount).toBe(4);
  });

  test("discovers hidden host directories from the standard bucket list", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      ".agents/skills/gstack-browse/SKILL.md": skillDoc("gstack-browse", "Host directory skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs).toHaveLength(1);
    expect(scanned.leafs[0]?.relativePath).toBe(".agents/skills/gstack-browse");
  });

  test("does not recursively pull duplicate source layouts when a supported host bucket already matched", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      ".agents/skills/adapt/SKILL.md": skillDoc("adapt", "Agent skill."),
      "source/skills/adapt/SKILL.md": skillDoc("adapt", "Source mirror."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("pbakaus-impeccable", repoPath, "impeccable");

    expect(scanned.leafs).toHaveLength(1);
    expect(scanned.leafs[0]?.relativePath).toBe(".agents/skills/adapt");
    expect(scanned.duplicateLeafs).toEqual([]);
    expect(scanned.skillFileCount).toBe(1);
  });
});

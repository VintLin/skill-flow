import { describe, expect, test } from "vitest";
import { InventoryService } from "../services/inventory-service.js";
import {
  createRepo,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("inventory discovery precedence", () => {
  const sandbox = useSkillFlowSandbox();

  test("keeps the root skill and direct child skills when both exist", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("browse", "Root browse skill."),
      "autoplan/SKILL.md": skillDoc("autoplan", "Autoplan skill."),
      "alpha/browse/SKILL.md": skillDoc("browse", "Root browse skill."),
      "skills/browse/SKILL.md": skillDoc("browse", "Root browse skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs).toHaveLength(2);
    expect(scanned.leafs.map((leaf) => leaf.relativePath)).toEqual([".", "autoplan"]);
    expect(scanned.duplicateLeafs).toEqual([{ path: "skills/browse", keptPath: "." }]);
    expect(scanned.skillFileCount).toBe(3);
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

  test("uses repository display name for a root-level skill link name", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("gstack", "Root skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("garrytan-gstack", repoPath, "gstack");

    expect(scanned.leafs[0]?.linkName).toBe("gstack");
  });

  test("uses SKILL.md frontmatter name as the displayed skill title", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "audio-text-compare/SKILL.md": skillDoc(
        "音频文本校对",
        "Compare audio text.",
        "Audio Text Compare",
      ),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs[0]?.title).toBe("音频文本校对");
    expect(scanned.leafs[0]?.linkName).toBe("audio-text-compare");
  });

  test("strips YAML quotes from SKILL.md frontmatter scalar fields", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "keep-codex-fast/SKILL.md": `---
name: "keep-codex-fast"
description: "Safe Codex local-state maintenance"
---

# Keep Codex Fast
`,
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs[0]?.name).toBe("keep-codex-fast");
    expect(scanned.leafs[0]?.title).toBe("keep-codex-fast");
    expect(scanned.leafs[0]?.description).toBe("Safe Codex local-state maintenance");
    expect(scanned.leafs[0]?.diagnostics).toEqual([]);
  });

  test("falls back to folder name before OpenAI display name and markdown heading", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "puma-code-checker/SKILL.md": `---
name:
description: |
  Check Puma codes.
---

# Puma Code Checker
`,
      "puma-code-checker/agents/openai.yaml": `interface:
  display_name: "铺码码值检查"
`,
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("demo-source", repoPath, "demo");

    expect(scanned.leafs[0]?.title).toBe("puma-code-checker");
  });

  test("detects gstack-style direct child skills alongside the root skill", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "SKILL.md": skillDoc("gstack", "Root skill."),
      "browse/SKILL.md": skillDoc("browse", "Browse skill."),
      "investigate/SKILL.md": skillDoc("investigate", "Investigate skill."),
    });
    const inventory = new InventoryService();

    const scanned = await inventory.scanSource("garrytan-gstack", repoPath, "gstack");

    expect(scanned.leafs.map((leaf) => leaf.relativePath)).toEqual([".", "browse", "investigate"]);
    expect(scanned.skillFileCount).toBe(3);
  });
});

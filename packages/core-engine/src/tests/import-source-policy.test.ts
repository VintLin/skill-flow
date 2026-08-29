import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImportSourcePolicy } from "../services/import-source-policy.js";

describe("ImportSourcePolicy", () => {
  const temporaryPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryPaths.splice(0).map((entry) =>
      fs.rm(entry, { recursive: true, force: true })
    ));
  });

  it("normalizes supported GitHub locator forms into one source identity", () => {
    const policy = new ImportSourcePolicy();

    expect(policy.parseGitHubLocator("anthropics/skills")).toEqual({
      canonicalRepo: "anthropics/skills",
      originalLocator: "anthropics/skills",
      locator: "anthropics/skills",
    });
    expect(policy.parseGitHubLocator("https://github.com/anthropics/skills/tree/main/skills/pdf"))
      .toEqual({
        canonicalRepo: "anthropics/skills",
        originalLocator: "https://github.com/anthropics/skills/tree/main/skills/pdf",
        locator: "https://github.com/anthropics/skills.git",
        requestedPath: "skills/pdf",
      });
    expect(policy.parseGitHubLocator("anthropics/skills@pdf")).toEqual({
      canonicalRepo: "anthropics/skills",
      originalLocator: "anthropics/skills@pdf",
      locator: "https://github.com/anthropics/skills.git",
      skillSelector: "pdf",
    });
    expect(policy.parseGitHubLocator("anthropics/skills/skills/pdf")).toEqual({
      canonicalRepo: "anthropics/skills",
      originalLocator: "anthropics/skills/skills/pdf",
      locator: "https://github.com/anthropics/skills.git",
      requestedPath: "skills/pdf",
    });
  });

  it("resolves quoted local paths without classifying repositories as direct locators", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-import-policy-"));
    temporaryPaths.push(root);
    const policy = new ImportSourcePolicy();

    await expect(policy.resolveDirectLocator(`"${root}"`)).resolves.toBe(root);
    await expect(policy.resolveDirectLocator("anthropics/skills")).resolves.toBeUndefined();
    await expect(policy.resolveDirectLocator("clawhub:pdf@1.0.0")).resolves.toBe("clawhub:pdf@1.0.0");
  });

  it("uses the same selector aliases and path precedence for preview and commit", () => {
    const policy = new ImportSourcePolicy();
    const leafs = [
      { id: "nested", relativePath: "examples/react-best-practices", linkName: "react-best-practices", title: "React Best Practices" },
      { id: "skill", relativePath: "skills/react-best-practices", linkName: "react-best-practices", title: "React Best Practices" },
      { id: "curated", relativePath: "skills/.curated/react-best-practices", linkName: "react-best-practices", title: "React Best Practices" },
    ];

    const matches = policy.findSelectorMatches(
      leafs,
      "vercel-react-best-practices",
      "vercel-labs/agent-skills",
    );

    expect(matches.map((leaf) => leaf.id)).toEqual(["nested", "skill", "curated"]);
    expect(policy.pickPreferredLeaf(matches)?.id).toBe("skill");
    expect(policy.selectLeafIdsForRequestedPath(leafs, "./skills/")).toEqual(["skill", "curated"]);
  });
});

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("release metadata", () => {
  test("workspace packages, changelog, and release notes are aligned to v1.4.8", async () => {
    const packageJsonPaths = [
      "apps/cli/package.json",
      "packages/core-engine/package.json",
      "packages/domain/package.json",
      "packages/integration/package.json",
      "packages/query/package.json",
      "packages/shared-types/package.json",
      "packages/storage/package.json",
      "packages/tui/package.json",
    ];

    const packageVersions = await Promise.all(
      packageJsonPaths.map(async (relativePath) => {
        const content = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
        const parsed = JSON.parse(content) as { version: string };
        return parsed.version;
      }),
    );

    expect(new Set(packageVersions)).toEqual(new Set(["1.4.8"]));

    const changelog = await fs.readFile(path.join(repoRoot, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("## v1.4.8");

    const releaseNotes = await fs.readFile(
      path.join(repoRoot, "releases", "RELEASE_v1.4.8.md"),
      "utf8",
    );
    expect(releaseNotes).toContain("# RELEASE v1.4.8");
    expect(releaseNotes).toContain("Compared with `v1.4.7`");
  });
});

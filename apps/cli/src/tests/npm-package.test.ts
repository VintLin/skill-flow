import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { createCliPublishStage } from "../../../../scripts/release/cli-publish-utils.mjs";

const cliRoot = path.resolve(import.meta.dirname, "../..");
const internalPackagePattern = /@skill-flow\//;
const internalImportPattern =
  /(?:from\s+["']@skill-flow\/|import\s*\(\s*["']@skill-flow\/|require\(\s*["']@skill-flow\/)/;

describe.sequential("npm package", () => {
  const tempPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempPaths.map((targetPath) => fs.rm(targetPath, { recursive: true, force: true })),
    );
    tempPaths.length = 0;
  });

  test("packed CLI does not depend on unpublished workspace packages", async () => {
    execFileSync("npm", ["run", "build"], {
      cwd: cliRoot,
      stdio: "pipe",
    });

    const packOutput = execFileSync("npm", ["pack", "--json"], {
      cwd: cliRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
    const [{ filename }] = JSON.parse(packOutput) as [{ filename: string }];
    const tarballPath = path.join(cliRoot, filename);
    tempPaths.push(tarballPath);

    const extractRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-pack-test-"));
    tempPaths.push(extractRoot);

    execFileSync("tar", ["-xzf", tarballPath, "-C", extractRoot], {
      stdio: "pipe",
    });

    const packedPackageRoot = path.join(extractRoot, "package");
    const packedPackageJson = JSON.parse(
      await fs.readFile(path.join(packedPackageRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const internalDependencies = Object.keys(packedPackageJson.dependencies ?? {}).filter(
      (dependency) => internalPackagePattern.test(dependency),
    );

    expect(internalDependencies).toEqual([]);

    const packedCliEntry = await fs.readFile(path.join(packedPackageRoot, "dist", "cli.js"), "utf8");
    const packedBridgeEntry = await fs.readFile(
      path.join(packedPackageRoot, "dist", "bridge-command.js"),
      "utf8",
    );

    expect(packedCliEntry).not.toMatch(internalImportPattern);
    expect(packedBridgeEntry).not.toMatch(internalImportPattern);
  });

  test("staged publish manifest strips internal workspace dependencies", async () => {
    execFileSync("npm", ["run", "build"], {
      cwd: cliRoot,
      stdio: "pipe",
    });

    const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-publish-stage-"));
    tempPaths.push(stageRoot);

    const { packageManifest } = await createCliPublishStage(stageRoot);
    const internalDependencies = Object.keys(packageManifest.dependencies ?? {}).filter((dependency) =>
      internalPackagePattern.test(dependency),
    );

    expect(internalDependencies).toEqual([]);
    expect(packageManifest.scripts).toBeUndefined();
    expect(packageManifest.devDependencies).toBeUndefined();
    await expect(fs.stat(path.join(stageRoot, "dist", "cli.js"))).resolves.toBeTruthy();
  });
});

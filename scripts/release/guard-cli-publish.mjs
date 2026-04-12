import { readCliManifest } from "./cli-publish-utils.mjs";

const { packageJsonPath, packageManifest } = await readCliManifest(process.cwd());
const internalDependencies = Object.keys(packageManifest.dependencies ?? {}).filter((dependencyName) =>
  dependencyName.startsWith("@skill-flow/"),
);

if (internalDependencies.length === 0) {
  process.exit(0);
}

console.error(
  [
    `Refusing to publish ${packageJsonPath} because it still depends on internal workspace packages.`,
    `Use a staged publish directory instead so npm registry metadata matches the published tarball.`,
    `Run: node ../../scripts/release/publish-cli-package.mjs`,
  ].join("\n"),
);
process.exit(1);

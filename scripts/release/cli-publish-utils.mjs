import fs from "node:fs/promises";
import path from "node:path";

export const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
export const cliRoot = path.join(repoRoot, "apps", "cli");
const files = ["LICENSE", "README.md", "README.zh.md"];

export function sanitizeCliManifest(packageManifest) {
  const sanitizedManifest = structuredClone(packageManifest);
  sanitizedManifest.dependencies = Object.fromEntries(
    Object.entries(sanitizedManifest.dependencies ?? {}).filter(
      ([dependencyName]) => !dependencyName.startsWith("@skill-flow/"),
    ),
  );
  delete sanitizedManifest.scripts;
  delete sanitizedManifest.devDependencies;
  return sanitizedManifest;
}

export async function readCliManifest(root = cliRoot) {
  const packageJsonPath = path.join(root, "package.json");
  const packageJsonContent = await fs.readFile(packageJsonPath, "utf8");
  return {
    packageJsonPath,
    packageJsonContent,
    packageManifest: JSON.parse(packageJsonContent),
  };
}

export async function createCliPublishStage(stageRoot) {
  await fs.rm(stageRoot, { recursive: true, force: true });
  await fs.mkdir(stageRoot, { recursive: true });

  for (const file of files) {
    await fs.copyFile(path.join(repoRoot, file), path.join(stageRoot, file));
  }

  await fs.cp(path.join(cliRoot, "dist"), path.join(stageRoot, "dist"), { recursive: true });

  const { packageManifest } = await readCliManifest();
  const sanitizedManifest = sanitizeCliManifest(packageManifest);
  await fs.writeFile(
    path.join(stageRoot, "package.json"),
    `${JSON.stringify(sanitizedManifest, null, 2)}\n`,
    "utf8",
  );

  return { stageRoot, packageManifest: sanitizedManifest };
}

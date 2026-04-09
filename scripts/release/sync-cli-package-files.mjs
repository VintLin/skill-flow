import fs from "node:fs/promises";
import path from "node:path";

const command = process.argv[2];
const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const cliRoot = path.join(repoRoot, "apps", "cli");
const statePath = path.join(cliRoot, ".pack-sync-state.json");
const files = ["README.md", "README.zh.md", "LICENSE"];
const packageJsonPath = path.join(cliRoot, "package.json");

if (command === "prepare") {
  await prepare();
} else if (command === "restore") {
  await restore();
} else {
  console.error("Usage: node sync-cli-package-files.mjs <prepare|restore>");
  process.exitCode = 1;
}

async function prepare() {
  const state = {};

  for (const file of files) {
    const sourcePath = path.join(repoRoot, file);
    const targetPath = path.join(cliRoot, file);
    const sourceContent = await fs.readFile(sourcePath, "utf8");

    try {
      const existingContent = await fs.readFile(targetPath, "utf8");
      state[file] = { existed: true, content: existingContent };
    } catch {
      state[file] = { existed: false };
    }

    await fs.writeFile(targetPath, sourceContent, "utf8");
  }

  const packageJsonContent = await fs.readFile(packageJsonPath, "utf8");
  state["package.json"] = {
    existed: true,
    content: packageJsonContent,
  };
  const packageManifest = JSON.parse(packageJsonContent);
  const dependencies = Object.fromEntries(
    Object.entries(packageManifest.dependencies ?? {}).filter(
      ([dependencyName]) => !dependencyName.startsWith("@skill-flow/"),
    ),
  );
  packageManifest.dependencies = dependencies;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageManifest, null, 2)}\n`, "utf8");

  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function restore() {
  let rawState;
  try {
    rawState = await fs.readFile(statePath, "utf8");
  } catch {
    return;
  }

  const state = JSON.parse(rawState);

  for (const file of files) {
    const targetPath = path.join(cliRoot, file);
    const entry = state[file];
    if (!entry) {
      continue;
    }

    if (entry.existed) {
      await fs.writeFile(targetPath, entry.content, "utf8");
      continue;
    }

    await fs.rm(targetPath, { force: true });
  }

  const packageEntry = state["package.json"];
  if (packageEntry?.existed) {
    await fs.writeFile(packageJsonPath, packageEntry.content, "utf8");
  }

  await fs.rm(statePath, { force: true });
}

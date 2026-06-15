import fs from "node:fs/promises";
import path from "node:path";
import { readCliManifest, sanitizeCliManifest } from "./cli-publish-utils.mjs";

const command = process.argv[2];
const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const cliRoot = path.join(repoRoot, "apps", "cli");
const statePath = path.join(cliRoot, ".pack-sync-state.json");
const backupRoot = path.join(cliRoot, ".pack-sync-backups");
const files = ["README.md", "README.zh.md", "LICENSE"];
const directories = ["skills"];
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
  await fs.rm(backupRoot, { recursive: true, force: true });

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

  for (const directory of directories) {
    const sourcePath = path.join(repoRoot, directory);
    const targetPath = path.join(cliRoot, directory);
    const backupPath = path.join(backupRoot, directory);

    try {
      await fs.stat(targetPath);
      state[directory] = { existed: true, backupPath };
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.cp(targetPath, backupPath, { recursive: true });
    } catch {
      state[directory] = { existed: false };
    }

    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.cp(sourcePath, targetPath, { recursive: true });
  }

  const { packageJsonContent, packageManifest } = await readCliManifest(cliRoot);
  state["package.json"] = {
    existed: true,
    content: packageJsonContent,
  };
  const sanitizedManifest = sanitizeCliManifest(packageManifest);
  sanitizedManifest.scripts = packageManifest.scripts;
  sanitizedManifest.devDependencies = packageManifest.devDependencies;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(sanitizedManifest, null, 2)}\n`, "utf8");

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

  for (const directory of directories) {
    const targetPath = path.join(cliRoot, directory);
    const entry = state[directory];
    if (!entry) {
      continue;
    }

    await fs.rm(targetPath, { recursive: true, force: true });
    if (entry.existed) {
      await fs.cp(entry.backupPath, targetPath, { recursive: true });
    }
  }

  const packageEntry = state["package.json"];
  if (packageEntry?.existed) {
    await fs.writeFile(packageJsonPath, packageEntry.content, "utf8");
  }

  await fs.rm(statePath, { force: true });
  await fs.rm(backupRoot, { recursive: true, force: true });
}

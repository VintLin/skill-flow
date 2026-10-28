import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sourcePath = path.join(repoRoot, "packages", "integration", "src", "data", "builtin-sources.json");
const desktopResourcePath = path.join(
  repoRoot,
  "apps",
  "desktop-mac",
  "Sources",
  "DesktopApp",
  "Resources",
  "ImportRecommendations",
  "recommendations.json",
);
const integrationDistPath = path.join(repoRoot, "packages", "integration", "dist", "data", "builtin-sources.json");

const content = await fs.readFile(sourcePath, "utf8");
const parsed = JSON.parse(content);
if (!Array.isArray(parsed) || parsed.some((source) => typeof source?.canonicalRepo !== "string")) {
  throw new Error(`Invalid builtin source catalog: ${sourcePath}`);
}

await fs.mkdir(path.dirname(desktopResourcePath), { recursive: true });
await fs.writeFile(desktopResourcePath, content, "utf8");
await fs.mkdir(path.dirname(integrationDistPath), { recursive: true });
await fs.writeFile(integrationDistPath, content, "utf8");

console.log(`Synced ${parsed.length} builtin sources (${parsed.filter((source) => source.recommendation).length} recommendations).`);

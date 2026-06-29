import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliRoot = path.join(repoRoot, "apps", "cli");
const distRoot = path.join(cliRoot, "dist");

await fs.rm(distRoot, { recursive: true, force: true });

await build({
  entryPoints: {
    cli: path.join(cliRoot, "src", "cli.tsx"),
    "bridge-command": path.join(cliRoot, "src", "bridge-command.ts"),
  },
  outdir: distRoot,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["commander", "ink", "react", "react/jsx-runtime"],
});

await build({
  entryPoints: {
    "desktop-bridge": path.join(cliRoot, "src", "desktop-bridge.ts"),
  },
  outdir: distRoot,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  minify: true,
});

execFileSync(
  process.execPath,
  [
    path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
    "-p",
    "tsconfig.json",
    "--emitDeclarationOnly",
  ],
  {
    cwd: cliRoot,
    stdio: "inherit",
  },
);

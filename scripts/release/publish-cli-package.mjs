import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createCliPublishStage } from "./cli-publish-utils.mjs";

const extraArgs = process.argv.slice(2);
const stageRoot = await createCliPublishStage(path.join(os.tmpdir(), `skill-flow-publish-${process.pid}`));

try {
  execFileSync("npm", ["publish", ...extraArgs], {
    cwd: stageRoot.stageRoot,
    stdio: "inherit",
  });
} finally {
  await import("node:fs/promises").then(({ rm }) => rm(stageRoot.stageRoot, { recursive: true, force: true }));
}

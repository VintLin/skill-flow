// E2E fixture: real runtime/bridge, with deterministic barriers around real commits.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.SKILL_FLOW_PROGRESS_E2E_ROOT;
if (!root || !root.includes("skill-flow-progress-e2e-")) throw new Error("Isolated E2E root required");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.env.SKILL_FLOW_STATE_ROOT = path.join(root, "state");
const { TARGET_ORDER } = await import(path.join(repo, "packages/integration/dist/utils/constants.js"));
for (const target of TARGET_ORDER) {
  process.env[`SKILL_FLOW_TARGET_${target.replaceAll("-", "_").toUpperCase()}`] = path.join(root, "targets", target);
}
const { SkillFlowApp } = await import(path.join(repo, "packages/query/src/runtime.ts"));
const { runBridgeCommand, parseBridgeProcessArgs } = await import(path.join(repo, "apps/cli/src/bridge-runner.ts"));
const { getBuiltinGitSources } = await import(path.join(repo, "packages/integration/dist/utils/builtin-git-sources.js"));
const { deriveSourceId } = await import(path.join(repo, "packages/integration/dist/utils/source-id.js"));
const { StateStore } = await import(path.join(repo, "packages/storage/dist/state-store.js"));
const app = new SkillFlowApp();
const doc = (id, version) => `---\nname: ${id}\ndescription: E2E ${version}\n---\n# ${id} ${version}\n`;
const mark = async (name) => fs.writeFile(path.join(root, name), new Date().toISOString());
const exists = async (name) => fs.access(path.join(root, name)).then(() => true, () => false);
for (const builtin of getBuiltinGitSources()) {
  await fs.mkdir(app.store.getCatalogCheckoutPath(deriveSourceId(builtin.locator)), { recursive: true });
}

if (process.argv.includes("--setup")) {
  await fs.mkdir(path.join(root, "targets", "codex"), { recursive: true });
  for (const id of ["fast", "failed", "slow", "unchanged", "repair"]) {
    const source = path.join(root, "inputs", id);
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), doc(id, "before"));
    const added = await app.addSource(source, { sourceIdOverride: id, project: false });
    if (!added.ok) throw new Error(JSON.stringify(added));
    const applied = await app.applyDraft(id, { selectedLeafIds: added.data.lock.leafIds, enabledTargets: ["codex"] });
    if (!applied.ok) throw new Error(JSON.stringify(applied));
    if (id === "fast") {
      const collection = await app.createCollection({
        displayName: "Latest collection", skills: [{ sourceId: id, leafId: added.data.lock.leafIds[0] }], enabledTargets: [],
      });
      if (!collection.ok) throw new Error(JSON.stringify(collection));
    }
    if (!["unchanged", "repair"].includes(id)) {
      await fs.writeFile(path.join(source, "SKILL.md"), doc(id, "after"));
    }
  }
  // Seed Git-managed fixture snapshots without running Git or touching the
  // repository. Only the external remote/download boundary is controlled;
  // integrity inspection, protected transactions, and target application run live.
  const store = new StateStore(app.store.rootPath);
  const state = await store.readState();
  for (const id of ["slow", "unchanged", "repair"]) {
    const source = state.manifest.sources.find((source) => source.id === id);
    const lock = state.lockFile.sources[id];
    const previous = lock.localPath;
    const checkout = path.join(root, "state/source/git", id);
    await fs.mkdir(path.dirname(checkout), { recursive: true });
    await fs.rename(previous, checkout);
    source.kind = "git";
    source.locator = source.canonicalLocator = `https://e2e.invalid/${id}`;
    lock.localPath = checkout;
    lock.canonicalLocator = source.locator;
    lock.revision = { provider: "git", commit: "0".repeat(40), capturedAt: new Date().toISOString() };
    for (const leaf of state.lockFile.leafInventory.filter((leaf) => leaf.sourceId === id)) {
      leaf.absolutePath = path.join(checkout, leaf.relativePath);
      leaf.skillFilePath = path.join(leaf.absolutePath, "SKILL.md");
    }
    // Existing projections use symlinks: point the fixture at its moved checkout.
    for (const projection of state.lockFile.projections.filter((projection) => projection.sourceId === id && projection.status === "active")) {
      await fs.rm(projection.targetPath, { force: true, recursive: true });
      await fs.symlink(checkout, projection.targetPath);
    }
  }
  await store.writeState(state);
  await fs.writeFile(path.join(root, "state/source/git/repair/SKILL.md"), "corrupted checkout\n");
  await mark("release-precheck");
  await mark("release-repair");
  await fs.rm(path.join(root, "inputs", "failed"), { recursive: true });
  await mark("setup-complete");
  process.exit(0);
}

const readRemote = app.sourceCheckoutService.readGitRemoteHeadCommit.bind(app.sourceCheckoutService);
app.sourceCheckoutService.readGitRemoteHeadCommit = async (locator, options) => {
  if (!locator.startsWith("https://e2e.invalid/")) return readRemote(locator, options);
  const id = locator.split("/").at(-1);
  if (id === "slow") {
    await mark("slow-precheck-blocked");
    while (!(await exists("release-precheck"))) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return (id === "slow" ? "1" : "0").repeat(40);
};
const prepare = app.sourceCheckoutService.prepareSourceCheckout.bind(app.sourceCheckoutService);
app.sourceCheckoutService.prepareSourceCheckout = (locator, input) => {
  const fixtureLocator = locator.startsWith("https://e2e.invalid/")
    ? path.join(root, "inputs", locator.split("/").at(-1)) : locator;
  return prepare(fixtureLocator, input);
};

const execute = app.protectedGroupOperationService.execute.bind(app.protectedGroupOperationService);
app.protectedGroupOperationService.execute = async (input, steps) => {
  const result = await execute(input, {
    ...steps,
    apply: async (...args) => {
      if (input.sourceId === "repair") {
        await mark("repair-before-apply");
        while (!(await exists("release-repair"))) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (input.sourceId === "slow") {
        await mark("slow-before-apply");
        while (!(await exists("release-slow"))) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return steps.apply(...args);
    },
  });
  await mark(`${input.sourceId}-transaction-${result.ok ? "committed" : "failed"}`);
  return result;
};

// The real runner generates every normal progress message. Only adversarial
// duplicates/stale messages are injected here to exercise transport filtering.
let replayed = false;
let fastTerminal;
const prefix = "SKILL_FLOW_UPDATE_PROGRESS ";
const exit = await runBridgeCommand(app, parseBridgeProcessArgs(process.argv.slice(2)), {
  stderr: (line) => {
    console.error(line);
    if (!line.startsWith(prefix)) return;
    const event = JSON.parse(line.slice(prefix.length));
    fs.appendFile(path.join(root, "progress.jsonl"), `${JSON.stringify(event)}\n`).catch(() => {});
    if (event.sourceId === "fast" && event.phase === "completed") fastTerminal = event;
    if (event.sourceId === "slow" && event.phase === "updating" && !replayed) {
      replayed = true;
      if (fastTerminal) {
        console.error(prefix + JSON.stringify(fastTerminal));
        console.error(prefix + JSON.stringify({ ...fastTerminal, phase: "updating" }));
      }
      fs.readFile(path.join(root, "old-slow-event.json"), "utf8")
        .then((old) => console.error(prefix + old)).catch(() => {});
      // Malformed/foreign frames must never clear a real card.
      console.error(prefix + "{broken");
      console.error(prefix + JSON.stringify({ ...event, protocolVersion: "999", phase: "completed" }));
    }
    if (event.sourceId === "slow" && event.phase === "completed") {
      fs.writeFile(path.join(root, "old-slow-event.json"), JSON.stringify(event)).catch(() => {});
    }
  },
});
process.exitCode = exit;

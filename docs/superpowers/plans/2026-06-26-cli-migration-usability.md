# CLI Migration Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cross-machine Skill Flow migration manageable from normal CLI commands without bridge JSON or direct state-file edits.

**Architecture:** Add small runtime APIs for list observability, source target toggling, backups, and batch import; keep `manifest.json` / `lock.json` as the existing authority. CLI commands call query runtime methods, and storage owns BOM-tolerant reads plus mutation lock metadata.

**Tech Stack:** TypeScript, Commander, Vitest, existing `SkillFlowApp`, `StateStore`, `DeploymentPlanner` / `DeploymentApplier`, Node fs/path APIs.

---

## Source Spec

- [CLI Migration Usability Design](../specs/2026-06-26-cli-migration-usability-design.md)
- [Summary feedback](../../feedback/FEEDBACK_skill-flow-user-feedback-2026-06-26-summary.md)
- [Detailed feedback](../../feedback/FEEDBACK_skill-flow-user-feedback-2026-06-26-detailed.md)

## File Structure

Modify:

- `apps/cli/src/cli.tsx`  
  Add `list` options, `enable`, `disable`, `only`, and `import-manifest` commands.
- `apps/cli/src/tests/skill-flow.test.ts`  
  Add CLI/runtime integration coverage for ON/OFF commands and projection repair behavior.
- `apps/cli/src/tests/cli-utils.test.ts`  
  Add formatting/parser coverage if command-specific helpers are extracted.
- `packages/query/src/runtime.ts`  
  Add runtime methods for enhanced list summaries, target selection updates, state backup, and batch import orchestration.
- `packages/query/src/tests/runtime-v2.test.ts`  
  Cover runtime-level list resolved counts and selection mutations.
- `packages/query/src/tests/source-lifecycle.test.ts`  
  Cover source enable/disable/only lifecycle cases if existing fixtures fit better here.
- `packages/storage/src/state-store.ts`  
  Add mutation lock metadata support and state-root backup helper if kept storage-local.
- `packages/storage/src/state-schema.ts`  
  Make authority JSON reads tolerate UTF-8 BOM.
- `packages/storage/src/tests/state-store.test.ts`  
  Cover BOM tolerance and mutation lock metadata.
- `packages/integration/src/utils/format.ts`  
  Add formatting helpers for `list --ids --warnings` and CLI summaries.
- `packages/integration/src/utils/fs.ts`  
  Make generic JSON reads tolerate BOM if state-schema is not the only JSON trust boundary.
- `README.md`, `README.zh.md`, `README.ja.md`  
  Document new user-facing commands after implementation.
- `releases/RELEASE_vNEXT.md`  
  Add release notes for the command surface when version target is known.
- `docs/FEATURE_INDEX.md`  
  Keep spec/plan status current.

Create:

- `apps/cli/src/import-manifest-command.ts`  
  Parse plain text and JSON import manifests, leaving Markdown support to a later step inside Stage 2.
- `apps/cli/src/tests/import-manifest-command.test.ts`  
  Unit tests for manifest parsing and CLI option normalization.

Do not create:

- A generic state editor.
- A YAML parser dependency.
- A second bridge-only implementation path.

## Task 1: Enhanced List Observability

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/integration/src/utils/format.ts`
- Modify: `apps/cli/src/cli.tsx`
- Test: `packages/query/src/tests/runtime-v2.test.ts`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Add runtime test for resolved selected leaf count**

Add this test to `packages/query/src/tests/runtime-v2.test.ts` near existing list or summary tests:

```ts
test("listWorkflows resolves all-selection leaf counts", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "browse/SKILL.md": skillDoc("browse", "Browser flow."),
    "review/SKILL.md": skillDoc("review", "Review flow."),
  });
  const app = new SkillFlowApp();
  const added = await app.addSource(repoPath, { project: false });
  expect(added.ok).toBe(true);
  if (!added.ok) return;

  const applied = await app.applyDraft(added.data.sourceId, {
    enabledTargets: ["codex"],
    selectedLeafIds: added.data.leafs.map((leaf) => leaf.id),
  });
  expect(applied.ok).toBe(true);

  const listed = await app.listWorkflows();
  expect(listed.ok).toBe(true);
  if (!listed.ok) return;

  const summary = listed.data.summaries.find((item) => item.source.id === added.data.sourceId);
  expect(summary?.binding.selectionMode).toBe("all");
  expect(summary?.binding.selectedLeafIds).toEqual([]);
  expect(summary?.binding.resolvedSelectedLeafCount).toBe(2);
});
```

- [ ] **Step 2: Run the runtime test and verify it fails**

Run:

```bash
npm run -w @skill-flow/query test -- runtime-v2.test.ts
```

Expected: FAIL because `resolvedSelectedLeafCount` is not present.

- [ ] **Step 3: Extend binding summary shape in runtime**

In `packages/query/src/runtime.ts`, update the summary construction in `listWorkflows()` so each binding summary includes `resolvedSelectedLeafCount`.

Use the existing `summary.leafs` / binding data rather than adding new state fields:

```ts
const selectedLeafIds = binding.selectionMode === "all"
  ? leafs.map((leaf) => leaf.id)
  : binding.selectedLeafIds;
const bindingSummary = {
  ...binding,
  selectedLeafIds: binding.selectionMode === "all" ? [] : selectedLeafIds,
  resolvedSelectedLeafCount: selectedLeafIds.length,
};
```

If `SourceBindingSummary` is imported from `@skill-flow/domain/types`, add the field there rather than using a local type cast.

- [ ] **Step 4: Add formatter coverage for IDs and warnings**

Add a focused formatter test to `apps/cli/src/tests/cli-utils.test.ts` or an existing formatter test file:

```ts
test("formatWorkflowList can show ids and warnings", () => {
  const output = formatWorkflowList([
    makeWorkflowSummary({
      displayName: "action-browser@vintlin",
      sourceId: "vintlin-action-browser",
      health: "PARTIAL",
      warningMessages: ["unmanaged external content in codex target"],
    }),
  ], { showIds: true, showWarnings: true });

  expect(output).toContain("action-browser@vintlin");
  expect(output).toContain("vintlin-action-browser");
  expect(output).toContain("warning: unmanaged external content in codex target");
});
```

If no helper factory exists, define a local minimal `WorkflowSummary` object in the test.

- [ ] **Step 5: Implement list formatter options**

Change `packages/integration/src/utils/format.ts`:

```ts
export type WorkflowListFormatOptions = {
  showIds?: boolean;
  showWarnings?: boolean;
};

export function formatWorkflowList(
  summaries: WorkflowSummary[],
  options: WorkflowListFormatOptions = {},
): string {
  // preserve existing default output when options are empty
}
```

For `showIds`, include `summary.source.id` after `formatGroupLabel(summary.source)`. For `showWarnings`, print leaf metadata warnings and lock invalid leaf summaries under the group.

- [ ] **Step 6: Wire CLI list options**

Change `apps/cli/src/cli.tsx`:

```ts
program
  .command("list")
  .option("--ids", "Show source ids next to display names")
  .option("--warnings", "Show warning details under affected groups")
  .option("--json", "Print JSON output")
  .action(async (options: { ids?: boolean; warnings?: boolean; json?: boolean }) => {
    const result = await app.listWorkflows();
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    if (options.json) {
      console.log(JSON.stringify(result.data.summaries, null, 2));
      return;
    }
    console.log(formatWorkflowList(result.data.summaries, {
      showIds: options.ids,
      showWarnings: options.warnings,
    }));
  });
```

- [ ] **Step 7: Verify Task 1**

Run:

```bash
npm run -w @skill-flow/query test -- runtime-v2.test.ts
npm run -w skill-flow test -- cli-utils.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add packages/query/src packages/domain/src packages/integration/src apps/cli/src
git commit -m "feat: show source ids and resolved selections"
```

## Task 2: Enable, Disable, And Only Runtime API

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/source-lifecycle.test.ts`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Add tests covering target changes without source deletion:

```ts
test("disableSources clears targets without deleting source metadata", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "browse/SKILL.md": skillDoc("browse", "Browser flow."),
  });
  const app = new SkillFlowApp();
  const added = await app.addSource(repoPath, { project: false });
  expect(added.ok).toBe(true);
  if (!added.ok) return;

  await app.applyDraft(added.data.sourceId, {
    enabledTargets: ["codex"],
    selectedLeafIds: added.data.leafs.map((leaf) => leaf.id),
  });

  const disabled = await app.disableSources([added.data.sourceId]);
  expect(disabled.ok).toBe(true);
  const state = await new StateStore(app.store.rootPath).readState();
  expect(state.manifest.sources.some((source) => source.id === added.data.sourceId)).toBe(true);
  expect(state.manifest.bindings[added.data.sourceId]?.enabledTargets).toEqual([]);
});

test("onlySources enables listed sources and disables others", async () => {
  const repoA = await createRepo(sandbox.sandboxRoot, {
    "a/SKILL.md": skillDoc("a", "A."),
  });
  const repoB = await createRepo(sandbox.sandboxRoot, {
    "b/SKILL.md": skillDoc("b", "B."),
  });
  const app = new SkillFlowApp();
  const a = await app.addSource(repoA, { project: false });
  const b = await app.addSource(repoB, { project: false });
  expect(a.ok).toBe(true);
  expect(b.ok).toBe(true);
  if (!a.ok || !b.ok) return;

  const result = await app.onlySources([a.data.sourceId], ["codex"]);
  expect(result.ok).toBe(true);
  const manifest = (await new StateStore(app.store.rootPath).readState()).manifest;
  expect(manifest.bindings[a.data.sourceId]?.enabledTargets).toEqual(["codex"]);
  expect(manifest.bindings[b.data.sourceId]?.enabledTargets).toEqual([]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
```

Expected: FAIL because `disableSources` / `onlySources` do not exist.

- [ ] **Step 3: Add runtime result types**

In `packages/query/src/runtime.ts`, add:

```ts
type SourceTargetUpdateResult = {
  enabledSourceIds: string[];
  disabledSourceIds: string[];
  actions: DeploymentAction[];
  backupPath?: string;
};
```

- [ ] **Step 4: Implement target mutation helpers**

Add methods to `SkillFlowApp`:

```ts
async enableSources(
  sourceIds: string[],
  targets?: DeploymentTargetId[],
): Promise<Result<SourceTargetUpdateResult>> {
  return this.updateSourceTargets({ mode: "enable", sourceIds, targets });
}

async disableSources(sourceIds: string[]): Promise<Result<SourceTargetUpdateResult>> {
  return this.updateSourceTargets({ mode: "disable", sourceIds, targets: [] });
}

async onlySources(
  sourceIds: string[],
  targets?: DeploymentTargetId[],
): Promise<Result<SourceTargetUpdateResult>> {
  return this.updateSourceTargets({ mode: "only", sourceIds, targets });
}
```

Add a private `updateSourceTargets(...)` that:

- reads state
- validates all source IDs exist
- validates all target IDs exist in merged target definitions
- creates a backup before mutation
- updates `manifest.bindings[sourceId].enabledTargets`
- calls existing apply/repair path for affected sources
- returns enabled/disabled counts and deployment actions

Use existing `applyDraft()` internally where possible instead of directly editing projections.

- [ ] **Step 5: Add ambiguous target failure**

Inside `onlySources`, if `targets` is missing and a listed source has no current `enabledTargets`, return:

```ts
return fail("TARGETS_REQUIRED", `Source ${sourceId} has no existing targets. Pass --targets codex,cline.`);
```

Keep this before backup or mutation.

- [ ] **Step 6: Verify Task 2**

Run:

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add packages/query/src packages/domain/src
git commit -m "feat: add source target toggle runtime"
```

## Task 3: Enable, Disable, And Only CLI Commands

**Files:**
- Modify: `apps/cli/src/cli.tsx`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Add CLI tests for ON/OFF commands**

Add integration-style tests that call `SkillFlowApp` directly if command runner helpers are unavailable:

```ts
test("only command semantics keep sources registered", async () => {
  const repoA = await createRepo(sandbox.sandboxRoot, {
    "a/SKILL.md": skillDoc("a", "A."),
  });
  const repoB = await createRepo(sandbox.sandboxRoot, {
    "b/SKILL.md": skillDoc("b", "B."),
  });
  const app = new SkillFlowApp();
  const a = await app.addSource(repoA, { project: false });
  const b = await app.addSource(repoB, { project: false });
  expect(a.ok).toBe(true);
  expect(b.ok).toBe(true);
  if (!a.ok || !b.ok) return;

  const only = await app.onlySources([a.data.sourceId], ["codex"]);
  expect(only.ok).toBe(true);

  const listed = await app.listWorkflows();
  expect(listed.ok).toBe(true);
  if (!listed.ok) return;
  expect(listed.data.summaries.map((item) => item.source.id).sort()).toEqual(
    [a.data.sourceId, b.data.sourceId].sort(),
  );
});
```

- [ ] **Step 2: Add target parser helper**

In `apps/cli/src/cli.tsx`, add:

```ts
function parseTargets(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
```

- [ ] **Step 3: Add commands**

In `apps/cli/src/cli.tsx`, add:

```ts
program
  .command("enable")
  .argument("<sourceIds...>", "Skills group ids to enable")
  .option("--targets <ids>", "Comma-separated target ids")
  .action(async (sourceIds: string[], options: { targets?: string }) => {
    const result = await app.enableSources(sourceIds, parseTargets(options.targets) as never);
    handleSourceTargetUpdate(result);
  });

program
  .command("disable")
  .argument("<sourceIds...>", "Skills group ids to disable")
  .action(async (sourceIds: string[]) => {
    const result = await app.disableSources(sourceIds);
    handleSourceTargetUpdate(result);
  });

program
  .command("only")
  .argument("<sourceIds...>", "Enable only these skills groups")
  .option("--targets <ids>", "Comma-separated target ids")
  .action(async (sourceIds: string[], options: { targets?: string }) => {
    const result = await app.onlySources(sourceIds, parseTargets(options.targets) as never);
    handleSourceTargetUpdate(result);
  });
```

Add:

```ts
function handleSourceTargetUpdate(
  result: Awaited<ReturnType<SkillFlowApp["onlySources"]>>,
) {
  if (!result.ok) {
    printErrors(result.errors);
    process.exitCode = 1;
    return;
  }
  if (result.data.backupPath) {
    console.log(`Backup: ${result.data.backupPath}`);
  }
  console.log(`Enabled: ${result.data.enabledSourceIds.length}`);
  console.log(`Disabled: ${result.data.disabledSourceIds.length}`);
  console.log(formatActionSummary(result.data.actions));
  printWarnings(result.warnings.map((warning) => warning.message));
}
```

- [ ] **Step 4: Verify Task 3**

Run:

```bash
npm run -w skill-flow test -- skill-flow.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/cli/src packages/query/src packages/domain/src
git commit -m "feat: add source enable disable only commands"
```

## Task 4: BOM-Tolerant Authority JSON Reads

**Files:**
- Modify: `packages/storage/src/state-schema.ts`
- Modify: `packages/integration/src/utils/fs.ts`
- Test: `packages/storage/src/tests/state-store.test.ts`

- [ ] **Step 1: Add failing BOM test**

In `packages/storage/src/tests/state-store.test.ts`, add:

```ts
test("readState accepts UTF-8 BOM in authority JSON files", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-bom-"));
  const store = new StateStore(stateRoot);
  await store.init();

  const manifestText = await fs.readFile(store.manifestPath, "utf8");
  await fs.writeFile(store.manifestPath, `\uFEFF${manifestText}`, "utf8");

  await expect(store.readState()).resolves.toMatchObject({
    manifest: { schemaVersion: 2 },
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm run -w @skill-flow/storage test -- state-store.test.ts
```

Expected: FAIL with JSON parse failure.

- [ ] **Step 3: Strip BOM before JSON.parse**

In `packages/storage/src/state-schema.ts`, update the private JSON read helper:

```ts
function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}
```

Use `JSON.parse(stripUtf8Bom(raw))`.

In `packages/integration/src/utils/fs.ts`, apply the same helper in exported `readJsonFile()` so cache and legacy readers share the tolerance.

- [ ] **Step 4: Add parse diagnostic test**

Add a test that writes malformed JSON with BOM and expects `StateStoreError.details` to include `{ bomDetected: true }`.

- [ ] **Step 5: Verify Task 4**

Run:

```bash
npm run -w @skill-flow/storage test -- state-store.test.ts
npm run -w @skill-flow/integration test --passWithNoTests
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add packages/storage/src packages/integration/src
git commit -m "fix: tolerate bom in state json"
```

## Task 5: Mutation Lock Metadata And Add Progress

**Files:**
- Modify: `packages/storage/src/state-store.ts`
- Modify: `packages/integration/src/utils/fs.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify: `apps/cli/src/cli.tsx`
- Test: `packages/storage/src/tests/state-store.test.ts`
- Test: `apps/cli/src/tests/add-selection-and-find-command.test.ts`

- [ ] **Step 1: Add lock metadata test**

In `packages/storage/src/tests/state-store.test.ts`, add:

```ts
test("withMutationLock writes owner metadata", async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-lock-"));
  const store = new StateStore(stateRoot);
  await store.init();

  await store.withMutationLock(async () => {
    const lockText = await fs.readFile(path.join(stateRoot, ".mutation.lock"), "utf8");
    const metadata = JSON.parse(lockText);
    expect(metadata.pid).toBe(process.pid);
    expect(metadata.startedAt).toEqual(expect.any(String));
    expect(metadata.command).toContain("skill-flow");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm run -w @skill-flow/storage test -- state-store.test.ts
```

Expected: FAIL because lock file does not contain owner JSON.

- [ ] **Step 3: Extend file lock API**

In `packages/integration/src/utils/fs.ts`, extend `withFileLock` to accept optional metadata:

```ts
export type FileLockMetadata = {
  command?: string;
  pid?: number;
  startedAt?: string;
};

export async function withFileLock<T>(
  lockPath: string,
  task: () => Promise<T>,
  metadata?: FileLockMetadata,
): Promise<T> {
  // existing acquisition logic
  await fs.writeFile(lockPath, JSON.stringify(metadata ?? {}, null, 2));
  // existing cleanup logic
}
```

Preserve current timeout behavior.

- [ ] **Step 4: Pass metadata from StateStore**

In `packages/storage/src/state-store.ts`, update:

```ts
return withFileLock(path.join(this.stateRoot, ".mutation.lock"), async () => {
  this.mutationLockDepth += 1;
  try {
    return await task();
  } finally {
    this.mutationLockDepth -= 1;
  }
}, {
  command: process.argv.join(" "),
  pid: process.pid,
  startedAt: new Date().toISOString(),
});
```

- [ ] **Step 5: Add coarse progress callback**

In `packages/query/src/runtime.ts`, add an optional progress callback to `addSource` options:

```ts
type RuntimeProgressReporter = (message: string) => void;
type SkillFlowAddOptions = AddSourceOptions & AddSourceDraftOptions & {
  project?: boolean;
  onProgress?: RuntimeProgressReporter;
};
```

Call it at coarse points: resolving source, scanning skills, resolving targets, writing manifest, repairing projections.

- [ ] **Step 6: Wire non-interactive add progress**

In `apps/cli/src/cli.tsx`, pass:

```ts
onProgress: (message) => console.log(message),
```

only for normal non-JSON CLI paths. Do not print progress in bridge handlers.

- [ ] **Step 7: Verify Task 5**

Run:

```bash
npm run -w @skill-flow/storage test -- state-store.test.ts
npm run -w skill-flow test -- add-selection-and-find-command.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add packages/integration/src packages/storage/src packages/query/src apps/cli/src
git commit -m "feat: expose mutation lock and add progress"
```

## Task 6: Import Manifest Parser

**Files:**
- Create: `apps/cli/src/import-manifest-command.ts`
- Create: `apps/cli/src/tests/import-manifest-command.test.ts`

- [ ] **Step 1: Write parser tests**

Create `apps/cli/src/tests/import-manifest-command.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseImportManifestText } from "../import-manifest-command.js";

describe("parseImportManifestText", () => {
  test("parses plain text source list", () => {
    expect(parseImportManifestText("obra/superpowers\n# comment\n\ngarrytan/gstack\n", "sources.txt"))
      .toEqual({
        sources: [
          { source: "obra/superpowers" },
          { source: "garrytan/gstack" },
        ],
      });
  });

  test("parses JSON source manifest", () => {
    expect(parseImportManifestText(
      JSON.stringify({
        sources: [
          { source: "obra/superpowers", skills: "all", targets: ["codex"] },
          { source: "garrytan/gstack", skills: "none", targets: [] },
        ],
      }),
      "sources.json",
    )).toEqual({
      sources: [
        { source: "obra/superpowers", skills: "all", targets: ["codex"] },
        { source: "garrytan/gstack", skills: "none", targets: [] },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm run -w skill-flow test -- import-manifest-command.test.ts
```

Expected: FAIL because parser file does not exist.

- [ ] **Step 3: Implement parser**

Create `apps/cli/src/import-manifest-command.ts`:

```ts
export type ImportManifestSourceEntry = {
  source: string;
  skills?: "all" | "none";
  targets?: string[];
};

export type ImportManifest = {
  sources: ImportManifestSourceEntry[];
};

export function parseImportManifestText(text: string, fileName: string): ImportManifest {
  const trimmed = stripUtf8Bom(text).trim();
  if (fileName.endsWith(".json") || trimmed.startsWith("{")) {
    return parseJsonManifest(trimmed);
  }
  return {
    sources: text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((source) => ({ source })),
  };
}

function parseJsonManifest(text: string): ImportManifest {
  const payload = JSON.parse(text) as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.sources)) {
    throw new Error("Import manifest JSON must contain a sources array.");
  }
  return {
    sources: payload.sources.map((entry, index) => normalizeEntry(entry, index)),
  };
}

function normalizeEntry(entry: unknown, index: number): ImportManifestSourceEntry {
  if (!isRecord(entry) || typeof entry.source !== "string" || entry.source.trim().length === 0) {
    throw new Error(`Import manifest source at index ${index} requires a non-empty source.`);
  }
  const result: ImportManifestSourceEntry = { source: entry.source.trim() };
  if (entry.skills !== undefined) {
    if (entry.skills !== "all" && entry.skills !== "none") {
      throw new Error(`Import manifest source ${result.source} has invalid skills value.`);
    }
    result.skills = entry.skills;
  }
  if (entry.targets !== undefined) {
    if (!Array.isArray(entry.targets) || !entry.targets.every((target) => typeof target === "string")) {
      throw new Error(`Import manifest source ${result.source} targets must be strings.`);
    }
    result.targets = entry.targets;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}
```

- [ ] **Step 4: Verify Task 6**

Run:

```bash
npm run -w skill-flow test -- import-manifest-command.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/cli/src/import-manifest-command.ts apps/cli/src/tests/import-manifest-command.test.ts
git commit -m "feat: parse import manifest files"
```

## Task 7: Import Manifest Runtime And CLI

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Modify: `apps/cli/src/cli.tsx`
- Modify: `apps/cli/src/import-manifest-command.ts`
- Test: `apps/cli/src/tests/import-manifest-command.test.ts`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Add runtime batch import test**

Add:

```ts
test("importManifest dry run does not mutate state", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "browse/SKILL.md": skillDoc("browse", "Browser flow."),
  });
  const app = new SkillFlowApp();

  const result = await app.importManifest({
    sources: [{ source: repoPath, skills: "none", targets: [] }],
    dryRun: true,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.data.imported).toBe(0);
  const listed = await app.listWorkflows();
  expect(listed.ok).toBe(true);
  if (!listed.ok) return;
  expect(listed.data.summaries).toEqual([]);
});
```

- [ ] **Step 2: Add runtime method**

In `packages/query/src/runtime.ts`, add:

```ts
type ImportManifestOptions = {
  sources: Array<{ source: string; skills?: "all" | "none"; targets?: DeploymentTargetId[] }>;
  dryRun?: boolean;
  apply?: boolean;
  skipExisting?: boolean;
  continueOnError?: boolean;
  skipLocalMissing?: boolean;
};

type ImportManifestResult = {
  imported: number;
  skippedExisting: number;
  skippedLocalMissing: number;
  enabled: number;
  inactive: number;
  failed: number;
  timedOut: number;
  backupPath?: string;
};
```

Implement `importManifest(options)` using:

- validation only for `dryRun`
- `addSource()` for imports
- `applyDraft()` / `enableSources()` / `disableSources()` for targets
- one backup before mutation

Do not add Markdown parsing here; CLI parser normalizes inputs.

- [ ] **Step 3: Wire CLI command**

In `apps/cli/src/cli.tsx`, add:

```ts
program
  .command("import-manifest")
  .argument("<file>", "Import manifest file")
  .option("--dry-run", "Validate and summarize without writing state")
  .option("--apply", "Apply the import manifest")
  .option("--continue-on-error", "Continue after per-source failures")
  .option("--skip-existing", "Skip sources already in state")
  .option("--skip-local-missing", "Skip missing local source paths")
  .option("--summary <path>", "Write JSON summary to a file")
  .action(async (file: string, options) => {
    const manifest = parseImportManifestText(await fs.readFile(file, "utf8"), file);
    const result = await app.importManifest({ ...manifest, ...options });
    handleImportManifestResult(result, options.summary);
  });
```

Add `import fs from "node:fs/promises";` and import `parseImportManifestText`.

- [ ] **Step 4: Verify Task 7**

Run:

```bash
npm run -w skill-flow test -- import-manifest-command.test.ts
npm run -w skill-flow test -- skill-flow.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add apps/cli/src packages/query/src
git commit -m "feat: add import manifest command"
```

## Task 8: Documentation And Release Notes

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `README.ja.md`
- Modify: `docs/FEATURE_INDEX.md`
- Create: `releases/RELEASE_vNEXT.md`

- [ ] **Step 1: Update command maps**

Add these rows to the command maps:

```markdown
| `list --ids --warnings` | Show source IDs and warning details for migration/debugging |
| `enable <sourceIds...>` | Enable registered groups for targets |
| `disable <sourceIds...>` | Turn registered groups OFF without uninstalling |
| `only <sourceIds...>` | Keep only selected groups ON |
| `import-manifest <file>` | Batch import source manifests |
```

- [ ] **Step 2: Add migration workflow example**

Add:

```bash
skill-flow import-manifest skill-group-install-manifest.json --dry-run
skill-flow import-manifest skill-group-install-manifest.json --apply --skip-existing
skill-flow only obra-superpowers dietrichgebert-ponytail joeseesun-qiaomu-goal-meta-skill vintlin-action-browser vintlin-computer-care-skills --targets codex,cline
skill-flow list --ids --warnings
```

- [ ] **Step 3: Add release note**

Create `releases/RELEASE_vNEXT.md`:

```markdown
# Release vNEXT

## CLI migration usability

- Added `list --ids --warnings` for source identity and warning visibility.
- Added `enable`, `disable`, and `only` for ON/OFF group management without state-file edits.
- Added BOM-tolerant state JSON reads.
- Added mutation lock owner metadata and coarse `add` progress.
- Added `import-manifest` for plain text and JSON source manifests.
```

- [ ] **Step 4: Verify docs**

Run:

```bash
node -e "const fs=require('fs'); for (const f of ['README.md','README.zh.md','README.ja.md','docs/FEATURE_INDEX.md']) fs.readFileSync(f,'utf8'); console.log('docs readable')"
```

Expected: `docs readable`.

- [ ] **Step 5: Commit Task 8**

```bash
git add README.md README.zh.md README.ja.md docs/FEATURE_INDEX.md releases/RELEASE_vNEXT.md
git commit -m "docs: document cli migration workflow"
```

## Final Verification

- [ ] **Step 1: Run package tests**

```bash
npm run -w @skill-flow/storage test
npm run -w @skill-flow/query test
npm run -w skill-flow test
```

Expected: all pass.

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: all workspace builds pass.

- [ ] **Step 3: Manual smoke test**

```bash
node apps/cli/dist/cli.js list --ids --warnings
node apps/cli/dist/cli.js import-manifest ./tmp/sources.json --dry-run
```

Expected: commands print structured output and do not require bridge JSON.

## Self-Review

Spec coverage:

- Stage 1 list observability: Task 1.
- Stage 1 enable/disable/only: Tasks 2 and 3.
- Stage 1 backup and summary: Task 2 and Task 3.
- Stage 1 BOM tolerance: Task 4.
- Stage 1 lock owner and progress: Task 5.
- Stage 2 import manifest parsing and command: Tasks 6 and 7.
- Documentation updates: Task 8.

No YAML dependency is introduced. Markdown table import is intentionally deferred until JSON/plain text import is stable, matching the spec.

# CLI Selection Target Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent CLI target commands and import manifests from producing "enabled but deploys nothing" states.

**Architecture:** Keep `manifest.json` as the only source of truth. Put semantic validation and selection completion in `SkillFlowApp`; keep CLI limited to parsing `--all-skills` and printing runtime errors.

**Tech Stack:** TypeScript, Commander, Vitest, existing `SkillFlowApp`, existing CLI test helpers.

---

## Source Spec

- `docs/superpowers/specs/2026-06-27-cli-selection-target-semantics-design.md`

## File Structure

Modify:

- `packages/query/src/runtime.ts`  
  Runtime authority for target command validation, `--all-skills` behavior, and import manifest semantic checks.
- `packages/query/src/tests/source-lifecycle.test.ts`  
  Focused runtime tests for `enableSources`, `onlySources`, and `disableSources`.
- `apps/cli/src/cli.tsx`  
  Parse `--all-skills` for `enable` and `only`; update help text.
- `apps/cli/src/tests/skill-flow.test.ts`  
  CLI command coverage for the new option and failure message.
- `README.md`, `README.zh.md`, `README.ja.md`, `releases/RELEASE_vNEXT.md`  
  Sync public command docs after behavior is implemented.

Do not create:

- A new selection command.
- A second state model.
- Parser-level cross-field business rules.
- New abstractions around target updates.

## CLI Help Contract

After implementation, these help lines should be true:

```text
enable [options] <sourceIds...>       Enable targets for registered groups
  --targets <ids>                     Comma-separated target ids to enable
  --all-skills                        If a group has no selected skills, select all current skills before enabling targets

only [options] <sourceIds...>         Enable only these groups and disable all others
  --targets <ids>                     Comma-separated target ids to enable
  --all-skills                        If a kept group has no selected skills, select all current skills before enabling targets

import-manifest [options] <file>      Batch import source manifests
  --dry-run                           Validate and summarize without writing state
  --apply                             Apply the import manifest
  --continue-on-error                 Continue after per-source failures
  --skip-existing                     Skip sources already in state
  --skip-local-missing                Skip missing local source paths
  --summary <path>                    Write JSON summary to a file
```

`import-manifest` JSON entries with non-empty `targets` must set `skills` to `"all"`.

## Task 1: Runtime Guardrails For Target Commands

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/source-lifecycle.test.ts`

- [ ] **Step 1: Add failing runtime tests**

Add tests near existing `enableSources` / `onlySources` tests:

```ts
test("enableSources rejects empty selections unless allSkills is requested", async () => {
  const app = new SkillFlowApp();
  const repo = await createSkillRepo("empty-select-source", ["alpha"]);
  const added = await app.addSource(repo, { project: false });
  expect(added.ok).toBe(true);
  if (!added.ok) return;

  const cleared = await app.applyDraft(added.data.sourceId, {
    selectedLeafIds: [],
    enabledTargets: [],
  });
  expect(cleared.ok).toBe(true);

  const rejected = await app.enableSources([added.data.sourceId], ["codex"]);
  expect(rejected.ok).toBe(false);
  if (rejected.ok) return;
  expect(rejected.errors[0]?.message).toContain("Pass --all-skills");

  const enabled = await app.enableSources([added.data.sourceId], ["codex"], { allSkills: true });
  expect(enabled.ok).toBe(true);

  const listed = await app.listWorkflows();
  expect(listed.ok).toBe(true);
  if (!listed.ok) return;
  const summary = listed.data.summaries.find((item) => item.source.id === added.data.sourceId);
  expect(summary?.binding.resolvedSelectedLeafCount).toBe(1);
});

test("onlySources with allSkills preserves existing selections", async () => {
  const app = new SkillFlowApp();
  const repo = await createSkillRepo("partial-select-source", ["alpha", "beta"]);
  const added = await app.addSource(repo, { project: false });
  expect(added.ok).toBe(true);
  if (!added.ok) return;

  const firstLeaf = added.data.leafs[0]!.id;
  const selected = await app.applyDraft(added.data.sourceId, {
    selectedLeafIds: [firstLeaf],
    enabledTargets: [],
  });
  expect(selected.ok).toBe(true);

  const result = await app.onlySources([added.data.sourceId], ["codex"], { allSkills: true });
  expect(result.ok).toBe(true);

  const listed = await app.listWorkflows();
  expect(listed.ok).toBe(true);
  if (!listed.ok) return;
  const summary = listed.data.summaries.find((item) => item.source.id === added.data.sourceId);
  expect(summary?.binding.selectedLeafIds).toEqual([firstLeaf]);
});
```

Use the local repo helper style already present in `source-lifecycle.test.ts`; do not add a new helper if one exists.

- [ ] **Step 2: Run the failing tests**

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
```

Expected: tests fail because `enableSources` / `onlySources` do not accept the third options argument and do not reject empty selections.

- [ ] **Step 3: Add the minimal runtime option**

In `packages/query/src/runtime.ts`, add one local type near the target update methods:

```ts
type SourceTargetUpdateOptions = {
  allSkills?: boolean;
};
```

Change signatures only:

```ts
async enableSources(
  sourceIds: string[],
  targets?: DeploymentTargetId[],
  options: SourceTargetUpdateOptions = {},
): Promise<Result<SourceTargetUpdateResult>> {
  return this.runSerializedMutation(() => this.updateSourceTargets("enable", sourceIds, targets, options));
}

async onlySources(
  sourceIds: string[],
  targets?: DeploymentTargetId[],
  options: SourceTargetUpdateOptions = {},
): Promise<Result<SourceTargetUpdateResult>> {
  return this.runSerializedMutation(() => this.updateSourceTargets("only", sourceIds, targets, options));
}
```

Keep `disableSources` unchanged.

- [ ] **Step 4: Guard empty selections in `updateSourceTargets`**

Change `updateSourceTargets` to receive `options: SourceTargetUpdateOptions = {}`.

Inside the enabled-source loop, before `prepareAuthorityManifestForDraft`, derive selected leaves:

```ts
const selectedLeafIds = currentDraft.data.selectedLeafIds.length > 0
  ? currentDraft.data.selectedLeafIds
  : options.allSkills
    ? [...(lockFile.sources[sourceId]?.leafIds ?? [])]
    : [];

if (selectedLeafIds.length === 0) {
  return fail({
    code: "SOURCE_SELECTION_REQUIRED",
    message: `Source ${sourceId} has no selected skills. Pass --all-skills to select all current skills before enabling targets.`,
  });
}
```

Pass `selectedLeafIds` into `prepareAuthorityManifestForDraft`. This preserves existing selections and only fills empty selections when explicitly requested.

- [ ] **Step 5: Verify runtime**

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
npm run -w @skill-flow/query build
```

Expected: PASS.

## Task 2: CLI Option And Help Text

**Files:**
- Modify: `apps/cli/src/cli.tsx`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Add CLI coverage that runs the built CLI with a temp state root:

```ts
test("enable --all-skills fills an empty selection before enabling targets", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/review/SKILL.md": skillDoc("review", "Review code."),
  });
  const app = new SkillFlowApp();
  const added = await app.addSource(repoPath, {
    sourceIdOverride: "demo-source",
    draft: {
      enabledTargets: [],
      selectedLeafIds: [],
    },
  });
  expect(added.ok).toBe(true);
  if (!added.ok) return;

  const output = runCli(["enable", "demo-source", "--targets", "codex", "--all-skills"]);
  expect(output).toContain("Enabled: 1");

  const listOutput = runCli(["list", "--json"]);
  const summaries = JSON.parse(listOutput) as Array<{
    source: { id: string };
    binding: { resolvedSelectedLeafCount: number };
  }>;
  expect(
    summaries.find((summary) => summary.source.id === "demo-source")?.binding.resolvedSelectedLeafCount,
  ).toBe(1);
});

test("enable without --all-skills reports empty selection error", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/review/SKILL.md": skillDoc("review", "Review code."),
  });
  const app = new SkillFlowApp();
  const added = await app.addSource(repoPath, {
    sourceIdOverride: "demo-source",
    draft: {
      enabledTargets: [],
      selectedLeafIds: [],
    },
  });
  expect(added.ok).toBe(true);
  if (!added.ok) return;

  const failure = runCliFailure(["enable", "demo-source", "--targets", "codex"]);
  expect(failure.status).toBe(1);
  expect(failure.stderr).toContain("Pass --all-skills");
});
```

Keep the implementation in the style already used by `skill-flow.test.ts`; avoid introducing a new process runner.

- [ ] **Step 2: Wire `--all-skills`**

In `apps/cli/src/cli.tsx`:

```ts
program
  .command("enable")
  .argument("<sourceIds...>", "Skills group ids to enable")
  .option("--targets <ids>", "Comma-separated target ids to enable")
  .option("--all-skills", "If a group has no selected skills, select all current skills before enabling targets")
  .action(async (sourceIds: string[], options: { targets?: string; allSkills?: boolean }) => {
    const result = await app.enableSources(sourceIds, parseTargets(options.targets) as never, {
      allSkills: Boolean(options.allSkills),
    });
    handleSourceTargetUpdate(result);
  });
```

Apply the same option and action change to `only`.

- [ ] **Step 3: Verify CLI**

```bash
npm run -w skill-flow test -- skill-flow.test.ts
npm run -w skill-flow build
node apps/cli/dist/cli.js enable --help
node apps/cli/dist/cli.js only --help
```

Expected: tests and build pass; help output includes `--all-skills`.

## Task 3: Import Manifest Semantic Validation

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Add failing import tests**

Add tests near existing `importManifest` coverage:

```ts
test("importManifest rejects targets unless skills is all", async () => {
  const app = new SkillFlowApp();
  const repo = await createSkillRepo("bad-manifest-source", ["alpha"]);

  const omitted = await app.importManifest({
    sources: [{ source: repo, targets: ["codex"] }],
    apply: true,
  });
  expect(omitted.ok).toBe(false);
  if (!omitted.ok) {
    expect(omitted.errors[0]?.message).toContain('skills to "all"');
  }

  const none = await app.importManifest({
    sources: [{ source: repo, skills: "none", targets: ["codex"] }],
    apply: true,
  });
  expect(none.ok).toBe(false);

  const listed = await app.listWorkflows();
  expect(listed.ok).toBe(true);
  if (!listed.ok) return;
  expect(listed.data.summaries.some((item) => item.source.locator === repo)).toBe(false);
});
```

- [ ] **Step 2: Implement one runtime validation block**

In `importManifest`, after target dedupe and unknown-target validation, add:

```ts
if (targets.length > 0 && entry.skills !== "all") {
  result.failed += 1;
  const error = {
    code: "IMPORT_MANIFEST_SKILLS_REQUIRED",
    message: `Import manifest source ${entry.source} with targets must set skills to "all".`,
  };
  if (options.continueOnError) {
    continue;
  }
  return fail(error);
}
```

Do not move this into `parseImportManifestText`; parsing stays shape-only.

- [ ] **Step 3: Verify import behavior**

```bash
npm run -w skill-flow test -- skill-flow.test.ts -t "importManifest"
npm run -w skill-flow build
```

Expected: PASS.

## Task 4: Docs And Real E2E

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `README.ja.md`
- Modify: `releases/RELEASE_vNEXT.md`

- [ ] **Step 1: Update public docs**

Update only command examples and command tables:

```text
skill-flow enable <sourceId> --targets codex --all-skills
skill-flow only <sourceId> --targets codex --all-skills
```

Mention that import manifest entries with targets require `skills: "all"`.

- [ ] **Step 2: Run focused verification**

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
npm run -w skill-flow test -- skill-flow.test.ts
npm run -w @skill-flow/query build
npm run -w skill-flow build
```

Expected: PASS.

- [ ] **Step 3: Run one real CLI smoke**

Use a temp state root and a temp local source:

```bash
STATE_ROOT="$(mktemp -d)"
REPO_ROOT="$(mktemp -d)"
mkdir -p "$REPO_ROOT/skills/demo"
printf '%s\n' '---' 'name: demo' 'description: Demo skill.' '---' '# Demo' > "$REPO_ROOT/skills/demo/SKILL.md"
SKILL_FLOW_STATE_ROOT="$STATE_ROOT" node apps/cli/dist/cli.js add "$REPO_ROOT" --yes
SKILL_FLOW_STATE_ROOT="$STATE_ROOT" node apps/cli/dist/cli.js list --ids --warnings
SKILL_FLOW_STATE_ROOT="$STATE_ROOT" node apps/cli/dist/cli.js disable "$(basename "$REPO_ROOT")"
SKILL_FLOW_STATE_ROOT="$STATE_ROOT" node apps/cli/dist/cli.js enable "$(basename "$REPO_ROOT")" --targets codex --all-skills
SKILL_FLOW_STATE_ROOT="$STATE_ROOT" node apps/cli/dist/cli.js list --json
```

Expected: commands exit 0 and `list --json` shows a positive `resolvedSelectedLeafCount` for the enabled source.

## Review Checklist

- [ ] Empty selected skills cannot be enabled by target commands unless `--all-skills` is explicit.
- [ ] `--all-skills` fills only empty selections and preserves existing selections.
- [ ] `disable` still only clears targets.
- [ ] `import-manifest` rejects `targets` unless `skills` is `"all"`.
- [ ] CLI help matches the contract above.
- [ ] No new command, parser abstraction, or duplicate state model was added.

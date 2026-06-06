# State Schema V2 Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the state schema V2 branch by auditing the current diff, preserving the completed plan history, splitting the verified work into coherent commits, and producing a clean handoff.

**Architecture:** Implementation work is already complete and verified in `codex/import-preparation-cache`. This plan is the single active execution entrypoint; prior design and closure plans are archived under `plans/archive/2026-06-04-state-schema-v2-completed/` for reference. No new product behavior should be added unless final review finds a regression.

**Tech Stack:** TypeScript monorepo, Vitest, Swift XCTest, Markdown plan docs, Git.

---

## Current State

Worktree:

```text
/Users/Vint/.config/superpowers/worktrees/01_skill-flow/import-preparation-cache
```

Branch:

```text
codex/import-preparation-cache
```

Verified commands from the latest pass on 2026-06-06:

```bash
npm run build
npm test
cd apps/desktop-mac
swift test
```

Observed result:

- `npm run build` exited 0.
- `npm test` exited 0.
- `swift test` exited 0 with 466 tests, 1 skipped helper-timeout test, 0 failures.

Static boundary checks from the latest pass:

```bash
rg -n "@skill-flow/storage/store|new StateStore\b|\bStateStore\b" packages apps --glob '!**/dist/**'
rg -n "readManifest\(|writeManifest\(|readLock\(|writeLock\(|readVirtualGroups\(|writeVirtualGroups\(" packages/query/src packages/core-engine/src apps/cli/src --glob '!**/tests/**' --glob '!**/dist/**'
rg -n "app\.store\.(readManifest|writeManifest|readLock|readState|readVirtualGroups|writeVirtualGroups|init)\b" packages apps --glob '!**/dist/**'
```

Observed result: all three commands returned no matches. `virtual-groups.json` matches are limited to legacy helper, migration service, and tests.

## Execution Status

Completed on 2026-06-06:

- Task 1 diff audit.
- Task 2 static boundary verification.
- Task 3 full verification.
- Task 4 commit grouping plan.
- Task 5 final handoff contents.

Not executed:

- Staging, committing, pushing, or PR creation. Repository rules require explicit user instruction before commit/push/PR.

## Completed Reference Documents

Archived documents:

- `plans/archive/2026-06-04-state-schema-v2-completed/01-overview-and-data-model.md`
- `plans/archive/2026-06-04-state-schema-v2-completed/02-state-contract-and-migration.md`
- `plans/archive/2026-06-04-state-schema-v2-completed/03-import-desktop-verification.md`
- `plans/archive/2026-06-04-state-schema-v2-completed/04-architect-review-and-closure-checklist.md`
- `plans/archive/2026-06-04-state-schema-v2-completed/05-v1-authority-public-export-cleanup.md`

Use those only as reference material. Continue execution from this file.

## Success Criteria

The branch is ready for user review when all of these are true:

1. The only active file in `plans/2026-06-04-state-schema-v2/` is this execution plan.
2. Completed plan documents 01-05 are under `plans/archive/2026-06-04-state-schema-v2-completed/`.
3. A final diff audit finds no accidental unrelated edits.
4. V1 authority public surface static checks still return no matches.
5. `npm run build`, `npm test`, and `cd apps/desktop-mac && swift test` pass after any final edits.
6. Commits, if requested, are split by logical boundary and do not mix unrelated changes.

## Task 1: Final Diff Audit

**Files:**

- Review: all modified and untracked files from `git status --short`
- Review: `git diff --stat`
- Review: `git diff --name-status`

- [x] **Step 1: List current status**

Run:

```bash
git status --short --branch
```

Expected: branch is `codex/import-preparation-cache`; modified files match the V2 migration/import/desktop/documentation scope.

- [x] **Step 2: Review file-level scope**

Run:

```bash
git diff --name-status
```

Expected: changes are limited to:

- `README.md`, `README.zh.md`, `releases/RELEASE_v1.3.11.md`
- `apps/cli/src/**`
- `apps/desktop-mac/**`
- `packages/core-engine/src/**`
- `packages/domain/src/**`
- `packages/integration/src/**`
- `packages/query/src/**`
- `packages/storage/src/**`
- `plans/2026-06-04-state-schema-v2/**`
- `plans/archive/2026-06-04-state-schema-v2-completed/**`

- [x] **Step 3: Review large diff areas**

Run:

```bash
git diff --stat
```

Expected: large changes are explainable by the V2 migration service, runtime import/repair flows, desktop bridge payloads, tests, and archived plan docs.

- [x] **Step 4: Inspect deletion and replacement boundaries**

Run:

```bash
git diff -- packages/core-engine/src/services/workspace-bootstrap-service.ts packages/core-engine/src/services/legacy-agents-lock.ts packages/core-engine/src/services/agents-origin-reader.ts
```

Expected:

- `agents-origin-reader.ts` deletion is replaced by `legacy-agents-lock.ts`.
- `WorkspaceBootstrapService` no longer reads `.skill-lock.json` by default.
- Legacy lock reading is explicit and isolated.

## Task 2: Static Boundary Verification

**Files:**

- Verify: `packages/storage/src/index.ts`
- Verify: `packages/query/src/**`
- Verify: `packages/core-engine/src/**`
- Verify: `apps/cli/src/**`

- [x] **Step 1: Verify old storage public import is gone**

Run:

```bash
rg -n "@skill-flow/storage/store|new StateStore\b|\bStateStore\b" packages apps --glob '!**/dist/**'
```

Expected: no output.

- [x] **Step 2: Verify production V1 authority calls are gone**

Run:

```bash
rg -n "readManifest\(|writeManifest\(|readLock\(|writeLock\(|readVirtualGroups\(|writeVirtualGroups\(" packages/query/src packages/core-engine/src apps/cli/src --glob '!**/tests/**' --glob '!**/dist/**'
```

Expected: no output.

- [x] **Step 3: Verify app.store authority calls are gone**

Run:

```bash
rg -n "app\.store\.(readManifest|writeManifest|readLock|writeLock|readState|writeState|readPreferences|writePreferences|readVirtualGroups|writeVirtualGroups|togglePinnedSource|pruneMissingSourceIds|init)\b" packages apps --glob '!**/dist/**'
```

Expected: no output.

- [x] **Step 4: Verify virtual groups remain migration-only**

Run:

```bash
rg -n "virtual-groups\.json|readLegacyVirtualGroups|LegacyVirtualGroup|legacyVirtualGroup" packages apps --glob '!**/dist/**'
```

Expected: matches are limited to:

- `packages/core-engine/src/services/legacy-virtual-group.ts`
- `packages/core-engine/src/services/state-migration-service.ts`
- tests that seed or assert legacy migration behavior

## Task 3: Full Verification

**Files:**

- Verify: entire repository
- Verify: `apps/desktop-mac`

- [x] **Step 1: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: command exits 0.

- [x] **Step 2: Run root test suite**

Run:

```bash
npm test
```

Expected: command exits 0.

- [x] **Step 3: Run desktop Swift test suite**

Run:

```bash
cd apps/desktop-mac
swift test
```

Expected: command exits 0. A skipped `testTimedOutHelperIsForceKilledWhenItIgnoresTerminate` is acceptable if there are 0 failures.

## Task 4: Commit Preparation

**Files:**

- Stage by logical boundary only
- Do not stage unrelated files

- [x] **Step 1: Prepare commit groups**

Use these groups unless review finds a better split:

```text
1. storage/domain migration contract and V1 public surface cleanup
2. core-engine V2 migration, collection materialization, target repair
3. query runtime import selector/preparation/repair/diagnostics
4. CLI bridge parser and CLI tests
5. desktop bridge/UI diagnostics and Swift tests
6. README/release notes/plan archive
```

- [ ] **Step 2: Stage the first group only**

Run an explicit `git add` with file paths for the first commit group. Do not use `git add .`.

Expected: `git diff --cached --name-status` contains only files from that group.

- [ ] **Step 3: Commit the group**

Use the matching commit message for the staged group:

```text
1. refactor: remove v1 storage authority surface
2. feat: migrate state schema v2 core services
3. feat: support v2 import selectors and repair diagnostics
4. feat: accept v2 import drafts in cli bridge
5. feat: support v2 import drafts in desktop bridge
6. docs: document state schema v2 finalization
```

Expected: commit succeeds.

- [ ] **Step 4: Repeat for remaining groups**

After each group:

```bash
git diff --cached --name-status
git status --short
```

Expected: staged files match the intended group; unstaged files remain for later groups.

## Task 5: Final Handoff

**Files:**

- Review: `git log --oneline -6`
- Review: `git status --short --branch`

- [x] **Step 1: Confirm clean or expected status**

Run:

```bash
git status --short --branch
```

Expected: either clean after commits, or only intentionally uncommitted files if the user requested no commit.

- [x] **Step 2: Summarize verification**

Record these exact command results in the final handoff:

```text
npm run build: pass
npm test: pass
cd apps/desktop-mac && swift test: pass, 466 tests, 1 skipped, 0 failures
```

- [x] **Step 3: Summarize remaining risk**

Use this risk statement unless new issues are found:

```text
Remaining risk: broad branch diff requires human review before merge; no known failing automated verification remains.
```

- [x] **Step 4: Ask before push or PR**

Do not push or create a PR unless explicitly requested.

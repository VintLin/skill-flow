# V2 Compatibility Debt Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove runtime compatibility layers and redundant legacy field meanings so normal Skill Flow execution reads, writes, and exposes one current authority schema.

**Architecture:** Legacy V1 understanding is restricted to migration boundary modules. Current domain/storage/query/bridge/desktop paths expose current contracts directly; migration converts old state once and runtime never maps current state back into V1-shaped concepts such as `virtual` source kinds. The 2026-06-06 architecture review expands this plan from fallback deletion into P0 authority-shape alignment before the larger V2 suffix removal pass.

**Tech Stack:** TypeScript monorepo, Vitest, Swift XCTest, bridge JSON protocol, Markdown execution plans, subagent audits.

---

## Current Worktree

```text
/Users/Vint/.config/superpowers/worktrees/01_skill-flow/import-preparation-cache
```

Branch:

```text
codex/import-preparation-cache
```

Do not commit, push, or open a PR unless explicitly requested.

## Completed Plan Archive

Already completed reference plans are archived under:

```text
plans/archive/2026-06-04-state-schema-v2-completed/
plans/archive/2026-06-04-state-schema-v2-finalization-completed/
```

The active execution entrypoint for this cleanup is:

```text
plans/2026-06-06-v2-compat-debt-cleanup/00-current-execution-plan.md
```

## Boundary Rule

Allowed legacy boundary:

```text
packages/core-engine/src/services/state-migration-service.ts
packages/core-engine/src/services/legacy-*.ts
packages/core-engine/src/tests/*migration*
packages/query/src/tests/*migration*
packages/storage/src/tests/*migration*
```

Normal runtime code must not:

- Read V1 authority files as fallback.
- Map V2 `collection` sources back to V1 `virtual`.
- Emit V1-shaped bridge/view payloads for V2 state.
- Use legacy field names to carry current V2 semantics.

## Debt Categories

Each audit finding must be classified as one of:

- `allowed-legacy`: migration input or migration fixture only.
- `must-remove`: runtime compatibility code or fallback that should be deleted.
- `contract-change`: public type, bridge payload, CLI output, or desktop model must move to V2 semantics.
- `test-contract`: test fixture or expectation still protects old behavior.
- `rename-only`: internal method/type name contains old terminology but no data or public contract still uses old semantics.

## Success Criteria

The cleanup is complete when:

1. Domain source kind has one current public type, includes `github` and `collection`, and no normal-path consumer imports a smaller V1-shaped `SourceKind`.
2. Runtime V2 view and bridge-facing payloads do not expose `kind: "virtual"` or `sourceKind: "virtual"`.
3. Desktop source type filtering uses `collection`, while UI copy displays localized "组合" / "Combined" / "組み合わせ".
4. V1 and legacy fields are only read inside the allowed legacy boundary.
5. Runtime fallback from missing current authority state to V1 state is removed; migration or explicit migration status handles old state.
6. Projection ledger and runtime projection repair read current authority projections directly and do not depend on V1 `ProjectionRecord.mode` outside migration.
7. `state-v2-view.ts` and public `V2` suffixes have a tracked removal path. Full deletion is a later large contract step unless Task 5A proves it is small enough to complete safely in this branch.
8. Static checks and test suites pass.

## Decision Update: 2026-06-06 Architecture Review

The review file:

```text
plans/2026-06-06-v2-compat-debt-cleanup/01-data-structure-optimization-recommendations.md
```

adds a stricter end state: the current schema should be the only domain authority shape, normal runtime should not depend on V1 shadow types, `state-v2-view.ts` should disappear, and public `V2` suffixes should be removed after migration is complete.

The selected route is **B: upgrade the active plan and execute P0 structure fixes first**.

This means:

- Do now: fix real semantic bugs and authority-type splits that can produce wrong behavior.
- Do now: update this plan so every remaining V1/V2 dual-track item has an owner and phase.
- Do not do in the first slice: wholesale file/class/type renames from `*V2` to current names.
- Do not do in the first slice: delete `state-v2-view.ts` until runtime public DTO consumers are migrated or a focused spike proves deletion is low risk.

Important interpretation:

- `source/collection/<collectionId>` currently stores materialized collection members. It is not a source checkout for fetching remote data, but it is a real on-disk materialization root and must not be removed merely because the source kind is `collection`.
- `collection` should be excluded from checkout/fetch services, but storage path helpers may still expose a collection materialization path when the caller is explicitly materializing or inspecting a collection.

## Task 1: Archive Completed Plans And Preserve Active Plan

**Files:**

- Move: `plans/2026-06-04-state-schema-v2/00-current-execution-plan.md`
- Create: `plans/archive/2026-06-04-state-schema-v2-finalization-completed/00-current-execution-plan.md`
- Create: `plans/2026-06-06-v2-compat-debt-cleanup/00-current-execution-plan.md`

- [x] **Step 1: Move completed finalization plan**

Run:

```bash
mkdir -p plans/archive/2026-06-04-state-schema-v2-finalization-completed
mv plans/2026-06-04-state-schema-v2/00-current-execution-plan.md \
  plans/archive/2026-06-04-state-schema-v2-finalization-completed/00-current-execution-plan.md
```

Expected: finalization plan is archived. Do not move `docs/superpowers/plans/2026-06-04-import-preparation-cache.md` unless a later audit proves it is completed.

- [x] **Step 2: Write this active cleanup plan**

Run:

```bash
test -f plans/2026-06-06-v2-compat-debt-cleanup/00-current-execution-plan.md
```

Expected: command exits 0.

## Task 2: Parallel Audit

**Files:**

- Review: `packages/domain/src/**`
- Review: `packages/storage/src/**`
- Review: `packages/core-engine/src/**`
- Review: `packages/query/src/**`
- Review: `packages/shared-types/src/**`
- Review: `apps/cli/src/**`
- Review: `apps/desktop-mac/Sources/DesktopApp/**`
- Review: `apps/desktop-mac/Tests/**`
- Review: `packages/**/src/tests/**`

- [x] **Step 1: Dispatch Schema/Storage audit**

Ask an explorer agent to inspect `packages/domain` and `packages/storage`.

Required output:

```text
allowed-legacy:
must-remove:
contract-change:
test-contract:
rename-only:
recommended first edits:
```

- [x] **Step 2: Dispatch Migration Boundary audit**

Ask an explorer agent to inspect `packages/core-engine`.

Required output:

```text
allowed-legacy:
must-remove:
contract-change:
test-contract:
rename-only:
recommended first edits:
```

- [x] **Step 3: Dispatch Query Runtime audit**

Ask an explorer agent to inspect `packages/query`.

Required output:

```text
allowed-legacy:
must-remove:
contract-change:
test-contract:
rename-only:
recommended first edits:
```

- [x] **Step 4: Dispatch Bridge/Desktop/CLI audit**

Ask an explorer agent to inspect `packages/shared-types`, `apps/cli`, and `apps/desktop-mac`.

Required output:

```text
allowed-legacy:
must-remove:
contract-change:
test-contract:
rename-only:
recommended first edits:
```

- [x] **Step 5: Dispatch Test Contract audit**

Ask an explorer agent to classify tests that still encode V1 compatibility as normal behavior.

Required output:

```text
allowed-legacy:
must-remove:
contract-change:
test-contract:
rename-only:
recommended first edits:
```

- [x] **Step 6: Consolidate audit results**

Write the consolidated audit in this plan under `Audit Results`. Every finding must be assigned to one of the debt categories above.

## Task 3: Contract Cleanup

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/query/src/state-v2-view.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/tests/state-v2-view.test.ts`
- Modify: `packages/query/src/tests/runtime-v2.test.ts`
- Modify: other tests identified by Task 2

- [x] **Step 1: Add failing tests for V2 view source kind**

Update `packages/query/src/tests/state-v2-view.test.ts` so `projectSourceKindV2ToView("collection")` expects `collection`.

Expected assertion shape:

```ts
expect(projectSourceKindV2ToView("collection")).toBe("collection");
expect(manifest.sources.map((source) => ({ id: source.id, kind: source.kind }))).toEqual([
  { id: "repo", kind: "git" },
  { id: "stack", kind: "collection" },
]);
```

- [x] **Step 2: Change view mapping**

Update `packages/query/src/state-v2-view.ts`:

```ts
export function projectSourceKindV2ToView(kind: SourceKindV2): SourceKind {
  switch (kind) {
    case "github":
      return "git";
    case "collection":
      return "collection";
    case "clawhub":
      return "clawhub";
    case "git":
    case "local":
      return kind;
  }
}
```

If `SourceKind` does not include `collection`, update the domain type and all switch exhaustiveness tests in the same task.

- [x] **Step 3: Remove runtime `collection -> virtual` fallbacks**

Update `packages/query/src/runtime.ts` creation and merge return fallbacks from:

```ts
kind: "virtual" as const
```

to:

```ts
kind: "collection" as const
```

Rename helper logic only when it affects data contract. Internal method names like `collectionToVirtualGroupView` may be left for a later `rename-only` pass if tests prove payloads are already V2-correct.

- [x] **Step 4: Run focused query tests**

Run:

```bash
npm run -w @skill-flow/query test -- state-v2-view.test.ts runtime-v2.test.ts virtual-groups.test.ts workflow-service.test.ts
```

Expected: tests pass after updating V2 expectations to `collection`.

## Task 4: Desktop And Bridge Cleanup

**Files:**

- Modify: `packages/shared-types/src/protocol.ts`
- Modify: `packages/shared-types/src/tests/protocol.test.ts`
- Modify: `apps/cli/src/bridge-command.ts`
- Modify: `apps/cli/src/tests/bridge-command.test.ts`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/*.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/*.swift`

- [x] **Step 1: Update desktop source type predicate**

Change desktop logic that checks:

```swift
sourceKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "virtual"
```

to:

```swift
sourceKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "collection"
```

Update associated tests to construct `sourceKind: "collection"`.

- [x] **Step 2: Update source type filter id only if it is persisted**

Inspect whether `selectedHomeSourceTypeFilterId` is persisted. If it is not persisted, change filter id from `virtual` to `collection`. If it is persisted, route it through migration, not runtime aliasing.

- [x] **Step 3: Remove bridge fallback payloads that retry legacy for V2-capable paths**

Delete fallback behavior where a V2 request is converted to a legacy payload during normal operation. Keep explicit unsupported-command handling only if it is tied to migration or version detection.

- [x] **Step 4: Run focused protocol and desktop tests**

Run:

```bash
npm run -w @skill-flow/shared-types test -- protocol.test.ts
npm run -w skill-flow test -- bridge-command.test.ts
cd apps/desktop-mac && swift test --filter MainViewModelVirtualGroupTests
```

Expected: tests pass with V2 `collection` semantics.

Verified on 2026-06-06:

```bash
npm run -w @skill-flow/shared-types test -- protocol.test.ts
npm run -w skill-flow test -- bridge-command.test.ts
npm run -w @skill-flow/query test -- import-page-flow.test.ts runtime-source-v2.test.ts
cd apps/desktop-mac && swift test --filter 'BridgeClientExecutionTests|ImportScreenContainerTests|WorkflowCoverageTests'
```

Result: all passed. Swift run executed 109 tests, 1 skipped, 0 failures.

## Task 5: Remove Runtime Legacy Fallbacks

**Files:**

- Modify according to audit results from Task 2.

- [ ] **Step 1: Remove fallback reads outside migration boundary**

For each `must-remove` audit finding, delete the fallback or replace it with an explicit migration-status error.

Expected behavior:

```text
old state present -> migration command/status handles it
runtime read path -> V2 state only
```

Progress on 2026-06-06:

- Removed `@skill-flow/domain/projection-compat` public helper, package export, and test.
- Replaced production projection fallback usage with `packages/core-engine/src/services/projection-ledger.ts`, which reads explicit projection records only.
- Removed `packages/storage/src/preferences-store.ts` public V1 shared preferences normalizer; query now normalizes save-settings view input internally.
- Removed `packages/storage/src/import-data-cache.ts` fallback that promoted legacy `sources` cache entries into V2 `repos`.
- Changed `ImportPreparationRecord.sourceKind` and `packages/storage/src/import-preparation-cache.ts` to V2 `SourceKindV2`, accepting `github` and `collection`.
- Removed normal `SourceKind` support for `virtual`; V2/current view contracts now use `collection`.
- Renamed bridge normal-path helpers from `VirtualSkillRef` / `parseVirtualSkillRefs` to collection terminology.
- Renamed query collection binding helper from `getVirtualSourceAllowedLeafIds` to `getCollectionSourceAllowedLeafIds`.
- Renamed workflow health parameter from `isVirtualSource` to `isCollectionSource`.
- Renamed desktop collection editor internals and tests from `VirtualGroup*` / `isVirtual` to `Collection*` / `isCollection`.
- Renamed desktop localization keys `source.author.virtual` and `group_editor.impact.create_virtual_group` to collection keys.
- Renamed query collection test file from `virtual-groups.test.ts` to `collections.test.ts`.
- Removed `selectedSkillIds` from normal `ImportDraft` and ready `ImportPreviewResult` contracts.
- Changed runtime import audit details from `selectedSkillIds` to `selectedSkillUiIds`.
- Changed GitHub skill-selector fallback to construct V2 `selectedSkills` selectors instead of legacy `selectedSkillIds`.
- Updated desktop preview parsing to derive default selection from `selectedSkills[].uiId` only.
- Renamed local import choice fields from `selectedSkillIds` to `selectedSkillPaths` in domain/query/desktop UI.
- Renamed normal selector alias fields from `legacyAliases` to `selectorAliases` / `selectors.aliases`.
- Renamed normal preview/provider ids from `legacyId` to `providerSkillId`.
- Renamed local V2 choice alias from `legacyChoiceId` to `sourceChoiceAlias`.
- Changed `ConfigCoordinator` internal dependency contract from `getConfigData(): { manifest, lockFile }` to `getConfigViewData(): { viewManifest, viewLockFile }`.

- [ ] **Step 2: Convert old normal-path tests into migration tests or delete them**

If a test constructs V1 state to exercise normal runtime behavior, move the assertion to a migration test or update the fixture to V2.

- [x] **Step 3: Run static boundary checks**

Run:

```bash
rg -n "virtualGroups|readVirtualGroups|writeVirtualGroups" packages apps --glob '!**/dist/**'
rg -n "kind: \"virtual\"|sourceKind.*virtual|source\\.kind === \"virtual\"|source\\.kind !== \"virtual\"" packages apps --glob '!**/dist/**'
rg -n "collection.*virtual|virtual.*collection" packages apps --glob '!**/dist/**'
rg -n "readManifest\\(|writeManifest\\(|readLock\\(|writeLock\\(" packages/query/src packages/core-engine/src apps/cli/src --glob '!**/tests/**' --glob '!**/dist/**'
```

Expected: matches are either zero or listed under `Allowed Remaining Matches` in this plan with a migration-only reason.

Verified on 2026-06-06 after the Task 5 cleanup slices. Results:

- `readManifest` / `writeManifest` / `readLock` / `writeLock`: no production matches in the checked paths.
- `projection-compat`, `getManagedDeployments`, `normalizeSharedPreferences`, storage `preferences-store`, and import-data-cache legacy `sources` fallback: no source matches outside generated `dist`.
- Remaining `virtual` matches outside migration are negative assertions that old `virtual-groups.json` / `source/virtual` paths are not created, plus one recommendation description using the ordinary English phrase `virtual team`.

## Task 5A: P0 Authority Structure Alignment

**Purpose:** Execute route B from the architecture review. This task fixes authority-shape issues that can cause wrong runtime behavior, without doing the full public `V2` suffix rename.

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/runtime-store.ts`
- Create or modify: `packages/storage/src/tests/runtime-store.test.ts`
- Modify: `packages/core-engine/src/services/source-checkout-service.ts`
- Modify: `packages/core-engine/src/services/source-authority-service-v2.ts`
- Modify: `packages/core-engine/src/services/import-preparation-service-v2.ts`
- Modify: `packages/core-engine/src/services/projection-ledger.ts`
- Modify: `packages/core-engine/src/services/doctor-service.ts`
- Modify: `packages/core-engine/src/services/workspace-bootstrap-service.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify focused tests under `packages/core-engine/src/tests/**`, `packages/query/src/tests/**`, and `packages/storage/src/tests/**`

- [ ] **Step 1: Add SourceKind authority tests**

Create or update `packages/storage/src/tests/runtime-store.test.ts`:

```ts
import path from "node:path";
import { describe, expect, test } from "vitest";
import { RuntimeStore } from "../runtime-store.js";

describe("RuntimeStore source paths", () => {
  test("uses the current source kind set for checkout roots", () => {
    const store = new RuntimeStore("/state");

    expect(store.getSourceRoot("git")).toBe(path.join("/state", "source", "git"));
    expect(store.getSourceRoot("github")).toBe(path.join("/state", "source", "github"));
    expect(store.getSourceRoot("local")).toBe(path.join("/state", "source", "local"));
    expect(store.getSourceRoot("clawhub")).toBe(path.join("/state", "source", "clawhub"));
  });

  test("keeps collection as a materialization path, not a fetch checkout kind", () => {
    const store = new RuntimeStore("/state");

    expect(store.getSourceRoot("collection")).toBe(path.join("/state", "source", "collection"));
    expect(store.getSourceCheckoutPath("collection", "writing-stack")).toBe(
      path.join("/state", "source", "collection", "writing-stack"),
    );
  });
});
```

Run:

```bash
npm run -w @skill-flow/storage test -- runtime-store.test.ts
```

Expected before implementation: TypeScript fails because `SourceKind` does not include `github`.

- [ ] **Step 2: Unify `SourceKind` public type**

In `packages/domain/src/types.ts`, replace the existing top-level `SourceKind` definition:

```ts
export type SourceKind = "local" | "git" | "clawhub" | "collection";
```

with:

```ts
export type SourceKind = "git" | "github" | "local" | "clawhub" | "collection";
```

Then change the V2 alias near the authority types from:

```ts
export type SourceKindV2 = "git" | "github" | "local" | "clawhub" | "collection";
```

to:

```ts
export type SourceKindV2 = SourceKind;
```

This is an intermediate compatibility alias only. The final suffix-removal phase deletes `SourceKindV2` after all imports are migrated.

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage test -- runtime-store.test.ts
```

Expected: both commands pass.

- [ ] **Step 3: Split checkout kinds from materialization kinds**

In `packages/core-engine/src/services/source-checkout-service.ts`, change:

```ts
export type SourceCheckoutKind = Extract<SourceKind, "local" | "git" | "clawhub">;
```

to:

```ts
export type SourceCheckoutKind = Extract<SourceKind, "local" | "git" | "github" | "clawhub">;
```

Then inspect `resolveSource`, `previewFailureCode`, `fetchFailureCode`, and `getSourceRoot` in the same file. The expected behavior is:

```text
git/github/local/clawhub -> allowed checkout/fetch kinds
collection -> not accepted by SourceCheckoutService
```

Add or update focused tests in `packages/core-engine/src/tests/source-checkout-service.test.ts` so a GitHub locator resolves through the checkout service and no test passes `collection` into the checkout service.

Run:

```bash
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts
```

Expected: tests pass with `github` included in checkout kinds and `collection` absent from checkout kinds.

- [ ] **Step 4: Replace V1 projection ledger types with current authority projection types**

In `packages/core-engine/src/services/projection-ledger.ts`, stop importing V1 `LockFile`, `ProjectionRecord`, and `SourceLockRecord`. Use current authority types:

```ts
import type {
  DeploymentTargetId,
  LockFileV2,
  ProjectionRecordV2,
  SourceLockRecordV2,
} from "@skill-flow/domain/types";

export function managedProjections(lockFile: Pick<LockFileV2, "projections">): ProjectionRecordV2[] {
  return lockFile.projections.filter((projection) => projection.status === "active");
}

export function bootstrapImportedTargets(
  lockFile: Pick<LockFileV2, "projections">,
  sourceLock: SourceLockRecordV2,
): DeploymentTargetId[] {
  return [
    ...new Set([
      ...lockFile.projections
        .filter(
          (projection) =>
            projection.status === "active" &&
            projection.sourceId === sourceLock.sourceId,
        )
        .map((projection) => projection.target),
      ...(sourceLock.observedTargets?.map((item) => item.target) ?? []),
      ...(sourceLock.importedFromTargets ?? []),
    ]),
  ];
}
```

If this exact implementation over-includes managed targets for bootstrap-detected sources, refine the call site instead of reintroducing `mode`. `ProjectionRecord.mode` must remain migration-only.

- [ ] **Step 5: Update ledger consumers to current authority shape**

Update consumers that currently pass V1 projected lock files or expect V1 fields:

```text
packages/core-engine/src/services/doctor-service.ts
packages/core-engine/src/services/workspace-bootstrap-service.ts
packages/query/src/runtime.ts
```

Required field mapping:

```text
V1 lockFile.sources[]             -> V2 Object.values(lockFile.sources)
V1 sourceLock.id                  -> V2 sourceLock.sourceId
V1 sourceLock.checkoutPath        -> V2 sourceLock.localPath
V1 sourceLock.invalidLeafs        -> V2 leaf diagnostics or empty current equivalent
V1 projection.mode                -> derive from sourceLock.importMode or projection status, not from projection record
V1 projection active/managed list -> V2 projections filtered by status === "active"
```

Run:

```bash
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
```

Expected: both builds pass without adding `mode` to `ProjectionRecordV2`.

- [ ] **Step 6: Add a regression test for active projections not being dropped**

Add or update a focused test in `packages/core-engine/src/tests/deployment-planner-v2.test.ts` or `packages/query/src/tests/collections.test.ts` that creates a V2 lock file with active projections that do not include `mode`, then verifies the runtime path still sees those projections.

Minimum assertion:

```ts
expect(lockFile.projections.some((projection) => projection.status === "active")).toBe(true);
expect(resultingProjectionTargets).toContain("codex");
```

Run:

```bash
npm run -w @skill-flow/core-engine test -- deployment-planner-v2.test.ts
npm run -w @skill-flow/query test -- collections.test.ts
```

Expected: tests pass. A failure where active projections disappear is a blocker.

- [ ] **Step 7: Mark V1 shadow types as deprecated instead of deleting them in this slice**

In `packages/domain/src/types.ts`, add JSDoc deprecation comments to V1 shape types that still exist only because `state-v2-view.ts` and public runtime DTOs have not been deleted yet:

```ts
/**
 * @deprecated V1 projected view type. Normal runtime authority code must use ManifestFileV2.
 */
export type Manifest = {
```

Apply the same pattern to:

```text
SourceManifestRecord
SourceBinding
Manifest
SharedPreferences
DeploymentRecord
ProjectionRecord
LockFile
LocalImportChoice
ImportPreviewSkill
ImportDraft
```

Do not add deprecation comments to migration-only internal types in `state-migration-service.ts`; those names already live in the migration boundary.

Run:

```bash
npm run -w @skill-flow/domain build
```

Expected: build passes.

- [ ] **Step 8: Record the remaining `state-v2-view.ts` deletion path**

Append a dated entry under `Known remaining contract work` in this plan:

```text
- `packages/query/src/state-v2-view.ts` remains only as a public/runtime DTO bridge. Deletion requires migrating `SkillFlowApp.getConfigData()`, bootstrap/config/doctor/workflow summaries, CLI tests using `projectStateV2ToView`, and desktop bridge consumers to current authority DTOs.
```

Run:

```bash
rg -n "projectStateV2ToView|state-v2-view|StateV2AuthorityView|LockFileV2View" packages apps --glob '!**/dist/**'
```

Expected: matches remain, but all are covered by the deletion-path entry and no new `collection -> virtual` mapping exists.

- [ ] **Step 9: Run P0 focused verification**

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage build
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
npm run -w @skill-flow/storage test -- runtime-store.test.ts state-store-v2.test.ts import-preparation-cache.test.ts
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts deployment-planner-v2.test.ts state-migration-service.test.ts
npm run -w @skill-flow/query test -- collections.test.ts runtime-v2.test.ts runtime-source-v2.test.ts config-coordinator.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 10: Decide next phase**

If Task 5A passes, choose the next phase from the review file:

```text
Phase 5B: delete state-v2-view.ts and migrate public runtime/query DTOs to current authority shape.
Phase 5C: remove V2 suffixes from public types, files, classes, and tests.
Phase 5D: remove P1/P2 redundant fields such as displayName/skillFilePath/locatorIndex/lease.state after separate tests prove the replacement path.
```

Do not mark the whole cleanup complete after Task 5A. Task 5A only completes the selected route B P0 structure-fix slice.

## Task 6: Final Verification

**Files:**

- Verify: entire repository

- [ ] **Step 1: Run root build**

Run:

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 2: Run root tests**

Run:

```bash
npm test
```

Expected: exits 0.

- [ ] **Step 3: Run desktop tests**

Run:

```bash
cd apps/desktop-mac && swift test
```

Expected: exits 0. One skipped helper-timeout test is acceptable if there are 0 failures.

- [ ] **Step 4: Rebuild test package if desktop resources or bridge changed**

Run:

```bash
scripts/release/package-desktop-mac-dev.sh dist/desktop-mac-test-current
rm -f dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip dist/desktop-mac-test-current/arm64/SHA256SUMS
ditto -c -k --keepParent "dist/desktop-mac-test-current/arm64/Skill Flow.app" dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip
shasum -a 256 dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip > dist/desktop-mac-test-current/arm64/SHA256SUMS
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" arm64
scripts/release/audit-mac-package-size.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg
```

Expected: package, artifact validation, and size audit pass.

## Audit Results

Consolidated from five parallel explorer audits on 2026-06-06.

### allowed-legacy

- `packages/core-engine/src/services/state-migration-service.ts`: may read V1 `manifest.json`, `lock.json`, `deployments`, `virtual-groups.json`, and `kind: "virtual"` as migration input only.
- `packages/core-engine/src/services/legacy-virtual-group.ts`: may read legacy `virtual-groups.json` only because it is exclusively used by migration.
- `packages/core-engine/src/tests/state-migration-service.test.ts`: may seed V1 and legacy virtual groups to verify V2 migration output.
- `packages/query/src/tests/state-migration-runtime.test.ts`: may seed V1 state to verify explicit migration entrypoints.
- `packages/storage/src/tests/state-migration-status.test.ts`: may seed legacy/incomplete state to verify migration status.
- `packages/storage/src/state-store-v2.ts`: may reject V1 state with `STATE_MIGRATION_REQUIRED`; this is not fallback.

### must-remove

- `packages/query/src/state-v2-view.ts`: removes V2-to-V1 public projection, especially `collection -> virtual`.
- `packages/query/src/runtime.ts`: removes `kind: "virtual"` fallback return values after V2 collection creation/merge.
- `packages/query/src/workflow-service.ts`: removes `source.kind === "virtual"` normal-path collection detection.
- `packages/query/src/runtime.ts`: removes `selectedSkillIds` import draft fallback from normal V2 import paths.
- `packages/query/src/runtime.ts`: removes legacy selector fallback by `relativePath`, `linkName`, `name`, and prefixed ids from V2 import contract.
- `packages/domain/src/projection-compat.ts` and `packages/domain/src/index.ts`: remove public V1 `deployments` fallback helper.
- `packages/storage/src/preferences-store.ts` and `packages/storage/src/index.ts`: remove public V1 shared preferences normalizer.
- `packages/storage/src/import-data-cache.ts`: remove runtime cache fallback from legacy `sources` to `repos`.
- `apps/cli/src/bridge-command.ts`: reject normal payloads using `draft.selectedSkillIds`; require V2 `selectedSkills`.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`: remove import-draft V2 capability downgrade and legacy send path.
- `apps/desktop-mac/Sources/DesktopApp/Store/ImportState.swift`: remove `legacySkillId` / `importDraftV2Compatible` from normal import state.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`: remove `selectedSkillIds` command API from normal desktop command contract.
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`: remove preview fallback from `selectedSkillIds`.

### contract-change

- `packages/domain/src/types.ts`: mark or isolate V1 `Manifest`, `LockFile`, `SharedPreferences`, `VirtualGroupsState`, and V1 `SourceKind`; normal contract should prefer V2 types.
- `packages/domain/src/types.ts`: change V2 fields named `legacyAliases`, `legacyChoiceId`, and `legacyId` when they are current runtime selector fields rather than migration-only data.
- `packages/storage/src/import-preparation-cache.ts`: use `ImportPreparationRecordV2` / `SourceKindV2` instead of mixed `ImportPreparationRecord` / V1 `SourceKind`.
- `packages/storage/src/runtime-store.ts`: accept V2 checkout kind and support `collection`.
- `packages/core-engine/src/services/workspace-bootstrap-service.ts`: accept V2 `ManifestFileV2` / `LockFileV2`, use `localPath`, and remove `projection-compat`.
- `packages/core-engine/src/services/doctor-service.ts`: accept V2 bindings and projections.
- `packages/core-engine/src/services/source-checkout-service.ts` and `source-types.ts`: replace V1-shaped snapshot DTOs with V2-neutral DTOs.
- `packages/core-engine/src/services/source-authority-service-v2.ts` and `skill-collection-materializer.ts`: make selector aliases neutral or migration-only.
- `packages/query/src/config-coordinator.ts`: stop exposing old `Manifest` / `LockFile` dependencies.
- `packages/query/src/runtime.ts`: move public config/bootstrap/preview/inspect result DTOs to V2 semantics.
- `packages/shared-types/src/protocol.ts`, `apps/cli/src/bridge-command.ts`, and desktop bridge models: rename virtual group bridge commands/payload fields or explicitly schedule them as API-breaking cleanup.
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`: use `collection` source kind for combined-source logic.

### test-contract

- `packages/query/src/tests/state-v2-view.test.ts`: currently protects `collection -> virtual`; update first.
- `packages/query/src/tests/runtime-v2.test.ts`: currently expects create collection response `kind: "virtual"` while authority state is already `collection`.
- `packages/query/src/tests/workflow-service.test.ts`: currently uses schema V1 manifest/lock and `kind: "virtual"` as normal input.
- `packages/query/src/tests/config-coordinator.test.ts`: currently uses schema V1 manifest/lock as normal config dependency.
- `packages/query/src/tests/import-page-flow.test.ts`: still tests normal `selectedSkillIds` payload fallback; keep only V2 selector tests.
- `packages/domain/src/projection-compat.test.ts`: protects V1 fallback helper as normal domain behavior.
- `packages/storage/src/tests/preferences-store.test.ts`: protects V1 shared preferences normalizer as normal storage behavior.
- `packages/storage/src/tests/import-preparation-cache.test.ts`: protects mixed unversioned preparation records as normal cache behavior.
- `packages/shared-types/src/tests/protocol.test.ts`: protects `selectedSkillIds` and `create-virtual-group` bridge protocol.
- `apps/cli/src/tests/bridge-command.test.ts`: protects legacy `selectedSkillIds` and virtual group bridge payloads.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/*.swift`: multiple tests protect import draft legacy fallback and `sourceKind == "virtual"` as normal behavior.

### rename-only

- Test file names and internal names containing `virtual-groups` may be renamed after contract cleanup if they no longer expose old data semantics.
- Localization keys such as `home.sidebar.virtual` can be renamed after source kind cleanup; display copy is already "组合" / "Combined" / "組み合わせ".
- `StateStoreV2.readManifest()` / `writeManifest()` names are V2-only despite lacking a suffix; optional rename later.

### First Execution Slice

1. Fix the `collection -> virtual` public view leak and the tests protecting it.
2. Change runtime create/merge collection fallback payloads to `kind: "collection"`.
3. Change desktop combined-source detection from `virtual` to `collection`.
4. Run focused query and desktop tests.
5. Then continue with import draft legacy fallback removal.

## Allowed Remaining Matches

Last scanned on 2026-06-06 after Task 5 cleanup slices.

Allowed migration-only matches:

- `packages/core-engine/src/services/legacy-virtual-group.ts`
- `packages/core-engine/src/services/state-migration-service.ts`
- `packages/core-engine/src/tests/state-migration-service.test.ts`

Known remaining contract work:

- `packages/query/src/runtime.ts` and downstream query services still use projected `Manifest` / `LockFile` view types widely for public/runtime summaries, apply planning, doctor, and workflow operations. This is the next large contract migration if the public view itself must stop using V1-shaped names.
- 2026-06-06 route B update: `packages/query/src/state-v2-view.ts` remains only as a public/runtime DTO bridge. Deletion requires migrating `SkillFlowApp.getConfigData()`, bootstrap/config/doctor/workflow summaries, CLI tests using `projectStateV2ToView`, and desktop bridge consumers to current authority DTOs.

Known remaining rename-only/internal matches:

- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`: helper checks that V2 requests do not include legacy `selectedSkillIds`.

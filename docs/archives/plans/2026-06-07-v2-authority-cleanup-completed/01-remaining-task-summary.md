# V2 Authority Cleanup Remaining Task Summary

## Purpose

This document records the read-only remaining-task summary used to create the new active plan. It replaces the completed-task-heavy active plan from `plans/2026-06-06-v2-compat-debt-cleanup/`.

## Current Worktree

```text
/Users/Vint/.config/superpowers/worktrees/01_skill-flow/import-preparation-cache
```

Branch:

```text
codex/import-preparation-cache
```

## Source Documents

- `plans/archive/2026-06-06-v2-compat-debt-cleanup-superseded/00-current-execution-plan.md`
- `plans/archive/2026-06-06-v2-compat-debt-cleanup-superseded/01-data-structure-optimization-recommendations.md`
- `plans/archive/2026-06-06-v2-compat-debt-cleanup-superseded/02-authority-structure-audit.md`
- `plans/archive/2026-06-06-v2-compat-debt-cleanup-superseded/03-decision-confirmations.md`

If the archive move has not happened yet, read the same files from `plans/2026-06-06-v2-compat-debt-cleanup/`.

## Completed Work Removed From Active Execution

The following items are not active tasks anymore:

- Initial plan archive/setup work from the old Task 1.
- Parallel audit dispatch and consolidation from the old Task 2.
- Public `collection` view cleanup from the old Task 3.
- Desktop/bridge source type text cleanup from the old Task 4.
- `@skill-flow/domain/projection-compat` removal.
- `packages/storage/src/preferences-store.ts` removal.
- `packages/storage/src/import-data-cache.ts` legacy `sources -> repos` fallback removal.
- Normal-path `kind: "virtual"` / `sourceKind: "virtual"` cleanup, except migration boundary and negative assertions.
- Normal-path `selectedSkillIds` cleanup, except negative tests rejecting legacy payloads.
- Normal-path `legacyId` / `legacyAliases` / `legacyChoiceId` cleanup.
- Production `readManifest` / `writeManifest` / `readLock` / `writeLock` cleanup in the previously checked query/core/CLI paths.

Important distinction: `selectedSkillIds` cleanup is complete, but `selectedSkillPaths` remains active P0 desktop/import-preview work.

## Remaining P0 Work

### P0 5A: Authority Structure Alignment

Remaining work:

- Add `github` to the current public `SourceKind`.
- Keep `SourceKindV2` only as a temporary alias until suffix removal.
- Change `SourceCheckoutKind` to include `github` and exclude `collection`.
- Keep `collection` out of checkout/fetch services.
- Use independent physical paths: `stateRoot/source/<kind>/<id>`, including `github`.
- Keep `collection` as a materialization path under `stateRoot/source/collection/<id>`.
- Remove normal runtime reads of `ProjectionRecord.mode`.
- Rewrite `projection-ledger.ts` to consume current authority projection records.

Key files:

- `packages/domain/src/types.ts`
- `packages/storage/src/runtime-store.ts`
- `packages/core-engine/src/services/source-checkout-service.ts`
- `packages/core-engine/src/services/import-preparation-service-v2.ts`
- `packages/core-engine/src/services/projection-ledger.ts`
- `packages/core-engine/src/services/doctor-service.ts`
- `packages/core-engine/src/services/workspace-bootstrap-service.ts`
- `packages/query/src/runtime.ts`

### P0 5B: Delete V2-to-V1 View Layer And Desktop V1 Import Preview

Remaining work:

- Delete `packages/query/src/state-v2-view.ts`.
- Remove `projectStateV2ToView` calls from runtime/query/CLI tests.
- Stop exposing V1-shaped `schemaVersion: 1`, `deployments`, `projectionViews`, and `mode` view payloads for current authority state.
- Remove desktop import preview `previewVersion == 2` branching.
- Replace Swift `selectedSkillPaths` import-preview state with V2 `selectedSkills`.
- Update CLI and bridge tests to expect V2 authority DTOs.

Key files:

- `packages/query/src/state-v2-view.ts`
- `packages/query/src/runtime.ts`
- `packages/query/src/index.ts`
- `apps/cli/src/tests/config-integration.test.ts`
- `apps/cli/src/tests/skill-flow.test.ts`
- `apps/desktop-mac/Sources/DesktopApp/Store/ImportState.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`

### P0 5C: Shadow Type Cleanup And Suffix Removal

Remaining work:

- Remove V1 shadow types once their consumers are migrated.
- Rename current authority `*V2` types/classes/files to unsuffixed names.
- Keep versioned names only at migration command/history boundaries.
- Remove redundant P1 fields while adding one-time normalizer/drop tests.

Key files:

- `packages/domain/src/types.ts`
- `packages/storage/src/state-store-v2.ts`
- `packages/storage/src/state-schema-v2.ts`
- `packages/core-engine/src/services/source-authority-service-v2.ts`
- `packages/core-engine/src/services/import-preparation-service-v2.ts`
- `packages/core-engine/src/services/deployment-planner-v2.ts`
- `packages/core-engine/src/services/deployment-applier-v2.ts`

### P0 5D: Dead Public Surface Cleanup

Remaining work:

- Delete `packages/core-engine/src/services/workflow-service.ts`.
- Do not remove the package-level `"./services/*"` export pattern.
- No `packages/core-engine/src/index.ts` export removal is needed unless a new export is added later; current `index.ts` does not export this file.

Key files:

- `packages/core-engine/src/services/workflow-service.ts`
- `packages/core-engine/package.json`

## Remaining P1 Work

### P1 Normalizer-Based Redundant Field Removal

Remaining work:

- Delete `LeafRecordV2.displayName`; use `title` as the current field.
- Evaluate and delete `LeafRecordV2.skillFilePath` only if runtime can derive it from `absolutePath` / canonical skill filename without ambiguity.
- Delete `ImportPreparationCache.locatorIndex`; use record scanning.
- Delete `ImportPreparationRecordV2.lease` as a whole; use top-level `status` and `expiresAt`.
- Add explicit normalizer tests proving old JSON fields are discarded once at the storage/migration boundary.

Key files:

- `packages/domain/src/types.ts`
- `packages/storage/src/import-preparation-cache.ts`
- `packages/storage/src/state-store-v2.ts`
- `packages/core-engine/src/services/source-authority-service-v2.ts`

### P1 Source Revision Shape

Remaining work:

- Change `SourceRevisionV2` from a shared `provider` union into a discriminated union if it removes field ambiguity without adding runtime branching.

Key files:

- `packages/domain/src/types.ts`
- `packages/core-engine/src/services/source-authority-service-v2.ts`

## Adopted Decisions

- Use `03-decision-confirmations.md` as authority when older documents conflict.
- `collection` must never map to git checkout/fetch.
- `collection` may still have a storage materialization path under `stateRoot/source/collection/<id>`.
- `github` uses independent physical path `stateRoot/source/github/<id>`.
- `Task 5A` is not P0 completion; P0 completion requires 5A, 5B, 5C, and 5D.
- P1 field deletion must be handled by one-time migration/normalizer discard tests, not runtime compatibility branches.
- `SourceRevisionV2` provider ambiguity is active P1 work: implement a discriminated union when it does not add runtime fallback, otherwise create `04-source-revision-decision.md` with exact blocking source references.

## Required Verification Commands

Focused:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage build
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
npm run -w @skill-flow/storage test -- runtime-store.test.ts state-store-v2.test.ts import-preparation-cache.test.ts
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts deployment-planner-v2.test.ts state-migration-service.test.ts import-preparation-service-v2.test.ts source-authority-service-v2.test.ts
npm run -w @skill-flow/query test -- collections.test.ts runtime-v2.test.ts runtime-source-v2.test.ts config-coordinator.test.ts source-lifecycle.test.ts import-page-flow.test.ts
npm run -w @skill-flow/shared-types test -- protocol.test.ts
npm run -w skill-flow test -- bridge-command.test.ts
cd apps/desktop-mac && swift test --filter 'BridgeClientExecutionTests|ImportViewModelTests|ImportScreenContainerTests|WorkflowCoverageTests'
```

Final:

```bash
npm run build
npm test
cd apps/desktop-mac && swift test
```

If desktop resources, bridge, or app packaging behavior changed:

```bash
scripts/release/package-desktop-mac-dev.sh dist/desktop-mac-test-current
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" arm64
scripts/release/audit-mac-package-size.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg
```

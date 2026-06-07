# Final Change List

Date: 2026-06-07

Worktree:

```text
/Users/Vint/.config/superpowers/worktrees/01_skill-flow/import-preparation-cache
```

Branch:

```text
codex/import-preparation-cache
```

Status:

- Code changes are implemented and verified.
- Changes are not committed.
- Desktop test package is rebuilt under `dist/desktop-mac-test-current/arm64`.

## Summary

This branch completes the current V2 authority cleanup by removing normal-runtime compatibility layers and making migration code the owner of legacy shapes.

Main result:

- Normal runtime now uses current authority files and current DTOs directly.
- V1/V2 suffix service and store layers were removed or renamed into current names.
- `virtual` group runtime language was replaced by `collection` / combination-facing behavior, with legacy `virtual` reads kept only in migration boundaries.
- Redundant persisted fields were removed from current authority types, with one-time discard handled at storage normalization boundaries.
- Desktop, bridge, CLI, TUI, query, storage, and core-engine tests were updated to current payloads.

Current diff size:

```text
102 files changed, 3369 insertions(+), 10960 deletions(-)
```

## Authority And Type Cleanup

- `SourceKind` is now the current source-kind union: `git`, `github`, `local`, `clawhub`, `collection`.
- Removed public V2 suffix aliases and service/store names from normal runtime.
- Deleted current-runtime imports and tests for:
  - `StateStoreV2`
  - `SourceAuthorityServiceV2`
  - `ImportPreparationServiceV2`
  - `state-v2-view`
  - `projection-compat`
  - legacy virtual group tests in normal runtime paths
- Kept legacy virtual group handling under migration-specific files and tests.

## Storage And Authority Files

- Replaced V2 storage files with current `StateStore` / `state-schema` names.
- Removed `preferences-store` as a normal runtime store surface.
- Removed import-preparation cache `locatorIndex`.
- Removed import-preparation cache `lease`.
- Added cache normalization tests to reject deriving current `status` from legacy `lease.state`.
- Added Vitest `dist/**` exclusions to package test configs so `npm run build && npm test` is repeatable.

## Redundant Field Cleanup

Removed or stopped persisting redundant authority fields:

- `LeafRecord.displayName`
- `LeafRecord.metadataWarnings`
- `SourceLockRecord.id`
- `SourceLockRecord.locator`
- `SourceLockRecord.kind`
- `SourceLockRecord.displayName`
- `SourceLockRecord.originalDisplayName`
- `SourceLockRecord.checkoutPath`
- `SourceLockRecord.updatedAt`
- `SourceLockRecord.invalidLeafs`
- `SourceLockRecord.invalidLeafPaths`
- `SourceLockRecord.commitSha`

Current behavior:

- `LeafRecord.diagnostics` is the source of metadata warnings.
- Summary/view DTOs derive `metadataWarnings` for consumers.
- `StateStore.normalizeLockFile()` discards legacy redundant leaf/source fields at the authority boundary.
- Checkout-specific summary fields are kept in internal DTOs, not in persisted `SourceLockRecord`.

## Import Preparation

- Replaced locator-index lookup with record scanning.
- `findReusablePreparation()` now:
  - considers all records matching `cacheKey` or `locator`;
  - sorts by `preparedAt` descending, then id;
  - reuses only ready records with existing checkout paths;
  - skips or deletes terminal unusable records;
  - returns preparing records when appropriate;
  - returns stale only as fallback.
- Added regression coverage for newer terminal records sharing a cache key with an older reusable ready record.

## Source Revision

- `SourceRevision` is provider-specific:
  - `git` / `github` / `clawhub`: ref or commit plus capture time.
  - `local`: content hash plus capture time.
  - `collection`: capture time.
- Removed ambiguous V2 revision naming from current public type surface.

## Collection / Combination Behavior

- Normal runtime now treats collection sources as materialized collection state, not git checkout/fetch sources.
- Desktop user-facing strings and tests were updated away from virtual group terminology.
- `MainViewModelCollectionTests.swift` replaces old virtual-group-focused tests.
- Bridge and CLI import draft payloads use current selected-skill shapes without legacy fallback retry.

## Projection And Deployment

- Removed normal-runtime dependency on `ProjectionRecord.mode`.
- Added current `projection-ledger`.
- Renamed deployment planner/applier files from V2 names to current names.
- Active/current projection ownership terminology was updated in core-engine behavior and tests.
- `projection.mode` reads remain only in migration code for legacy input conversion.

## Query, CLI, TUI, Desktop

- Query runtime no longer uses `projectStateV2ToView` or `state-v2-view`.
- Config coordinator and workflow service consume current authority DTOs.
- CLI bridge tests were updated for current import draft and bridge protocol payloads.
- TUI add flow now consumes summary DTO types instead of persisted manifest/leaf records.
- Desktop bridge models, import state, localization, and view model tests were updated to current collection/import terminology.

## Deferred Decision

`LeafRecord.skillFilePath` is intentionally not removed in this branch.

Reason:

- Desktop detail warmup and query document loading still use document file paths.

Decision document:

```text
plans/2026-06-07-v2-authority-cleanup-remaining/03-skill-file-path-decision.md
```

Required next cleanup:

- Add a shared helper that derives `SKILL.md` from `leaf.absolutePath`.
- Keep `skillFilePath` only as derived DTO/bridge output if still needed.
- Remove persisted `LeafRecord.skillFilePath` after query and desktop consumers use the helper.

## Verification

Static debt checks:

```bash
rg -n "projectStateV2ToView|state-v2-view|selectedSkillPaths|previewVersion|projection\\.mode|locatorIndex|\\.lease\\.|SourceKindV2|StateStoreV2|SourceAuthorityServiceV2|ImportPreparationServiceV2" packages apps --glob '!**/dist/**' --glob '!**/.build/**'
rg -n "kind: \"virtual\"|sourceKind.*virtual|source\\.kind === \"virtual\"|source\\.kind !== \"virtual\"" packages apps --glob '!**/dist/**' --glob '!**/.build/**'
rg -n "core-engine/src/services/workflow-service|core-engine/services/workflow-service" packages apps --glob '!**/dist/**' --glob '!**/.build/**'
```

Observed result:

- Matches are limited to migration boundaries, negative tests, or normalization tests.
- No normal runtime import of deleted workflow service path.

Build:

```bash
npm run build
```

Observed result:

- Exit 0.

Tests:

```bash
npm test
```

Observed result:

- Exit 0.
- Domain: 3 files, 5 tests.
- Shared types: 1 file, 11 tests.
- Integration: 6 files, 34 tests.
- Storage: 7 files, 43 tests.
- Core engine: 9 files, 72 tests.
- Query: 15 files, 150 tests.
- TUI: 2 files, 10 tests.
- CLI: 14 files, 159 tests.

Desktop tests:

```bash
cd apps/desktop-mac && swift test
```

Observed result:

- Exit 0.
- 470 tests.
- 1 skipped helper-timeout test.
- 0 failures.

Desktop package:

```bash
scripts/release/package-desktop-mac-dev.sh dist/desktop-mac-test-current
rm -f dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip dist/desktop-mac-test-current/arm64/SHA256SUMS
ditto -c -k --keepParent "dist/desktop-mac-test-current/arm64/Skill Flow.app" dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip
shasum -a 256 dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip > dist/desktop-mac-test-current/arm64/SHA256SUMS
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" arm64
scripts/release/audit-mac-package-size.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg
```

Observed result:

- Artifact validation passed.
- App bundle: 140416 KiB.
- DMG: 57268 KiB.
- Node runtime bundled: v22.22.2.
- npm/npx bundled: yes.

Artifacts:

```text
dist/desktop-mac-test-current/arm64/Skill Flow.app
dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg
dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip
dist/desktop-mac-test-current/arm64/SHA256SUMS
```

## Remaining Before Commit

- Sync historical unchecked boxes in `00-current-execution-plan.md` for Task 1, Task 2, and Task 4 if this plan file is intended to be the final project ledger.
- Review the large diff before commit.
- Decide commit structure. Recommended split:
  1. authority/storage/type cleanup;
  2. query/CLI/bridge/desktop current DTO migration;
  3. redundant field cleanup and verification config;
  4. plans/archive documentation updates.


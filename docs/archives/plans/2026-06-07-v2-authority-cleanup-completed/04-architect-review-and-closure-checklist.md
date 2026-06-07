# Architect Review And Closure Checklist

Date: 2026-06-07

## Merge Gate

This branch is merge-ready only when the items below are true.

- P0 migration authority / collection replacement is transactional enough to avoid mixed authority state.
- P1 data-integrity fixes are complete:
  - legacy `LeafRecord.valid: false` is preserved;
  - missing legacy projection `status` migrates to `"active"`;
  - orphaned legacy `kind: "virtual"` sources fail migration with diagnostics;
  - committing import-preparation records are not deleted by a concurrent prepare;
  - normal runtime collection error codes no longer use `VIRTUAL_GROUP_*`;
  - desktop treats `github` source kind as remote.
- Legacy compatibility code remains owned by migration boundaries.
- Normal runtime uses current authority names and collection terminology.
- Verification commands pass:
  - `npm run build`
  - `npm test`
  - `cd apps/desktop-mac && swift test`

## Completed In This Closure Pass

- Added migration negative coverage for orphaned legacy virtual source.
- Added migration field-preservation coverage for `valid: false` and missing projection `status`.
- Added import-preparation concurrency coverage for `committing` records.
- Added collection error-code assertions for `COLLECTION_*`.
- Added desktop source-type assertion for `github`.

## Deferred Items

- Remove `managedProjections` dead alias.
- Add `createSourceRevision` exhaustive check.
- Rename `legacy-agents-lock.ts` if the team decides interop naming must be clarified before merge.
- Clean P2 naming / fixture / dist artifact items.
- Sync `00-current-execution-plan.md` historical checkboxes if that file is used as final project ledger.

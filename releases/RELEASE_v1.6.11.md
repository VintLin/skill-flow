# RELEASE v1.6.11

## Summary

v1.6.11 is a reliability and architecture release that centralizes managed source lifecycle operations while preserving the existing CLI, TUI, desktop bridge, and persisted state contracts.

## Highlights

- Centralized add, final import, update, repair, and uninstall orchestration in the shared query runtime.
- Kept protected recovery transactions and target projection reconciliation scoped to the source operation being performed.
- Added explicit source lifecycle terminology for future architecture work.

## User-visible changes

- Existing source group workflows continue to use the same commands, response shapes, state files, and target paths.
- Failed source updates no longer return the same warning more than once.
- Source add, import, update, repair, and uninstall behavior remains covered by the existing end-to-end runtime and CLI tests.

## Release Artifacts

The GitHub Release contains arm64, x86_64, and universal macOS DMG/ZIP artifacts plus `sha256.txt`.

## Verification

- `npm run build`
- `npm test`
- Focused source lifecycle tests for add, import, update, repair, and uninstall
- macOS artifact architecture, bundle-signature, and checksum validation during packaging

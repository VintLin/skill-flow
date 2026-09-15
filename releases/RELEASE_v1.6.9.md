# RELEASE v1.6.9

## Summary

v1.6.9 adds read-only Project Doctor diagnostics for inspecting a specific project without registering or modifying it.

## Highlights

- Inspect an explicit project path with `skill-flow doctor --project <path>`.
- Report managed Skill deployments, copied-content drift, symlink integrity, missing paths, and external Skills.
- Preserve the existing global `skill-flow doctor` maintenance behavior.
- Keep Project Doctor user-facing through the CLI; no desktop Doctor entry or report sheet is included.

## User-visible changes

Project Doctor is read-only and supports registered or unregistered project directories. Diagnostics include actionable paths, status aggregation, coverage, and uncertainty when the filesystem cannot be fully inspected.

## Release Artifacts

The GitHub Release contains arm64, x86_64, and universal macOS DMG/ZIP artifacts plus `sha256.txt`.

## Verification

- `npm run build`
- `npm test`
- Project Doctor focused query tests
- Desktop `MainViewModelSelectionTests`
- macOS artifact validation during packaging

# RELEASE v1.5.6

## Summary

- `v1.5.6` deepens the desktop runtime architecture around explicit bridge/query/command seams and shared deployment reconciliation.
- The release keeps the existing desktop workflows while reducing reverse dependencies and adding focused coverage for bridge payload decoding and deployment state coordination.

## Highlights

### 1. Shared deployment reconciliation

- Added a dedicated deployment reconciler to the shared query runtime.
- Moved deployment coordination out of the broad runtime implementation into a focused module with dedicated tests.

### 2. Explicit desktop runtime seams

- Narrowed desktop query and command interfaces and clarified runtime dependency wiring.
- Centralized bridge payload decoding so desktop consumers share one decoding path.

### 3. View-model and test hardening

- Reduced reverse dependencies across detail, import, collection, settings, and main view-model logic.
- Added and updated Swift and TypeScript tests for the refactored runtime boundaries.

## User-visible changes

- Existing CLI and desktop workflows remain available with no intentional command or protocol changes.
- Desktop bridge-backed operations use more explicit and consistent state coordination internally.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `npm run build`
- `npm test`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

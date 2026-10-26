# RELEASE v1.6.13

## Summary

v1.6.13 keeps the desktop skill list visible when startup recovery cannot complete after an interrupted operation.

## Highlights

- Falls back to the saved workflow list when workspace bootstrap fails.
- Keeps the Home screen in a warning state so an incomplete recovery is visible without hiding persisted skills.
- Adds a regression test for the restart-time empty-list failure.

## User-visible changes

- Restarting Skill Flow no longer turns a recoverable saved workspace into an empty Home screen when the recovery journal is invalid or incomplete.
- The app displays the saved skill groups and records the bootstrap failure as a warning.
- A valid bootstrap failure still remains visible as a diagnostic; mutations continue to follow the existing recovery safety rules.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

These bundles use ad-hoc signing, not Developer ID signing or Apple notarization.

## Verification

- `npm run build`
- `npm test`
- `swift test --filter MainViewModelProjectScopeTests`
- `scripts/release/validate-mac-artifacts.sh` for arm64, x86_64, and universal bundles
- Real installed-app restart acceptance with 17 skill groups visible after restart

# RELEASE v1.6.18

## Summary

v1.6.18 improves desktop presentation consistency and workspace persistence while making the CLI first-use path easier to recover from.

## Highlights

- Shares one Agent display order across Home, Group Cards, Import, Menu Bar, and Settings.
- Orders Home Source Type and default Tags by the number of associated Groups within the active Project Scope.
- Adds measured overflow popovers for complete Agent and Skill access in dense Group Cards.
- Moves durable desktop Agent visibility and group-tag state into `~/.skillflow/desktop.json` with migration and cross-process write protection.
- Adds a CLI completion hint that identifies the registered group and points users to `skill-flow list --ids`.

## User-visible changes

- Dragging an Agent in Home or Settings keeps the same order in Group Cards and after relaunch.
- Group Cards show an overflow entry only when their Agent or Skill row does not fit; the popover preserves existing selection behavior.
- Existing desktop visibility and group tags survive application replacement, relaunch, and workspace-scope changes.
- After `skill-flow add`, users see the registered group, the enabled-skill count, and the next command to review it.

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
- `npm test` — 789 passed, 0 failed
- `swift test --package-path apps/desktop-mac` — 652 passed, 2 skipped, 0 failed (the two skipped cases are opt-in progress E2E tests)
- Three-architecture artifact build, architecture validation, and code-sign verification
- Staged CLI package dry-run for `skill-flow@1.6.18`

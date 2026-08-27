# RELEASE v1.6.1

## Summary

- `v1.6.1` is a focused macOS navigation cleanup for the Usage dashboard.
- Usage Analytics now has one clear entry point from the home toolbar.

## Highlights

### 1. Single Usage entry point

- Removes the duplicate Usage Analytics card from the home sidebar.
- Keeps the existing Usage icon in both regular and compact home toolbars.
- Leaves the Usage dashboard, refresh controls, and analytics behavior unchanged.

## User-visible changes

- Users now open Usage from the home toolbar without seeing a second, redundant sidebar action.
- The sidebar remains focused on filters, tags, Agents, and project scope.

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
- `swift test --filter DesktopInteractionRegressionTests/testHomeUsageEntryExistsOnlyInToolbar`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

# RELEASE v1.6.7

## Summary

- `v1.6.7` keeps the currently open macOS Group detail synchronized with committed source updates.
- Detail refreshes now preserve route and project-scope ownership while handling stale responses, temporary failures, and removed Skill selections safely.

## Highlights

### 1. Immediate active-detail refresh

- Refreshes the open Group detail after a successful single-source or bulk Update.
- Updates Skill documents, statistics, metadata, and the file tree without requiring navigation away from the detail page.

### 2. Race-safe ownership

- Accepts inspect results only when they still belong to the current route, source, project scope, and inspect generation.
- Prevents older asynchronous completions from replacing newer detail state.

### 3. Failure and selection recovery

- Preserves the last usable detail when post-update inspection fails and retries when the user re-enters the Group.
- Reconciles the selected Skill after refresh so removed Skills do not leave stale document or file-tree content visible.

## User-visible changes

- An open Group detail now shows newly updated Skill content immediately after Update completes.
- Updated document text, statistics, and file-tree entries no longer require a manual refresh or leaving and reopening the Group.
- Temporary refresh failures keep the previous usable detail instead of blanking the screen.

## Contributors

- Thanks to [@ren2019](https://github.com/ren2019) for originating and contributing [PR #15](https://github.com/VintLin/skill-flow/pull/15).

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
- `swift test --package-path apps/desktop-mac`
- Real-state macOS end-to-end Update verification with `pbakaus-impeccable`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

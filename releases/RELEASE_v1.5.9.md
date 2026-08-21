# RELEASE v1.5.9

## Summary

- `v1.5.9` hardens managed Git source updates after `v1.5.8`.
- The release keeps source authority files, lock metadata, and managed checkouts consistent across fast-path updates, repairs, rollback failures, and GitHub fallback paths.

## Highlights

### 1. Git update integrity

- Persists each updated source with its checkout state before continuing a batch update.
- Rolls back checkout and lock changes when a later source fails.
- Keeps unchanged-remote fast paths limited to managed checkouts that still match the locked source state.

### 2. Managed checkout ownership

- Centralizes canonical checkout path and managed symlink rules.
- Prevents externally owned source paths from being treated as Skill Flow-managed checkouts.
- Uses one recorded branch identity across clone, update, archive fallback, and lock metadata.

### 3. Authority rollback safety

- Writes the four source authority files as one staged transaction.
- Preserves the original write error and rollback error context when authority recovery fails.
- Keeps prepared canonical checkouts when deleting them could leave source authority pointing at missing content.

### 4. GitHub source fallback

- Falls back from GitHub SSH to HTTPS clone attempts.
- Falls back again to GitHub archive download when git access is unavailable.
- Preserves the same source identity and branch metadata across fallback modes.

## User-visible changes

- Managed Git source updates are less likely to leave stale lock metadata, missing checkout files, or split source authority state after failures.
- `skill-flow add` and update flows recover more cleanly when network, filesystem, or rollback errors happen mid-operation.
- GitHub-hosted sources work in more environments where SSH access is not configured.

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
- `swift test`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

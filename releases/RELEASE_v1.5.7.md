# RELEASE v1.5.7

## Summary

- `v1.5.7` improves Git source update performance while preserving checkout integrity and recovery behavior.
- The release makes unchanged-remote decisions verifiable, repairs local managed state when needed, and surfaces those repairs across supported clients.

## Highlights

### 1. Safe Git source fast path

- Checks the remote default HEAD with a single five-second preflight.
- Supports both 40-character SHA-1 and 64-character SHA-256 commit IDs.
- Skips refetching only when the remote commit and every locked leaf hash still match.

### 2. Managed checkout recovery

- Repairs missing checkouts, missing `SKILL.md` files, and content drift even when the remote commit is unchanged.
- Returns stable `repaired` and `repairReason` fields and records repair outcomes in the mutation audit log.
- Reconciles enabled deployment targets after source repair.

### 3. Symlink and fallback hardening

- Preserves safe relative symlinks inside a skill leaf in content hashes.
- Rejects absolute or escaping symlinks before they can be deployed.
- Falls back to a full update with a stable diagnostic when remote preflight is unavailable.

## User-visible changes

- CLI, TUI, and macOS desktop flows report when a managed checkout was repaired and why.
- Normal update behavior and target reconciliation remain unchanged for healthy sources.

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

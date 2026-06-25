# RELEASE v1.5.1

## Summary

- `v1.5.1` fixes local scan import ownership for skills discovered outside managed Skill Flow state.
- Compared with `v1.5.0`, Skill Flow now distinguishes agent target directories from manual local directories when deciding whether to replace the original skill path with a managed symlink.

## Highlights

### 1. Agent-directory imports become managed symlinks

- Skills imported from configured agent target roots are copied into Skill Flow's managed checkout and the original agent-directory skill is replaced with a symlink to that checkout.
- This keeps agent directories aligned with Skill Flow after import instead of leaving unmanaged duplicate copies behind.

### 2. Manual local directories stay untouched

- Skills imported from ordinary local directories are still copied into Skill Flow state.
- The original manual source directory is left in place and is not replaced with a symlink.

### 3. Observed target metadata stays stable

- The symlink replacement check is limited to the import cleanup path.
- Local scan observed-target data keeps the existing path semantics used by bootstrap and reconciliation.

## User-visible changes

- Importing a skill from a Codex, Claude, Cursor, or other configured agent directory now hands that path over to Skill Flow management with a symlink.
- Importing a skill from a non-agent folder no longer mutates that folder.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `npm run -w @skill-flow/query build`
- `npm run -w skill-flow test -- src/tests/config-integration.test.ts`
- `npm run build`
- `npm test`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

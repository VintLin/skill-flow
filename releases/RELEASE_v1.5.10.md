# RELEASE v1.5.10

## Summary

- `v1.5.10` makes macOS Quit safe while managed updates or final imports are running.
- The release adds durable recovery for interrupted desktop operations without changing the public CLI/TUI command surface.

## Highlights

### 1. Safe desktop Quit

- Command-Q now freezes protected group operations, cancels active helpers, and prevents queued work from replaying.
- Durable update and final import operations recover before the next protected mutation can run.
- Discovery-only import work remains available when recovery is required.

### 2. Durable recovery journal

- Records the managed checkout, authority snapshot, target ownership, and import preparation evidence needed to compensate one interrupted source.
- Validates the complete journal before touching any recorded path.
- Rejects invalid ownership with typed recovery errors instead of using unsafe cleanup paths.

### 3. Target conflict protection

- Rechecks owned target fingerprints before restoring projections.
- Preserves external target edits and reports `RECOVERY_TARGET_CONFLICT` when recovery cannot safely overwrite them.

### 4. Helper cancellation boundaries

- Quit cancellation terminates the full helper process group after a grace period.
- Ordinary command timeouts keep the existing helper-only termination behavior.
- Desktop bridge tests now cover both paths so the two lifecycles stay separate.

## User-visible changes

- Quitting the macOS app during a managed update or final import no longer leaves the app stuck behind ambiguous partial state.
- On the next launch, Skill Flow either restores the interrupted source or keeps update/import disabled until recovery can be completed safely.
- If target files changed outside Skill Flow during recovery, the app preserves those changes and reports a recoverable target conflict instead of overwriting them.

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
- Dev `.app` package launch and import page smoke test
- Packaged helper E2E with bundled Node: import commit, bootstrap recovery, and target conflict protection
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

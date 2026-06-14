# RELEASE v1.4.4

## Summary

- `v1.4.4` fixes macOS first-run group import reliability on cold machines and slow networks.
- Compared with `v1.4.3`, desktop import bridge commands now get enough time for provider fallback, checkout preparation, and import commit work to finish or return a structured failure.

## Highlights

### 1. Import bridge requests no longer use the generic short timeout

- Import search, local scan, preview, preparation, commit, and source import commands now use a dedicated longer desktop bridge timeout.
- The timeout message reports the active timeout used by the command.
- Ordinary bridge commands keep the existing shorter timeout guard.

### 2. First-run imports can complete provider and checkout work

- Cold imports can now wait for slow provider fetches, GitHub archive download, extraction, and skill scanning instead of being killed by the desktop bridge at the generic command limit.
- The query runtime can return its normal structured success or failure payload instead of being masked by an early desktop timeout.

### 3. Recommended import cards preserve skill-detail loading

- Recommended card decoration now keeps the `needsSkillDetails` state from the base import card.
- Clicking import on a recommended card can still load skill details before sending the import draft.

## User-visible changes

- A new computer's first import is less likely to fail with a generic macOS desktop timeout while the source is still being prepared.
- Slow provider or network failures should surface as import-specific failures when possible.
- Recommended groups continue to load skill details before import even after recommendation badges and descriptions are applied.

## Release Artifacts

- `skill-flow-1.4.4.tgz`
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
- `scripts/release/release-github.sh all`

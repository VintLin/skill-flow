# RELEASE v1.6.12

## Summary

v1.6.12 fixes desktop Update All loading states so each group finishes independently while the remaining groups continue updating.

## Highlights

- Clear an individual card's loading state immediately after its update commits, fails, or is confirmed unchanged.
- Keep repair operations loading until their protected transaction finishes.
- Ignore duplicate and stale progress messages and clear outstanding states when the bridge fails or times out.

## User-visible changes

- Finished groups stop spinning before the full batch ends. Queued and actively updating groups retain their existing presentation.
- Card layout, controls, labels, and animations are unchanged.
- Update All retains one batch request, bounded source checks, and serial protected update transactions. Ordinary CLI and TUI output stays unchanged.
- Desktop update progress is an opt-in bridge event stream; existing final responses and persisted state formats are preserved.

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
- `VITEST_MAX_WORKERS=1 npm test` (all workspace packages, unchanged test assertions)
- `SKILL_FLOW_RUN_PROGRESS_E2E=1 swift test --filter BulkUpdateProgressE2ETests` covers independent completion, unchanged sources, integrity repair, failures, stale messages, timeouts, retry, and deployed content, with screenshots and event artifacts.
- Installed-app acceptance completed a real batch of 39 groups with no update failures or remaining loading states. One remote-check timeout fell back successfully; duplicate-skill warnings remained non-fatal.
- The broader Swift regression run had two existing 150 ms helper-budget timing failures; an isolated comparison against the prior bridge implementation reproduced the remaining timeout. Focused progress E2E passed after restoring and rebuilding this implementation.
- All three macOS architectures, bundle signatures, and artifact checksums are validated during packaging.

# RELEASE v1.6.19

## Summary

v1.6.19 completes built-in agent coverage for the desktop app and gives Antigravity an independent configuration entry from Gemini CLI.

## Highlights

- Adds default ordering, labels, short labels, mount paths, project paths, and theme-aware identity colors for ten built-in icon-backed agents.
- Adds separate Antigravity desktop configuration metadata while keeping its global skills directory at `~/.gemini/config/skills`.
- Detects Antigravity installations from both `~/.gemini/config` and `~/.gemini/antigravity`.

## User-visible changes

- Antigravity appears as its own selectable agent in desktop settings and group cards.
- Antigravity and Gemini CLI use separate global configuration entries, so their skills can be managed independently.
- The newly covered built-in agents show consistent names, abbreviations, paths, ordering, and light or dark theme colors in the desktop app.

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
- `swift test --package-path apps/desktop-mac` — 653 passed, 2 skipped, 0 failed
- Three-architecture artifact build, architecture validation, and code-sign verification
- GitHub Release asset and checksum verification

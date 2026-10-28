# RELEASE v1.6.16

## Summary

v1.6.16 unifies built-in source and desktop recommendation metadata, adds the new recommended Groups, preserves tag ordering, and ships the updated desktop status icons and import flow.

## Highlights

- Uses one canonical built-in source catalog for CLI, TUI, query, and macOS recommendation loading.
- Adds `agent-qa`, Vercel Skills, and Matt Pocock's engineering skills to the desktop recommendation page.
- Inserts recommendations by their existing category order instead of appending new entries at the end.
- Ships the macOS Agent and Skill click fix together with the updated queued, loading, success, timeout, and failure icons.

## User-visible changes

- Import → Recommended Download shows the new Groups in category order: creation, development, design, research, automation, and general.
- Home Group cards keep their existing configuration and now use the updated status icon states.
- Agent and Skill controls continue to accept real mouse clicks after launch.

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
- `npm test`
- Integration tests: 64 passed
- Desktop import tests: 77 passed
- Real desktop recommendation page verification after installation
- Three architecture artifact validation and code-sign verification
- `git diff --check`

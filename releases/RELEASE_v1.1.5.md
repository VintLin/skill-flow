# RELEASE v1.1.5

## Summary

- Monorepo split: `apps/cli`, `packages/core`, `packages/tui`, `packages/shared-types`, `packages/bridge`, `apps/desktop-mac`.
- Added versioned machine bridge protocol (`protocolVersion=1.0`).
- Added CLI bridge entry: `skill-flow bridge --json`.
- Added desktop macOS shell scaffold (menu bar + main window + settings + serialized mutation coordinator).

## Migration

- CLI command compatibility is preserved for existing interactive usage.
- Build/test commands move to workspace root scripts:
  - `npm run build`
  - `npm run test`
- Desktop debug helper override:
  - `SKILL_FLOW_DESKTOP_HELPER_OVERRIDE=/abs/path/apps/cli/dist/cli.js`

## Distribution Checklist

1. `npm run build && npm run test` at repo root.
2. `scripts/release/build-desktop-mac.sh` with signing env set.
3. Notarize, staple, and validate artifacts.
4. Publish DMG/ZIP and Sparkle appcast metadata.

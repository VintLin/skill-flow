# RELEASE v1.1.0

## Summary

- `v1.1.0` is the desktop and workspace refoundation release.
- The project now ships as a monorepo with a dedicated macOS desktop app, shared runtime packages, and a versioned bridge entrypoint.
- GitHub source imports now remain usable on machines without `git` by falling back to ZIP downloads.
- Desktop builds now fail with explicit dependency guidance when `node`, `git`, or `npx` is missing.

## Highlights

### 1. Monorepo split and shared runtime

- Split the project into `apps/cli`, `apps/desktop-mac`, and focused runtime packages under `packages/*`.
- Root build and test flows now run through workspace-aware scripts:
  - `npm run build`
  - `npm test`

### 2. Desktop bridge and native macOS shell

- Added the versioned machine bridge protocol (`protocolVersion=1.0`).
- Added the CLI bridge entrypoint:
  - `skill-flow bridge --json`
- Added the rebuilt macOS shell with home, import, detail, settings, and menu bar quick config flows.

### 3. Better behavior on new machines

- GitHub repositories now fall back to downloaded ZIP archives when `git` is unavailable.
- Non-GitHub Git sources still require `git` and fail explicitly instead of silently degrading.
- Desktop bridge startup now reports actionable dependency errors for:
  - `node` for the bundled helper
  - `git` for non-GitHub Git operations
  - `npx` for ClawHub imports

## User-visible changes

- Existing interactive CLI usage remains compatible.
- The desktop app now points users to the README desktop prerequisites section when required dependencies are missing.
- README and desktop packaging docs now describe the current bridge, desktop, and packaging layout.

## Migration

- CLI command compatibility is preserved for existing interactive usage.
- Build/test commands move to workspace root scripts:
  - `npm run build`
  - `npm test`
- Desktop debug helper override:
  - `SKILL_FLOW_DESKTOP_HELPER_OVERRIDE=/abs/path/apps/cli/dist/cli.js`

## Verification

- `npm run build`
- `npm test`
- `swift build` in `apps/desktop-mac`
- `swift test` in `apps/desktop-mac`

## Distribution Checklist

1. `npm run build && npm run test` at repo root.
2. `scripts/release/build-desktop-mac.sh` with signing env set.
3. Notarize, staple, and validate artifacts.
4. Publish DMG/ZIP and Sparkle appcast metadata.

# PLAN v1.3.6 - Desktop Bundled Node Runtime

## Goal

Make the macOS Desktop app work when launched from Finder without relying on a user shell `PATH`.

This fixes the common `asdf` / `nvm` failure mode where `open -a "Skill Flow"` works from a configured terminal, but double-click launch cannot find `node`.

## Scope

- macOS Desktop release packaging only.
- Keep the existing JavaScript bridge helper.
- Do not change the bridge JSON protocol.
- Do not bundle `npm` or `npx`; skills.sh imports still require a host `npx`.
- Keep system Node fallback for development and broken-package recovery.

## Implementation

1. Runtime resolution
   - Prefer DEBUG `SKILL_FLOW_DESKTOP_NODE_OVERRIDE`.
   - Then prefer `Contents/Resources/node/<arch>/bin/node`.
   - Then try `/opt/homebrew/bin/node`, `/usr/local/bin/node`, and `/usr/bin/node`.
   - Finally fall back to `/usr/bin/env node`.
   - Keep the existing missing Node error if no candidate works.

2. Release packaging
   - Pin Node.js to `v22.22.2`.
   - Download official macOS `darwin-arm64` and `darwin-x64` tarballs.
   - Verify SHA256 before staging.
   - Copy only `bin/node` and the Node license into the app bundle.
   - Stage one runtime for single-arch builds and both runtimes for universal builds.

3. Artifact validation
   - Require the bundled Node directory in packaged apps.
   - Verify each expected app architecture has a matching Node runtime.
   - Run `node --version` against every bundled runtime during validation.

4. Documentation
   - Update Desktop prerequisites to say release builds include Node.
   - Keep `git` and `npx` as external tool requirements.
   - Document the expected package-size increase and runtime update responsibility.

## Validation

- `swift test --package-path apps/desktop-mac --filter BridgeClientExecutionTests`
- `bash -n scripts/release/package-desktop-mac.sh`
- `bash -n scripts/release/validate-mac-artifacts.sh`
- Package at least one `arm64` app and validate:
  - `scripts/release/package-desktop-mac.sh --arch arm64`
  - `scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/arm64/Skill Flow.app" arm64`

## Acceptance Criteria

- Double-click launch no longer depends on shell-managed `node` paths.
- The bundled runtime is used before system Node in release apps.
- A missing or non-executable bundled runtime falls back to system Node.
- Universal packages include both `arm64` and `x86_64` Node runtimes.
- README and release notes describe the new runtime behavior.

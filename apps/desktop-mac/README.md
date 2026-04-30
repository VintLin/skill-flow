# Skill Flow Desktop (macOS)

Native SwiftUI shell for `skill-flow`.

This app is not a separate product with its own state model. It is a desktop surface over the same `~/.skillflow` state and the same runtime behavior exposed by `skill-flow bridge --json`.

## Scope

- macOS 15+
- main window UI
- import, detail, settings, and home screens
- menu bar quick config
- localized strings
- serialized mutation handling

## How It Connects

```text
SwiftUI view
  ->
ViewModel
  ->
BridgeClient
  ->
skill-flow bridge --json
  ->
shared runtime + state root
```

No separate desktop database. `manifest.json` and `lock.json` remain the single source of truth.

## Local Development

Build the CLI helper first:

```bash
npm run build
```

Then build and test the app:

```bash
cd apps/desktop-mac
swift build
swift test
```

If you need the desktop app to use a local CLI helper build:

```bash
export SKILL_FLOW_DESKTOP_HELPER_OVERRIDE=/absolute/path/to/apps/cli/dist/cli.js
```

## Packaging

Development package:

```bash
scripts/release/package-desktop-mac-dev.sh
```

Shared packager:

```bash
scripts/release/package-desktop-mac.sh --arch arm64
scripts/release/package-desktop-mac.sh --arch x86_64
scripts/release/package-desktop-mac.sh --arch universal
```

GitHub Releases helpers:

```bash
scripts/release/release-github.sh all
scripts/release/publish-github-release.sh
```

Validation script:

```bash
scripts/release/validate-mac-artifacts.sh "/absolute/path/to/Skill Flow.app" arm64
scripts/release/validate-mac-artifacts.sh "/absolute/path/to/Skill Flow.app" arm64,x86_64
```

Unsigned release-style entry:

```bash
scripts/release/build-desktop-mac.sh
scripts/release/build-desktop-mac.sh universal /absolute/path/to/output
```

## Artifacts

Packaging writes per architecture:

- `dist/desktop-mac/arm64/Skill Flow.app`
- `dist/desktop-mac/arm64/Skill-Flow-arm64.dmg`
- `dist/desktop-mac/arm64/Skill-Flow-arm64.zip`
- `dist/desktop-mac/arm64/sha256.txt`
- `dist/desktop-mac/x86_64/Skill Flow.app`
- `dist/desktop-mac/x86_64/Skill-Flow-x86_64.dmg`
- `dist/desktop-mac/x86_64/Skill-Flow-x86_64.zip`
- `dist/desktop-mac/x86_64/sha256.txt`
- `dist/desktop-mac/universal/Skill Flow.app`
- `dist/desktop-mac/universal/Skill-Flow-universal.dmg`
- `dist/desktop-mac/universal/Skill-Flow-universal.zip`
- `dist/desktop-mac/universal/sha256.txt`
- `dist/desktop-mac/sha256.txt` when packaging with `all`

## Notes

- Shared packaging keeps the internal executable name `SkillFlowDesktop` and only changes the external app bundle name to `Skill Flow`.
- `universal` packaging builds `arm64` and `x86_64` binaries separately and merges them with `lipo`.
- `release-github.sh all` builds Apple Silicon, Intel, and universal installers in one pass and reuses a single JS build across all three packages.
- `publish-github-release.sh` uploads all three architecture variants plus one merged `sha256.txt` to the GitHub release tagged with the current CLI version.
- Debug helper override is for development only.
- Mutation work is serialized to avoid apply/update/uninstall races.
- Release packages bundle Node.js `v22.22.2` under `Contents/Resources/node/<arch>/bin/node`, so Finder launch does not depend on shell `PATH`.
- The universal package carries both `arm64` and `x86_64` Node runtimes, so it is expected to be noticeably larger than single-arch packages.
- Bundled Node security updates are handled by updating the pinned runtime version and rebuilding the desktop release.
- skills.sh imports still require a host `npx`; the bundled runtime only covers the desktop bridge helper.

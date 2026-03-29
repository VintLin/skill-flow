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
scripts/release/release-github.sh
scripts/release/package-desktop-mac-zip.sh universal
scripts/release/generate-sha256.sh universal
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
- `dist/desktop-mac/x86_64/Skill Flow.app`
- `dist/desktop-mac/x86_64/Skill-Flow-x86_64.dmg`
- `dist/desktop-mac/universal/Skill Flow.app`
- `dist/desktop-mac/universal/Skill-Flow-universal.dmg`
- `dist/desktop-mac/universal/Skill-Flow-universal.zip`
- `dist/desktop-mac/universal/sha256.txt`

## Notes

- Shared packaging keeps the internal executable name `SkillFlowDesktop` and only changes the external app bundle name to `Skill Flow`.
- `universal` packaging builds `arm64` and `x86_64` binaries separately and merges them with `lipo`.
- For unsigned GitHub releases, upload the universal `.dmg`, `.zip`, and `sha256.txt` together.
- Debug helper override is for development only.
- Mutation work is serialized to avoid apply/update/uninstall races.
- Unsigned packages still expect `node` to exist in `PATH` on the target machine.

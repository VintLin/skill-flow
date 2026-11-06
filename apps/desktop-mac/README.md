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

## Packaging and release

The canonical packaging and release procedure is
[`docs/RELEASE_PROCESS.md`](../../docs/RELEASE_PROCESS.md). This README keeps only
desktop-local development instructions so release commands have one owner.

## Notes

- Debug helper override is for development only.
- Mutation work is serialized to avoid apply/update/uninstall races.

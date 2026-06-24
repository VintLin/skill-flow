# RELEASE v1.5.0

## Summary

- `v1.5.0` ships an in-app DMG update flow for the macOS desktop app and tightens import target handling.
- Compared with `v1.4.9`, Skill Flow now lets macOS users upgrade to a new release from the Settings page and stays consistent when listing import targets.

## Highlights

### 1. In-app DMG update flow on macOS

- Settings now shows the latest available release and prompts the user to install it in place.
- A new `DesktopUpdateChecker` and `DesktopUpdateInstaller` pair downloads the staged DMG, validates it, and re-launches the app once the new version is ready.
- Installer validation rejects malformed payloads and constrains the staged DMG to the expected location.

### 2. macOS import targets are more accurate

- Import target projection now matches the targets that are actually recommended to the user.
- Import target filtering keeps visible fallback targets and locally managed source targets in the picker.
- The import page keeps locally available agents selectable.

### 3. Agent icon rendering is corrected

- WorkBuddy and Kimi Code icons render with the correct asset in the macOS agent selector.

### 4. Diagnostics tolerate missing roots

- The `doctor` service no longer fails when a managed target root is missing from disk.

## User-visible changes

- macOS Settings → "Check for updates" can now download and install the next `v1.5.0` release in place, with localized confirmation in English, Simplified Chinese, and Japanese.
- The macOS import page now shows the same agent set that the underlying logic projects, including WorkBuddy and Kimi Code with their corrected icons.
- `skill-flow doctor` reports managed target status without failing when a target root has not been created yet.

## Release Artifacts

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
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

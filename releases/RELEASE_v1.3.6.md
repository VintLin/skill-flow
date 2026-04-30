# RELEASE v1.3.6

## Summary

- `v1.3.6` is a desktop packaging release focused on making Finder launch independent from shell-managed Node.js paths.
- Compared with `v1.3.5`, the macOS desktop app now bundles its own Node.js runtime for the bridge helper and tightens update feedback in desktop settings and project scope controls.

## Highlights

### 1. Finder launch no longer depends on shell PATH

- Desktop release bundles now include Node.js `v22.22.2` inside the app bundle.
- The bridge helper uses the bundled runtime before falling back to system Node.
- This fixes the common `asdf` / `nvm` case where terminal launch works but double-click launch reports a missing Node.js dependency.

### 2. Release packaging validates the bundled runtime

- The macOS packager downloads official Node.js macOS runtime archives and verifies SHA256 before staging.
- Artifact validation now checks that every packaged app architecture has a matching bundled Node runtime.

### 3. External tool requirements stay explicit

- `git` remains required for non-GitHub Git sources.
- `npx` remains required for skills.sh imports; the bundled runtime is only for the desktop bridge helper.

### 4. Application Update behavior is clearer

- Update checks now use the GitHub Releases latest redirect instead of the GitHub API endpoint.
- The settings screen now distinguishes local builds that are newer than the latest published release.
- The app no longer runs a silent update check on startup; checks run when users press the update action.

### 5. Project scope refresh is explicit

- The macOS home scope switcher now includes a compact refresh action next to `Global`.
- Refreshing projects re-runs the desktop list query and applies the latest detected project scope state.
- The refresh action uses the same loading, success, and failure toast pattern as skill group updates.

## User-visible changes

- Double-click launching Skill Flow on macOS works for users whose Node.js is installed through `asdf` or `nvm`.
- Desktop packages are larger because they include Node.js runtime files.
- Application Update no longer reports an older GitHub release as the current app version when using a newer local build.
- Users can refresh the detected project list directly from the macOS home scope bar.
- The CLI command surface and bridge protocol stay unchanged.

## Release Artifacts

- `skill-flow-1.3.6.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

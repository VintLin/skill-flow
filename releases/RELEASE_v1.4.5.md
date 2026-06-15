# RELEASE v1.4.5

## Summary

- `v1.4.5` ships the built-in `skill-flow` group as part of the installed app and CLI release payloads.
- Compared with `v1.4.4`, a fresh install now shows the `skill-flow` group on the home page automatically, with all skills and agent targets left OFF until the user enables them.

## Highlights

### 1. Installed builds now include the built-in `skill-flow` group resource

- The CLI publish tarball now includes `skills/skill-flow`.
- The macOS desktop helper bundle now includes the same built-in skill resource alongside `desktop-bridge.js`.

### 2. Home bootstrap auto-registers the built-in group

- Runtime bootstrap now registers the packaged `skill-flow` group into Skill Flow's managed local source store on first launch.
- If a managed checkout is later pruned because files are missing, bootstrap can register the built-in group again automatically.

### 3. Built-in skills stay OFF until the user enables them

- The built-in group is imported into Skill Flow state only.
- Initial bindings use `selectedLeafIds: []` and `enabledTargets: []`, so no skill is auto-enabled and nothing is deployed into local agent directories.

## User-visible changes

- Fresh installs show the `skill-flow` group on the home page without requiring a manual import step.
- The built-in group behaves like a normal local managed group inside Skill Flow.
- Users still control whether any built-in skills are enabled or deployed.

## Release Artifacts

- `skill-flow-1.4.5.tgz`
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
- `swift test --package-path apps/desktop-mac`
- `scripts/release/release-github.sh all`

# RELEASE v1.6.4

## Summary

- `v1.6.4` expands built-in Skill deployment from 22 to 32 Agent targets without changing the existing targets' order, paths, deployment strategies, or shared icon mappings.
- The macOS app now includes dedicated icons for every newly supported target, plus dedicated Pi and OpenClaw assets, and presents clearer localized operational copy.

## Highlights

### 1. Ten additional deployment targets

- Adds DeepSeek Harness, Antigravity, Junie, Mistral Vibe, OpenHands, Qoder, Qwen Code, Zencoder, Kilo Code, and Goose.
- Each target uses its declared global Skill directory and an independently documented project path.
- Project paths remain documentation for project-scope installs; the current runtime does not reinterpret them as user-level compatibility scan roots.

### 2. Complete desktop icon coverage

- Bundles the supplied Agent icons for all 10 new targets.
- Gives Pi and OpenClaw dedicated assets while leaving the existing WorkBuddy / CodeBuddy and Trae / Trae CN shared icon mappings unchanged.

### 3. Conservative Usage boundaries

- Deployment support does not imply Usage analytics support.
- The 10 new targets remain explicitly `unsupported` for Usage collection until a stable, attributable Skill invocation source is verified; Skill Flow does not report false zero-use data for them.

### 4. Clearer localized desktop copy

- Refines local discovery, maintenance actions, generic failure recovery, Usage loading and empty states, and date-range validation.
- Keeps English, Simplified Chinese, and Japanese behavior descriptions aligned.

## User-visible changes

- Users can select and deploy Skills to 32 built-in Agent targets from CLI, TUI, bridge-backed desktop flows, and Agent settings.
- New targets render with their intended icons in the macOS app.
- Existing Agent behavior and shared icon assignments remain unchanged.
- Usage surfaces mark the newly added targets as unsupported instead of inferring activity from installation directories.

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
- `swift test --package-path apps/desktop-mac --filter AgentIconTests`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

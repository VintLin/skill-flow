# RELEASE v1.3.7

## Summary

- `v1.3.7` adds first-class Hermes Agent support to Skill Flow.
- Compared with `v1.3.6`, selected skills can now be deployed directly to Hermes Agent's writable skills directory instead of requiring a custom agent entry.

## Highlights

### 1. Hermes Agent is now a built-in target

- Hermes Agent appears in the built-in target catalog with the label `Hermes Agent`.
- Skill Flow writes Hermes deployments to `~/.hermes/skills/`, matching Hermes Agent's local skills source of truth.
- The target can still be overridden with `SKILL_FLOW_TARGET_HERMES_AGENT` when a different skills root is needed.

### 2. Desktop presentation is aligned

- The macOS desktop app now includes Hermes Agent in the default agent display order.
- Hermes Agent has a dedicated bundled icon, label, and short label in desktop target lists.
- Settings and target display flows treat Hermes Agent like the other built-in agents.

### 3. Hermes-oriented source layouts are detected

- Skill Flow now recognizes `.hermes/skills` inside source repositories when scanning for skill definitions.
- This makes Hermes-ready repositories easier to import without moving files into a different agent-specific folder first.

## User-visible changes

- Users can select Hermes Agent as a normal target when applying a skill group.
- Existing custom Hermes Agent entries are no longer necessary for the standard `~/.hermes/skills/` setup.
- The CLI command surface and bridge protocol stay unchanged.
- External Hermes skill directories remain a Hermes configuration feature; Skill Flow's built-in target writes to the local Hermes skills directory.

## Release Artifacts

- `skill-flow-1.3.7.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

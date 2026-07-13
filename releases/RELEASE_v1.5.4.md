# RELEASE v1.5.4

## Summary

- `v1.5.4` improves macOS desktop multi-group workflows with a session FIFO update/import queue, shares agent display and group tags across production/dev app bundles, adds the built-in Grok Build deployment target, and tightens group-card detail navigation hit targets.
- Compared with `v1.5.3`, users can keep clicking Update/Import on many groups without waiting, desktop organization state survives package switches, and accidental whole-card detail opens are reduced.

## Highlights

### 1. Desktop Group Operation Queue

- Continuous Update and Import clicks enqueue work instead of being blocked or rejected.
- Cards show distinct **Queued** vs **Running** (`Updating` / `Downloading`) feedback.
- Same group + same operation is deduped; failures and stale targets skip without stopping the rest of the queue.
- Home **Update All** is one bulk job that absorbs matching single-group updates.
- Bridge mutations serialize instead of failing with concurrent-mutation rejection.

### 2. Shared Desktop Workspace Memory

- Agent Display Visibility and Group Tags live in a shared macOS UserDefaults suite so production and `*.dev.*` packages share organization state on one Mac.
- One-shot migration from the best legacy per-bundle store; concurrent packages use last-write-wins.

### 3. Grok Build deployment target

- Built-in target `grok-build` with managed global path `~/.grok/skills/` and documented project path `.grok/skills/`.
- Override with `SKILL_FLOW_TARGET_GROK_BUILD` when needed.

### 4. Safer group card detail open

- Detail navigation is scoped to the card header (title / byline / stats) instead of the whole card, reducing mis-taps on agents, skills, and tags.

## User-visible changes

- macOS desktop: multi-group Update/Import queue with Queued/Running card states.
- macOS desktop: tags and agent display visibility shared across app packages on the same Mac.
- CLI/desktop/TUI: Grok Build appears as a deployable agent target.
- macOS desktop: only the group card header opens the detail page.

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

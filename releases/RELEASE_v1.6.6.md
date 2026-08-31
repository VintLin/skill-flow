# RELEASE v1.6.6

## Summary

- `v1.6.6` refines the macOS Settings and Usage interfaces for clearer scrolling, selection, and Agent identification.
- Usage now applies a documented, contrast-checked Agent color system only where it improves data interpretation, while ordinary Group Card controls remain neutral.

## Highlights

### 1. Clear Agent identity in Usage

- Gives built-in Agents distinct light- and dark-theme identity colors backed by first-party visual research and recorded evidence levels.
- Uses those colors consistently for Agent series in Daily Trend and for the top-Agent ranking dots.
- Keeps unknown and custom Agents on safe fallback colors and preserves the normal SkillFlow accent for selection and interaction state.

### 2. Cleaner Usage hierarchy

- Removes the redundant chat/call-record KPI from the summary.
- Uses the current theme accent for selected Skill and Agent ranking rows instead of an indistinct gray background.
- Keeps Skill trend series on the standard chart palette so Agent identity colors do not spread into unrelated UI.

### 3. Settings and icon polish

- Extends the Settings scroll surface to the full window width so the scrollbar aligns with the window edge, matching Usage.
- Adds an independent WorkBuddy icon so WorkBuddy and CodeBuddy no longer share the same visual asset.

## User-visible changes

- The Settings scrollbar now appears against the window edge.
- Usage no longer displays the chat/call-record metric.
- Selected Usage ranking rows are easier to recognize in every accent theme.
- Codex, ZCode, WorkBuddy, and other built-in Agents use distinct colors in Usage trends and the top-Agent list.
- Group Card Agent icons remain neutral and continue to use the existing interaction styling.

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
- `swift test --package-path apps/desktop-mac`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

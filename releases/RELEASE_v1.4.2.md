# RELEASE v1.4.2

## Summary

- `v1.4.2` fixes macOS Skill group cards after rename, refresh, and relaunch so counts, author/source metadata, and original-name hints stay consistent.
- Compared with `v1.4.1`, group cards now derive visible counts from the rendered skill list and keep original-name tooltip behavior stable when users move the pointer slightly.

## Highlights

### 1. Group card counts use rendered skills

- Skill counts on macOS group cards now come from the card's current skill list.
- Cached source snapshot counts are no longer allowed to keep stale values after a group refresh or selection change.
- Detail headers use the same rendered-detail source so the count users see matches the actual visible skills.

### 2. Rename metadata stays visible

- Sparse enrichment responses now merge into existing detail enrichment state instead of replacing metadata that was already known.
- Renamed groups keep their author subtitle, source row, star/download/source indicators, and row spacing after refresh.
- Group card metadata rows remain data-driven instead of relying on fixed placeholder rows.

### 3. Original-name indicator is stable

- Renamed groups keep their original imported name across app relaunches, so the info indicator still appears when the custom display name differs.
- The original-name tooltip now sizes to its text within defined bounds and uses a popover that is not clipped by the card.
- Hover dismissal is debounced so tiny pointer movement does not repeatedly replay the tooltip animation.

## User-visible changes

- Refreshing a Skill group no longer leaves a stale skill count such as `24` when only one skill is currently shown.
- Renaming a Skill group no longer makes the card shorter by dropping the author/source information rows.
- Reopening the app still shows the original-name info icon for renamed groups.
- Hovering the info icon shows a readable tooltip without clipping or repeated animation flicker.

## Release Artifacts

- `skill-flow-1.4.2.tgz`
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

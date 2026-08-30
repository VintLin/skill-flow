# RELEASE v1.6.3

## Summary

- `v1.6.3` refines the macOS Usage dashboard and completes the current desktop localization pass.
- Usage activity is now easier to scan across a rolling year or a selected calendar year without coupling it to the Daily Trend range.

## Highlights

### 1. Year-based activity calendar

- Replaces the weekday-by-hour heatmap with a daily contribution-style calendar.
- “Current” shows the trailing 365 days, while year controls show January through December for the selected year.
- Hovering a day shows its localized date and Skill invocation count.

### 2. Clearer Usage controls and layout

- Moves Today, 24H, 7D, 30D, 90D, and Custom controls beside the Daily Trend title.
- Loads activity history independently so Daily Trend filtering does not alter the yearly calendar.
- Centers the dashboard once it reaches its maximum width while keeping the vertical scroll indicator at the window edge.

### 3. Completed desktop localization pass

- Localizes remaining interface copy, fallback Skill, Agent, project, and date labels across English, Simplified Chinese, and Japanese.
- Keeps Usage period controls and tooltip text consistent with the active desktop language.

## User-visible changes

- Users can compare the current trailing year with `2026`, `2025`, and other available calendar years.
- Usage range controls now clearly belong to the Daily Trend chart rather than the entire dashboard.
- Wide Usage windows remain visually centered and daily activity cells expose their exact count on hover.

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
- Focused macOS Usage visualization and bridge payload decoding suites
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

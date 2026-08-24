# RELEASE v1.6.0

## Summary

- `v1.6.0` adds a local-first Skill Usage analytics system to Skill Flow.
- The release identifies attributable Skill invocations from supported Agent session, database, and trace formats, stores normalized observations locally, and presents them through a new interactive macOS Usage dashboard.

## Highlights

### 1. Cross-Agent Skill Usage collection

- Adds modular collectors for supported Codex, Claude Code, ZCode, OpenCode, Pi, Kimi Code, and WorkBuddy evidence sources.
- Uses Agent-specific parsing rules instead of treating generic tool calls, prompts, task lists, or MCP calls as Skill usage.
- Includes active and archived Codex sessions and preserves parser coverage diagnostics for Agents without a safe primary counting source.

### 2. Explainable local observations

- Normalizes accepted calls into local observations with Skill, Agent, timestamp, project, session, evidence kind, and source identity.
- Counts every accepted Skill invocation in the Skill run total; unique Skill metrics remain separately de-duplicated.
- Extracts only whitelisted metadata required for attribution and does not import prompt, response, tool output, or transcript bodies into Usage storage.

### 3. Interactive desktop Usage dashboard

- Adds Today, 24H, 7D, 30D, 90D, and custom time ranges.
- Adds fixed-square hourly activity, daily trend bands, hover details, total metrics, top Skills, and top Agents.
- Skill and Agent selections update the trend chart, rankings, and per-Agent/per-Skill counts from the same filtered snapshot.

### 4. Shared analytics contract

- Adds Usage storage, analytics services, bridge commands, payload decoding, and desktop view data around one snapshot contract.
- Keeps time filtering, Skill identity, Agent aggregation, project attribution, and chart totals consistent across runtime and UI consumers.

## User-visible changes

- Users can open Usage from the macOS home toolbar and inspect how often Skills run, when they run, which projects they belong to, and which Agents invoked them.
- Users can compare overall activity or focus the dashboard on one Skill or Agent without exporting local conversation data.
- Usage totals reconcile across the chart, summary metrics, Skill ranking, and Agent ranking for the selected time range.

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

---
name: skill-flow
description: Use when the user asks Codex to inspect, import, enable, disable, deploy, update, repair, migrate, or uninstall Skill Flow skill groups through the skill-flow CLI or bridge protocol.
---

# Skill Flow

## Overview

Operate Skill Flow through its CLI without editing state files directly. Prefer the machine-readable bridge protocol for agent work; use the human CLI only for simple commands that already emit usable output.

## Core Rules

- Use `skill-flow bridge --json` for structured operations and parse the JSON response.
- Never edit `~/.skillflow`, target skill directories, manifests, locks, or source checkouts directly.
- Inspect before mutating: run `list`, `inspect`, `doctor`, or `preview-import-source` first.
- Default imports to OFF by using `enabledTargets: []` unless the user explicitly asks to deploy immediately.
- Treat skill enablement and deployment as draft state: use `apply`, not direct filesystem edits.
- Explain impact before state-changing operations; require explicit confirmation for destructive operations.

## Command Entry

Use installed CLI:

```bash
skill-flow bridge --json --request '{"protocolVersion":"1.0","command":"list"}'
```

Inside this repository, use the workspace CLI:

```bash
npm run -w skill-flow dev -- bridge --json --request '{"protocolVersion":"1.0","command":"list"}'
```

For payload details, read `references/bridge-commands.md` before crafting a bridge request.

## Workflow

1. Classify the task as read-only, normal mutation, or destructive.
2. Read current state with `list` or a narrower inspect command.
3. For imports, run preview or prepare first; build draft from returned skill selectors.
4. For enable/disable/deploy, call `apply` with full `selectedLeafIds` and `enabledTargets`.
5. For updates or repairs, run `doctor` before and after.
6. Report `ok`, warnings, errors, changed source ids, and any blocked actions.

## Safety Levels

| Level | Operations | Rule |
| --- | --- | --- |
| Read-only | `list`, `doctor`, `inspect`, `inspect-enrichment`, `search-import-groups`, `scan-local-import-groups`, `preview-import-source`, `inspect-state-migration` | Execute directly when useful. |
| Normal mutation | `bootstrap`, `commit-import-source`, `import-source`, `apply`, `update`, `toggle-pin`, `rename-source`, collections, `save-settings` | Summarize impact; proceed if the user requested that exact change. |
| Destructive/high-risk | `uninstall`, non-dry-run `migrate-state`, broad repairs such as `repair-state --all` | Require explicit confirmation after identifying exact ids and scope. |

## Common Tasks

| User asks | Do |
| --- | --- |
| "What groups do I have?" | Bridge `list`. |
| "Search for a skill" | Human CLI `skill-flow find <query> --json`, or bridge import search for remote groups. |
| "Import this repo, keep skills off" | `preview-import-source`, then `import-source` or `prepare-import-source` + `commit-import-source` with `enabledTargets: []`. |
| "Turn these skills on for Codex" | `inspect`, map names to leaf ids, then `apply` with `enabledTargets: ["codex"]`. |
| "Disable a skill" | `inspect`, remove its leaf id from `selectedLeafIds`, then `apply` with remaining ids. |
| "Why did deployment fail?" | `doctor`, then `inspect` for the affected source. |
| "Remove this group" | `list`/`inspect`, ask for confirmation, then `uninstall`. |

## Common Mistakes

- Using interactive `config` or `add` when bridge JSON can do the same job.
- Omitting `protocolVersion: "1.0"` from bridge requests.
- Passing skill names to `apply`; it requires leaf ids such as `source-id:skills/review`.
- Importing with non-empty `enabledTargets` when the user did not request deployment.
- Running `uninstall` or migration based on display names instead of exact source ids.

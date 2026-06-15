# Skill Flow Bridge Commands

Use this reference when composing `skill-flow bridge --json` requests.

All bridge requests use:

```json
{
  "protocolVersion": "1.0",
  "command": "list",
  "payload": {}
}
```

The response includes `ok`, optional `data`, `warnings`, and `errors`. Stop on `ok: false` and report every error message.

## Read-only Commands

| Command | Payload | Purpose |
| --- | --- | --- |
| `list` | omitted | List workflow summaries and current state. |
| `doctor` | omitted | Diagnose drift, missing target paths, and blocked projections. |
| `inspect` | `{ "sourceId": "...", "scope": { "kind": "global" } }` | Inspect one source/group and its draft/deployment details. |
| `inspect-enrichment` | `{ "sourceId": "..." }` | Inspect extra source metadata. |
| `search-import-groups` | `{ "query": "..." }` or omitted | Search remote/importable groups. |
| `scan-local-import-groups` | `{ "path": "/path/to/skill" }` or omitted | Find importable local groups. Explicit `path` must point to a directory containing `SKILL.md`; omit `path` to scan known local target roots. |
| `preview-import-source` | `{ "locator": "..." }` | Preview importable skills without committing. |
| `inspect-state-migration` | omitted | Check migration status. |

## Import Commands

Prepare/commit flow:

```json
{
  "protocolVersion": "1.0",
  "command": "prepare-import-source",
  "payload": { "locator": "owner/repo/path" }
}
```

Commit selected skills with targets OFF:

```json
{
  "protocolVersion": "1.0",
  "command": "commit-import-source",
  "payload": {
    "preparationId": "prep-id",
    "draft": {
      "skillSelectionMode": "selected",
      "selectedSkills": [
        {
          "uiId": "skill_review",
          "selector": { "kind": "repoPath", "path": "skills/review" }
        }
      ],
      "enabledTargets": []
    }
  }
}
```

Direct import has the same `draft` shape:

```json
{
  "protocolVersion": "1.0",
  "command": "import-source",
  "payload": {
    "locator": "owner/repo",
    "draft": {
      "skillSelectionMode": "all",
      "selectedSkills": [],
      "enabledTargets": []
    }
  }
}
```

Rules:

- Use selectors returned by preview/prepare; do not invent paths.
- Use `enabledTargets: []` unless deployment was explicitly requested.
- If `skillSelectionMode` is not `all`, provide `selectedSkills`.

## Enable, Disable, Deploy

Apply a complete draft for a source:

```json
{
  "protocolVersion": "1.0",
  "command": "apply",
  "payload": {
    "sourceId": "source-id",
    "draft": {
      "selectedLeafIds": ["source-id:skills/review"],
      "enabledTargets": ["codex"]
    },
    "scope": { "kind": "global" }
  }
}
```

Rules:

- `selectedLeafIds` is the full desired selection, not a patch.
- `enabledTargets` is the full desired target list.
- Disable all deployment targets by passing `enabledTargets: []`.
- Project scope uses `{ "kind": "project", "projectId": "..." }`; only use project ids discovered from Skill Flow state.

## Source and Collection Mutations

| Command | Payload | Safety |
| --- | --- | --- |
| `bootstrap` | omitted | Mutates local state during detection; summarize before running if user did not ask for setup/repair. |
| `add` | `{ "locator": "...", "options": {}, "applyNow": false }` | Prefer prepare mode unless user asks to apply immediately. |
| `update` | `{ "sourceIds": ["..."] }` or omitted | Omitted updates all sources. |
| `toggle-pin` | `{ "sourceId": "..." }` | State change. |
| `rename-source` | `{ "sourceId": "...", "displayName": "..." }` | State change. |
| `create-collection` | `{ "displayName": "...", "skills": [{ "sourceId": "...", "leafId": "..." }], "enabledTargets": [] }` | Confirm members before creating. |
| `merge-groups` | `{ "displayName": "...", "sourceIds": ["a", "b"], "enabledTargets": [] }` | Requires at least two non-collection source ids; confirm ids before merging. |
| `restore-collection-sources` | `{ "collectionId": "..." }` | Restores sources hidden by `merge-groups`; confirm the merged collection id. |
| `save-settings` | `{ "customTargets": [], "agentDisplayOrder": [] }` | Rewrites settings; inspect existing settings first through bootstrap/list outputs. |

## Destructive and High-risk Commands

Uninstall:

```json
{
  "protocolVersion": "1.0",
  "command": "uninstall",
  "payload": { "sourceIds": ["source-id"] }
}
```

State migration dry run:

```json
{
  "protocolVersion": "1.0",
  "command": "migrate-state",
  "payload": { "to": 2, "dryRun": true, "backup": true }
}
```

Rules:

- Never uninstall by display name; use exact source ids from `list`.
- Run migration with `dryRun: true` first.
- Non-dry-run migration requires explicit user confirmation and backups enabled unless the user explicitly disables backup.

## Human CLI Fallbacks

Use these when bridge does not expose the operation or the command already has suitable output:

```bash
skill-flow find "<query>" --json
skill-flow repair-source <sourceId>
skill-flow repair-source --all
skill-flow repair-state <sourceId>
skill-flow repair-targets <sourceId>
skill-flow update <sourceId>
skill-flow doctor
skill-flow list
```

Avoid interactive `skill-flow config` and interactive `skill-flow add` in unattended agent workflows.

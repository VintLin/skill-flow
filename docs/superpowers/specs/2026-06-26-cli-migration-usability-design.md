# CLI Migration Usability Design

## Context

Two user feedback documents from 2026-06-26 describe the same migration workflow from two angles:

- [summary feedback](../../feedback/FEEDBACK_skill-flow-user-feedback-2026-06-26-summary.md)
- [detailed feedback](../../feedback/FEEDBACK_skill-flow-user-feedback-2026-06-26-detailed.md)

The user had a list of skill group sources, imported them on a fresh Windows machine, and wanted only a small selected set to be ON for agent targets while all other groups stayed registered but OFF. The final state was achievable, but it required bridge JSON calls, direct state-file editing, manual repair, and careful interpretation of internal fields.

The core model is working: source, leaf, binding, target, manifest, lock, and repair flows can express the desired state. The problem is that common migration intents are not exposed as safe first-class CLI workflows.

## Goal

Make cross-machine skill group migration and ON/OFF management understandable from the normal CLI without requiring direct edits to `manifest.json` or bridge protocol knowledge.

This design has two implementation stages:

1. Stage 1: foundation usability commands and diagnostics.
2. Stage 2: batch manifest import workflow.

Stage 1 should land first because it solves the immediate "only these groups are ON" path and gives Stage 2 safer primitives to call.

## Non-Goals

- Do not redesign `manifest.json` or `lock.json`.
- Do not introduce a second state model for CLI usability.
- Do not treat target directories as authority.
- Do not implement Issue 8 plugin asset routing here. Non-skill assets remain separate work.
- Do not require users to use `bridge --json` for the workflows in this spec.
- Do not add a broad state editor. Commands expose specific user intents only.

## Current Pain Points

### Direct State Editing

Users currently need to edit `manifest.json` to express "only these groups are ON". This is fragile because it can produce invalid JSON, UTF-8 BOM issues, selection/lock drift, and stale target projections.

### Ambiguous ON/OFF Language

CLI concepts expose `enabledTargets`, `selectionMode`, and selected leaf IDs, while users think in terms of ON and OFF groups. `uninstall` deletes a source, which is not the same as turning a group OFF.

### Source Identity Confusion

The display name can differ from the source ID. Users need source IDs for automation, but `list` does not make them obvious enough.

### Weak PARTIAL Diagnostics

`PARTIAL` can mean different things: source warnings, invalid leaves, unmanaged external content, or target/projection warnings. The list view does not explain enough.

### Lock And Progress Opacity

Long `add` operations can hold the mutation lock while other commands appear stuck. Users need to know the active command, PID, elapsed time, and current add phase.

### Windows State Encoding

PowerShell can write JSON files with a UTF-8 BOM. Skill Flow should tolerate BOM at JSON trust boundaries and report encoding issues clearly when repair is needed.

## Stage 1 Design

### `list --ids --warnings`

`skill-flow list` gains explicit observability options:

```bash
skill-flow list --ids
skill-flow list --warnings
skill-flow list --ids --warnings
skill-flow list --json
```

`--ids` adds source IDs alongside display names:

```text
DISPLAY                         SOURCE ID                         STATUS    SKILLS  TARGETS
action-browser@vintlin          vintlin-action-browser             ACTIVE    1       codex, cline
ponytail@dietrichgebert         dietrichgebert-ponytail            ACTIVE    4       codex, cline
```

`--warnings` prints warning summaries under affected groups:

```text
agents                          wshobson-agents                    PARTIAL   158     0 targets
  warning: 1 invalid leaf
  warning: unmanaged external content in codex target
```

`--json` should expose machine-readable fields:

```json
{
  "sourceId": "vintlin-action-browser",
  "displayName": "action-browser@vintlin",
  "status": "ACTIVE",
  "selectionMode": "all",
  "selectedLeafIds": [],
  "resolvedSelectedLeafCount": 1,
  "enabledTargets": ["codex", "cline"],
  "warnings": []
}
```

The important addition is `resolvedSelectedLeafCount`. `selectionMode = "all"` with `selectedLeafIds = []` remains valid state, but CLI output should not force users to infer that meaning.

### `enable`, `disable`, And `only`

Add three user-intent commands:

```bash
skill-flow enable <sourceIds...> --targets codex,cline
skill-flow disable <sourceIds...>
skill-flow only <sourceIds...> --targets codex,cline
```

Semantics:

- `enable` sets `enabledTargets` for listed sources.
- `disable` clears `enabledTargets` for listed sources.
- `only` enables the listed sources and disables every other registered source.
- None of these commands uninstall sources.
- None of these commands delete source metadata from lock.
- Commands apply target repair or print the exact follow-up repair command if automatic repair is not selected.

Default target behavior:

- If `--targets` is provided, use those targets.
- If `--targets` is omitted for `enable`, reuse the source's existing targets if present.
- If `--targets` is omitted for `only`, reuse each listed source's existing targets; if a listed source has no targets, fail with an actionable message asking for `--targets`.

This avoids hidden target detection in bulk state changes.

### Backup And Summary

Stage 1 state-changing commands should create a backup by default before writing manifest changes.

Output:

```text
Backup: C:\Users\babybus\.skillflow.backup-20260626-143552
Enabled: 5
Disabled: 17
Managed projections changed: 742 removed, 31 created
Next: skill-flow list --ids --warnings
```

If backup creation fails, the command must fail before mutating state.

### BOM Tolerance

State JSON readers should strip a leading UTF-8 BOM before parsing authority JSON files.

If parsing still fails, the error should include:

- file path
- parse phase
- whether a BOM was detected
- suggested command or manual fix

Stage 1 does not need a standalone `repair-state-file --strip-bom` command if all JSON readers tolerate BOM. Add that command only if tests show there are non-JSON encoding problems that cannot be safely tolerated.

### Lock Owner And Progress

Mutation lock metadata should include:

```json
{
  "command": "skill-flow add jimliu/baoyu-skills --yes",
  "pid": 16680,
  "startedAt": "2026-06-26T10:47:28.000Z"
}
```

When another command waits or times out, it should print:

```text
State is locked by:
  command: skill-flow add jimliu/baoyu-skills --yes
  pid: 16680
  started: 2026-06-26 10:47:28
  elapsed: 04:31
```

`skill-flow add` should print coarse phases in non-JSON CLI mode:

```text
Resolving source...
Cloning repository...
Scanning skills...
Found 22 skills.
Resolving targets...
Writing manifest...
Repairing projections...
Done.
```

Keep progress coarse. Do not add a progress framework or animated UI for Stage 1.

## Stage 2 Design

Stage 2 adds a first-class batch import command after Stage 1 commands exist.

Working name:

```bash
skill-flow import-manifest <file> --dry-run
skill-flow import-manifest <file> --apply
```

Supported input formats should start minimal:

1. Plain text: one source locator per line.
2. JSON: structured sources with optional skills and targets.
3. Markdown table: supported after the JSON/plain text path is stable.

YAML is allowed later only if an existing dependency already supports it. Do not add a YAML dependency just for Stage 2 if JSON and Markdown cover the feedback.

JSON shape:

```json
{
  "sources": [
    { "source": "obra/superpowers", "skills": "all", "targets": ["codex"] },
    { "source": "garrytan/gstack", "skills": "none", "targets": [] }
  ]
}
```

Stage 2 options:

```bash
--dry-run
--apply
--continue-on-error
--skip-existing
--timeout-per-source <seconds>
--summary <path>
--map-path <from=to>
--skip-local-missing
```

Stage 2 summary:

```text
Backup: C:\Users\babybus\.skillflow.backup-20260626-143552
Imported: 22
Skipped existing: 3
Skipped local missing: 4
Enabled: 5
Inactive: 17
Failed: 0
Timed out: 0
Next: skill-flow list --ids --warnings
```

Stage 2 should call the same runtime primitives as Stage 1; it should not duplicate manifest-editing logic.

## Data Flow

### Stage 1 Enable / Disable / Only

```text
CLI command
  -> query runtime
  -> read manifest + lock
  -> resolve source IDs
  -> validate targets
  -> backup state root
  -> update manifest bindings
  -> apply or schedule target repair
  -> write summary
```

The mutation path should use existing runtime and storage services. Do not introduce a standalone manifest editor that bypasses runtime invariants.

### Stage 1 List

```text
CLI command
  -> query runtime list/inspect summary
  -> resolve selected leaf counts from lock inventory
  -> attach warning summaries
  -> render table or JSON
```

### Stage 2 Import Manifest

```text
CLI command
  -> parse input file
  -> normalize source entries
  -> dry-run validation
  -> backup state root
  -> import sources
  -> apply Stage 1-style target selection
  -> repair projections
  -> emit summary
```

## Error Handling

Unknown source IDs:

- Print the missing IDs.
- Suggest `skill-flow list --ids`.
- Do not mutate state.

Unknown targets:

- Print unknown target IDs.
- Print available target IDs.
- Do not mutate state.

`only` without targets:

- If any requested source has no existing targets and `--targets` is omitted, fail before mutation.
- Message: `Source <id> has no existing targets. Pass --targets codex,cline.`

Lock timeout:

- Include owner metadata when available.
- If owner metadata is missing, keep the current timeout behavior but add the lock file path.

BOM / parse errors:

- Strip UTF-8 BOM before parsing JSON.
- If parse still fails, include detected BOM status and file path.

Batch import partial failure:

- Stage 2 with `--continue-on-error` records failure per source and continues.
- Without `--continue-on-error`, stop at first failure and keep enough summary information to resume manually.

## Testing

### Stage 1 CLI Tests

- `list --ids` shows display name and source ID.
- `list --warnings` includes warning summaries.
- `list --json` includes `resolvedSelectedLeafCount`.
- `enable` sets targets without uninstalling sources.
- `disable` clears targets without deleting source metadata.
- `only` enables listed sources and disables all others.
- `only` fails before mutation if target inference is ambiguous.
- state-changing commands create backup before write.

### Stage 1 Storage Tests

- authority JSON reader accepts UTF-8 BOM.
- parse error includes path and BOM diagnostic.

### Stage 1 Lock Tests

- mutation lock writes command, pid, and startedAt.
- lock timeout output includes owner metadata.

### Stage 1 Progress Tests

- `add` reports coarse progress phases in normal CLI mode.
- JSON/bridge output remains machine-readable and is not polluted by progress text.

### Stage 2 Tests

- plain text manifest imports multiple sources.
- JSON manifest supports `skills: all` and `skills: none`.
- `--dry-run` produces no state writes.
- `--skip-existing` does not re-import existing sources.
- missing local path is skipped with `--skip-local-missing`.
- `--summary` writes a structured result.
- `--continue-on-error` reports mixed success/failure.

## Documentation Updates

Stage 1 should update:

- `README.md`
- `README.zh.md`
- `README.ja.md` if command map changes are user-visible there
- `docs/FEATURE_INDEX.md`
- release notes for the target version

Stage 2 should add:

- import manifest format examples
- Windows PowerShell examples
- rollback and backup examples

## Completion Criteria

Stage 1 is complete when a user can run:

```bash
skill-flow list --ids --warnings
skill-flow only obra-superpowers dietrichgebert-ponytail joeseesun-qiaomu-goal-meta-skill vintlin-action-browser vintlin-computer-care-skills --targets codex,cline
skill-flow list --ids --warnings
```

without editing state files or using bridge JSON.

Stage 2 is complete when a user can run:

```bash
skill-flow import-manifest skill-group-install-manifest.json --dry-run
skill-flow import-manifest skill-group-install-manifest.json --apply
skill-flow list --ids --warnings
```

and receive a summary that distinguishes imported, skipped, inactive, failed, timed out, and repaired groups.


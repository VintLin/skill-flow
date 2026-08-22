# External Source Ownership Design

## Goal

Skill Flow can catalogue a Skill installed and updated by another tool without
copying it into `~/.skillflow`, changing the installed path, projecting it to
targets, or attempting repair. The external tool remains the file owner.

## Vocabulary

- **Managed source**: current Skill Flow authority. It has a checkout under
  `~/.skillflow/source/*` and can be projected and repaired.
- **External source**: an observed, machine-local group of one or more paths
  owned by another installer. It is catalogued but never deployed by Skill
  Flow.
- **Observed path**: the selected absolute path plus its resolved `realpath`.
  The pair detects a replacement or changed symlink without conflating paths.

`SourceKind` remains transport (`git`, `local`, `clawhub`, `collection`).
Ownership is independent: existing sources default to `managed`; an adopted
source is `external` with kind `local`.

## User-facing contract

```text
skill-flow adopt <path...> [--name <name>]
skill-flow external status [sourceId]
skill-flow external update <sourceId> --confirm-external-update
skill-flow remove <sourceId>
```

- `adopt` requires existing absolute directories and at least one valid
  `SKILL.md` across the supplied paths. It does not copy, link, or write them.
- One source can observe several paths. Same-name skills are one catalogue
  entry; differing copies are reported as a warning, never resolved by Skill
  Flow.
- Existing managed symlinks into `.skillflow` are rejected. A managed source
  must first be handed off through the external tool's official reinstall
  process.
- An external source has no target toggles and is excluded from deployment,
  repair, and managed update. A managed projection that would target an
  observed external path is blocked.
- `external status` refreshes local inventory and, when configured, compares a
  local version probe with GitHub releases. Stable SemVer is the default;
  prereleases require explicit opt-in. Cached comparisons expire after one
  hour, while this command always forces a fresh comparison.
- `external update` executes only an explicitly configured, confirmation-gated
  executable-and-arguments delegate. It never constructs shell text, and a
  failed step stops the sequence without persisting output.
- Removing an external source only removes the Skill Flow registration and
  its snapshots. It never removes observed files.

## Data contract

`SourceManifestRecord` gains optional `ownership`, defaulting to `managed`.
For external sources it carries immutable observation intent: display name and
the selected/resolved paths. `SourceLockRecord` keeps the current inventory
snapshot but does not use `localPath` as a managed checkout; its external
variant records the observed paths and timestamps.

State readers normalise absent ownership to `managed`, preserving all existing
state files. New external state is validated by storage before it can become
authoritative.

## Architecture

`ExternalSourceLifecycle` is the seam for adopt, refresh, and removal rules.
It owns path validation, inventory aggregation, duplicate-path detection, and
snapshot construction. `SkillFlowApp` exposes a small facade; deployment and
checkout services never need to know external installer details.

## Acceptance tests

1. Adopting valid paths writes no `source/local/*` checkout and leaves every
   observed directory and symlink unchanged.
2. A source can aggregate two paths; content drift is visible in its snapshot.
3. Adoption rejects relative, missing, duplicate, nested, and managed-symlink
   paths, and rejects inputs with no valid skill.
4. Existing state without `ownership` remains managed after read/write.
5. Managed deployment that collides with an observed external path is blocked;
   external sources never create projections.
6. `update`, `repair-targets`, and target selection reject external source IDs;
   `external status` refreshes them without write access to observed files.
7. CLI and bridge expose the same adoption/status/update semantics. Desktop
   presents external ownership and cannot surface target deployment controls.

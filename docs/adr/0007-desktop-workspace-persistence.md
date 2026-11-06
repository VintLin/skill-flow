# Desktop Workspace Persistence in the Skill Flow State Root

## Status

Accepted

## Context

Skill Flow desktop packages currently keep cross-package presentation state in the fixed
`com.skillflow.desktop.shared` `UserDefaults` suite. That fixed suite solved Bundle ID
isolation, but it leaves durable product state outside the state root and makes concurrent
read-modify-write operations vulnerable to stale snapshots. It also duplicates Agent order:
the desktop suite stores `sortOrder`, while `preferences.json.agentDisplayOrder` is the value
used by the runtime and settings bridge.

The upgrade path must preserve existing desktop data without treating an empty or malformed
new read as proof that old data was intentionally deleted. Legacy Bundle ID domains and the
shared suite are migration inputs only; they must not remain competing writers after migration.

## Decision

Durable desktop workspace organization is stored at:

```text
~/.skillflow/desktop.json
```

The path follows `SKILL_FLOW_STATE_ROOT` in the same way as the other Skill Flow authority
files. `desktop.json` has its own `schemaVersion` and `migrationGeneration`, and contains:

```text
desktop.json
├── schemaVersion
├── migrationGeneration
├── agentDisplayVisibility      # target id -> visible
└── groupTags                   # tag definitions, group membership and tag ordering mode
```

`preferences.json.agentDisplayOrder` remains the single canonical Agent order because the
core runtime already consumes it. The desktop file stores visibility only. A desktop reorder
must update `preferences.json` through the existing bridge settings path, so the Group card,
sidebar and Settings page read the same order.

`UserDefaults.standard` remains for device-local chrome such as theme, language, window
preferences, density and auto-launch. The shared suite and legacy Bundle ID domains become
read-only migration sources. They are not deleted by this migration.

All desktop-file writes use a directory lock and temporary-file-then-rename replacement. A
read-modify-write operation reads the latest file while holding the lock. A valid existing
`desktop.json` wins over legacy sources. During migration, sources are considered in this
order: fixed shared suite, production Bundle ID domains, then development Bundle ID domains.
Values are merged by field and group key; an empty value never replaces a non-empty value.
If the new file is malformed, migration backs it up and stops instead of replacing it with an
empty file. The legacy stores remain available for manual recovery.

## Migration shape

```text
old shared suite / Bundle ID domains
             │  read-only snapshots
             ▼
      normalize + merge
             │
             ├── agent visibility -> desktop.json
             ├── group tags       -> desktop.json
             └── agent order      -> preferences.json via save-settings bridge
```

Migration is idempotent. The first successful write creates `desktop.json`; subsequent starts
read only that file. A migration backup is retained before replacing an invalid new file.

## Consequences

- Desktop state survives switching production and development packages and future bundle IDs.
- The file can be inspected and backed up together with the rest of `~/.skillflow`.
- Cross-process writes have one lock and one authority instead of last-write-wins UserDefaults.
- The bridge surface must carry Agent order writes; this is an intentional external contract
  because the runtime already owns that field.
- Existing `UserDefaults` data is not automatically reconstructed if it is already absent. The
  migration preserves data that is still present and makes future loss diagnosable.

## Rejected alternatives

- Keep using the shared suite: it leaves the state-root boundary split and does not provide a
  reliable cross-process transaction for desktop workspace data.
- Dual-write `UserDefaults` and `desktop.json`: two authorities would recreate the same stale
  snapshot problem.
- Put tags and visibility in core authority files: these fields are desktop organization state,
  while Agent order is already part of the shared runtime preference contract.

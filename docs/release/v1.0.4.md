# Skill Flow v1.0.4 Release Notes

Date: 2026-03-22
Version: `v1.0.4`

## Summary

`v1.0.4` turns `skill-flow` into a unified ingestion and bootstrap workflow.

This release focuses on one practical problem: users already have skills spread across agent directories, but the old flow still treated `add`, `config`, `update`, and startup checks as separate concerns. `v2.0.0` closes that gap.

## Highlights

### 1. Local sources are now first-class

`skill-flow` now supports local sources explicitly instead of treating them like a Git-shaped special case.

New storage layout:

```text
~/.skillflow/source/local/<source-id>/
```

This is also where unmanaged external skills are adopted when `config` detects them.

### 2. `config` now bootstraps on startup

Opening `skill-flow config` now does real startup work before entering the main UI:

```text
detect targets
  -> scan known agent roots
  -> import unmanaged skills
  -> refresh inventory
  -> normalize bindings
  -> audit projections
  -> enter config UI
```

The UI renders immediately and shows a boot log while this work runs.

### 3. Existing agent skills can be adopted into managed state

If `skill-flow` sees unmanaged skills under known agent `skills/` roots, it can import them into managed local storage.

Important rule:
- already-managed projections are skipped
- symlinked skills are recognized
- symlinks that already point into `~/.skillflow/source/*` are treated as managed state and are not imported again

### 4. `find` no longer blocks before UI render

`skill-flow find <query>` now enters the UI first, then runs the search. This avoids the old "nothing is happening" delay during slower searches.

### 5. Update behavior is now deterministic

Each source now preserves its selection intent:

- `all`
- `partial`

This means when a source gains new skills during update, `skill-flow` can decide consistently whether those new skills should be auto-selected.

## User-visible Behavior Changes

### Group naming

Display labels now show source context directly:

- local: `<name>@local`
- git: `<repo>@<owner>`
- clawhub: `<slug>@clawhub`

These are display labels only. Stable source IDs remain persistence-oriented.

### Config startup

You will now see visible boot progress before the normal config panes appear.

### External skill adoption

Existing unmanaged skills can now appear in config after bootstrap, provided they are not already managed by the current state.

## Real-state Validation Notes

This release was validated against a real user environment.

Observed result:
- bootstrap correctly detects already-managed symlinked agent skills
- those skills are skipped instead of being duplicated
- no false re-import occurred in the real `~/.skillflow` state

## Verification

Commands run:

```bash
npm run build
npm test
```

Result:

```text
57/57 tests passing
```

## Upgrade Notes

No manual migration command is required.

Recommended first run after upgrade:

```bash
skill-flow config
```

This allows the new bootstrap flow to reconcile current state, detect unmanaged external skills, and audit existing projections.

# Config State Reconciliation

Last updated: 2026-03-22

This document explains how `skill-flow` maps config state to persisted state,
why state could look inconsistent before, and what the current normalization
rules are.

## Four State Layers

`skill-flow` currently has four relevant state layers:

1. TUI draft state
2. `manifest.json`
3. `lock.json`
4. Target disk state

They are related, but they do not serve the same purpose.

## Layer Responsibilities

### 1. TUI draft state

The config UI uses this shape:

- `enabledTargets: DeploymentTargetName[]`
- `selectedLeafIds: string[]`

This is the editing model used by `ConfigApp`.

Important constraint:

- the TUI has one shared selected skill set per workflow group
- it does not model different `leafIds` per target

So from the UI's perspective, a workflow group means:

- these targets are enabled
- these skills are selected for all enabled targets

### 2. `manifest.json`

`manifest.json` stores user intent.

Relevant structure:

```json
{
  "bindings": {
    "<sourceId>": {
      "targets": {
        "<target>": {
          "enabled": true,
          "leafIds": ["<sourceId>:browse"]
        }
      }
    }
  }
}
```

Even though `manifest` stores `leafIds` per target, current config behavior
expects all enabled targets for one source to share the same `leafIds`.

That means the persisted manifest shape is more expressive than the TUI model.

### 3. `lock.json`

`lock.json` stores actual scanned and applied state.

It contains:

- `sources`: checked out source snapshots
- `leafInventory`: currently discovered valid skills
- `deployments`: saved projections to targets

This file is not the source of user intent. It is the source of actual known
inventory and deployment state.

### 4. Target disk state

This is the real directory or symlink on each target root.

Planner and doctor logic compare disk state against `lock.json`.

Disk state is the final truth for whether a projection exists right now.

## Main Read/Write Flow

### Config open

When `skill-flow config` starts:

1. `getConfigData()` forces inventory reconciliation
2. `manifest` and `lock` are loaded
3. bindings are normalized into the same model the TUI uses
4. summaries are derived from normalized data

This makes config rendering depend on one consistent state model.

### Preview

When the user changes selection in the TUI:

1. the draft stays in memory only
2. `previewDraft()` loads `manifest` and `lock`
3. bindings are normalized first
4. the draft is applied to an in-memory manifest copy
5. a deployment plan is calculated

Preview does not write filesystem state.

### Save

When the user saves:

1. `applyDraft()` reconciles inventory for the source
2. `manifest` and `lock` are loaded
3. bindings are normalized first
4. the current draft is written into manifest intent
5. planner computes actions
6. applier updates target disk state and `lock.deployments`
7. normalized manifest and updated lock are written back

## Why State Could Look Wrong Before

The main mismatch was this:

- TUI draft model: one shared `selectedLeafIds`
- persisted manifest model: separate `leafIds` per target

If persisted data ever contained different `leafIds` for different enabled
targets, config had no exact way to represent that state.

Typical bad outcome:

1. persisted `manifest` had target A and target B enabled
2. target A had one skill selected
3. target B had another skill selected
4. config loaded that into one shared draft
5. after save or refresh, the visible state looked different from what the
   user expected

That is not a rendering bug by itself. It is a state-model mismatch.

## Current Normalization Rule

Before config-related reads and writes, bindings are normalized per source:

1. collect all enabled targets
2. union all `leafIds` across those enabled targets
3. drop any `leafId` not present in current `lock.leafInventory`
4. write the same final `leafIds` back to every enabled target

So for current behavior, this:

```json
{
  "claude-code": { "enabled": true, "leafIds": ["group:browse"] },
  "codex": { "enabled": true, "leafIds": ["group:review"] }
}
```

is normalized to:

```json
{
  "claude-code": { "enabled": true, "leafIds": ["group:browse", "group:review"] },
  "codex": { "enabled": true, "leafIds": ["group:browse", "group:review"] }
}
```

This matches the only state shape the current TUI can represent.

## Relationship With Inventory Reconciliation

`reconcileInventory()` may remove stale `leafIds` from bindings when those
skills are no longer present in `lock.leafInventory`.

That behavior is expected and necessary.

The important part is ordering:

- reconcile inventory first
- normalize bindings second
- render or save third

Without that ordering, config can show stale selections or write back an
incompatible state shape.

## Current Invariant

For the current config implementation, one workflow group should satisfy this
invariant:

- every enabled target under the same source has the same `leafIds`

If product requirements later need per-target skill selection, the TUI state
model must change first. Until then, normalization is the correct behavior.

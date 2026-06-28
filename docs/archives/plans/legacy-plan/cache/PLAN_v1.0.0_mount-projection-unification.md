# Mount Projection Unification Plan

## Goal

Unify skill mount ownership into one explicit ledger so `applyDraft`, `uninstall`, `pruneMissingCheckouts`, `repairTargets`, and `doctor` stop inferring target paths from multiple partial state shapes.

The design must:

- keep the implementation simple and explicit
- remove mixed ownership bugs at the root
- preserve current target-root safety guarantees
- make shared-path behavior deterministic

## Problem

Mount ownership is currently split across three state shapes:

- `manifest.bindings` stores desired enabled targets
- `lock.deployments` stores managed projections
- `lock.sources[].importedFromTargets` stores bootstrap-imported ownership implicitly

That split causes three classes of bugs:

1. lifecycle drift
   `uninstall`, `applyDraft`, `prune`, and `repairTargets` do not clean or rebuild the same objects
2. path deletion drift
   shared paths can be deleted too early because one flow checks owners and another flow guesses candidate paths
3. bootstrap drift
   bootstrap-detected imports are not first-class projections, so they are skipped or reconstructed inconsistently

## Existing Reusable Parts

- [runtime.ts](/Users/Vint/Repos/03_Project/skill-flow/packages/query/src/runtime.ts)
  Serial mutation entrypoints and lifecycle orchestration already exist.
- [deployment-planner.ts](/Users/Vint/Repos/03_Project/skill-flow/packages/core-engine/src/services/deployment-planner.ts)
  Existing naming, collision, and relocation rules should stay.
- [deployment-applier.ts](/Users/Vint/Repos/03_Project/skill-flow/packages/core-engine/src/services/deployment-applier.ts)
  Existing target-root safety checks should stay.
- [workspace-bootstrap-service.ts](/Users/Vint/Repos/03_Project/skill-flow/packages/core-engine/src/services/workspace-bootstrap-service.ts)
  Existing external scan and origin extraction should stay.

## Target Architecture

### Single Fact Source

Replace split mount ownership with one explicit ledger in lock state:

```ts
type ProjectionRecord = {
  sourceId: string
  leafId?: string
  target: DeploymentTargetName
  targetRootPath: string
  targetPath: string
  strategy: "symlink" | "copy"
  mode: "managed" | "bootstrap-imported"
  status: "active"
  contentHash?: string
  appliedAt: string
}
```

`lock.projections` becomes the only authority for "what path is currently owned by which source on which target".

`lock.deployments` and `lock.sources[].importedFromTargets` are migration inputs only and must be removed after migration.

### Ownership Rules

1. Every path under a managed target root is deleted only through ledger-based ownership checks.
2. A path is removed from disk only when its last active projection owner disappears.
3. `managed` projections are desired state and can be recreated by repair flows.
4. `bootstrap-imported` projections are observed state and are not recreated by repair flows if the path disappears.
5. Shared roots and mixed ownership use the same remaining-owner rule. No special case for bootstrap imports.

### Projection Granularity

Projection ownership is always leaf-level.

Rules:

- every projected skill path maps to one or more leaf-level projection owners
- do not introduce source-level or group-level path ownership records
- do not use `source.displayName` as a second ownership shape
- owner counting, rename, remove, and repair must all operate on leaf-level projections only

This avoids mixed ownership granularity where one path is tracked sometimes as a whole source and sometimes as an individual leaf.

### Data Flow

```text
manifest.bindings
    │
    ├── desired managed projections
    │
bootstrap scan
    │
    └── observed bootstrap-imported projections
              │
              v
        lock.projections
              │
              ├── planner diff
              ├── applier filesystem mutations
              └── last-owner deletion guard
```

### Bootstrap Detection

Bootstrap detection must materialize explicit projection records instead of only recording target names.

Grouping must be based on:

- resolved real path
- content hash

It must not group by `entry.name + hash`, because one physical skill can appear under multiple entry names across agent roots.

Bootstrap ownership must be claimed only from explicit observation.

Rules:

- a bootstrap-imported projection may be created only from a path that was explicitly observed during scan
- an already-recorded bootstrap-imported projection may be retained only if the recorded path is still observed or still exists under the same managed root
- do not claim bootstrap ownership from projected-name candidates or source display names alone
- if no explicit observation exists, treat the path as foreign content until a future scan confirms it

This keeps bootstrap ownership conservative and prevents the ledger from silently adopting unrelated directories that merely look like projected names.

### Bootstrap Observation Granularity

Projection ownership remains leaf-level, so bootstrap observation must not introduce a second source-level ownership model.

Allowed end states:

- preferred: bootstrap observations become leaf-scoped and map directly to leaf-level projection records
- acceptable migration constraint: bootstrap-detected sources are restricted to single-leaf shape until leaf-scoped observations exist

Forbidden state:

- source-level bootstrap observations that are later expanded into multiple leaf owners by inference

If bootstrap import ever needs multi-leaf support, the scan result must record enough identity to map each observed path to one concrete leaf.

### Bootstrap Stale Reconciliation

Bootstrap-imported projections are observed state, so stale observations must be removed eagerly.

Rules:

- if a bootstrap scan no longer observes a previously recorded bootstrap-imported projection, mark it stale in the same reconciliation pass
- if the recorded target path no longer exists, remove the stale projection record
- if the path still exists but no longer matches the observed bootstrap-imported source identity, treat it as foreign content and remove only the stale record
- do not keep stale bootstrap-imported projection records waiting for manual cleanup
- do not recreate missing bootstrap-imported paths during repair flows

This keeps observed ownership aligned with what the scan actually sees and prevents stale bootstrap owners from blocking later deletes or renames.

## Lifecycle Semantics

## State Layers

The system should distinguish between two different kinds of state:

- `manifest`
  - desired state
  - user intent
  - source identity
  - enabled targets
  - selection state
- observed local state
  - checkout inventory
  - projected target paths
  - bootstrap-imported observations
  - drift and missing-path facts

Rules:

- user intent is not reconstructed implicitly from disk during normal operation
- observed local state may be rebuilt from local files and target roots
- `lock.projections` should converge toward observed state, not become a second desired-state layer
- `lock.deployments` remains only a compatibility view during migration
- compatibility fields must not remain in normal business logic after migration completes

This keeps the system simple:

- `manifest` answers "what should be enabled"
- local scan answers "what is on disk now"

## State Rebuild Mode

User intent may be reset, but only through an explicit rebuild flow.

The default runtime behavior must preserve `manifest` and treat it as the desired-state source.

Add an explicit rebuild mode with these semantics:

- discard legacy deployment metadata and stale observed state
- rescan local source checkouts and target roots
- rebuild observed state from local files
- keep or regenerate source identity only when it can be derived deterministically
- classify ambiguous paths as unmanaged or needing confirmation

Non-goals for rebuild mode:

- do not silently infer that every observed mount is desired user intent
- do not silently re-enable targets the user may previously have disabled
- do not overwrite `manifest` during normal boot

This gives the system a clean recovery and migration path without making normal operation surprising.

### applyDraft

- derive desired `managed` projections from `manifest.bindings`
- diff against `lock.projections`
- disable target by removing matching projection owners from the ledger
- delete target path only if no active owner remains

### Source Update Semantics

`updateSources` must not mutate target paths incrementally while inventory is changing.

It must always run as:

```text
refresh checkout
  -> rescan inventory
  -> derive next desired managed projections
  -> diff next desired projections against lock.projections
  -> apply create/update/remove actions
```

Cases:

- repo adds a skill
  - create a new `managed` projection if the source-target binding should project it
- repo removes a skill
  - remove that projection owner from the ledger
  - remove the disk path only if no other owner remains
- repo renames a skill
  - model as old projection remove plus new projection create
  - do not delete the old path early if another owner still uses it
- repo changes skill contents without renaming
  - update the existing managed projection in place
  - do not drop and recreate a shared path unless the planner explicitly needs a rename

The planner must decide from a full before/after diff. It must not delete on the fly during inventory refresh.

### uninstall

- remove all projection records for the source, both `managed` and `bootstrap-imported`
- keep disk path when another owner still exists
- remove the source only after projection cleanup finishes

### pruneMissingCheckouts

- when checkout is missing, remove all projections for that source from the ledger
- for each projection path inside the managed root, apply the same last-owner deletion rule
- never guess candidate paths from names

### repairTargets

- rebuild only missing `managed` projections whose targets are still enabled
- do not recreate missing `bootstrap-imported` paths
- remove stale bootstrap-imported records when the observed path is gone

### doctor

- audit the ledger against disk state
- classify drift by projection mode
- report:
  - missing managed projection
  - stale bootstrap-imported projection
  - unsafe path outside managed root

## Planner and Applier Changes

### Planner

The planner should produce actions only from ledger diff, not from mixed lock state and ad-hoc bootstrap cleanup.

Rename and update must be expressed as:

- create or update the next target path
- remove the old projection owner separately

`previousTargetPath` should not remain a special deletion side effect in the applier.

### Applier

The applier should:

- enforce root safety for every create, update, remove, and relocation
- use a single remaining-owner check for all path deletions
- delete old paths only through explicit remove actions derived from the ledger

## Migration Plan

### Phase 1. Schema and read-path dual support

- add `lock.projections`
- read from both legacy fields and new ledger
- write new mutations into `lock.projections`
- keep legacy fields only for migration compatibility during the phase

### Phase 2. Bootstrap materialization

- change bootstrap scan to emit explicit `bootstrap-imported` projection records
- stop relying on `importedFromTargets` for lifecycle cleanup
- group bootstrap entries by `realpath + contentHash`

### Phase 3. Lifecycle unification

- rewrite `applyDraft`, `uninstall`, `pruneMissingCheckouts`, `repairTargets`, and `doctor` to operate only on the ledger
- remove `cleanupImportedTargetPaths()`
- remove ad-hoc imported candidate path inference

### Phase 4. Planner and applier cleanup

- remove `previousTargetPath` deletion side effect
- make rename/update flow produce explicit remove actions
- keep one shared last-owner deletion guard

### Phase 5. Legacy field deletion

- remove `lock.deployments`
- remove `lock.sources[].importedFromTargets`
- remove fallback read paths and migration helpers
- keep compatibility logic only in a single migration boundary until this phase lands

## Test Mapping

This plan must close the scenarios documented in [mount-lifecycle-matrix.md](/Users/Vint/Repos/03_Project/skill-flow/docs/test/mount-lifecycle-matrix.md).

Highest-priority regression tests:

- `B05`
- `B07`
- `S07`
- `C05`
- `P01`
- `R03`

Expected simplification after unification:

- `B05`, `S07`, and `C05` all reduce to the same last-owner deletion rule
- `P01` stops needing candidate-path reconstruction because prune walks explicit projection records
- `R03` becomes explicit policy instead of accidental omission

## Failure Modes

| Failure mode | Test required | Error handling | User-visible result |
|---|---|---|---|
| Shared path deleted while another owner still exists | Yes | Required | Critical if silent |
| Bootstrap-imported path not cleaned on uninstall | Yes | Required | Critical if silent |
| Missing checkout prunes source state but leaves imported mount behind | Yes | Required | Critical if silent |
| Rename removes old shared path too early | Yes | Required | Critical if silent |
| Bootstrap scan fragments one physical skill into multiple sources | Yes | Required | High |
| Repair recreates bootstrap-imported path that should stay observed-only | Yes | Required | Medium |

## Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Schema and ledger helpers | `packages/domain`, `packages/storage`, `packages/query` | — |
| Bootstrap materialization | `packages/core-engine`, `packages/query` | Schema and ledger helpers |
| Planner and applier unification | `packages/core-engine` | Schema and ledger helpers |
| Lifecycle rewrite | `packages/query` | Bootstrap materialization, planner and applier unification |
| Regression suite | `apps/cli`, `packages/query`, `packages/core-engine` | Lifecycle rewrite |

Parallel lanes:

- Lane A: schema and ledger helpers
- Lane B: planner and applier unification, after Lane A
- Lane C: bootstrap materialization, after Lane A
- Lane D: lifecycle rewrite, after Lane B and Lane C
- Lane E: regression suite, after Lane D

Execution order:

Launch Lane A first. Then launch B and C in parallel. Merge both. Then D. Then E.

## Not In Scope

- changing user-facing `manifest.bindings` format
- adding filesystem watchers or background sync
- redesigning cross-process locking
- changing target naming rules beyond what is needed for ledger unification
- broad refactors outside mount lifecycle and projection ownership

## Success Criteria

The work is complete when:

- every mount path owner is represented explicitly in one ledger
- lifecycle operations no longer infer bootstrap target paths from naming candidates
- bootstrap ownership is derived only from explicit observation or an existing confirmed projection
- bootstrap observation does not rely on source-level inference to fabricate multiple leaf owners
- shared-path deletion is guarded by one owner-count rule everywhere
- bootstrap-imported projections have documented repair semantics
- compatibility reads for `lock.deployments` and `importedFromTargets` no longer exist in business logic
- the high-priority matrix cases pass with automated tests

# Desktop Quit Operation Recovery Design

## Goal

Make quitting the macOS application safe while a managed group Update, Bulk
Update, or final Import is running. A later launch must either observe the last
completed group state or finish recovering the one incomplete group before new
protected mutations begin.

## Scope

Protected operations:

- managed single-group Update;
- managed Bulk Update, with a commit point per group;
- final Import commit.

Import search, preview, and preparation may be cancelled and their interrupted
temporary data cleaned without a full transaction. Pin, rename, apply,
uninstall, collection, settings, migration, doctor, and external-source
operations retain their existing behavior.

## Interfaces And Seams

### Desktop queue shutdown

The Group Operation Queue remains a session FIFO with one running slot. Its
shutdown interface atomically:

1. refuses new operations;
2. removes Queued operations;
3. exposes the Running operation until cancellation and recovery finish;
4. prevents `drain()` from scheduling more work.

Queued and Running work is never resumed. If Quit was cancelled after recovery
failed, protected operations remain disabled. A later successful in-app
recovery may reopen a fresh empty session queue.

### Operation recovery module

One deep module owns the durable journal and recovery state machine. Callers
can begin a protected group mutation, advance durable stages, commit it, or
recover the unfinished operation. Callers do not read or edit journal files.

The journal is stored separately from authority files and
`.skillflow-migration.json`. It contains an operation identifier, operation
kind, source identifier, phase, managed checkout recovery paths, the authority
snapshot needed for compensation, and owned-target fingerprints and recovery
paths.

Journal writes use the repository's normal atomic file replacement guarantees.
They do not promise file-and-directory fsync durability across sudden power
loss.

### Helper cancellation

BridgeClient owns a registry of the active helper for protected operations.
Application termination sends cooperative termination and waits up to five
seconds. If the helper remains alive, the whole process group is killed so Git
or archive grandchildren do not continue after the desktop exits.

The registry also latches termination before a protected helper starts. If a
short non-protected mutation currently owns the Serial Mutation Channel, it is
allowed to finish normally; the queued Update or Import is then rejected before
launch instead of killing the unrelated helper.

There is no public bridge command change. The Node bridge handles termination
inside the running helper; bootstrap invokes recovery before normal workspace
cleanup.

### Application termination

An AppKit termination coordinator returns `terminateLater` only when a
protected Group Operation is active. It freezes the queue, presents a stopping
and recovery state, and replies to the pending termination request after
recovery succeeds. Failure keeps the application open with Retry Recovery and
Cancel Quit actions. Cancel Quit leaves a visible Recovery Required state and
keeps Update and Import disabled; a later Quit cannot bypass the unfinished
journal.

## Per-group commit contract

A managed group is committed only when all of the following describe the same
version:

1. canonical managed checkout;
2. manifest and lock authority state;
3. Skill Flow-owned target projections.

Bulk Update remains one bridge command and one desktop Group Operation. The
runtime advances one source through the complete per-group transaction before
starting the next source. On cancellation, earlier committed sources remain;
the current source is recovered.

Final Import uses the same commit contract. If no source existed before the
operation, recovery removes the incomplete managed source registration and its
owned projections while restoring any managed path moved aside by the import.

## Ownership and conflicts

- Managed checkout validation from the Git source update boundary remains
  mandatory before staging, replacement, or recovery.
- `ownership: "external"` sources never enter this transaction path.
- Target directories are projections, not authority. Recovery evidence covers
  only paths the planner classified as Skill Flow-owned.
- Before restoring an owned target, recovery compares its current fingerprint
  with the value produced by the interrupted operation. A mismatch is a
  recovery conflict and is never overwritten automatically.

## Bootstrap ordering

Bootstrap performs these steps in order:

1. acquire the mutation lock, reclaiming a dead helper's lock by the existing
   PID rules;
2. inspect and recover any unfinished operation journal;
3. stop with a structured recovery conflict if compensation cannot complete;
4. only then run missing-checkout pruning and ordinary bootstrap reconciliation.

Successful recovery deletes operation backups and the journal. It never
re-enqueues or resumes the interrupted operation. When the user previously
cancelled Quit, success also clears the desktop cancellation latch and opens a
fresh empty queue so new work can be requested normally.

## Compatibility updates

- ADR 0002's v1 `no cancel` decision is superseded only for application Quit.
- The import timeout design's OS-cleanup fallback is superseded by process-group
  termination for protected operations.
- Git update time budgets remain unchanged; application Quit has its own
  five-second cooperative cancellation grace period.
- Bridge protocol 1.0 command names and payloads remain unchanged.

## Acceptance tests

1. Queue shutdown drops Queued operations and cannot restart draining until a
   recovery succeeds after the user has cancelled Quit; reopening starts with
   an empty queue and never replays the interrupted work.
2. Quit with no protected operation terminates immediately.
3. Quit with a Running operation enters delayed termination and displays
   stopping/recovery feedback.
4. A cooperative helper exits during the grace period without forced kill.
5. An unresponsive helper and its descendant process are terminated after the
   grace period.
6. Cancellation before and after every checkout replacement stage restores the
   previous managed group.
7. Cancellation during authority promotion or target deployment restores the
   previous managed group.
8. Bulk Update preserves previously committed groups and restores only the
   current incomplete group.
9. Final Import recovery removes an incomplete new group and restores owned
   target paths.
10. Import preparation cancellation cleans interrupted preparation while
    preserving reusable Ready preparation records.
11. A target fingerprint mismatch blocks recovery without overwriting the path.
12. Bootstrap recovers an unfinished journal before missing-checkout pruning.
13. Recovery success clears backups and journal; failure keeps protected
    mutations disabled and supports retry.

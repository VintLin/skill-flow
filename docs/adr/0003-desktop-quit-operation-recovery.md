# Desktop Quit Operation Recovery

## Context

The desktop Group Operation Queue is session-scoped. Queued Update and Import
operations are intentionally not durable, but a running operation can cross
several filesystem commits: managed checkout replacement, authority state
writes, and target projection reconciliation. Terminating the desktop helper
between those commits can leave a managed group inconsistent on the next
launch.

ADR 0002 deliberately omitted cancellation from the first queue version. This
ADR adds a narrower capability: cancellation only while the macOS application
is terminating. It does not add a task panel, resumable work, or a general
Cancel action.

## Decision

- Command-Q and the application Quit menu freeze the Group Operation Queue,
  discard Queued operations, cancel all disposable preparation tasks, and
  cancel the single durable Running commit. Closing the main window does not
  cancel work.
- A completed operation remains committed. During Bulk Update, groups that
  reached their per-group commit point remain committed; only the current
  incomplete group is recovered.
- A group reaches its commit point only after its managed checkout, authority
  state, and owned target projections are mutually consistent.
- Import search, local scan, preview, and preparation remain disposable work.
  Final import commit and managed update use durable operation recovery.
- Quit first stops all active durable and disposable helper process groups. It
  waits five seconds after cooperative termination, then kills survivors.
  Ordinary command timeout retains the upstream helper-only behavior.
- A recovery journal is written before protected mutation. It records recovery
  evidence, not work to resume. No Queued or Running operation is replayed.
- Bootstrap recovers an unfinished journal before checkout pruning or new
  mutations. Normal quit and process-crash recovery are supported; sudden
  power loss remains best effort and does not carry an fsync-level guarantee.
- Recovery validates every journal path and its semantic ownership before path
  I/O, then restores managed checkout, authority state, and only Skill
  Flow-owned target projections in that order. It never adopts,
  overwrites, or removes externally owned source paths.
- If an owned target no longer matches the fingerprint written by the running
  operation, recovery reports a conflict instead of overwriting the external
  change.
- Successful recovery completes the pending Quit request. Failed recovery
  blocks normal termination and offers Retry Recovery or Cancel Quit; protected
  mutations remain disabled until recovery succeeds. If Quit was cancelled,
  successful recovery reopens a fresh empty session queue without replaying
  discarded or interrupted work.
- Cancellation uses process signals and bootstrap recovery. The public bridge
  protocol gains no cancel or recover command.
- Bulk Update validates the complete selected source list before starting its
  existing per-group transactions.
- Recovery Required permits import discovery queries but blocks preparation,
  final Import, and Update. Disposable-only cleanup failure does not block Quit
  and is retried during bootstrap.
- Migration is recovery-aware under the schema-independent mutation lock:
  current V2 recovers first, V1 plus an active journal is rejected, and dry-run
  remains read-only.

## Consequences

- The queue stays session-scoped. Preparation may overlap within ADR 0002's
  bound, while durable commits remain FIFO and single-flight.
- `no cancel` in ADR 0002 is superseded only for application termination.
- Recovery state is an internal durable implementation detail, separate from
  Shared Skill State authority files, migration markers, and Desktop Workspace
  Memory.
- Managed update and final import require a per-group transaction seam that
  keeps checkout backups until authority and deployment commit together.
- Process-group termination applies only to application Quit. Ordinary timeout
  continues to terminate only the helper process.
- CLI and TUI behavior and external-source lifecycle rules remain unchanged.

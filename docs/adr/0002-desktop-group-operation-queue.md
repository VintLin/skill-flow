# Desktop Group Operation Queue (bounded preparation, serial commit)

Desktop users need to click Update/Import on many skill groups without waiting for each to finish. The bridge previously used a single-flight `MutationCoordinator` that **rejected** concurrent mutations (`concurrentMutationRejected`), and import UI enforced a single `importingImportGroupId`. We replace that with a **Session-Scoped Group Operation Queue**: FIFO serial commit of Update and Import (plus other writes on the same Serial Mutation Channel), with per-card Queued/Running feedback and a bounded pool for isolated read/download preparation. It is not a durable job manager.

## Considered Options

- **Global FIFO queue + bounded preparation + serial mutation channel (chosen)** — overlaps isolated network/read work while preserving engine locks, recovery boundaries, click-order commits, and card-level feedback.
- **True parallel mutation workers** — faster wall-clock potential, but fights file locks and multiplies failure/partial-state surface.
- **Keep reject + disable other cards** — simplest code, poor multi-group UX (current pain).
- **Persist queue across restarts** — download-manager complexity; rejected for first version (session-scoped only).

## Consequences

- `MutationCoordinator` must wait/queue rather than throw on overlap.
- Import no longer disables sibling import buttons; it enqueues.
- Up to three queued imports may prepare disposable checkouts before their FIFO
  commit turn. Preparation never writes authority state or target projections.
- Update All is one Bulk Update job that absorbs matching single-group Updates.
- Bulk Update checks remote Git revisions with at most three concurrent reads,
  then performs required protected updates serially in selection order.
- Quit cancels all disposable preparation tasks, while at most one durable
  commit owns the recovery journal.
- CLI/TUI unchanged; no general Cancel action, no task panel, and no end-of-queue
  summary toast in v1. Application-termination cancellation is defined by
  [ADR 0003](0003-desktop-quit-operation-recovery.md).

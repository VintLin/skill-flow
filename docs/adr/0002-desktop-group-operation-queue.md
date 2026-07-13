# Desktop Group Operation Queue (serial, not concurrent-reject)

Desktop users need to click Update/Import on many skill groups without waiting for each to finish. The bridge previously used a single-flight `MutationCoordinator` that **rejected** concurrent mutations (`concurrentMutationRejected`), and import UI enforced a single `importingImportGroupId`. We replace that with a **Session-Scoped Group Operation Queue**: FIFO serial execution of Update and Import (plus other writes on the same Serial Mutation Channel), with per-card Queued/Running feedback—not parallel downloads and not a durable job manager.

## Considered Options

- **Global FIFO queue + serial mutation channel (chosen)** — matches engine mutation locks, minimal concurrency risk, allows continuous enqueue with card-level feedback.
- **True parallel N workers** — faster wall-clock potential, but fights file locks and multiplies failure/partial-state surface.
- **Keep reject + disable other cards** — simplest code, poor multi-group UX (current pain).
- **Persist queue across restarts** — download-manager complexity; rejected for first version (session-scoped only).

## Consequences

- `MutationCoordinator` must wait/queue rather than throw on overlap.
- Import no longer disables sibling import buttons; it enqueues.
- Update All is one Bulk Update job that absorbs matching single-group Updates.
- CLI/TUI unchanged; no cancel, no task panel, no end-of-queue summary toast in v1.

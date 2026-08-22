# Desktop Quit Operation Recovery Design

## Goal

Make macOS application Quit safe while managed Update or final Import work is
running. A later launch observes the last committed group state or completes
compensation for the one incomplete group before another protected mutation.

## Operation classes

- **Durable mutations:** managed single/Bulk Update and final Import commit.
  These use the recovery journal.
- **Preparation:** import checkout preparation. It is disposable and does not
  use the durable journal.
- **Disposable queries:** import search, local scan, and preview. Their helper
  work may be stopped and their interrupted temporary data cleaned.
- Other commands retain their existing behavior and serial-mutation rules.

The public CLI/TUI command surface is unchanged. The desktop always performs
final Import as `prepare-import-source` followed by `commit-import-source` so
the durable boundary is explicit. The existing public `import-source` direct
fallback remains available to non-desktop callers.

## Desktop queue and helper shutdown

Quit is Command-Q or the application Quit menu, not main-window closure. It
atomically refuses new Group Operations, discards Queued work, and retains the
Running identity until cancellation and recovery finish. Work is never resumed
or replayed.

`BridgeClient` tracks all active helpers, not only one process. Each helper is
registered with its operation class before launch can cross the termination
latch. On Quit, all active durable, preparation, and disposable-query helpers
are stopped before recovery begins. Cooperative shutdown sends TERM to each
helper process group; after five seconds, any surviving group is killed.

This process-group behavior is Quit-only. An ordinary command timeout preserves
the upstream helper-only contract: terminate the helper, wait its existing
grace period, then force-kill that helper if needed. Ordinary timeout does not
newly kill descendant processes.

Quit is delayed whenever protected queue work or any cancellable helper is
active. Disposable-only cleanup is best effort: cleanup failure does not block
Quit and bootstrap retries it next launch. Durable recovery failure keeps the
application open. If the user cancels Quit, the app enters **Recovery
Required**: search, local scan, and preview remain available; preparation,
final Import, and Update are rejected until recovery succeeds.

## Durable transaction contract

A managed group commits only when these describe the same version:

1. canonical managed checkout;
2. manifest and lock authority state;
3. Skill Flow-owned target projections.

Bulk Update performs one complete transaction per source. Before the first
transaction, the runtime preflights the entire selected source list. Therefore
an invalid later source cannot leave earlier sources updated. Once preflight
succeeds, earlier committed sources remain committed if a later source is
interrupted; only the current source is recovered.

Final Import has the same contract. Recovery removes an incomplete new source
registration and owned projections while restoring the prepared checkout.

## Journal ownership and validation

The private `recovery/active.json` journal is separate from authority files and
`.skillflow-migration.json`. It records an operation/source identity, managed
source kind, phase, validated authority snapshot, checkout ownership, target
IDs and ownership, fingerprints, backups, and any prior import-preparation
record. It stores compensation evidence, never resumable work.

Before reading fingerprints, deleting, moving, or restoring any journal path,
recovery validates the complete journal:

- the authority snapshot satisfies current state invariants;
- source kind is managed (`git`, `local`, or `clawhub`), matches the source, and
  is not external or a collection;
- checkout identity resolves to the canonical managed checkout and agrees with
  lock authority;
- every target belongs to its recorded target ID and is inside that target's
  currently re-detected built-in or custom root;
- an import-preparation checkout equals the cache path assigned to its
  preparation ID and matches the journal source identity.

Invalid structure returns `RECOVERY_JOURNAL_INVALID`; invalid semantic path
ownership returns `RECOVERY_PATH_OWNERSHIP_INVALID`. Neither case supplies a
path to cleanup code. Target fingerprints are then checked as a second guard;
an external mismatch returns `RECOVERY_TARGET_CONFLICT` and is not overwritten.
Journal replacement is atomic but does not claim file-and-directory fsync
durability across sudden power loss.

## Recovery and migration ordering

Under the schema-independent mutation lock, bootstrap/recovery performs:

1. read and validate the whole journal and authority snapshot;
2. stop/clean interrupted disposable preparations;
3. verify every owned-target fingerprint;
4. restore the managed checkout;
5. restore authority state;
6. restore owned targets and any prior preparation record;
7. clear backups and journal;
8. only then prune missing checkouts and reconcile normally.

State migration follows the same boundary. Dry-run migration is strictly
read-only and does not acquire the lock or recover. For current V2 state,
migration entry first recovers an active journal before reporting that state is
current. A V1 state plus an active journal is an inconsistent unsupported
combination and migration stops without changing either file. Normal bootstrap
still performs its recovery check, making recovery idempotent across entry
points.

## Compatibility

- ADR 0002's `no cancel` decision is superseded only for application Quit.
- Existing timeout budgets stay unchanged; Quit has its own five-second group
  cancellation grace period.
- Bridge protocol command names and payload shapes remain unchanged.
- CLI/TUI flows and external-source lifecycle behavior remain unchanged, while
  shared managed transaction and recovery invariants apply wherever invoked.

## Acceptance tests

1. Queue shutdown drops Queued work and cannot restart until durable recovery
   succeeds; no interrupted work is replayed.
2. Quit is immediate with no protected queue work or cancellable helper.
3. Durable, preparation, preview, search, and local-scan helpers delay Quit and
   are all terminated, including descendants, before durable recovery.
4. Disposable-only cleanup failure still permits Quit and is retried by the
   next bootstrap.
5. Ordinary helper timeout retains helper-only termination semantics.
6. Whole-list Bulk Update preflight occurs before the first journal/mutation;
   after it passes, compensation remains per group.
7. Cancellation at checkout, authority, or deployment stages restores only the
   incomplete managed group.
8. Final Import restores its Ready preparation and removes incomplete managed
   state.
9. Recovery rejects invalid authority, checkout, preparation, or target
   ownership before touching any recorded path.
10. A target fingerprint conflict is retained for explicit recovery.
11. V2 migration entry recovers first; V1 plus journal is blocked; dry-run is
    read-only.
12. Recovery Required permits search/scan/preview but blocks preparation,
    final Import, and Update.

## Confirmed decision record

- Q13-A: restore checkout, authority, then owned targets.
- Q14-A: recovery runs before ordinary bootstrap pruning/reconciliation.
- Q15-A: ordinary timeout remains helper-only; process-group kill is Quit-only.
- Q16-A: Bulk Update preflights the complete selection before per-group work.
- Q17-A: helpers are classified as durable, preparation, disposable query, or
  unrelated.
- Q18-A: disposable helpers also delay Quit and are cancelled/cleaned first.
- Q19-A: Quit uses TERM, a five-second grace period, then group kill.
- Q20-A: Recovery Required allows discovery queries but blocks preparation and
  durable mutations.
- Q21-A: disposable cleanup failure does not block Quit.
- Q22-A: all cancellable helpers stop before durable recovery.

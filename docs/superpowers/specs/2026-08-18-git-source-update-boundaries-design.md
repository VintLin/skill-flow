# Git Source Update Boundaries Design

## Goal

Make managed source updates faster without weakening the ownership, locator,
or desktop process boundaries documented by the upstream architecture.

## Scope

This change is limited to managed source update behavior:

- preserve the remote-ref precheck and reuse an existing managed Git object store;
- preserve an already-recorded `originBranch` throughout the update;
- reject update when a managed lock points outside its canonical checkout path
  or that path uses symbolic links;
- keep every desktop bridge update bounded.

It does not change GitHub or GitLab locator parsing, reconcile, repair,
deployment, or external-source lifecycle rules.

## Contracts

### Managed checkout ownership

Before any update preflight, checkout reuse, rename, or replacement, a managed
lock path must equal:

```text
<stateRoot>/source/<sourceKind>/<sourceId>
```

The resolved path must also remain inside `<stateRoot>/source`. The managed
path components must not be symbolic links, and their real paths must remain
under the real source root. A mismatch returns
`SOURCE_CHECKOUT_PATH_INVALID` without reading or modifying the referenced
checkout. External sources continue to leave the managed update path before
this check.

### Git update path

When a lock has an `originBranch`, remote precheck, local-object fetch, clean
clone, and archive fallback use that exact branch. Failure must not silently
switch to `main` or `master`. Locks without `originBranch` retain the upstream
default-branch behavior.

For a managed Git checkout, first attempt a local no-checkout clone to reuse
its object store, then fetch the remote ref and detach at `FETCH_HEAD`. If this
optimization fails, remove the temporary checkout and use the upstream clean
clone, HTTPS fallback, and archive fallback sequence.

### Mutation lock ownership

A lock with a live PID is never reclaimed solely because its timestamp has
crossed the stale threshold. A dead owner may be reclaimed immediately, while
missing or unreadable ownership metadata retains the upstream age-based rule.

### Desktop update budget

Every bridge command remains time-bounded. Managed update uses a dedicated
budget based on the distinct selected source count:

- one source: 5 minutes;
- two sources: 10 minutes;
- three or more sources: 15 minutes;
- update all: 15 minutes.

Tests may inject shorter budgets. Timeout termination and output handling stay
the same as other bridge commands. Application Quit is a separate lifecycle:
the Desktop Quit Operation Recovery design freezes the queue, requests
cooperative cancellation, and terminates the helper process group after its
five-second grace period without changing these update budgets.

## Acceptance tests

1. An unchanged remote commit skips checkout preparation.
2. A changed Git source reuses the existing managed object store.
3. A failed local reuse falls back to the upstream clean-fetch sequence.
4. A recorded `originBranch` is used by every update fetch path without
   switching to a default branch.
5. Managed update rejects mismatched and symbolic-link checkout paths before
   checkout preparation and leaves referenced external directories untouched.
6. A live process lock is not reclaimed after five minutes.
7. One- and two-source desktop updates receive 5- and 10-minute budgets, while
   update-all and larger selections never exceed 15 minutes.
8. External sources remain excluded from managed update before any checkout
   operation.

# Git Source Update Boundaries Design

## Goal

Make managed source updates faster without weakening the ownership, locator,
or desktop process boundaries documented by the upstream architecture.

## Scope

This change is limited to managed source update behavior:

- preserve the remote-ref precheck and reuse an existing managed Git object store;
- resolve GitHub tree URLs against confirmed remote branch names;
- reject update when a managed lock points outside its canonical checkout path;
- keep every desktop bridge update bounded.

It does not expand GitLab tree URL behavior and does not change reconcile,
repair, deployment, or external-source lifecycle rules.

## Contracts

### Managed checkout ownership

Before any update preflight, checkout reuse, rename, or replacement, a managed
lock path must equal:

```text
<stateRoot>/source/<sourceKind>/<sourceId>
```

The resolved path must also remain inside `<stateRoot>/source`. A mismatch
returns `SOURCE_CHECKOUT_PATH_INVALID` without reading or modifying that path.
External sources continue to leave the managed update path before this check.

### GitHub tree URLs

The text after `/tree/` is ambiguous when branch names contain `/`. Resolve it
by generating branch/path splits from longest branch candidate to shortest:

1. If Git is available, compare candidates with `git ls-remote --heads`.
2. Otherwise, or when the Git probe fails, confirm candidates through the
   GitHub branch API.
3. Use the longest confirmed branch and keep the remaining suffix as the
   requested repository path.
4. If no branch is confirmed, fail clearly instead of guessing.

The confirmed branch is stored as `originBranch` and reused by precheck,
clone, fetch, and archive fallback.

### Desktop update budget

Every bridge command remains time-bounded. Managed update uses a dedicated
budget based on the distinct selected source count:

- one source: 5 minutes;
- two sources: 10 minutes;
- three or more sources: 15 minutes;
- update all: 15 minutes.

Tests may inject shorter budgets. Timeout termination and output handling stay
the same as other bridge commands.

## Acceptance tests

1. A GitHub tree URL whose branch is `feature/foo` resolves that complete
   branch and preserves the remaining skill path.
2. GitHub API fallback provides the same resolution when Git is unavailable.
3. An unresolvable tree branch fails instead of using the first path segment.
4. Managed update rejects a mismatched `lock.localPath` before checkout
   preparation and leaves the referenced directory untouched.
5. One- and two-source desktop updates receive 5- and 10-minute budgets, while
   update-all and larger selections never exceed 15 minutes.
6. External sources remain excluded from managed update before any checkout
   operation.

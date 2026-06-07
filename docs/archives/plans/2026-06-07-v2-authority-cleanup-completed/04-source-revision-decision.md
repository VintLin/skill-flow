# Source Revision Decision

Date: 2026-06-07

## Decision

`SourceRevision` remains a provider-specific discriminated union. Normal runtime should not infer revision shape from legacy V1/V2 fields.

Current provider rules:

- `git`, `github`, `clawhub`: revision may include ref / commit plus `capturedAt`.
- `local`: revision includes a local content hash plus `capturedAt`.
- `collection`: revision includes `capturedAt`; collection member provenance lives in `collections.json`.

## Required Follow-Up

`createSourceRevision` should be made exhaustive before adding any new `SourceKind`.

Required implementation shape:

- switch on the provider/kind discriminant;
- return a provider-specific revision for every current source kind;
- use `assertNever` or equivalent for the default branch;
- add a test that a new source-kind compile surface cannot silently fall through.

## Boundary

This is not a migration compatibility layer. Migration may read old revision-like fields only to produce the current `SourceRevision`.

# First-use CLI mental model

## Status

Accepted for implementation planning.

## Context

The first-use feedback in GitHub issue #19 shows that a CLI-only user can reach
`skill-flow config` while trying to install a new source, cannot tell how
`source`, `sourceId`, and `skill group` relate, and sees a default name such as
`skills` that does not identify its owner. These are onboarding failures rather
than a single runtime defect.

The current command surface has four distinct jobs:

- `add` introduces a source and performs the initial import;
- `list` explains what is registered and what can be referenced;
- `config` changes the skills and targets of an existing group;
- `find` helps locate installable sources or skills.

## Decision

Skill Flow will make that mental model explicit without changing the existing
command names or persisted identifiers.

1. `config` is a configuration surface for registered groups, not an install
   surface. Its empty state must explain how to run `add`.
2. `list` must show the display name, stable source ID, and source locator
   together. Command examples must use the stable source ID.
3. A default display name must retain owner or locator context when a repository
   name is generic (for example, `Matt Pocock · Skills` rather than `Skills`).
4. Display-name changes must not change the source ID, checkout path, bindings,
   or deployment identity.
5. Documentation and help text will use the definitions in
   `docs/references/REF_source-group-terminology.md` as the single terminology
   source.

This is intentionally an additive UX/documentation change. A command rename or
state-schema migration is not required for the first implementation slice.

## User-facing flow

```text
find (optional) -> add -> list -> config -> enable/only -> update
```

After a successful `add`, the CLI should print the registered display name,
stable ID, discovered skill count, and the next commands a user can run.

## Consequences

Positive consequences:

- A user who opens `config` first receives a recoverable explanation instead of
  a dead end.
- The same source can have a friendly display name without breaking scripts
  that use its stable ID.
- `list` becomes a reliable bridge between human-facing names and CLI inputs.

Trade-offs:

- `list` output becomes wider and must remain readable in terminals.
- Naming logic must distinguish a display name from the ID derived from a
  locator.
- Existing tests and help text need explicit assertions for the new first-use
  messaging.

## Verification obligations

- A fresh workspace entering `config` shows the install instruction.
- `list` shows display name, source ID, and locator for at least one source.
- Generic repository names preserve owner context in the default display name.
- Renaming a display name leaves source ID, bindings, checkout path, and update
  behavior unchanged.
- `add` output explains the next step when no skills or targets are enabled.
- README and command help define `source`, `sourceId`, and `skill group` once and
  use the terms consistently.

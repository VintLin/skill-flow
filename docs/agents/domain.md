# Domain Docs

This is a multi-context monorepo.

## Before exploring

- Read the root `CONTEXT.md` for shared domain vocabulary.
- Read relevant system ADRs under `docs/adr/`.
- When a bounded context gains its own `CONTEXT.md` or `docs/adr/`, read those files for work in that context.

## Layout

- Root `CONTEXT.md`: shared vocabulary across CLI, runtime, storage, integration, TUI, and macOS desktop.
- `docs/adr/`: system-wide architectural decisions.
- Context-local `CONTEXT.md` and ADR directories: optional, created only for genuinely independent contexts.

## Vocabulary

Use the terms defined in `CONTEXT.md` in issue titles, specs, plans, test names, and architecture discussions. If a needed concept is missing, record that as a domain-modeling gap rather than inventing a synonym.

## ADR conflicts

Surface any contradiction with an existing ADR explicitly before proposing a change.

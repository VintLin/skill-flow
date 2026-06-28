# Cross-Platform Desktop

## Scope

This directory now keeps only the desktop migration documents that still match the current repository state.

It is the working entry for the current `apps/desktop` pass, not a history dump of every earlier planning phase.

## Active source of truth

- [DESKTOP_CONTRACT.md](/Users/Vint/.superset/worktrees/skill-flow/feat-cross-platform/docs/plan/cross-platform-desktop/DESKTOP_CONTRACT.md)
  - stable behavior boundary copied from `apps/desktop-mac`
  - route inventory, bridge surface, persistence rules, and parity constraints

- [UI_PARITY_GAP.md](/Users/Vint/.superset/worktrees/skill-flow/feat-cross-platform/docs/plan/cross-platform-desktop/UI_PARITY_GAP.md)
  - current gap snapshot based on the existing `apps/desktop` code
  - only tracks what is still missing or not yet proven

- [CURRENT_IMPLEMENTATION_PLAN.md](/Users/Vint/.superset/worktrees/skill-flow/feat-cross-platform/docs/plan/cross-platform-desktop/CURRENT_IMPLEMENTATION_PLAN.md)
  - ordered execution plan from the current branch state
  - immediate next coding slices, validation gates, and cutover conditions

## What changed

The earlier path-policy and full-migration planning documents were useful for getting the project started, but they no longer match the current phase.

The repo already has:

- a Tauri desktop shell in `apps/desktop`
- shared desktop state and route wiring
- bridge integration
- home/import/detail/settings screen shells
- tray route handling
- desktop settings persistence
- cross-platform release scripts

The next phase is no longer "design the migration". The next phase is "close parity and release gaps without widening scope".

## Archived material

Superseded planning files were moved to:

- `docs/plan/cache/cross-platform-desktop/`

They remain available for reference, but should not be used as the default implementation guide.

# Skill Flow v1.0.6 Release Notes

Date: 2026-03-23
Version: `v1.0.6`

## Summary

`v1.0.6` improves source import predictability and reduces noise in the `config` interface.

This release tightens `add --path` behavior, makes generated follow-up commands cleaner, and simplifies the top bar in `skill-flow config` so users only see information that affects current decisions.

## Highlights

### 1. `add --path` behavior is now more predictable

`skill-flow add` now keeps requested path handling consistent across stored source state, default selection, and follow-up workflows.

This reduces ambiguity when importing a repository with a scoped subpath and makes later actions reuse the same path intent more reliably.

### 2. Scoped imports now explain partial default selection

When `add` uses a path that narrows the default selection instead of redefining the source itself, `skill-flow` now emits an explicit preselection warning.

This makes the result clearer:

- the source group is still imported as a full managed source
- the initial selected skills can still be scoped by the requested path

### 3. `find` follow-up commands are cleaner

Generated follow-up commands from `find` no longer include redundant `--path .` output for root-scoped skills.

This keeps the suggested command focused on meaningful arguments only.

### 4. `config` top bar is now quieter and more intentional

The top bar in `skill-flow config` was simplified to remove repeated action hints and low-signal steady-state labels.

New behavior:

- default steady state shows only `Skill Flow`
- `Changes: N` appears only when there are unsaved changes
- `Status: ...` appears only for active or failed operations
- the `Skill Flow` title remains visually stable instead of inheriting transient status colors

## User-visible Behavior Changes

### Add flow

- path-scoped imports are easier to reason about
- preselection warnings make partial default selections explicit
- generated follow-up commands are less noisy

### Config UI

- top bar no longer repeats bottom action hints
- stable states no longer show `Clean`, `Saved`, or `Updated`
- only actionable or exceptional state remains visible

## Verification

Commands run:

```bash
npm run build
npm test
```

Result:

```text
12 test files passing
116 tests passing
```

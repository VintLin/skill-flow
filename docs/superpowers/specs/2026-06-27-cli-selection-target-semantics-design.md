# CLI Selection And Target Semantics Design

## Context

The new migration CLI commands make source target state easier to change:

- `enable`
- `disable`
- `only`
- `import-manifest`

End-to-end smoke testing exposed one confusing state: a source can have targets enabled while its selected skill set is empty. That is valid internal state, but it is misleading for migration commands because users read "ON" as "this group deploys something".

## Goal

Make CLI migration commands preserve the manifest as the single source of truth while preventing accidental empty deployments.

## Rules

### Target Commands

`enable` and `only` change target bindings. They do not silently change skill selection.

If a listed source has no selected skills:

- Without `--all-skills`: fail before mutating state.
- With `--all-skills`: select all currently resolved skills for that source, then apply the requested target change.

If a listed source already has selected skills, `--all-skills` does not overwrite them.

`disable` only clears targets. It never changes selected skills.

### Import Manifest

`import-manifest` must reject contradictory source entries:

- `skills: "none"` with non-empty `targets` is invalid.
- omitted `skills` with non-empty `targets` is invalid.
- non-empty `targets` requires `skills: "all"`.

Plain text manifests remain registration-only unless later options explicitly add target behavior.

## Ownership

Runtime owns semantic validation and selection completion because it is closest to `manifest.json` and `lock.json`.

CLI owns only argument parsing:

- parse `--all-skills`
- pass it to runtime
- print runtime errors

The import manifest parser owns shape validation only. Cross-field deployment rules stay in runtime.

## Expected Errors

Empty selection with target enable:

```text
Source <sourceId> has no selected skills. Pass --all-skills to select all current skills before enabling targets.
```

Invalid import manifest entry:

```text
Import manifest source <source> with targets must set skills to "all".
```

## Tests

Add focused coverage for:

- `enable --targets codex` fails when selection is empty.
- `enable --targets codex --all-skills` selects all skills only when selection is empty.
- `only --targets codex --all-skills` keeps existing selected skills unchanged.
- `disable` preserves selected skills.
- `import-manifest` rejects `skills: "none"` with targets and does not mutate state.
- `import-manifest` rejects omitted `skills` with targets and does not mutate state.

## Non-Goals

- No new state model.
- No separate skill selection command in this pass.
- No Markdown/YAML manifest support.
- No automatic overwrite of existing selected skills.

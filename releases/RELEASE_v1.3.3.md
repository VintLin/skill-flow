# RELEASE v1.3.3

## Summary

- `v1.3.3` is a patch release focused on broadening target coverage and making built-in and custom agent handling behave as one coherent system.
- Compared with `v1.3.2`, it adds first-class `Trae` support, aligns bridge/runtime/settings target metadata, and fixes a desktop tag editing edge case when a group has no tags yet.

## Highlights

### 1. First-class Trae target support

- `Trae` is now available as a built-in deployment target in the CLI, shared target definitions, desktop UI, and documented target list.
- The desktop app also ships a dedicated `Trae` icon and label mapping so target presentation stays consistent with other built-in agents.

### 2. Unified built-in and custom target handling

- Bridge responses, runtime coordination, TUI flows, shared preferences, and desktop settings now use the same target metadata model.
- Custom targets now persist more predictably alongside built-in targets, including display order, visibility, labels, and documented mount paths.
- This reduces drift between CLI, desktop, and stored preference state when teams mix standard agents with locally defined custom ones.

### 3. Cleaner desktop tag editing behavior

- Editable group cards now keep the add affordance visible when the tag list is empty.
- Regression coverage was added so compact tag input and add-button behavior stay locked down.

## User-visible changes

- You can deploy skills directly to `Trae` using the same built-in target flow as other supported agents.
- Custom agents and built-in agents are presented more consistently across CLI, bridge, TUI, and desktop settings surfaces.
- Desktop tag editing no longer gets stuck without an obvious add action when a group starts with zero tags.

## Release Artifacts

- `skill-flow-1.3.3.tgz`

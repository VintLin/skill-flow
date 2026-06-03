# Skill Group Editor Design

Date: 2026-06-02

## Goal

Add a desktop Skill Group Editor entry in the Home header. The editor lets users create virtual skill groups, merge existing groups into a virtual group, and restore groups hidden by a merge.

The first version treats virtual groups as Skill Flow state, not as desktop-only view data. A virtual group can combine skills from multiple existing groups without copying files or creating a new local skill source directory.

## Non-Goals

- Do not copy selected skills into a new local folder.
- Do not create a checkout directory for virtual groups.
- Do not auto-rename conflicting skill deployment names.
- Do not uninstall source groups during merge.
- Do not redesign the import page, settings page, or card layout beyond the new editor entry and required virtual group presentation.

## Current Context

The desktop Home page already has an integrated header with right-side icon buttons for import, update, and settings. Home cards are built from `MainViewModel.groupCards`, and selected skills / targets are represented as drafts using `selectedLeafIds` and `enabledTargets`.

Core state currently models source groups through manifest and lock records. Source kinds are `local`, `git`, and `clawhub`. Runtime mutations already serialize writes through `SkillFlowApp`, and desktop bridge commands already cover source rename, apply, import, update, pin, and uninstall.

The design adds virtual groups by extending the core model and bridge/runtime mutations instead of keeping cross-source group composition only in Swift view state.

## User Decisions

- Create new group means creating a virtual group.
- Merge existing groups creates a virtual group that replaces the selected source groups in the Home view.
- Merged source groups are hidden, not uninstalled.
- Merged source groups have their selected skills and enabled targets cleared to avoid duplicate deployment.
- Merge stores a restore snapshot so hidden source groups can be restored with their previous selected skills and targets.
- Duplicate deployment names are blocked before save.
- The header entry is a single icon button matching existing right-side header buttons.
- The entry opens one Skill Group Editor sheet with `Create`, `Merge`, and `Restore` tabs.

## Data Model

Add virtual group support to the domain model:

- Extend `SourceKind` with `virtual`.
- Allow `Manifest.sources[]` to include virtual group records.
- Store virtual group metadata in a focused `virtual-groups` state file under the existing state root. The metadata must include:
  - virtual group id;
  - display name;
  - included skills as pairs of source id and leaf id;
  - hidden source ids when created by merge;
  - restore snapshot for each hidden source group, including previous `selectedLeafIds` and `enabledTargets`;
  - timestamps for creation and update.
- Virtual group bindings use the existing `SourceBinding` shape.
- Virtual groups do not create a checkout path and do not copy skill files.
- The runtime resolves virtual group leaves from the source leaf inventory. A virtual leaf keeps source badge data so desktop can show which original group it came from.

The public list and inspect outputs present virtual groups as source-like group summaries so desktop can reuse card and detail flows. The separate `virtual-groups` state file carries composition, hidden-group, and restore metadata.

## Header Entry

Add one Home header toolbar icon button near the existing import, update, and settings buttons.

The button:

- uses the existing toolbar icon button size, background, spacing, hover behavior, and theme treatment;
- opens a `Skill Group Editor` sheet;
- is shown in the Home header where group management is naturally scoped.

The first implementation should avoid adding a dropdown menu. Create, merge, and restore are inside the sheet.

## Skill Group Editor Sheet

The sheet has three tabs.

### Create

The Create tab lets the user build a virtual group by freely combining skills from visible source groups.

Behavior:

- User enters a virtual group name.
- User browses visible source groups and selects skills from any of them.
- Each selected skill displays its original group badge.
- Saving requires a non-empty name and at least one selected skill.
- Saving runs conflict detection before writing state.
- Source groups remain visible and unchanged after a create-only virtual group is saved.

### Merge

The Merge tab creates a virtual group that replaces selected source groups in the Home view.

Behavior:

- User enters a virtual group name.
- User selects two or more visible source groups.
- The editor previews the combined skill list.
- The editor shows an impact preview before save:
  - create one virtual group;
  - hide selected source groups;
  - clear selected skills and enabled targets for hidden source groups;
  - save restore snapshots for hidden source groups.
- Saving requires at least two groups.
- Saving runs conflict detection before writing state.
- After save, the virtual group appears on Home and the source groups are hidden by default.

### Restore

The Restore tab lists groups hidden by merge.

Behavior:

- Hidden groups are grouped by the virtual group that replaced them.
- Restore re-shows the hidden source groups.
- Restore reapplies each source group snapshot of `selectedLeafIds` and `enabledTargets`.
- The first version deletes the replacing virtual group on restore to avoid duplicate deployments and duplicated Home entries.
- If a hidden source group no longer exists, restore skips it and reports the skipped group.
- If the restore snapshot is missing, restore is disabled for that entry.

## Conflict Detection

Before creating or merging a virtual group, runtime checks the selected skills for deployment name conflicts.

Rules:

- Conflict detection is based on the projected deployment name for each selected skill.
- If two selected skills would deploy to the same target path or projected name, saving is blocked.
- The error identifies the conflicting skill name and each source group involved.
- The system does not auto-rename conflicting skills in the first version.

This keeps the first version predictable and avoids silently changing deployed names.

## Bridge And Runtime Commands

Add bridge commands:

- `create-virtual-group`
- `merge-groups`
- `restore-merged-groups`

Create payload:

```json
{
  "displayName": "Writing Stack",
  "skills": [
    { "sourceId": "alpha", "leafId": "alpha:skills/review" },
    { "sourceId": "beta", "leafId": "beta:skills/plan" }
  ],
  "enabledTargets": ["codex"]
}
```

Merge payload:

```json
{
  "displayName": "Writing Stack",
  "sourceIds": ["alpha", "beta"],
  "enabledTargets": ["codex"]
}
```

Restore payload:

```json
{
  "virtualGroupId": "writing-stack"
}
```

Runtime responsibilities:

- validate source ids and leaf ids;
- validate name and selection count;
- detect conflicts;
- create virtual group state;
- write or update bindings;
- hide source groups for merge;
- clear merged source group bindings;
- store restore snapshots;
- restore source groups and delete the replacing virtual group;
- return fresh group summary data after each successful mutation.

Desktop responsibilities:

- collect user input;
- display source and skill options;
- show impact preview and validation messages;
- call bridge commands;
- refresh list and detail state after successful mutations;
- show runtime errors as toasts or inline sheet errors.

## Hidden Groups

Hidden groups are excluded from default Home cards and default filters. They remain registered and recoverable.

Hidden groups should still be visible to runtime validation and restore queries. The Restore tab is the primary desktop place where hidden groups are shown.

CLI behavior remains unchanged in the first version except that default group summaries omit hidden groups after a desktop merge. No new CLI command or option is required for this feature.

## Virtual Group Presentation

Virtual group cards should look like normal group cards with a clear virtual indicator.

Minimum presentation:

- source type label indicates virtual;
- stats show combined skill count;
- skill rows show original group badge;
- detail view shows included source groups;
- warnings are shown if a virtual group references a missing source or leaf.

Home sidebar source type filters include `Virtual` as a first-version source type option. Selecting `Virtual` shows only virtual group cards.

## Error Handling

- Empty virtual group name: block save.
- Empty selected skills in Create: block save.
- Fewer than two selected source groups in Merge: block save.
- Missing source or leaf: return a runtime error and leave state unchanged.
- Deployment name conflict: block save and list conflicts.
- Missing restore snapshot: disable restore for that virtual group.
- Source removed after merge: restore skips the missing source and reports it.
- Leaf removed after source update: virtual group shows a warning and excludes the missing leaf from deployment until edited or recreated.

All runtime mutations must be serialized with the existing mutation queue pattern to avoid conflicting manifest and lock writes.

## Testing

### TypeScript

Add focused runtime and protocol tests:

- `createVirtualGroup` writes virtual state and does not create checkout directories.
- Create can include skills from multiple source groups.
- Create rejects empty name and empty selection.
- Merge creates a virtual group, hides source groups, clears source bindings, and stores restore snapshots.
- Restore re-shows source groups, restores bindings, and deletes the virtual group.
- Conflict detection blocks duplicate deployment names.
- List and inspect omit hidden groups from default Home data and expose restore metadata where needed.
- Virtual groups return source badge metadata for included skills.

### Swift Desktop

Add focused view model and screen/container tests:

- Home header exposes the group editor entry.
- Create tab validates empty name and empty selection.
- Merge tab requires at least two groups.
- Merge tab shows impact preview values.
- Restore tab lists hidden groups and calls the restore command.
- Home refresh shows virtual groups and hides merged source groups.
- Runtime errors are surfaced as inline sheet errors or toast messages.

## Validation

Run the smallest relevant validation after implementation:

- related TypeScript tests under `packages/query` and shared protocol tests if protocol parsing changes;
- related Swift package tests under `apps/desktop-mac`;
- targeted desktop UI structural tests for the new header button and sheet tabs.

Full root `npm test` and desktop full test runs can be used if shared protocol or source listing behavior changes broadly.

# Group Update Selection And Indicator Design

## Summary

This design fixes two desktop update issues for skill groups:

1. If a group was fully selected before update, it must remain fully selected after update, including any newly discovered skills.
2. If an update produces actual changes, the group card should briefly show a green dot indicator during the current app session.

The design keeps selection semantics in the authority path and keeps the visual update indicator as desktop-only session state.

## Goals

- Preserve full-selection semantics after source updates.
- Avoid turning a previously `ON` skills state into `MIX` just because new skills were added upstream.
- Show a short-lived visual signal when a group was updated and changed.
- Keep the implementation small, testable, and aligned with the existing v2 state authority flow.

## Non-Goals

- No state schema changes.
- No migration changes.
- No persistent "unread" or "updated" marker.
- No import-page redesign.
- No new CLI-facing behavior.
- No changes to detail-page information architecture beyond consuming the corrected selection semantics.

## Problem Statement

Current update flow preserves source inventory, but desktop draft reconstruction can lose the meaning of `selectionMode = "all"`.

Today:

- authority state still distinguishes `selectionMode = "all"` from explicit `selectedLeafIds`
- desktop summary parsing primarily rebuilds draft selection from `selectedLeafIds`
- when `selectedLeafIds` is empty for an `all` binding, desktop falls back to enabled target leaf IDs instead of the current full leaf inventory

As a result, a group that was conceptually "all selected" can render as partially selected after update when new skills appear.

Separately, there is no lightweight visual signal that a group just changed during update, so successful updates with actual differences are easy to miss.

## User Decisions Confirmed

- Update indicator lifetime: session-only and temporary.
- Full-selection update rule: if a group was fully selected before update, it stays fully selected after update, including newly added skills.

## Recommended Approach

Use one authority-path fix and one desktop-session-only UI enhancement:

1. Carry source selection mode through summary payloads all the way to desktop.
2. Rebuild desktop drafts from selection mode, not only from selected leaf IDs.
3. Maintain a temporary in-memory set of recently updated source IDs in `MainViewModel`.

This keeps semantic state in the runtime authority layer and keeps transient UI feedback in the desktop view model.

## Design

### 1. Selection Semantics Stay Authoritative

`SourceBinding.selectionMode` remains the single source of truth for "all selected" vs "explicit subset selected".

The update path must not reinterpret "all" as a materialized explicit subset. It should continue to mean "all current leafs for this source".

That means:

- if a source binding is `selectionMode = "all"` before update, it stays `selectionMode = "all"` after update
- newly discovered leafs are implicitly part of the effective selection
- no special desktop heuristic should be required to guess whether empty `selectedLeafIds` means "none" or "all"

### 2. Query Summary Must Expose Selection Mode

Desktop currently consumes workflow summaries as its main reconstruction input. Those summaries must explicitly include the current source selection mode.

Required summary behavior:

- expose `selectionMode` for each source binding
- continue exposing `selectedLeafIds`
- keep target leaf mappings unchanged

This lets desktop tell the difference between:

- `selectionMode = "all"` with empty `selectedLeafIds` by design
- `selectionMode = "selected"` with explicit `selectedLeafIds`

### 3. Desktop Draft Reconstruction Rules

`MainViewModel.buildInitialDraftFromSummary(...)` should reconstruct the working draft with these rules:

- if `selectionMode == "all"`:
  - use all current summary leaf IDs as the draft's `selectedLeafIds`
- if `selectionMode == "selected"`:
  - use summary `selectedLeafIds`

This ensures the desktop tri-state and chips reflect the effective current selection instead of a lossy projection.

Expected outcomes:

- previously full-selected group stays `ON` after update, even when upstream added new skills
- partially selected group stays `MIX`
- unselected behavior remains unchanged where applicable

### 4. Temporary Updated Indicator

Desktop adds a session-only "recently updated" marker:

- maintain `recentlyUpdatedSourceIds` in `MainViewModel`
- when an update completes and the result for a source shows actual changes, insert that source ID into the set
- render a small green dot on that group card
- automatically clear the source ID after a short timeout
- if the same source updates again before timeout, restart the timeout

The green dot is a visual hint only. It does not become part of persisted source health, doctor state, save state, or migration data.

### 5. What Counts As "Updated"

The green dot should appear only when the update result reports actual changes.

Use existing update result data instead of inventing a second diff system. A source counts as changed when at least one of the following is true:

- `changed == true`
- `addedLeafIds` is non-empty
- `removedLeafIds` is non-empty
- `invalidatedLeafIds` is non-empty

If an update is effectively no-op, no green dot should appear.

## Data Flow

1. Desktop triggers `updateSource`, `updateCurrentGroup`, or update-all flow.
2. Bridge calls query runtime.
3. Query runtime calls `source-authority-service.updateSources(...)`.
4. Authority updates checkout and inventory while preserving binding semantics.
5. Query returns update result and refreshed summaries.
6. Desktop:
   - records recently updated source IDs for sources with actual changes
   - refreshes summaries
   - rebuilds drafts using summary `selectionMode`
7. Group cards render:
   - corrected `ON / MIX / OFF` skills state
   - temporary green dot for recently changed sources

## UI Behavior

### Group Card Indicator

- Add a small green dot near the group card title area.
- The dot must not replace warning or error badges.
- It should read as an additive, lightweight status hint.
- It must disappear automatically after the timeout.

### No Additional Interaction

There is no:

- manual dismiss button
- "mark as read" action
- persisted updated banner
- detail-page-only updated badge

## Scope Boundaries

### In Scope

- summary contract extension for selection mode
- desktop draft reconstruction fix
- desktop temporary updated indicator
- tests for authority-to-desktop semantic continuity

### Out Of Scope

- changing source update storage format
- changing update diff model structure
- long-term notification center behavior
- broader card layout redesign

## Testing Strategy

### Query / Runtime Tests

- summary payload includes `selectionMode`
- source with `selectionMode = "all"` still reports full-selection semantics after update with added leafs
- source with `selectionMode = "selected"` still reports subset semantics after update

### Desktop View Model Tests

- `buildInitialDraftFromSummary(...)` uses all summary leaf IDs when `selectionMode = "all"`
- partial-selection summary still builds subset draft
- changed update result inserts source ID into temporary updated set
- unchanged update result does not insert source ID
- timeout clears the indicator
- repeated update resets indicator lifetime

### Desktop Rendering Tests

- group card shows green dot when source ID is in the recently updated set
- group card does not show the dot otherwise
- existing header layout remains stable with the new indicator present

## Risks

### Risk 1: Partial Contract Upgrade

If some summary-producing paths expose `selectionMode` and others do not, desktop can drift between screens or refresh paths.

Mitigation:

- treat `selectionMode` as part of the shared summary contract everywhere desktop consumes summaries

### Risk 2: UI Layout Crowding

The title row already carries title text and sometimes original-name affordances.

Mitigation:

- place the green dot in the existing header row with minimal added width
- verify no overlap in group card rendering tests

### Risk 3: Session Timer Drift

Multiple updates in quick succession can produce stale clear tasks.

Mitigation:

- keep clear tasks keyed by source ID
- cancel and replace the previous task when the same source updates again

## Minimal Implementation Shape

- `packages/query`
  - extend summary payload to include `selectionMode`
- `apps/desktop-mac`
  - parse summary `selectionMode`
  - rebuild drafts from explicit mode
  - track temporary recently updated source IDs
  - render green dot on group cards

No other package requires a behavioral expansion beyond preserving and forwarding already authoritative semantics.

## Acceptance Criteria

- A group that was fully selected before update remains fully selected after update, including newly added skills.
- A group that was partially selected before update remains partially selected after update unless user data explicitly says otherwise.
- A group card shows a green dot only when the latest completed update produced actual changes.
- The green dot disappears automatically without persistence across app restart.
- Existing update behavior for unchanged sources remains visually calm.

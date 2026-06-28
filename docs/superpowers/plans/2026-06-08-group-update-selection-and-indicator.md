# Group Update Selection And Indicator Implementation Plan

> **For agentic workers:** Recommended sub-skill is `superpowers:subagent-driven-development` for task-by-task execution. Steps use checkbox syntax for tracking and can be completed serially.

**Goal:** Preserve `ON` selection state for fully selected groups after updates add new skills, and show a temporary green-dot indicator on desktop group cards when an update produced actual changes.

**Architecture:** Keep selection semantics authoritative in runtime summary payloads and reconstruct desktop drafts from explicit `selectionMode`. Keep the visual "recently updated" indicator entirely in `MainViewModel` session state with short-lived timers.

**Tech Stack:** TypeScript / Vitest for query runtime, Swift 6 / SwiftUI / XCTest for desktop.

---

## File Structure

- Modify `packages/query/src/runtime.ts`
  - Extend workflow summaries to expose `selectionMode`.
- Modify `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
  - Parse summary `selectionMode`.
  - Rebuild drafts from explicit mode.
  - Track temporary recently updated source IDs and timeout reset tasks.
- Modify `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
  - Render a green-dot indicator in the title/header row.
- Modify `packages/query/src/tests/runtime-v2.test.ts`
  - Add summary-level regression coverage for `selectionMode` continuity after update.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`
  - Add draft reconstruction and update-indicator lifecycle tests.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/MenuBarIconTests.swift`
  - Add group-card rendering regression coverage for the green dot without breaking header layout.

---

## Task 1: Expose Selection Mode In Workflow Summaries

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/runtime-v2.test.ts`

- [ ] **Step 1: Add a failing runtime regression test**

Add a test in `packages/query/src/tests/runtime-v2.test.ts` that:

- creates a source with `selectionMode = "all"`
- performs an update that adds at least one new leaf
- lists or inspects the resulting workflow summary
- asserts the summary still carries `selectionMode = "all"`
- asserts the new leaf is present in summary leaf inventory

Expected failure before implementation:

- summary omits `selectionMode`, or desktop-facing reconstruction data is incomplete

- [ ] **Step 2: Extend summary payload generation**

Update `packages/query/src/runtime.ts` so each workflow summary includes the current binding `selectionMode`.

Rules:

- if binding exists, emit `selectionMode` from the authoritative binding
- preserve existing `selectedLeafIds` behavior
- do not invent a new fallback enum or compatibility alias

- [ ] **Step 3: Run focused query tests**

Run:

```bash
npm run -w @skill-flow/query test -- src/tests/runtime-v2.test.ts
```

Expected:

- the new regression passes
- no unrelated summary regressions appear

---

## Task 2: Rebuild Desktop Drafts From Explicit Selection Mode

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Add failing desktop draft reconstruction tests**

Add tests for `buildInitialDraftFromSummary(...)` behavior:

1. `selectionMode = all`
   - summary has multiple leafs
   - `selectedLeafIds` may be empty
   - resulting draft must contain all current summary leaf IDs

2. `selectionMode = selected`
   - resulting draft must contain only explicit `selectedLeafIds`

Expected failure before implementation:

- `selectionMode = all` draft rebuilds from target leaf IDs or empty selection instead of all leafs

- [ ] **Step 2: Parse summary selection mode**

Update summary parsing in `MainViewModel` so `WorkflowSummary` carries `selectionMode` as an explicit field.

Requirements:

- keep type-safe mapping local to the summary parse path
- do not infer mode later from draft shape when the summary already knows it

- [ ] **Step 3: Change draft initialization**

Update `buildInitialDraftFromSummary(...)`:

- when `selectionMode == "all"`:
  - `selectedLeafIds = summary.leafs.map(\.id)` after existing normalization/sorting
- when `selectionMode == "selected"`:
  - `selectedLeafIds = summary.selectedLeafIds`

Do not change target reconstruction rules beyond what is required for this selection fix.

- [ ] **Step 4: Run focused desktop selection tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter 'SkillFlowDesktopTests.MainViewModelSelectionTests'
```

Expected:

- draft reconstruction tests pass
- no existing selection-state regressions

---

## Task 3: Add Temporary Recently Updated Indicator State

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Add failing indicator lifecycle tests**

Add tests that verify:

1. a source with actual update changes is marked as recently updated
2. a source with unchanged update result is not marked
3. the marker auto-clears after the configured timeout
4. updating the same source again before timeout resets the timer instead of leaving stale clear tasks

Use the existing update-result payload structure:

- `changed`
- `addedLeafIds`
- `removedLeafIds`
- `invalidatedLeafIds`

- [ ] **Step 2: Add session-only state to `MainViewModel`**

Introduce:

- a `recentlyUpdatedSourceIds` set keyed by source ID
- a keyed dictionary of clear tasks so repeated updates can cancel and replace prior timers

Rules:

- insert source ID only when update result represents actual change
- remove it automatically after a short timeout
- do not persist this state
- do not map this state into source health or save state

- [ ] **Step 3: Hook the state into update flows**

Update all desktop update entry points that consume update result payloads:

- single source update
- current group update
- update-all flow if applicable

Requirements:

- compute "actually changed" from returned update items only
- keep existing toast summary behavior unchanged

- [ ] **Step 4: Re-run focused desktop selection tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter 'SkillFlowDesktopTests.MainViewModelSelectionTests'
```

Expected:

- lifecycle tests pass
- no regression in optimistic save or selection behavior

---

## Task 4: Render The Green Dot On Group Cards

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- Modify if needed: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MenuBarIconTests.swift`

- [ ] **Step 1: Add failing rendering/layout tests**

Add or extend tests to verify:

- a group card can expose a recently-updated visual state
- the header row still fits title and existing affordances
- the indicator does not replace warning/error indicators or divider logic

- [ ] **Step 2: Extend card view model surface minimally**

Expose a boolean on `GroupCardModel`, for example `showsRecentlyUpdatedIndicator`, derived from the `recentlyUpdatedSourceIds` set during card construction.

Keep this scoped to group-card rendering only.

- [ ] **Step 3: Render the indicator**

In `GroupCardComponents.swift`:

- place a small green dot near the title area
- keep it visually subordinate to the title
- do not create a new row
- do not alter card interaction behavior

- [ ] **Step 4: Run focused UI rendering tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter 'SkillFlowDesktopTests.MenuBarIconTests'
```

Expected:

- new green-dot tests pass
- prior header-density regressions stay green

---

## Task 5: End-To-End Verification For The Full Behavior

**Files:**
- Reuse tests from Tasks 1-4
- Add one higher-level regression only if current coverage leaves a gap

- [ ] **Step 1: Add one cross-layer regression if needed**

Only if coverage is still missing, add one test that proves the real user path:

- a fully selected source updates with a newly added skill
- summary remains `all`
- desktop draft becomes all current leaf IDs
- group card skills state remains `ON`

Keep this in the narrowest existing suite that already exercises this path.

- [ ] **Step 2: Run package build and targeted tests**

Run:

```bash
npm run build
npm run -w @skill-flow/query test -- src/tests/runtime-v2.test.ts
swift test --package-path apps/desktop-mac --filter 'SkillFlowDesktopTests.MainViewModelSelectionTests'
swift test --package-path apps/desktop-mac --filter 'SkillFlowDesktopTests.MenuBarIconTests'
```

Expected:

- build succeeds
- focused query and desktop regressions pass

- [ ] **Step 3: Run broader safety net**

Run:

```bash
npm test
swift test --package-path apps/desktop-mac
```

Expected:

- no regressions in existing runtime or desktop behavior

---

## Acceptance Checklist

- [ ] Full-selected groups remain `ON` after update adds new skills.
- [ ] Partially selected groups remain `MIX`.
- [ ] Summary contract exposes `selectionMode`.
- [ ] Desktop draft reconstruction uses explicit `selectionMode`.
- [ ] Green dot appears only when update produced actual changes.
- [ ] Green dot auto-clears during the same session.
- [ ] No persistence, schema, or migration changes are introduced.

---

## Completion Definition

This task is complete when all of the following are true:

1. The authority-to-summary-to-desktop chain preserves full-selection semantics.
2. Desktop group cards visually indicate recent changed updates with a temporary green dot.
3. Focused query and desktop regressions pass.
4. Full `npm test` and full desktop Swift test pass.
5. No new persistent state or compatibility layer was introduced.

# Full Desktop Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/desktop` a behaviorally complete replacement for `apps/desktop-mac`, with each screen loading real data and behaving like the original app instead of only matching isolated UI or state slices.

**Architecture:** Execute the migration by vertical feature slice, not by technical layer. Each slice must include real bridge-backed data loading, screen rendering, user actions, failure handling, route transitions, and parity tests before moving to the next slice.

**Tech Stack:** React 19, Tauri 2, Vitest, TypeScript, Rust Tauri commands, existing desktop bridge and shared desktop state.

## Status

- full vertical parity pass completed for home, import, detail, settings, and tray
- macOS host release flow verified
- Linux and Windows host validation still pending if not yet executed

---

## File map

### Existing source of truth

- `apps/desktop-mac/Sources/DesktopApp/App/DesktopAppContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/HomeViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailLoadingLayoutTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewTests.swift`

### React/Tauri implementation files that will be modified

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/runtime/desktop-runtime.ts`
- `apps/desktop/src/runtime/desktop-integration.ts`
- `apps/desktop/src/runtime/desktop-maintenance.ts`
- `apps/desktop/src/screens/home-screen.tsx`
- `apps/desktop/src/screens/home-main-view.tsx`
- `apps/desktop/src/screens/import-screen.tsx`
- `apps/desktop/src/screens/detail-screen.tsx`
- `apps/desktop/src/screens/settings-screen.tsx`
- `apps/desktop/src/view-models/home-view-model.ts`
- `apps/desktop/src/view-models/import-view-model.ts`
- `apps/desktop/src/view-models/detail-view-model.ts`
- `apps/desktop/src/view-models/settings-view-model.ts`
- `apps/desktop/src/menu/tray.ts`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/bridge.rs`

### Test files that will be the active parity gate

- `apps/desktop/src/tests/app.test.tsx`
- `apps/desktop/src/tests/home-screen.test.tsx`
- `apps/desktop/src/tests/home-view-model.test.ts`
- `apps/desktop/src/tests/import-screen.test.tsx`
- `apps/desktop/src/tests/import-view-model.test.ts`
- `apps/desktop/src/tests/detail-screen.test.tsx`
- `apps/desktop/src/tests/detail-view-model.test.ts`
- `apps/desktop/src/tests/settings-screen.test.tsx`
- `apps/desktop/src/tests/settings-view-model.test.ts`
- `apps/desktop/src/tests/tray.test.ts`
- `apps/desktop/src/tests/desktop-smoke.test.ts`
- `apps/desktop/src/tests/desktop-integration-runtime.test.ts`
- `apps/desktop/src/tests/release-validation.test.ts`

## Execution rules

- Every task is vertical. Do not split UI, data, and interaction into separate phases for the same screen.
- Every task starts with failing parity tests copied from `apps/desktop-mac`.
- Every task must use real bridge-backed state shapes or Tauri-facing seams, not one-off fake state that the app never uses.
- Do not widen product scope. Only replicate current `apps/desktop-mac`.
- Commit after each task completes and its verification passes.

## Definition of done for each screen

- The screen loads the same real data categories as the macOS app.
- The screen renders the same major states: loading, ready, empty, failed.
- The screen supports the same user actions and route transitions.
- The screen preserves the same selection and draft continuity rules.
- The relevant old macOS behavior tests have matching React/Tauri parity tests.
- The screen is verified by targeted tests and by the full `@skill-flow/desktop` suite.

### Task 1: Build the parity inventory before changing behavior

**Files:**
- Modify: `docs/plan/cross-platform-desktop/UI_PARITY_GAP.md`
- Read: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`
- Read: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- Read: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift`
- Read: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`

- [ ] **Step 1: Rewrite the gap document as a screen-by-screen checklist**

Write the checklist under these headings only:

```md
## Home
- real bootstrap data
- search
- project scope
- refresh
- update current
- update all
- selection retention
- route round-trip

## Import
- recommendations
- search results
- preview
- drafts
- import success
- import failure
- installed state synchronization
- route round-trip

## Detail
- inspect
- enrichment
- loading
- empty
- file tree
- group documents
- skill documents
- save failure rollback

## Settings and Tray
- persisted settings
- update check
- maintenance actions
- tray entry actions
- quick-config parity
```

- [ ] **Step 2: Save the document without adding any new design scope**

Run: `sed -n '1,220p' docs/plan/cross-platform-desktop/UI_PARITY_GAP.md`

Expected: the file is a plain checklist of remaining parity gaps, not a design brainstorm.

- [ ] **Step 3: Commit**

```bash
git add docs/plan/cross-platform-desktop/UI_PARITY_GAP.md
git commit -m "docs: reset desktop parity gap tracker"
```

### Task 2: Fully replicate Home as one vertical slice

**Files:**
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/runtime/desktop-runtime.ts`
- Modify: `apps/desktop/src/runtime/desktop-integration.ts`
- Modify: `apps/desktop/src/screens/home-screen.tsx`
- Modify: `apps/desktop/src/screens/home-main-view.tsx`
- Modify: `apps/desktop/src/view-models/home-view-model.ts`
- Test: `apps/desktop/src/tests/app.test.tsx`
- Test: `apps/desktop/src/tests/home-screen.test.tsx`
- Test: `apps/desktop/src/tests/home-view-model.test.ts`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreen.swift`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
- Reference: `apps/desktop-mac/Sources/DesktopApp/ViewModels/HomeViewModel.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`

- [ ] **Step 1: Add failing Home parity tests for real data bootstrap and route continuity**

Add tests with these names:

```ts
it("bootstraps home from bridge-backed inventory and keeps the selected source in shared state", async () => {})
it("preserves selected source and visible cards when home route round-trips through detail and import", async () => {})
it("refresh rewrites inventory summaries without clearing valid home selection", async () => {})
```

- [ ] **Step 2: Run only the new Home tests to verify they fail**

Run: `npm run -w @skill-flow/desktop test -- home-view-model.test.ts home-screen.test.tsx app.test.tsx`

Expected: FAIL on the newly added cases, with failures tied to missing bootstrap or continuity behavior.

- [ ] **Step 3: Implement the minimal Home runtime and rendering changes**

Implement only these behavior changes:

```ts
// desktop-runtime.ts
// bootstrapIfNeeded must seed sourceIds, selectedSourceId, and home bootstrap phase

// desktop-integration.ts
// refreshInventory must fully rewrite inventory summaries, pins, and sourceIds from list()

// home-view-model.ts
// preserve valid selectedSourceId across refresh and route changes
// open detail/import/settings without clearing valid home selection

// home-screen.tsx / home-main-view.tsx
// render loading, ready, and empty states from shared runtime state
// render real inventory cards from integration-backed summaries
```

- [ ] **Step 4: Add failing Home parity tests for refresh and update actions**

Add tests with these names:

```ts
it("updates the current group using only the current selected source", async () => {})
it("updates every non-empty source in home order", async () => {})
it("shows the same loading and toast transitions as the macOS home workflow", async () => {})
```

- [ ] **Step 5: Run the Home test subset again to verify the new tests fail**

Run: `npm run -w @skill-flow/desktop test -- home-view-model.test.ts home-screen.test.tsx`

Expected: FAIL only on the newly added action cases.

- [ ] **Step 6: Implement the minimal Home mutation parity**

Implement only these changes:

```ts
// home-view-model.ts
// refresh, updateCurrentGroup, and updateAllGroupsFromHome must keep the same action order,
// toast behavior, and selected-source semantics as the macOS app
```

- [ ] **Step 7: Verify the Home slice**

Run: `npm run -w @skill-flow/desktop test -- app.test.tsx home-screen.test.tsx home-view-model.test.ts`

Expected: PASS

- [ ] **Step 8: Run the full desktop suite**

Run: `npm run -w @skill-flow/desktop test`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/App.tsx \
  apps/desktop/src/runtime/desktop-runtime.ts \
  apps/desktop/src/runtime/desktop-integration.ts \
  apps/desktop/src/screens/home-screen.tsx \
  apps/desktop/src/screens/home-main-view.tsx \
  apps/desktop/src/view-models/home-view-model.ts \
  apps/desktop/src/tests/app.test.tsx \
  apps/desktop/src/tests/home-screen.test.tsx \
  apps/desktop/src/tests/home-view-model.test.ts
git commit -m "feat: fully replicate desktop home workflow"
```

### Task 3: Fully replicate Import as one vertical slice

**Files:**
- Modify: `apps/desktop/src/screens/import-screen.tsx`
- Modify: `apps/desktop/src/view-models/import-view-model.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Test: `apps/desktop/src/tests/import-screen.test.tsx`
- Test: `apps/desktop/src/tests/import-view-model.test.ts`
- Test: `apps/desktop/src/tests/desktop-smoke.test.ts`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`

- [ ] **Step 1: Add failing Import parity tests for route-scoped screen state**

Add tests with these names:

```ts
it("keeps import screen search text and placeholder state across route round-trips", async () => {})
it("recreates import screen drafts from shared desktop state after container recreation", async () => {})
it("projects recommendation and search business state exactly from shared import state", async () => {})
```

- [ ] **Step 2: Run the Import test subset and verify it fails**

Run: `npm run -w @skill-flow/desktop test -- import-screen.test.tsx import-view-model.test.ts desktop-smoke.test.ts`

Expected: FAIL on the new route-state and shared-draft parity cases.

- [ ] **Step 3: Implement the minimal Import screen-state parity**

Implement only these changes:

```ts
// import-view-model.ts
// preserve submitted query, preview state, and drafts across route round-trips

// import-screen.tsx
// keep recommendation rails, loading, empty, and failure presentation tied to shared state
```

- [ ] **Step 4: Add failing Import parity tests for real actions**

Add tests with these names:

```ts
it("loads recommendations without triggering search on page entry", async () => {})
it("imports from recommendations and from search results with the same route and toast behavior as macOS", async () => {})
it("keeps installed state synchronized across recommendation and search copies after import", async () => {})
```

- [ ] **Step 5: Run the Import subset again to verify it fails on the new action tests**

Run: `npm run -w @skill-flow/desktop test -- import-screen.test.tsx import-view-model.test.ts`

Expected: FAIL only on the new action cases.

- [ ] **Step 6: Implement the minimal Import behavior parity**

Implement only these changes:

```ts
// import-view-model.ts
// keep page-entry recommendation loading local-only
// keep preview-once semantics
// keep import success/failure routing and toast semantics
// keep draft precedence over preview defaults
```

- [ ] **Step 7: Verify the Import slice**

Run: `npm run -w @skill-flow/desktop test -- import-screen.test.tsx import-view-model.test.ts desktop-smoke.test.ts`

Expected: PASS

- [ ] **Step 8: Run the full desktop suite**

Run: `npm run -w @skill-flow/desktop test`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/screens/import-screen.tsx \
  apps/desktop/src/view-models/import-view-model.ts \
  apps/desktop/src/app/App.tsx \
  apps/desktop/src/tests/import-screen.test.tsx \
  apps/desktop/src/tests/import-view-model.test.ts \
  apps/desktop/src/tests/desktop-smoke.test.ts
git commit -m "feat: fully replicate desktop import workflow"
```

### Task 4: Fully replicate Detail as one vertical slice

**Files:**
- Modify: `apps/desktop/src/runtime/desktop-integration.ts`
- Modify: `apps/desktop/src/screens/detail-screen.tsx`
- Modify: `apps/desktop/src/view-models/detail-view-model.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Test: `apps/desktop/src/tests/detail-screen.test.tsx`
- Test: `apps/desktop/src/tests/detail-view-model.test.ts`
- Test: `apps/desktop/src/tests/app.test.tsx`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailLoadingLayoutTests.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`

- [ ] **Step 1: Add failing Detail parity tests for route-scoped loading**

Add tests with these names:

```ts
it("loads inspect and enrichment exactly once per detail route entry", async () => {})
it("shows loading or empty detail presentation instead of stale content from the previous source", async () => {})
it("rebuilds detail presentation when the incoming document or file-tree revision changes", async () => {})
```

- [ ] **Step 2: Run the Detail subset and verify it fails**

Run: `npm run -w @skill-flow/desktop test -- detail-screen.test.tsx detail-view-model.test.ts app.test.tsx`

Expected: FAIL on route-scoped loading and stale-content cases.

- [ ] **Step 3: Implement the minimal Detail loading parity**

Implement only these changes:

```ts
// app/App.tsx and desktop-integration.ts
// route entry into detail must request inspect plus inspect-enrichment once per entry

// detail-view-model.ts
// keep detail content strictly scoped to current route sourceId

// detail-screen.tsx
// render loading, empty, and ready states without leaking previous detail payloads
```

- [ ] **Step 4: Add failing Detail parity tests for documents and selections**

Add tests with these names:

```ts
it("keeps the same default overview, file tree, group document, and skill document selection rules as macOS", async () => {})
it("keeps valid sub-selections on rehydrate and realigns only invalid ones", async () => {})
it("rolls back target and skill toggles when persistence fails", async () => {})
```

- [ ] **Step 5: Run the Detail subset again to verify it fails on the new selection tests**

Run: `npm run -w @skill-flow/desktop test -- detail-screen.test.tsx detail-view-model.test.ts`

Expected: FAIL only on the new selection and document cases.

- [ ] **Step 6: Implement the minimal Detail behavior parity**

Implement only these changes:

```ts
// detail-view-model.ts
// preserve macOS selection bootstrap, realignment, document selection, and rollback rules

// detail-screen.tsx
// keep the sidebar, header, document, and tree interaction surfaces aligned with the original shell
```

- [ ] **Step 7: Verify the Detail slice**

Run: `npm run -w @skill-flow/desktop test -- detail-screen.test.tsx detail-view-model.test.ts app.test.tsx`

Expected: PASS

- [ ] **Step 8: Run the full desktop suite**

Run: `npm run -w @skill-flow/desktop test`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/runtime/desktop-integration.ts \
  apps/desktop/src/screens/detail-screen.tsx \
  apps/desktop/src/view-models/detail-view-model.ts \
  apps/desktop/src/app/App.tsx \
  apps/desktop/src/tests/detail-screen.test.tsx \
  apps/desktop/src/tests/detail-view-model.test.ts \
  apps/desktop/src/tests/app.test.tsx
git commit -m "feat: fully replicate desktop detail workflow"
```

### Task 5: Fully replicate Settings and Tray as one vertical slice

**Files:**
- Modify: `apps/desktop/src/screens/settings-screen.tsx`
- Modify: `apps/desktop/src/view-models/settings-view-model.ts`
- Modify: `apps/desktop/src/menu/tray.ts`
- Modify: `apps/desktop/src/runtime/desktop-maintenance.ts`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/bridge.rs`
- Test: `apps/desktop/src/tests/settings-screen.test.tsx`
- Test: `apps/desktop/src/tests/settings-view-model.test.ts`
- Test: `apps/desktop/src/tests/tray.test.ts`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsScreen.swift`
- Reference: `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
- Reference: `apps/desktop-mac/Sources/DesktopApp/Components/MenuBar/MenuBarQuickConfigView.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewTests.swift`
- Reference: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`

- [ ] **Step 1: Add failing Settings parity tests for persisted behavior**

Add tests with these names:

```ts
it("loads, normalizes, and writes the full settings surface immediately", async () => {})
it("resets configuration back to full defaults", async () => {})
it("clears metadata cache through the Tauri maintenance boundary only", async () => {})
```

- [ ] **Step 2: Run the Settings subset and verify it fails**

Run: `npm run -w @skill-flow/desktop test -- settings-screen.test.tsx settings-view-model.test.ts tray.test.ts`

Expected: FAIL on the newly added persistence or maintenance cases.

- [ ] **Step 3: Implement the minimal Settings persistence parity**

Implement only these changes:

```ts
// settings-view-model.ts
// keep full persisted settings parity with the macOS app

// settings-screen.tsx
// keep all major sections, update actions, and maintenance actions visible and wired

// desktop-maintenance.ts and src-tauri bridge
// keep cache maintenance on the desktop boundary, not in renderer code
```

- [ ] **Step 4: Add failing Tray parity tests**

Add tests with these names:

```ts
it("maps tray quick actions to the same route inventory as the macOS app", async () => {})
it("keeps quick-config entry behavior aligned with the intended current cutover scope", async () => {})
```

- [ ] **Step 5: Run the Settings and Tray subset again to verify it fails on the new tray cases**

Run: `npm run -w @skill-flow/desktop test -- settings-screen.test.tsx settings-view-model.test.ts tray.test.ts`

Expected: FAIL only on the new tray parity cases.

- [ ] **Step 6: Implement the minimal Tray parity**

Implement only these changes:

```ts
// tray.ts
// preserve current route inventory and quick actions
// do not add routes outside the macOS contract
```

- [ ] **Step 7: Verify the Settings and Tray slice**

Run: `npm run -w @skill-flow/desktop test -- settings-screen.test.tsx settings-view-model.test.ts tray.test.ts`

Expected: PASS

- [ ] **Step 8: Run the full desktop suite**

Run: `npm run -w @skill-flow/desktop test`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/screens/settings-screen.tsx \
  apps/desktop/src/view-models/settings-view-model.ts \
  apps/desktop/src/menu/tray.ts \
  apps/desktop/src/runtime/desktop-maintenance.ts \
  apps/desktop/src-tauri/src/lib.rs \
  apps/desktop/src-tauri/src/bridge.rs \
  apps/desktop/src/tests/settings-screen.test.tsx \
  apps/desktop/src/tests/settings-view-model.test.ts \
  apps/desktop/src/tests/tray.test.ts
git commit -m "feat: fully replicate desktop settings and tray workflow"
```

### Task 6: Make release proof match the replicated product

**Files:**
- Modify: `scripts/release/build-desktop.sh`
- Modify: `scripts/release/validate-desktop-artifacts.sh`
- Modify: `apps/desktop/src/tests/release-validation.test.ts`

- [ ] **Step 1: Add failing release tests for the replicated desktop output**

Add tests with these names:

```ts
it("validates host-platform macOS release artifacts from the generated dist root", () => {})
it("keeps linux and windows artifact expectations explicit in the validation script", () => {})
```

- [ ] **Step 2: Run the release validation test file and verify it fails if the script no longer matches the product output**

Run: `npm run -w @skill-flow/desktop test -- release-validation.test.ts`

Expected: PASS if the script still matches the generated artifact set, FAIL otherwise.

- [ ] **Step 3: Run the real release flow on the current host**

Run: `npm run desktop:release`

Expected: PASS and generated artifacts under `dist/cli/macos` and `dist/desktop/macos`.

- [ ] **Step 4: Run the real validation flow on the current host**

Run: `npm run desktop:release:validate`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/release/build-desktop.sh \
  scripts/release/validate-desktop-artifacts.sh \
  apps/desktop/src/tests/release-validation.test.ts
git commit -m "test: verify desktop release flow against replicated shell"
```

### Task 7: Final proof that the new shell is a usable replacement

**Files:**
- Modify: `docs/plan/cross-platform-desktop/CURRENT_IMPLEMENTATION_PLAN.md`
- Modify: `docs/plan/cross-platform-desktop/UI_PARITY_GAP.md`

- [ ] **Step 1: Run the full desktop suite**

Run: `npm run -w @skill-flow/desktop test`

Expected: PASS

- [ ] **Step 2: Run the host release flow again**

Run: `npm run desktop:release && npm run desktop:release:validate`

Expected: PASS

- [ ] **Step 3: Update the plan document to record the actual finished state**

Replace the active status section with these facts only:

```md
- full vertical parity pass completed for home, import, detail, settings, and tray
- macOS host release flow verified
- Linux and Windows host validation still pending if not yet executed
```

- [ ] **Step 4: Update the gap document to keep only the remaining host-platform proof**

Expected remaining items:

```md
## Remaining work
- Linux host build and validation
- Windows host build and validation
```

- [ ] **Step 5: Commit**

```bash
git add docs/plan/cross-platform-desktop/CURRENT_IMPLEMENTATION_PLAN.md \
  docs/plan/cross-platform-desktop/UI_PARITY_GAP.md
git commit -m "docs: record full desktop parity execution status"
```

## Self-review

- Spec coverage:
  - Full-screen replication is covered by Tasks 2 through 5.
  - Real data loading and real user actions are included inside each vertical slice.
  - Release proof is covered by Task 6.
  - Final documentation update is covered by Task 7.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
  - Every task names exact files and exact verification commands.
- Type consistency:
  - All tasks reference the current TypeScript and Tauri files already present in `apps/desktop`.
  - The release commands match the current root `package.json` scripts.

## Execution handoff

This plan replaces the previous horizontal parity plan. From this point forward, the branch should only advance by complete vertical slices that make one screen genuinely usable like `apps/desktop-mac`.

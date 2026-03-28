# Desktop Refoundation Development Status

> Branch-local status document. This file lives in the current worktree because `docs` is a symlink to an external checkout.

**Goal:** Consolidate the current desktop refoundation progress, close the current audit round, and list the remaining tasks in execution order.

**Architecture:** `apps/desktop-mac/Sources/DesktopApp` is now the active desktop implementation root. Route state is centered on `DesktopRoute` and `DesktopAppState`, while `MainViewModel` still acts as the bridge-backed data and mutation coordinator for Home, Detail, Import, and menu interactions.

**Tech Stack:** Swift 6, SwiftUI, Observation, XCTest, desktop bridge command, `packages/query`, `packages/storage`

---

## Current Baseline

- Active desktop implementation root: `apps/desktop-mac/Sources/DesktopApp`
- Legacy desktop implementation root: `apps/desktop-mac/Sources/Deprecated/SkillFlowDesktop`
- Current public page read model: `MainViewModel.currentRoute`
- Current page write entry points: `MainViewModel.requestPage(_:)` and `MainViewModel.syncCurrentPage(from:)`
- Verification baseline: `swift test --package-path apps/desktop-mac`
- Latest verification result: 90 tests passed, 0 failed on 2026-03-28

## Completed Progress

### 1. Desktop runtime foundation is in place

- `DesktopAppState`, `WorkspaceState`, `ViewState`, and `AsyncResourceState` exist under `Sources/DesktopApp/Store`
- `DesktopRoute` and `DesktopNavigator` exist under `Sources/DesktopApp/Navigation`
- `DesktopRuntime` exists and owns the initial bootstrap route and selection state flow
- `DesktopAppContainer` is the active shell used by `SkillFlowDesktopApp`

### 2. All four desktop pages have active `DesktopApp` screen roots

- Home: `Screens/Home/HomeScreen.swift` and `Screens/Home/HomeScreenContainer.swift`
- Detail: `Screens/Detail/DetailScreen.swift` and `Screens/Detail/DetailScreenContainer.swift`
- Import: `Screens/Import/ImportScreen.swift` and `Screens/Import/ImportScreenContainer.swift`
- Settings: `Screens/Settings/SettingsScreen.swift` and `Screens/Settings/SettingsView.swift`

### 3. Route authority is mostly centralized on explicit desktop routes

- `DesktopAppState.view.currentRoute` is the route fact used by the active containers
- `HomeViewModel` already reads route directly from foundation state
- `MainViewModel.currentRoute` is now the public read-side accessor for page state
- Test coverage has been updated to assert route behavior instead of direct `currentPage` mutation

### 4. Settings no longer uses raw `@AppStorage` in the active desktop path

- Active settings UI binds through `SettingsViewModel`
- Persistence is still `UserDefaults`, but the active page no longer manages storage inline inside the view

### 5. Detail and Import page shells are active and covered by tests

- Detail route wiring is covered by `DetailScreenContainerTests` and workflow coverage
- Import route wiring, recommendation loading, preview, and import flows are covered by `ImportScreenContainerTests` and `WorkflowCoverageTests`

## In-Progress Boundaries

### 1. `MainViewModel` is still the desktop coordination bottleneck

- It still owns bridge calls, payload parsing, draft state, toast state, doctor state, import flows, detail content preparation, and write synchronization
- The file remains the main cross-page coordinator instead of a thinner page-facing adapter

### 2. `currentPage` is not deleted yet

- `currentPage` is now private and reduced to an internal compatibility cache
- `routeRequest` and `currentRouteProvider` still exist as transition seams
- Production code no longer depends on `currentPage` as the public route state, but the cache has not been removed

### 3. The deprecated desktop tree still exists

- `Sources/Deprecated/SkillFlowDesktop` is no longer the active implementation
- It has not been deleted yet, so migration is not complete

## Page Data Loading Matrix

| Page | Local data | Cache-backed data | Network / external refresh | Current status |
| --- | --- | --- | --- | --- |
| Home | Yes. Bootstrap and list payloads provide summaries, drafts, pins, and audit state. | No dedicated page cache layer beyond persisted workspace state. | Indirect only through bridge bootstrap/list. | Sufficient for a local workspace page. Not a true three-layer page. |
| Detail | Yes. `summary`, `draft`, selected source, and local fallback detail render before inspect-derived enrich fields are complete. | Yes. `sourceMetadata` and `sourceSnapshot` can reuse cache-backed query results; prepared documents and file tree are warmed locally after inspect. | Yes. Inspect path may refresh metadata and import snapshot data. | Semantically closest to local + cache + network, but still blocked by heavy inspect and main-thread bridge execution. |
| Import | Yes. Card drafts live in `ImportScreenState`; recommendation/search/preview state renders immediately from current model. | Yes. recommendation feeds, search snapshots, and source snapshots all use storage-backed cache with stale reuse. | Yes. exact repo lookup, search refresh, preview refresh, and snapshot enrich all hit external providers through query runtime. | Has meaningful cache and network layering, but card hydration is still uneven and drafts are still page-local. |
| Settings | Yes. Values load from `UserDefaults` through `SettingsViewModel`. | No separate cache layer. | No network layer. | Complete as a local settings page, but not unified into runtime/store state. |

## Remaining Work

### Must Do

#### A. Make desktop bridge execution non-blocking

Status: not started in the active path

- `Runtime/Bridge/BridgeClient.swift` is still `@MainActor`
- `send(...)` still calls `process.waitUntilExit()`
- Detail and import responsiveness remain bounded by this bridge behavior

#### B. Split detail loading into a true local-first progressive flow

Status: partially prepared, not complete

- `detailViewData(for:)` already supports partial local rendering
- Query runtime still makes `inspectSourceImpl()` begin with `listWorkflowsImpl()`
- The current bridge `inspect` contract still mixes local workspace facts with metadata/snapshot enrichment

#### C. Move expensive detail content preparation off the main actor

Status: not complete

- `scheduleDetailContentWarmupIfNeeded` still starts from a `Task { @MainActor ... }`
- `prepareDetailContent(...)` still performs local parsing and file-tree building in the active view-model path

### Cleanup After Behavior Stabilizes

#### D. Finish route refoundation cleanup

Status: low-risk cleanup, not finished

- Remove the last internal `currentPage` cache from `MainViewModel`
- Replace `routeRequest` and `currentRouteProvider` with a single explicit route owner
- Keep route regression coverage for home, detail, import, settings, and delete/import navigation paths

#### E. Finish page-state boundary cleanup

Status: mixed

- Detail page state has a dedicated `DetailScreenState`, but business loading still lives in `MainViewModel`
- Import drafts still live in `ImportScreenState.draftsByItemId`
- Settings uses a dedicated view model, but not a shared runtime/store slice
- Menu bar and main window still share one `MainViewModel`

#### F. Remove the deprecated desktop source tree

Status: not started

- Delete `apps/desktop-mac/Sources/Deprecated/SkillFlowDesktop`
- Remove any remaining references, assumptions, or documentation that treats it as current

#### G. Refresh plan and audit documents

Status: not started

- Update runtime and migration plans to reflect `currentRoute` instead of `currentPage`
- Mark old-path plans that still target `Sources/SkillFlowDesktop/...` as outdated or historical
- Refresh the page data flow audit to describe the active `DesktopApp` path

## Recommended Execution Order

### Task 1: Fix bridge blocking in the active `DesktopApp` path

Reason:
- Highest user-facing responsiveness risk still open
- Blocks any claim that desktop loading is actually progressive

### Task 2: Separate detail local shell from remote enrichment

Reason:
- This is the real functional follow-up to the bridge fix
- It converts the current partial detail layering into an explicit two-phase model

### Task 3: Move detail content warmup off the main actor

Reason:
- Local-first detail still stalls if expensive parsing and tree building stay on the main actor

### Task 4: Finish route and page-state cleanup

Reason:
- `currentPage` removal and page-local state cleanup are still useful
- They are no longer the highest-value blocking work

### Task 5: Delete deprecated desktop sources and refresh planning docs

Reason:
- Final cleanup should happen after the active path no longer depends on transitional seams

## Immediate Next Task Definition

If work resumes immediately after the current packaging fix, the next focused engineering task should be:

1. Add focused tests around bridge execution and detail warmup threading
2. Remove `@MainActor` / blocking wait behavior from the bridge path
3. Re-run `swift test --package-path apps/desktop-mac`
4. Commit the bridge fix as a standalone refactor unit

## Verification

Run:

```bash
swift test --package-path apps/desktop-mac
```

Expected:

- 90 tests passed
- 0 failed

# Desktop Refoundation Development Status

> Branch-local status document. This file lives in the current worktree because `docs` is a symlink to an external checkout.

**Goal:** Consolidate the current desktop refoundation progress, close the current audit round, and list the remaining tasks in execution order.

**Architecture:** `apps/desktop-mac/Sources/DesktopApp` is now the active desktop implementation root. Route state is centered on `DesktopRoute` and `DesktopAppState`, while `MainViewModel` acts as the bridge-backed data and mutation coordinator for Home, Detail, Import, and menu interactions.

**Tech Stack:** Swift 6, SwiftUI, Observation, XCTest, desktop bridge command, `packages/query`, `packages/storage`

---

## Current Baseline

- Active desktop implementation root: `apps/desktop-mac/Sources/DesktopApp`
- Legacy desktop implementation root: `apps/desktop-mac/Sources/Deprecated/SkillFlowDesktop`
- Current public page read model: `MainViewModel.currentRoute`
- Current page write entry point: `MainViewModel.requestPage(_:)`, which writes into bound `DesktopAppState.view.currentRoute`
- Verification baseline: `swift test --package-path apps/desktop-mac`
- Latest verification result: 98 tests passed, 0 failed on 2026-03-28

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

### 6. Desktop bridge execution no longer blocks the main actor

- `BridgeClient` no longer uses `process.waitUntilExit()`
- Bridge requests now await process termination asynchronously
- `BridgeClientExecutionTests` verifies main-actor work can continue while a slow helper is still running

### 7. Detail inspect no longer depends on a full list reconciliation pass

- `inspectSourceImpl()` now derives local summary, binding, leaf, and deployment facts from stored manifest/lock state
- Query-level coverage verifies `inspectSource()` still succeeds when `reconcileInventory()` fails but local state is already present
- CLI bridge inspect coverage still passes against the same response envelope

### 8. Detail content warmup no longer prepares documents on the main actor

- `scheduleDetailContentWarmupIfNeeded` now captures a sendable warmup input and executes file parsing and file-tree preparation in a detached task
- Prepared detail content is published back on the main actor only after background work completes
- `MainViewModelSelectionTests` covers that unrelated main-actor work can still run while detail warmup is in flight

### 9. Desktop detail state now stages enrichment after the local inspect shell

- `MainViewModel.selectSource(_:)` now stores the inspect shell first and then requests enrichment through a separate bridge call
- `detailViewData(for:)` renders summary, binding, deployment, and file preparation facts from the local shell before `sourceMetadata` and `sourceSnapshot` are applied
- `MainViewModelSelectionTests` verifies enrichment arrives without triggering a second inspect request

### 10. Query and bridge detail loading now expose explicit shell and enrichment phases

- `SkillFlowApp.inspectSource()` now returns only local detail shell facts: summary, source, binding, leafs, and deployments
- `SkillFlowApp.inspectSourceEnrichment()` now owns `sourceMetadata` and `sourceSnapshot`
- The bridge protocol now includes `inspect-enrichment`, and desktop detail hydration calls both explicit phases instead of splitting one payload locally

### 11. `currentPage` and route transition seams are removed from the active desktop path

- `MainViewModel` no longer keeps an internal `currentPage` cache
- `routeRequest` and `currentRouteProvider` are removed
- `HomeScreenContainer` now binds `MainViewModel` directly to `DesktopAppState`, and route tests assert state ownership through that binding

### 12. Detail page read-side now consumes snapshots instead of raw `MainViewModel` detail data

- `MainViewModel.detailSnapshot(for:)` is now the page-facing Detail read contract
- `DesktopAppContainer` and workflow/detail tests no longer build active Detail UI from `MainViewModel.DetailViewData`
- `MainViewModel.DetailViewData` remains an internal assembly shape inside `MainViewModel`

### 13. Import drafts now live in shared desktop app state

- `ImportDraftState` and `ImportState` now live under `Sources/DesktopApp/Store`
- `ImportScreenContainer` keeps `searchText` and `placeholderIndex` as page-local UI state, but card draft selections now persist in `DesktopAppState.importState`
- Import draft coverage now verifies the same draft survives `ImportScreenContainer` recreation against shared app state

### 14. Import page business state now reads through `ImportScreenContainer`

- `ImportScreenContainer.snapshot(locale:)` now exposes `searchPhase`, `submittedQuery`, `cards`, and `importingGroupId` as the page-facing Import read contract
- `ImportScreen` no longer reads import business state directly from `MainViewModel`
- Import search, preview, import, and target-label actions are now delegated through `ImportScreenContainer`

### 15. Detail page actions and fallback state now route through `DetailScreenContainer`

- `DetailScreenContainer` now owns fallback-row projection and forwards detail route actions like select, update, skill toggles, and target toggles
- `DetailScreen` no longer depends on `MainViewModel` directly
- Detail container coverage now verifies both fallback-row projection and action forwarding

## In-Progress Boundaries

### 1. `MainViewModel` is still the desktop coordination bottleneck

- It still owns bridge calls, payload parsing, draft state, toast state, doctor state, import flows, detail content preparation, and write synchronization
- The file remains the main cross-page coordinator instead of a thinner page-facing adapter, even though active Detail and Import pages now read and act through page containers

### 2. Import page still has mixed local and shared state ownership

- Import drafts now live in shared app state
- Search box text and placeholder animation index still live in `ImportScreenState`, which is acceptable as UI-local state for now
- Import business loading still comes from `MainViewModel`, but the active page now reads and acts through `ImportScreenContainer`

### 3. The deprecated desktop tree still exists

- `Sources/Deprecated/SkillFlowDesktop` is no longer the active implementation
- It has not been deleted yet, so migration is not complete

## Page Data Loading Matrix

| Page | Local data | Cache-backed data | Network / external refresh | Current status |
| --- | --- | --- | --- | --- |
| Home | Yes. Bootstrap and list payloads provide summaries, drafts, pins, and audit state. | No dedicated page cache layer beyond persisted workspace state. | Indirect only through bridge bootstrap/list. | Sufficient for a local workspace page. Not a true three-layer page. |
| Detail | Yes. `summary`, `draft`, selected source, and an explicit local inspect shell render before enrich fields are applied. | Yes. `sourceMetadata` and `sourceSnapshot` reuse explicit enrichment queries and local prepared document/file-tree caches. | Yes. inspect shell and enrichment now travel through separate bridge/query phases. | Three-layer flow is explicit end-to-end. Remaining work is cleanup, not data-flow authority. |
| Import | Yes. Card drafts live in `ImportScreenState`; recommendation/search/preview state renders immediately from current model. | Yes. recommendation feeds, search snapshots, and source snapshots all use storage-backed cache with stale reuse. | Yes. exact repo lookup, search refresh, preview refresh, and snapshot enrich all hit external providers through query runtime. | Has meaningful cache and network layering, but card hydration is still uneven and drafts are still page-local. |
| Settings | Yes. Values load from `UserDefaults` through `SettingsViewModel`. | No separate cache layer. | No network layer. | Complete as a local settings page, but not unified into runtime/store state. |

## Remaining Work

### Cleanup After Behavior Stabilizes

#### C. Finish route refoundation cleanup

Status: completed

- `MainViewModel` route writes now bind directly to `DesktopAppState`
- Transition seams and the last route cache are removed from the active desktop path
- Route regression coverage stays green across home, detail, import, settings, and workflow navigation paths

#### D. Finish page-state boundary cleanup

Status: next active cleanup

- Detail page now reads and acts through `DetailScreenContainer`, but business loading still lives in `MainViewModel`
- Import drafts now live in `DesktopAppState.importState`, and Import page reads through `ImportScreenContainer`, but Import business loading still lives in `MainViewModel`
- Settings uses a dedicated view model, but not a shared runtime/store slice
- Menu bar and main window still share one `MainViewModel`

#### E. Remove the deprecated desktop source tree

Status: not started

- Delete `apps/desktop-mac/Sources/Deprecated/SkillFlowDesktop`
- Remove any remaining references, assumptions, or documentation that treats it as current

#### F. Refresh plan and audit documents

Status: not started

- Update runtime and migration plans to reflect `currentRoute` instead of `currentPage`
- Mark old-path plans that still target `Sources/SkillFlowDesktop/...` as outdated or historical
- Refresh the page data flow audit to describe the active `DesktopApp` path

## Recommended Execution Order

### Task 1: Finish route and page-state cleanup

Reason:
- Route authority cleanup is done
- Page-local state cleanup is now the highest-value remaining cleanup work on the active desktop path

### Task 2: Delete deprecated desktop sources and refresh planning docs

Reason:
- Final cleanup should happen after page-state ownership is clearer and the active path stays stable without transitional seams

## Immediate Next Task Definition

If work resumes after the route authority cleanup, the next focused engineering task should be:

1. Decide whether the remaining Import business-loading implementation should leave `MainViewModel` now that the page-facing adapter exists
2. Decide whether the remaining Detail business-loading APIs should also leave `MainViewModel`
3. Verify whether menu bar and main window still need to share one `MainViewModel`
4. Re-run `swift test --package-path apps/desktop-mac`

## Verification

Run:

```bash
swift test --package-path apps/desktop-mac
```

Expected:

- 98 tests passed
- 0 failed

# Desktop Migration Contract

## Scope

- Freeze the current `apps/desktop-mac` shell contract for cross-platform migration.
- Treat the desktop app as a surface over shared `~/.skillflow` state and `skill-flow bridge --json`, not as a separate product with its own data model.
- Keep the contract limited to the current route set, runtime dependencies, bridge surfaces, localization, projection rules, resource discovery behavior, and shared main-window/menu-bar shell behavior already covered by the macOS app and tests.

## Routes and Navigation Rules

- Route inventory is fixed to `home`, `detail(sourceId)`, `importPage`, and `settings`.
- Route entry behavior in scope includes `DesktopAppContainer.navigation`, `HomeScreenContainer.navigation`, `DesktopRuntime.showDetail(sourceId:)`, `DesktopNavigator.show*`, and `MainViewModel.requestPage(...)`.
- Route changes write into `DesktopAppState.view.currentRoute`; `HomeViewModel.currentRoute` must mirror that value.
- `DesktopAppContainer.navigation.showDetail(_:)` sets the detail route and then triggers asynchronous source selection and inspection.
- `DesktopRuntime.showDetail(sourceId:)` trims the id, ignores empty input, sets `selectedSourceId`, and writes the detail route without any bridge call.
- `showHome`, `showImportPage`, and `showSettings` only change the route; they do not mutate workspace data.
- The shell must not invent additional route state, route aliases, or hidden navigation layers during migration.

## Screen Contracts

### Home

- Home is the bootstrap surface for the shared workspace source list.
- Bootstrap enters `loading`, then resolves to `ready`, `failed`, or `empty`-style presentation depending on data and warnings.
- `overviewState`, `sourcesState`, `deploymentsState`, and `doctorState` must preserve their current loading/empty/partial/error mapping.
- Core workflows are: open detail, refresh list, update all groups, update one group, pin/unpin, and switch project scope.
- `updateCurrentGroup()` uses the selected source only; no selection means no mutation and an error toast.
- `updateAllGroupsFromHome()` updates every non-empty source id currently in the list.

### Import

- Import content is split by `importSubmittedQuery`: empty query shows recommendations, non-empty query shows search results.
- `loadImportPageIfNeeded()` only seeds local recommendation data; it must not trigger search.
- Search and preview have explicit `loading`, `ready`, and `failed` phases.
- `previewImportGroupIfNeeded(_:)` runs once per group unless the group is already resolved.
- Successful import keeps the user on `importPage` when launched there; otherwise it navigates to the imported detail route.

### Detail

- Detail content is route-scoped and must come from inspect plus enrichment data for the active `detail(sourceId:)` route.
- Missing payloads use loading or empty presentation, not stale content from a previous source.
- Default detail selection is driven by `DetailRouteBootstrap.applySelections(...)`; overview is the initial state when loaded detail has no prior selection.
- Skill and target toggles update the current group through serialized mutation flow.
- The detail shell must preserve file tree, document tabs, selection state, and projection-derived labels exactly as the current tests expect.

### Settings

- Settings persist immediately through `DesktopSettingsStore` and stay backed by `UserDefaults`.
- The persisted surface includes auto-launch, log level, external helper flag, desktop language, theme mode, theme accent, home card density, menu card density, selected project scope, recent project scopes, and agent display preferences.
- Update checking uses `UpdateStatus` with `idle`, `checking`, `upToDate`, `updateAvailable`, and `failed`.
- `checkForUpdatesIfNeeded()` runs once per `SettingsViewModel` instance unless the view model is recreated.
- `openReleasePage()` opens the fetched release URL when present and falls back to the latest releases page otherwise.

## Shared State and Runtime Dependencies

- `DesktopRuntime` owns the single shared `DesktopAppState`; the desktop shell must not create a second source of truth.
- `DesktopRuntime.bootstrapIfNeeded()` is idempotent while the home bootstrap phase is `loading` or `ready`; it loads source ids once, seeds selection to the first source when needed, and records `idle`/`loading`/`ready`/`failed` in async resource state.
- `DesktopSettingsStore` is the only settings persistence layer.
- `DesktopGroupTagStore` owns custom group tag persistence and must tolerate legacy stored shapes.
- `BridgeClient` serializes all mutating bridge calls through its mutation coordinator; concurrent mutation attempts must be rejected, not queued.
- `DesktopMutationCoordinator` is the desktop seam for pin and selected-source updates and must not bypass bridge serialization.
- `BridgeClient` remains the runtime boundary for query and command execution.
- `MarkdownDocumentRenderer` cache is keyed by `renderCacheKey`; in-flight renders for the same key are shared and cancel only when the last waiter cancels.

## Bridge, Query, and Command Surfaces

- Query surface: `bootstrap`, `list`, `inspect(sourceId:scope:)`, `inspectEnrichment(sourceId:)`, `searchImportGroups(query:)`, and `previewImportSource(locator:)`.
- Command surface: `togglePinnedSource`, `updateSources`, `importSource`, `uninstall`, `apply`, and `doctor`.
- Desktop-used bridge command inventory currently includes `bootstrap`, `list`, `inspect`, `inspect-enrichment`, `search-import-groups`, `preview-import-source`, `import-source`, `toggle-pin`, `doctor`, `apply`, `update`, and `uninstall`. `BridgeCommand` also defines `add`, but it is not part of the current desktop-used surface.
- Payload shapes are fixed: `updateSources(nil)` serializes as an empty `sourceIds` array, `importSource` sends a `draft` with `selectedSkillIds` and `enabledTargets`, `apply` sends a `draft` with `selectedLeafIds` and `enabledTargets`, and `inspect`/`apply` carry `scope.bridgePayload`.
- `BridgeClientError` localization and dependency mapping are part of the contract: helper missing, invalid response, timeout, empty response, concurrent mutation rejection, and missing `node`/`git`/`npx` dependencies must keep their current meanings.
- Helper discovery must keep the current search order across bundled helper locations and dev fallback paths, and must fail with `helperMissing` when no helper exists.

## UI Behavior Parity Requirements

- Page parity gate before cutover:
  - Home must keep a route-aware top bar, app title, search field, import/settings entry actions, and project scope controls.
  - Import must keep recommendation rails plus centered empty/loading/failure presentation.
  - Detail must keep a dedicated sidebar, structured detail header, and split main/body layout.
  - Settings must keep sectioned appearance, agent display, update, general, advanced, and maintenance surfaces.
- Screen-level validation must assert layout surfaces and key interactions, not only isolated text presence.
- Localization must continue to resolve through `L10n` using the active desktop language, with English fallback when a locale bundle is missing a key.
- User-facing copy used by home, import, detail, settings, bridge errors, toasts, and project scope must remain backed by localized keys that already exist in the current bundles.
- `PresentationText.localized(...)` is the canonical way to defer string resolution, and toast rendering must continue to resolve against the presentation locale.
- `DesktopCardClickPolicy.allowsWholeCardTap(for:)` stays `true` only for `home`.
- `DesktopMotionTokens` stay fixed at the current values; the shell should preserve the existing hover and press feel.
- `DesktopResourceLocator.resourceDirectories(...)` keeps the current bundle/source-root search order and path de-duplication.
- `DesktopResourceLocator.runtimeResourceBundle()` keeps the current runtime bundle lookup behavior for packaged and development layouts.
- Projection name generation must preserve the current parity rules: exclude the current source, only consider sources with overlapping enabled targets, and resolve conflicts in the current preferred-name order.

## Non-Goals

- No new routes, route aliases, or alternate navigation state.
- No separate desktop database or additional persistence layer.
- No protocol redesign, command renaming, or bridge version bump.
- No rewrite of the current projection model, target catalog, or localization key families.
- No extra compatibility shims beyond the legacy reads already present in the current stores.
- No changes to resource lookup order, helper discovery order, or render-cache semantics unless this contract is updated first.

## Validation Checklist

- Route inventory matches `DesktopRoute`, `DesktopNavigationTests`, `MainViewModelRouteTests`, and `DesktopAppContainerTests`.
- Home, import, detail, and settings flows still satisfy the current coverage in `WorkflowCoverageTests`, `DesktopAppContainerTests`, `DetailLoadingLayoutTests`, and `DetailScreenContainerTests`.
- Mutation behavior still rejects concurrent writes and preserves the current toast/error handling in `DesktopMutationCoordinatorTests` and `WorkflowCoverageTests`.
- Settings update checks still match `SettingsViewModelTests`, including one-time background checking and release-page fallback.
- Project scope persistence still matches `MainViewModelProjectScopeTests` and `SettingsStateTests`.
- Localization still passes `DesktopLocalizationTests`.
- Group tag persistence and editing still match `GroupTagControllerTests`.
- Runtime bootstrap and detail routing still match `DesktopRuntimeTests`.
- Projection parity still passes `ProjectionRulesTests`.
- Resource lookup still passes `DesktopResourceLocatorTests`, and helper discovery/dependency behavior still matches the current `BridgeClientExecutionTests` coverage plus the search order implemented in `BridgeClient`.
- Markdown rendering and motion behavior still pass `MarkdownDocumentRendererTests` and `DesktopInteractionMotionTests`.
- Any migration change that violates one of the above is out of contract.

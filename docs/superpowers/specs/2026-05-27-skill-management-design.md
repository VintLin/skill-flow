# Skill Management Enhancements Design

Date: 2026-05-27

## Goal

Improve desktop Skill group management without changing the existing source identity model.

This design covers three user-facing changes:

1. Skill groups can be renamed from the desktop app.
2. The home page gains a sidebar for filtering groups by tag, project, and applied Agent.
3. The home search input can accept supported import locators and route them into the import preview flow.

## Non-Goals

- Do not rename `sourceId`, checkout directories, leaf ids, bindings, projections, or deployment records.
- Do not replace the existing import page.
- Do not redesign CLI/TUI workflows beyond the bridge/runtime support needed by desktop.
- Do not expand this into general plugin asset management.

## Current Context

The desktop home page already has:

- text search through `MainViewModel.searchQuery`;
- group cards built from `MainViewModel.groupCards`;
- custom and recommendation-derived tags through `GroupTagController`;
- project scope state through `selectedProjectScope` and `recentProjectScopes`;
- import discovery and preview on the import page through `ImportScreenContainer`, `ImportViewModel`, and `import-source` bridge calls.

The current group title comes from `SourceManifestRecord.displayName` and corresponding lock data. It is derived from the source locator when imported.

## Approach

Use core state for the mutable group display name. Keep sidebar filter state in desktop state because it is a view concern derived from existing source, tag, project, and target data.

This keeps external identity stable while making the group title an intentional user-managed label.

## Feature 1: Rename Skill Group

### Behavior

- A user can edit a group name from the desktop group card or detail page.
- Saving an empty or whitespace-only name is rejected.
- Saving a duplicate display name is allowed only if the current system already allows duplicate display labels. Otherwise it should follow the existing uniqueness expectation for local source labels.
- Rename updates visible titles on home and detail views after the mutation succeeds.
- Rename does not change any deployment path, source id, checkout path, leaf id, selected skill, selected target, pin, tag, or project draft.

### Data Model

No schema version change is required if only existing `displayName` fields are updated:

- `manifest.sources[].displayName`
- `lock.sources[].displayName`

The runtime must update both in one serialized mutation.

### Bridge/API

Add a bridge command:

```text
rename-source
```

Payload:

```json
{
  "sourceId": "example-source",
  "displayName": "My Skill Group"
}
```

Response data:

```json
{
  "sourceId": "example-source",
  "displayName": "My Skill Group"
}
```

Errors:

- `SOURCE_NOT_FOUND`
- `DISPLAY_NAME_EMPTY`
- `DISPLAY_NAME_INVALID`

### Desktop UI

Add a compact edit affordance near the group title:

- home card: inline title edit or small rename action in the card action menu;
- detail page: title edit from the detail header.

The first implementation should prefer the card action menu if inline editing creates layout risk.

## Feature 2: Home Sidebar Filters

### Behavior

The home page gains a left sidebar with three filter sections:

- Tags: all available tags from `GroupTagController.HomeSnapshot`.
- Projects: global plus recent project scopes.
- Agents: targets that appear in current group cards.

Filters combine with AND semantics:

- text search narrows the initial group list;
- selected tag narrows by tag membership;
- selected project scope comes from existing project scope selection;
- selected Agent narrows to groups where that target is enabled.

The default state shows all tags and all Agents under the selected project scope.

### State

Keep filter state in desktop view state:

- selected tag key already exists as `state.groupTags.selectedHomeFilterKey`;
- selected project scope already exists in settings state;
- add selected Agent filter as desktop-only view state.

The selected Agent filter should not be persisted in core preferences for this phase. It can reset on app launch.

### UI Placement

Replace the current horizontal home tag filter bar with a sidebar on home only.

Recommended layout:

- left sidebar fixed width around 220-260 px;
- right content keeps the existing card grid;
- narrow width can collapse the sidebar into a toolbar button or horizontal rows, but desktop minimum width is currently 980 px, so the first pass can target the fixed sidebar.

### Derived Agent Data

Agent filter options come from `GroupCardModel.targets`:

- include targets that are visible in the current target catalog;
- show count of groups where the target is enabled;
- selecting a target shows only groups with `target.isEnabled == true`.

## Feature 3: Home Import Locator

### Behavior

When the user submits the home search field:

- if the input looks like a supported import locator, navigate to the import page;
- copy the input into the import page search field;
- start the import preview flow for that locator;
- show the existing import card and require the user to confirm import.

If the input is not an import locator, keep the current home text search behavior.

### Supported Locator Detection

Use a conservative detector:

- existing local directory path;
- `file://` URL;
- GitHub/GitLab/hosted Git URL;
- `owner/repo` GitHub shorthand;
- `clawhub:<slug>`;
- quoted local paths, relying on existing source resolution quote stripping.

Avoid treating arbitrary words with slashes as locators unless they match a clear hosted repo shorthand.

### Flow

Add a home submit handler:

1. Normalize the input.
2. If it is not a locator, do nothing beyond current search.
3. If it is a locator, route to `.importPage`.
4. Set `ImportScreenState.searchText`.
5. Trigger a direct locator preview path.

The direct preview path should reuse existing `preview-import-source` and `import-source` behavior. Search results are not required for direct locator import.

## Component Changes

### TypeScript

- `packages/shared-types/src/protocol.ts`
  - add `rename-source` to `BridgeCommandName` and parser.
- `apps/cli/src/bridge-command.ts`
  - parse `rename-source` payload and call runtime.
- `packages/query/src/runtime.ts`
  - add `renameSource(sourceId, displayName)`;
  - update manifest and lock together through serialized mutation.
- `packages/storage/src/store.ts`
  - optionally add a focused helper for updating source display names, or keep the mutation in runtime with `readState` / `writeState`.

### Swift Desktop

- `BridgeClient`, `DesktopCommanding`, and `DesktopBridgeCommandFacade`
  - add `renameSource`.
- `MainViewModel`
  - expose rename mutation;
  - add selected Agent filter state;
  - add locator submit handling and import page handoff.
- `HomeScreenContainer`
  - expose sidebar filter operations and import handoff.
- `MainView`
  - add sidebar layout;
  - remove or demote the horizontal tag bar;
  - add rename UI action.
- `ImportScreenContainer`
  - add direct preview entry for one locator if current APIs cannot express it cleanly.

## Error Handling

- Rename failures show an error toast and leave the old title unchanged.
- Import locator preview failures use existing import page failed-card behavior where possible.
- Agent filters with no matches show the existing empty state with filter context.
- If selected tag or Agent disappears after refresh, clear that filter.

## Testing

### TypeScript

- shared protocol accepts `rename-source`.
- bridge command rejects invalid rename payloads.
- runtime rename updates manifest and lock while preserving ids and bindings.
- runtime rename returns `SOURCE_NOT_FOUND` for missing source.

### Swift

- `BridgeClient` encodes `rename-source`.
- `MainViewModel` optimistic or post-success rename behavior preserves state on failure.
- sidebar filtering combines tag, project, Agent, and text search.
- home import locator submit routes to import page and starts preview.
- non-locator home submit keeps search behavior.

### Manual Verification

- Start desktop app.
- Rename one Skill group, quit and reopen, confirm title persists.
- Filter by tag, project, and Agent in combination.
- Paste a GitHub URL or local path into home search, press Enter, confirm import page preview appears.
- Confirm import still requires explicit user action.

## Rollout Notes

This is an external bridge behavior change because a new command is added. It should include protocol and desktop tests. User-facing docs only need updates if desktop release notes are being prepared in the same change.

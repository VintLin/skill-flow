# Home Sidebar Background Design

## Goal

Make the home sidebar read as a distinct filter panel by giving it a white sidebar background while preserving the current sidebar structure and project list behavior.

## Confirmed Decisions

- Use option 1 from the visual comparison: one sidebar-level background.
- The sidebar uses a white/surface background and keeps the existing trailing hairline divider.
- Do not add rounded corners, shadows, nested cards, or per-section backgrounds.
- `Projects` stays as the existing bottom vertical list and does not become collapsible.
- `status`, `sourceType`, `tags`, and `agents` default to collapsed.
- Only tag options may display a `#` prefix. Status, source type, agent, and project options must not display `#`.

## UI Behavior

The home page keeps the current left sidebar and right card grid layout. The left sidebar gets an explicit white/surface background across its full height so it visually separates from the page background and the card grid. The existing right border remains as the boundary between filter panel and content.

The collapsible chip sections still work as they do now:

- Collapsed sections show one horizontal row with hidden scroll indicators.
- Expanded sections wrap chips using `WrappingHStack`.
- Section toggle accessibility labels continue to include the section title.

The initial state changes so all collapsible sections start collapsed:

- Status: collapsed
- Source Type: collapsed
- Tags: collapsed
- Agents: collapsed
- Projects: unchanged vertical list

## Implementation Scope

This is a small desktop-only SwiftUI polish change. It should touch only:

- `apps/desktop-mac/Sources/DesktopApp/Store/ViewState.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

No data model, bridge protocol, CLI helper, localization, import flow, rename flow, or packaging behavior changes are required.

## Testing

Focused verification should cover:

- `ViewState.expandedHomeSidebarSectionIds` defaults to an empty set.
- The existing default-state test expects no expanded home sidebar sections.
- The sidebar uses a white/surface background instead of `AppTheme.headerBackground`.
- The sidebar still has the trailing divider.
- Non-tag chip item builders do not add `#` prefixes.
- Tag chip items remain the only home sidebar chip source allowed to carry tag-style text.

Expected commands:

```bash
cd apps/desktop-mac
swift test --filter MainViewModelSelectionTests/testHomeStatusAndSourceFilterDefaultsAreAvailable
swift test --filter DesktopInteractionRegressionTests
swift build
```

## Self-Review

- Placeholder scan: no placeholders remain.
- Internal consistency: the spec keeps Projects unchanged while changing only collapsible section defaults.
- Scope check: this is one focused UI polish change and does not need decomposition.
- Ambiguity check: "white" means the existing app surface token in light mode; the implementation may use `AppTheme.surface(for: theme)` so dark mode stays theme-correct.

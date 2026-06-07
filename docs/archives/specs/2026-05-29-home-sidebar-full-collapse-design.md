# Home Sidebar Full Collapse Design

## Goal

Make the home sidebar truly disappear when collapsed, move the expand control into the original app identity area, and recalculate the home card grid from the actual available content width.

## Confirmed Direction

The selected direction is `B` from the visual companion plus `A` for the expanded header:

- Collapsed state fully removes the sidebar column. It does not keep the current `72pt` rail.
- The collapsed expand button appears where the app icon/title area used to be, while avoiding the native macOS traffic-light controls.
- Expanded state keeps the full-height sidebar.
- In the expanded sidebar header, `logo + Skill Flow` starts after the traffic-light safe area.
- The collapse button moves to the right side of the expanded sidebar header so it does not push the app title farther right.
- Card grid column count remains capped at `4`.

## Current Problem

The current implementation still renders a `72pt` hidden rail. The toggle is offset to avoid traffic lights, and the main header reserves space for that offset. This creates two issues:

- The sidebar is visually collapsed but still occupies horizontal space.
- `LayoutMetrics.homeGridAvailableWidth` always subtracts the expanded sidebar width, so collapsed mode can still render only two cards per row with large empty margins.

The expanded sidebar also starts the entire header row after the traffic-light inset. This avoids the native buttons but pushes the toggle, app icon, and `Skill Flow` title too far right.

## Layout

### Expanded Home Sidebar

Expanded mode keeps the current integrated shell:

```text
sidebar column | main column
```

Sidebar column:

- Width: `244` on regular windows.
- Width: `208` on narrow windows.
- Background: `AppTheme.surface(for: theme)`.
- Right divider: `AppTheme.cardBorder(for: theme)` hairline.
- Full height from the top of the window to the bottom.

Sidebar header:

- Height: `52`.
- Left side reserves the macOS traffic-light safe area.
- `headerLogoRow` starts after that safe area.
- Collapse button is aligned to the trailing side of the sidebar header.
- Header order is:

```text
traffic-light safe area | app icon + Skill Flow | spacer | collapse button
```

This keeps the app identity readable without placing it under native controls, and avoids using the collapse button as part of the left-leading identity group.

### Collapsed Home Sidebar

Collapsed mode removes the sidebar column from the `homeShell` layout:

```text
main column only
```

There is no `homeSidebarRail` and no `homeSidebarRailWidth` in the active layout.

The expand button is rendered in the home main header:

- It appears in the original app identity area at the top-left of the window.
- It is positioned after the native macOS traffic-light controls.
- It uses the same sidebar toggle icon and "show sidebar" accessibility label.
- It reserves enough horizontal room so it does not overlap the search field.

The collapsed main header order is:

```text
traffic-light safe area | expand button | search | spacer | import | update | settings
```

The expanded main header order remains:

```text
search | spacer | import | update | settings
```

## Card Grid Width

Home grid width must follow the actual sidebar visibility state.

Expanded:

```text
available = window width - expanded sidebar width - home content horizontal padding
```

Collapsed:

```text
available = window width - home content horizontal padding
```

The grid keeps the existing fixed card width and maximum column count:

- Card width remains `304`.
- Column spacing remains `14`.
- Maximum column count remains `4`.

The goal is only to stop collapsed mode from subtracting an invisible sidebar width. Wide windows can regain a third or fourth card column when the sidebar is collapsed, but the card system itself does not change.

## State And Scope

State ownership remains local to `MainView`:

```swift
@State private var isHomeSidebarVisible = true
```

No persistence is required.

In scope:

- Home route sidebar expanded/collapsed layout.
- Home main header collapsed expand button.
- Expanded sidebar header control ordering.
- Home card grid available width and column count based on sidebar visibility.
- Static and calculation regression tests.

Out of scope:

- Persisting collapsed state across launches.
- Changing sidebar filter sections.
- Changing Projects behavior.
- Changing card dimensions or maximum column count.
- Changing import, settings, or detail route structure beyond compile-safe shared helper adjustments.
- Repackaging unless requested after implementation.

## Testing

Focused tests should verify:

- Collapsed mode does not render or reserve `homeSidebarRail`.
- `homeShell(layout:)` chooses sidebar column only when `isHomeSidebarVisible` is true.
- Collapsed home main header includes a show-sidebar button before search.
- Expanded sidebar header places `headerLogoRow` before a trailing collapse button.
- Expanded sidebar header still reserves the traffic-light safe area.
- Grid available width uses expanded sidebar width when visible.
- Grid available width uses full window width when collapsed.
- Grid column count remains capped at `4`.
- Existing sidebar chip behavior, Projects placement, and home header actions remain intact.

Expected verification:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
swift build
```

If a broader test run is attempted and unrelated tests fail, report the exact failing tests separately instead of treating them as evidence against this feature.

## Self-Review

- Placeholder scan: no placeholders remain.
- Internal consistency: collapsed mode removes the rail everywhere, and the expand button moves into the main header.
- Scope check: this is a single home-screen layout polish project.
- Ambiguity check: card grid maximum remains `4`; only available width calculation changes.

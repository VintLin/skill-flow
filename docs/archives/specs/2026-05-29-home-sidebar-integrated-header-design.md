# Home Sidebar Integrated Header Design

## Goal

Rework the macOS home layout so the left sidebar is a full-height panel that includes the app identity, can be hidden from a button near the native macOS traffic-light controls, and has edge-aligned horizontal chip overflow fades.

## Confirmed Direction

The selected direction is `B + C` from the visual companion:

- Expanded state uses a full-height sidebar from the top of the window to the bottom.
- The app icon and `Skill Flow` title live inside the sidebar header.
- The main header no longer reserves a fake left title area on the home screen.
- Hidden state keeps a narrow left control rail with only the sidebar toggle.
- Projects stay in the sidebar as the existing bottom vertical list.

## Layout

The home route changes from:

```text
full-width topBar
sidebar | content
```

to:

```text
sidebar column | main column
```

Expanded sidebar column:

- Width: `244` on regular widths.
- Width: `208` on narrow widths.
- Background: `AppTheme.surface(for: theme)`.
- Right divider: `AppTheme.cardBorder(for: theme)` hairline.
- Top row height: `52`.
- Top row content: sidebar toggle, app icon, `Skill Flow` title.
- Sidebar body: the existing status/source/tags/agents sections and Projects list.

Hidden sidebar rail:

- Width: `72`.
- Background and right divider match the expanded sidebar.
- Contains only the sidebar toggle in the top row.
- Leaves enough left space for the native macOS traffic-light controls because the app uses `.windowStyle(.hiddenTitleBar)`.

Main column:

- Top row height remains `52`.
- Home screen top row contains search, import, update, and settings.
- It does not include the app icon or `Skill Flow` title in expanded sidebar mode.
- Content area remains the existing home card grid.

Non-home routes keep their existing top bar behavior unless a change is required to avoid compile or layout conflicts. The import, detail, and settings route structure is out of scope for this pass.

## Sidebar Toggle

The sidebar toggle is an icon-only button near the native macOS traffic-light controls.

- Expanded state icon: use a sidebar-hide style symbol such as `sidebar.left`.
- Hidden state icon: use the same symbol or a mirrored state if already available in the app icon set.
- Accessibility label: localized or static English is acceptable for this pass if no existing localization key is nearby, but the label must distinguish hide versus show.
- State ownership: local `@State` in `MainView` is sufficient. Persistence is not required.

## Horizontal Chip Overflow

Collapsed sidebar chip rows should make the chip fade/clip happen at the sidebar inner edges, not inset away from the edges.

Implementation intent:

- Keep the section content padded as it is now.
- Let only the collapsed horizontal scroll row extend to the sidebar body horizontal padding using negative horizontal margins or an equivalent local layout.
- Keep chip content itself padded, so the first and last chips are still readable and not flush against the window edge.
- Keep scroll indicators hidden.
- Expanded wrapped rows stay aligned with the section content padding.

## Scope

In scope:

- `MainView` home route layout restructuring.
- Home sidebar width constants.
- Local sidebar hidden/visible state.
- Static regression tests for the home layout structure.
- Focused Swift tests and desktop build.

Out of scope:

- Persisting sidebar visibility across launches.
- Changing Projects behavior.
- Changing import/detail/settings layout beyond compile-safe shared helper adjustments.
- Adding new dependencies.
- Repackaging unless explicitly requested after implementation.

## Testing

Focused tests should verify:

- Home route uses an integrated sidebar/main shell rather than rendering `topBar(layout:)` above `pageContent(layout:)`.
- Home sidebar has a header row containing `headerLogoRow` and a sidebar toggle when expanded.
- Home hidden rail exists and uses the same background/divider.
- Home main header omits `topBarTitleRow` and contains search/import/update/settings.
- `homeSidebarWidth` regular/narrow values are `244` and `208`.
- Collapsed chip rows extend to sidebar edges via named horizontal bleed constants or equivalent modifiers.
- Projects remain in `homeSidebarProjectSection` and are not made collapsible.

Expected commands:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
swift build
```

## Self-Review

- Placeholder scan: no placeholders remain.
- Internal consistency: expanded and hidden states are both defined, and Projects remains unchanged in both.
- Scope check: this is a single home-screen layout polish project.
- Ambiguity check: collapsed hidden state keeps only the sidebar toggle in the left rail; the app icon and title are visible only when the sidebar is expanded.

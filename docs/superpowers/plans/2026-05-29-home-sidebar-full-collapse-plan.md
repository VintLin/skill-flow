# Home Sidebar Full Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home sidebar fully disappear when collapsed, show the expand control in the former app identity area, and let the home card grid use the actual available width.

**Architecture:** Keep the change scoped to `MainView` and `DesktopInteractionRegressionTests`. Remove the hidden rail path from the home shell, make the home main header aware of collapsed versus expanded sidebar state, and move grid width calculation from state-free `LayoutMetrics` properties to explicit helper functions that accept sidebar visibility.

**Tech Stack:** Swift 6, SwiftUI, XCTest static regression tests, existing Skill Flow macOS desktop app.

---

## File Structure

- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
  - Remove `homeSidebarRail` from the active home layout.
  - Move the expanded sidebar collapse button to the trailing side of `homeSidebarHeader`.
  - Add a collapsed-mode expand button at the start of `homeMainHeader`.
  - Rework home main header search-width calculation to account for the optional collapsed expand button.
  - Add grid width helpers that accept `isSidebarVisible`.
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`
  - Update integrated sidebar regression tests for full collapse.
  - Add calculation coverage for expanded versus collapsed grid width and column count.
  - Update traffic-light/header ordering assertions.

---

## Task 1: Add Full-Collapse Header Regression Tests

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Replace hidden rail availability assertions**

In `testHomeSidebarHeaderAndHiddenRailAreAvailable`, replace the body with:

```swift
func testHomeSidebarHeaderAndFullCollapseToggleAreAvailable() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertTrue(source.contains("@State private var isHomeSidebarVisible = true"))
    XCTAssertTrue(source.contains("private var homeSidebarHeader: some View"))
    XCTAssertTrue(source.contains("private var homeSidebarToggleButton: some View"))
    XCTAssertTrue(source.contains("headerLogoRow"))
    XCTAssertTrue(source.contains("isHomeSidebarVisible.toggle()"))
    XCTAssertTrue(source.contains(".accessibilityLabel(isHomeSidebarVisible ? \"Hide sidebar\" : \"Show sidebar\")"))
    XCTAssertFalse(source.contains("private var homeSidebarRail: some View"))
    XCTAssertFalse(source.contains("homeSidebarRailWidth"))
}
```

- [ ] **Step 2: Update the home layout shell test**

In `testHomeLayoutUsesIntegratedSidebarHeaderShell`, after the existing `XCTAssertTrue(source.contains("homeShell(layout: layout)"))`, add these assertions:

```swift
XCTTrue(source.contains("if isHomeSidebarVisible {"))
XCTTrue(source.contains("homeMainColumn(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards, isSidebarVisible: isHomeSidebarVisible)"))
XCTFalse(source.contains("homeSidebarRail"))
```

- [ ] **Step 3: Update the home main header test**

Replace `testHomeMainHeaderOmitsTitleAndKeepsActions` with:

```swift
func testHomeMainHeaderOmitsTitleKeepsActionsAndShowsCollapsedToggle() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    guard
        let headerStart = source.range(of: "private func homeMainHeader(layout: LayoutMetrics, isSidebarVisible: Bool) -> some View"),
        let headerEnd = source.range(of: "\n    private func configPage", range: headerStart.upperBound..<source.endIndex)
    else {
        XCTFail("Expected homeMainHeader was not found")
        return
    }

    let headerSource = String(source[headerStart.lowerBound..<headerEnd.lowerBound])

    XCTAssertTrue(headerSource.contains("if !isSidebarVisible {"))
    XCTAssertTrue(headerSource.contains("homeSidebarToggleButton"))
    XCTAssertTrue(headerSource.contains("homeSearchField(width: searchWidth)"))
    XCTAssertTrue(headerSource.contains("importButton"))
    XCTAssertTrue(headerSource.contains("homeUpdateButton"))
    XCTAssertTrue(headerSource.contains("settingsButton"))
    XCTAssertTrue(headerSource.contains("includesSidebarToggle: !isSidebarVisible"))
    XCTAssertFalse(headerSource.contains("topBarTitleRow"))
    XCTAssertFalse(headerSource.contains("headerLogoRow"))
}
```

- [ ] **Step 4: Add expanded sidebar header ordering test**

Add this test before `testHomeMainHeaderSearchWidthFitsNarrowIntegratedSidebar`:

```swift
func testExpandedHomeSidebarHeaderPlacesToggleAfterTitle() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    guard
        let headerStart = source.range(of: "private var homeSidebarHeader: some View"),
        let headerEnd = source.range(of: "\n    private var homeSidebarToggleButton", range: headerStart.upperBound..<source.endIndex)
    else {
        XCTFail("Expected homeSidebarHeader block was not found")
        return
    }

    let headerSource = String(source[headerStart.lowerBound..<headerEnd.lowerBound])

    guard
        let logoRange = headerSource.range(of: "headerLogoRow"),
        let toggleRange = headerSource.range(of: "homeSidebarToggleButton")
    else {
        XCTFail("Expected header logo and sidebar toggle were not found")
        return
    }

    XCTAssertLessThan(logoRange.lowerBound, toggleRange.lowerBound)
    XCTAssertTrue(headerSource.contains("Spacer(minLength: 0)"))
    XCTAssertTrue(headerSource.contains(".padding(.leading, Self.homeSidebarTrafficLightLeadingInset)"))
    XCTAssertTrue(headerSource.contains(".padding(.trailing, Self.homeSidebarHorizontalPadding)"))
}
```

- [ ] **Step 5: Run the changed tests and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarHeaderAndFullCollapseToggleAreAvailable
swift test --filter DesktopInteractionRegressionTests/testHomeLayoutUsesIntegratedSidebarHeaderShell
swift test --filter DesktopInteractionRegressionTests/testHomeMainHeaderOmitsTitleKeepsActionsAndShowsCollapsedToggle
swift test --filter DesktopInteractionRegressionTests/testExpandedHomeSidebarHeaderPlacesToggleAfterTitle
```

Expected: FAIL because `homeSidebarRail` still exists, `homeMainColumn` does not accept `isSidebarVisible`, `homeMainHeader` does not accept `isSidebarVisible`, and the sidebar header still places the toggle before `headerLogoRow`.

- [ ] **Step 6: Keep tests uncommitted**

Do not commit failing tests alone. They will be committed with the implementation in Task 2.

---

## Task 2: Implement Full Collapse Header Behavior

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Update `homeShell(layout:)`**

In `homeShell(layout:)`, replace the current `if/else` sidebar block:

```swift
if isHomeSidebarVisible {
    homeSidebarColumn(homeTagSnapshot: homeTagSnapshot)
        .frame(width: layout.homeSidebarWidth)
} else {
    homeSidebarRail
        .frame(width: Self.homeSidebarRailWidth)
}

homeMainColumn(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards)
```

with:

```swift
if isHomeSidebarVisible {
    homeSidebarColumn(homeTagSnapshot: homeTagSnapshot)
        .frame(width: layout.homeSidebarWidth)
}

homeMainColumn(
    layout: layout,
    homeTagSnapshot: homeTagSnapshot,
    visibleCards: visibleCards,
    isSidebarVisible: isHomeSidebarVisible
)
```

- [ ] **Step 2: Update `homeMainColumn` signature and call site**

Replace the current signature:

```swift
private func homeMainColumn(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    visibleCards: [MainViewModel.GroupCardModel]
) -> some View {
    VStack(spacing: 0) {
        homeMainHeader(layout: layout)
        homeContent(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}
```

with:

```swift
private func homeMainColumn(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    visibleCards: [MainViewModel.GroupCardModel],
    isSidebarVisible: Bool
) -> some View {
    VStack(spacing: 0) {
        homeMainHeader(layout: layout, isSidebarVisible: isSidebarVisible)
        homeContent(
            layout: layout,
            homeTagSnapshot: homeTagSnapshot,
            visibleCards: visibleCards,
            isSidebarVisible: isSidebarVisible
        )
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}
```

- [ ] **Step 3: Replace `homeMainHeader(layout:)`**

Replace the current `homeMainHeader(layout:)` with:

```swift
private func homeMainHeader(layout: LayoutMetrics, isSidebarVisible: Bool) -> some View {
    let mainColumnWidth = Self.homeMainColumnWidth(
        forWindowWidth: layout.width,
        isSidebarVisible: isSidebarVisible
    )
    let leadingPadding = isSidebarVisible
        ? Self.homeMainHeaderSidePadding
        : Self.homeCollapsedHeaderLeadingPadding
    let reservedPadding = leadingPadding + Self.homeMainHeaderSidePadding
    let searchWidth = Self.homeMainHeaderSearchWidth(
        forMainColumnWidth: mainColumnWidth,
        reservedHorizontalPadding: reservedPadding,
        includesSidebarToggle: !isSidebarVisible
    )

    return HStack(spacing: Self.homeMainHeaderItemSpacing) {
        if !isSidebarVisible {
            homeSidebarToggleButton
        }
        homeSearchField(width: searchWidth)
        Spacer(minLength: 0)
        importButton
        homeUpdateButton
        settingsButton
    }
    .padding(.leading, leadingPadding)
    .padding(.trailing, Self.homeMainHeaderSidePadding)
    .frame(height: Self.homeSidebarHeaderHeight)
    .background(AppTheme.headerBackground(for: theme))
}
```

- [ ] **Step 4: Update `homeContent` signature**

Replace:

```swift
private func homeContent(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    visibleCards: [MainViewModel.GroupCardModel]
) -> some View {
```

with:

```swift
private func homeContent(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    visibleCards: [MainViewModel.GroupCardModel],
    isSidebarVisible: Bool
) -> some View {
```

Inside this function, replace both calls to `gridSection(layout: layout, homeTagSnapshot: homeTagSnapshot, groupCards: visibleCards)` with:

```swift
gridSection(
    layout: layout,
    homeTagSnapshot: homeTagSnapshot,
    groupCards: visibleCards,
    isSidebarVisible: isSidebarVisible
)
```

- [ ] **Step 5: Update `gridSection` signature and grid frame call**

Replace:

```swift
private func gridSection(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    groupCards: [MainViewModel.GroupCardModel]
) -> some View {
```

with:

```swift
private func gridSection(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    groupCards: [MainViewModel.GroupCardModel],
    isSidebarVisible: Bool
) -> some View {
```

Inside `gridSection`, replace:

```swift
LazyVGrid(columns: homeGridColumns(for: layout), spacing: 12) {
```

with:

```swift
LazyVGrid(columns: homeGridColumns(for: layout, isSidebarVisible: isSidebarVisible), spacing: 12) {
```

Replace:

```swift
.frame(maxWidth: layout.homeGridFrameWidth, alignment: .center)
```

with:

```swift
.frame(maxWidth: Self.homeGridFrameWidth(forWindowWidth: layout.width, isSidebarVisible: isSidebarVisible), alignment: .center)
```

- [ ] **Step 6: Move expanded sidebar toggle to trailing side**

Replace `homeSidebarHeader` with:

```swift
private var homeSidebarHeader: some View {
    HStack(spacing: 8) {
        headerLogoRow
            .lineLimit(1)
        Spacer(minLength: 0)
        homeSidebarToggleButton
    }
    .padding(.leading, Self.homeSidebarTrafficLightLeadingInset)
    .padding(.trailing, Self.homeSidebarHorizontalPadding)
    .frame(height: Self.homeSidebarHeaderHeight)
}
```

- [ ] **Step 7: Remove `homeSidebarRail`**

Delete the entire `private var homeSidebarRail: some View` property.

Delete these constants from `extension MainView`:

```swift
nonisolated static let homeSidebarRailWidth: CGFloat = 72
nonisolated static let homeSidebarHiddenToggleOffsetX: CGFloat = homeSidebarTrafficLightLeadingInset
nonisolated static let homeSidebarHiddenToggleOffsetY: CGFloat = (homeSidebarHeaderHeight - homeSidebarToggleButtonSize) / 2
nonisolated static let homeMainHeaderHiddenLeadingPadding: CGFloat = homeSidebarHiddenToggleOffsetX
    + homeSidebarToggleButtonSize
    + homeSidebarHorizontalPadding
    - homeSidebarRailWidth
nonisolated static let homeMainHeaderReservedHorizontalPadding: CGFloat = homeMainHeaderHiddenLeadingPadding
    + homeMainHeaderSidePadding
```

Add this replacement constant near `homeMainHeaderHorizontalPadding`:

```swift
nonisolated static let homeCollapsedHeaderLeadingPadding: CGFloat = homeSidebarTrafficLightLeadingInset
```

- [ ] **Step 8: Update header width helpers**

Replace `homeMainColumnWidth(forWindowWidth:isSidebarVisible:)` with:

```swift
nonisolated static func homeMainColumnWidth(forWindowWidth width: CGFloat, isSidebarVisible: Bool) -> CGFloat {
    let sidebarWidth = isSidebarVisible
        ? (width <= 760 ? homeSidebarNarrowWidth : homeSidebarRegularWidth)
        : 0
    return max(0, width - sidebarWidth)
}
```

Replace `fixedHomeMainHeaderControlsWidth(reservedHorizontalPadding:)` and both `homeMainHeaderSearchWidth` overloads with:

```swift
nonisolated static func fixedHomeMainHeaderControlsWidth(
    reservedHorizontalPadding: CGFloat,
    includesSidebarToggle: Bool
) -> CGFloat {
    let toggleWidth = includesSidebarToggle ? homeSidebarToggleButtonSize : 0
    let spacingCount: CGFloat = includesSidebarToggle ? 5 : 4
    return (toolbarButtonSize * 3)
        + toggleWidth
        + reservedHorizontalPadding
        + (homeMainHeaderItemSpacing * spacingCount)
}

nonisolated static func homeMainHeaderSearchWidth(
    forMainColumnWidth mainColumnWidth: CGFloat,
    reservedHorizontalPadding: CGFloat,
    includesSidebarToggle: Bool
) -> CGFloat {
    let fixedControlsWidth = fixedHomeMainHeaderControlsWidth(
        reservedHorizontalPadding: reservedHorizontalPadding,
        includesSidebarToggle: includesSidebarToggle
    )
    let availableWidth = mainColumnWidth - fixedControlsWidth
    if availableWidth >= homeMainHeaderMinimumSearchFieldWidth {
        return min(headerSearchFieldWidth, availableWidth)
    }
    return max(0, availableWidth)
}

nonisolated static func homeMainHeaderSearchWidth(forMainColumnWidth mainColumnWidth: CGFloat) -> CGFloat {
    homeMainHeaderSearchWidth(
        forMainColumnWidth: mainColumnWidth,
        reservedHorizontalPadding: homeMainHeaderHorizontalPadding,
        includesSidebarToggle: false
    )
}
```

- [ ] **Step 9: Run full-collapse header tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarHeaderAndFullCollapseToggleAreAvailable
swift test --filter DesktopInteractionRegressionTests/testHomeLayoutUsesIntegratedSidebarHeaderShell
swift test --filter DesktopInteractionRegressionTests/testHomeMainHeaderOmitsTitleKeepsActionsAndShowsCollapsedToggle
swift test --filter DesktopInteractionRegressionTests/testExpandedHomeSidebarHeaderPlacesToggleAfterTitle
```

Expected: PASS.

- [ ] **Step 10: Commit header behavior**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "fix: fully collapse home sidebar"
```

---

## Task 3: Recalculate Home Grid Width By Sidebar Visibility

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Add grid width regression test**

Add this test before `testHomeSidebarTopRowsReserveTrafficLightInset`:

```swift
func testHomeGridWidthFollowsSidebarVisibility() throws {
    let expandedRegularWidth = MainView.homeGridAvailableWidth(forWindowWidth: 1200, isSidebarVisible: true)
    let collapsedRegularWidth = MainView.homeGridAvailableWidth(forWindowWidth: 1200, isSidebarVisible: false)

    XCTAssertEqual(expandedRegularWidth, 1200 - MainView.homeSidebarRegularWidth - MainView.homeGridHorizontalPadding)
    XCTAssertEqual(collapsedRegularWidth, 1200 - MainView.homeGridHorizontalPadding)
    XCTAssertGreaterThan(collapsedRegularWidth, expandedRegularWidth)

    XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 900, isSidebarVisible: true), 2)
    XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 900, isSidebarVisible: false), 2)
    XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 1180, isSidebarVisible: true), 2)
    XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 1180, isSidebarVisible: false), 3)
    XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 1800, isSidebarVisible: false), 4)
}
```

- [ ] **Step 2: Add source structure assertions for grid helpers**

In `testHomeSidebarWidthAndChipBleedAreExplicit`, add:

```swift
XCTAssertTrue(source.contains("static let homeGridHorizontalPadding: CGFloat = 32"))
XCTAssertTrue(source.contains("homeGridAvailableWidth(forWindowWidth:"))
XCTAssertTrue(source.contains("homeGridColumnCount(forWindowWidth:"))
XCTAssertTrue(source.contains("homeGridFrameWidth(forWindowWidth:"))
```

- [ ] **Step 3: Run grid tests and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeGridWidthFollowsSidebarVisibility
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarWidthAndChipBleedAreExplicit
```

Expected: FAIL because `homeGridAvailableWidth(forWindowWidth:isSidebarVisible:)`, `homeGridColumnCount(forWindowWidth:isSidebarVisible:)`, `homeGridFrameWidth(forWindowWidth:isSidebarVisible:)`, and `homeGridHorizontalPadding` do not exist yet.

- [ ] **Step 4: Add explicit grid constants and helpers**

In `extension MainView`, add this constant near `homeMainHeaderMinimumSearchFieldWidth`:

```swift
nonisolated static let homeGridHorizontalPadding: CGFloat = 32
```

Add these helpers near the existing home header width helpers:

```swift
nonisolated static func homeGridAvailableWidth(
    forWindowWidth width: CGFloat,
    isSidebarVisible: Bool
) -> CGFloat {
    let sidebarWidth = isSidebarVisible
        ? (width <= 760 ? homeSidebarNarrowWidth : homeSidebarRegularWidth)
        : 0
    return max(304, width - sidebarWidth - homeGridHorizontalPadding)
}

nonisolated static func homeGridColumnCount(
    forWindowWidth width: CGFloat,
    isSidebarVisible: Bool
) -> Int {
    let availableWidth = homeGridAvailableWidth(
        forWindowWidth: width,
        isSidebarVisible: isSidebarVisible
    )
    let columns = Int((availableWidth + 14) / (304 + 14))
    return min(4, max(1, columns))
}

nonisolated static func homeGridFrameWidth(
    forWindowWidth width: CGFloat,
    isSidebarVisible: Bool
) -> CGFloat {
    let columns = CGFloat(homeGridColumnCount(
        forWindowWidth: width,
        isSidebarVisible: isSidebarVisible
    ))
    let spacing = CGFloat(max(homeGridColumnCount(
        forWindowWidth: width,
        isSidebarVisible: isSidebarVisible
    ) - 1, 0)) * 14
    return 304 * columns + spacing
}
```

- [ ] **Step 5: Update `homeGridColumns`**

Replace:

```swift
private func homeGridColumns(for layout: LayoutMetrics) -> [GridItem] {
    Array(repeating: GridItem(.fixed(304), spacing: 14), count: layout.homeGridColumnCount)
}
```

with:

```swift
private func homeGridColumns(for layout: LayoutMetrics, isSidebarVisible: Bool) -> [GridItem] {
    Array(
        repeating: GridItem(.fixed(304), spacing: 14),
        count: Self.homeGridColumnCount(forWindowWidth: layout.width, isSidebarVisible: isSidebarVisible)
    )
}
```

- [ ] **Step 6: Remove stale `LayoutMetrics` grid properties**

Delete these properties from `LayoutMetrics`:

```swift
var homeGridAvailableWidth: CGFloat {
    max(304, width - homeSidebarWidth - 32)
}

var homeGridColumnCount: Int {
    let columns = Int((homeGridAvailableWidth + 14) / (304 + 14))
    return min(4, max(1, columns))
}

var homeGridFrameWidth: CGFloat {
    let columns = CGFloat(homeGridColumnCount)
    let spacing = CGFloat(max(homeGridColumnCount - 1, 0)) * 14
    return 304 * columns + spacing
}
```

- [ ] **Step 7: Run grid tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeGridWidthFollowsSidebarVisibility
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarWidthAndChipBleedAreExplicit
```

Expected: PASS.

- [ ] **Step 8: Commit grid behavior**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "fix: expand home grid when sidebar is collapsed"
```

---

## Task 4: Update Existing Header Width Tests And Remove Rail Assumptions

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`

- [ ] **Step 1: Update `testHomeMainHeaderSearchWidthFitsNarrowIntegratedSidebar`**

Replace the current test with:

```swift
func testHomeMainHeaderSearchWidthFitsNarrowIntegratedSidebar() throws {
    let visibleSidebarMainWidth = MainView.homeMainColumnWidth(forWindowWidth: 620, isSidebarVisible: true)
    let collapsedSidebarMainWidth = MainView.homeMainColumnWidth(forWindowWidth: 620, isSidebarVisible: false)
    let visibleReservedPadding = MainView.homeMainHeaderHorizontalPadding
    let collapsedReservedPadding = MainView.homeCollapsedHeaderLeadingPadding + MainView.homeMainHeaderSidePadding

    XCTAssertEqual(visibleSidebarMainWidth, 620 - MainView.homeSidebarNarrowWidth)
    XCTAssertEqual(collapsedSidebarMainWidth, 620)
    XCTAssertEqual(visibleReservedPadding, 32)
    XCTAssertEqual(collapsedReservedPadding, 84)

    let visibleSidebarSearchWidth = MainView.homeMainHeaderSearchWidth(
        forMainColumnWidth: visibleSidebarMainWidth,
        reservedHorizontalPadding: visibleReservedPadding,
        includesSidebarToggle: false
    )
    let collapsedSidebarSearchWidth = MainView.homeMainHeaderSearchWidth(
        forMainColumnWidth: collapsedSidebarMainWidth,
        reservedHorizontalPadding: collapsedReservedPadding,
        includesSidebarToggle: true
    )
    let visibleFixedHeaderControlsWidth = MainView.fixedHomeMainHeaderControlsWidth(
        reservedHorizontalPadding: visibleReservedPadding,
        includesSidebarToggle: false
    )
    let collapsedFixedHeaderControlsWidth = MainView.fixedHomeMainHeaderControlsWidth(
        reservedHorizontalPadding: collapsedReservedPadding,
        includesSidebarToggle: true
    )

    XCTAssertGreaterThanOrEqual(visibleSidebarSearchWidth, MainView.homeMainHeaderMinimumSearchFieldWidth)
    XCTAssertGreaterThanOrEqual(collapsedSidebarSearchWidth, MainView.homeMainHeaderMinimumSearchFieldWidth)
    XCTAssertLessThanOrEqual(visibleSidebarSearchWidth + visibleFixedHeaderControlsWidth, visibleSidebarMainWidth)
    XCTAssertLessThanOrEqual(collapsedSidebarSearchWidth + collapsedFixedHeaderControlsWidth, collapsedSidebarMainWidth)
    XCTAssertLessThanOrEqual(visibleSidebarSearchWidth, MainView.headerSearchFieldWidth)
    XCTAssertLessThanOrEqual(collapsedSidebarSearchWidth, MainView.headerSearchFieldWidth)
    XCTAssertEqual(
        MainView.homeMainHeaderSearchWidth(
            forMainColumnWidth: 860 - MainView.homeSidebarRegularWidth,
            reservedHorizontalPadding: visibleReservedPadding,
            includesSidebarToggle: false
        ),
        MainView.headerSearchFieldWidth
    )
}
```

- [ ] **Step 2: Update `testHomeMainHeaderSearchWidthGuaranteeBoundaryIsAtFixedControlsWidth`**

Replace the current `fixedControlsWidth` setup with:

```swift
let reservedPadding = MainView.homeCollapsedHeaderLeadingPadding + MainView.homeMainHeaderSidePadding
let fixedControlsWidth = MainView.fixedHomeMainHeaderControlsWidth(
    reservedHorizontalPadding: reservedPadding,
    includesSidebarToggle: true
)
```

Replace all calls to `homeMainHeaderSearchWidth` in this test with the three-argument helper:

```swift
MainView.homeMainHeaderSearchWidth(
    forMainColumnWidth: fixedControlsWidth - 1,
    reservedHorizontalPadding: reservedPadding,
    includesSidebarToggle: true
)
```

Use the same `reservedPadding` and `includesSidebarToggle: true` for the `fixedControlsWidth` and `fixedControlsWidth + minimum - 1` cases.

- [ ] **Step 3: Replace traffic-light rail test**

Replace `testHomeSidebarTopRowsReserveTrafficLightInset` with:

```swift
func testHomeSidebarTopRowsReserveTrafficLightInsetWithoutHiddenRail() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertEqual(MainView.homeSidebarTrafficLightLeadingInset, 68)
    XCTAssertEqual(MainView.homeCollapsedHeaderLeadingPadding, MainView.homeSidebarTrafficLightLeadingInset)
    XCTAssertFalse(source.contains("homeSidebarRailWidth"))

    guard
        let sidebarHeaderStart = source.range(of: "private var homeSidebarHeader: some View"),
        let sidebarHeaderEnd = source.range(of: "\n    private var homeSidebarToggleButton", range: sidebarHeaderStart.upperBound..<source.endIndex),
        let mainHeaderStart = source.range(of: "private func homeMainHeader(layout: LayoutMetrics, isSidebarVisible: Bool) -> some View"),
        let mainHeaderEnd = source.range(of: "\n    private func configPage", range: mainHeaderStart.upperBound..<source.endIndex)
    else {
        XCTFail("Expected home sidebar and main header blocks were not found")
        return
    }

    let sidebarHeaderSource = String(source[sidebarHeaderStart.lowerBound..<sidebarHeaderEnd.lowerBound])
    let mainHeaderSource = String(source[mainHeaderStart.lowerBound..<mainHeaderEnd.lowerBound])

    XCTAssertTrue(sidebarHeaderSource.contains(".padding(.leading, Self.homeSidebarTrafficLightLeadingInset)"))
    XCTAssertTrue(sidebarHeaderSource.contains(".padding(.trailing, Self.homeSidebarHorizontalPadding)"))
    XCTAssertTrue(mainHeaderSource.contains("Self.homeCollapsedHeaderLeadingPadding"))
    XCTAssertTrue(mainHeaderSource.contains("if !isSidebarVisible {"))
}
```

- [ ] **Step 4: Update sidebar width test**

In `testHomeSidebarWidthAndChipBleedAreExplicit`, remove the assertion:

```swift
XCTAssertTrue(source.contains("static let homeSidebarRailWidth: CGFloat = 72"))
```

Add:

```swift
XCTAssertTrue(source.contains("static let homeCollapsedHeaderLeadingPadding: CGFloat = homeSidebarTrafficLightLeadingInset"))
XCTAssertFalse(source.contains("homeSidebarRailWidth"))
```

- [ ] **Step 5: Run updated tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeMainHeaderSearchWidthFitsNarrowIntegratedSidebar
swift test --filter DesktopInteractionRegressionTests/testHomeMainHeaderSearchWidthGuaranteeBoundaryIsAtFixedControlsWidth
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarTopRowsReserveTrafficLightInsetWithoutHiddenRail
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarWidthAndChipBleedAreExplicit
```

Expected: PASS.

- [ ] **Step 6: Run the full desktop interaction regression suite**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
```

Expected: PASS with all `DesktopInteractionRegressionTests` passing.

- [ ] **Step 7: Commit test cleanup**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "test: cover full sidebar collapse layout"
```

---

## Task 5: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
```

Expected: PASS with all `DesktopInteractionRegressionTests` passing.

- [ ] **Step 2: Run existing sidebar filter default test**

Run:

```bash
cd apps/desktop-mac
swift test --filter MainViewModelSelectionTests/testHomeStatusAndSourceFilterDefaultsAreAvailable
```

Expected: PASS.

- [ ] **Step 3: Run desktop build**

Run:

```bash
cd apps/desktop-mac
swift build
```

Expected: `Build complete!`.

- [ ] **Step 4: Check working tree**

Run:

```bash
git status --short --branch
```

Expected: only pre-existing `.superpowers/` remains untracked, or a clean tree if it was ignored outside this plan. No modified source or test files should remain.

- [ ] **Step 5: Report completion**

Report:

- Final commit hashes created during execution.
- Exact verification commands and pass/fail results.
- Whether `.superpowers/` is still untracked.
- Whether a new package was built. Do not build a package unless the user explicitly asks after implementation.

---

## Self-Review

- Spec coverage: Tasks cover full sidebar removal, collapsed expand button placement, expanded header ordering, grid width recalculation, `4`-column cap, tests, and final verification.
- Placeholder scan: the plan contains no incomplete placeholders, no deferred behavior, and no vague test instructions.
- Type consistency: helper names are consistent across tasks: `homeCollapsedHeaderLeadingPadding`, `fixedHomeMainHeaderControlsWidth(reservedHorizontalPadding:includesSidebarToggle:)`, `homeMainHeaderSearchWidth(forMainColumnWidth:reservedHorizontalPadding:includesSidebarToggle:)`, `homeGridAvailableWidth(forWindowWidth:isSidebarVisible:)`, `homeGridColumnCount(forWindowWidth:isSidebarVisible:)`, and `homeGridFrameWidth(forWindowWidth:isSidebarVisible:)`.

# Home Sidebar Integrated Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the home screen so the sidebar extends through the header, can be hidden with a left rail toggle, is wider, and has edge-aligned horizontal chip overflow fades.

**Architecture:** Keep the change scoped to `MainView` and existing static regression tests. Add a local `@State` for home sidebar visibility, split home layout into a sidebar column and main column, and preserve existing route behavior for import/detail/settings. Use constants for widths and chip bleed so the layout can be verified without screenshot tooling.

**Tech Stack:** Swift 6, SwiftUI, XCTest static regression tests, existing Skill Flow macOS desktop architecture.

---

## File Structure

- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
  - Add local sidebar visibility state.
  - Replace home route's `topBar + pageContent` stack with an integrated home shell.
  - Add expanded sidebar header and hidden sidebar rail.
  - Widen sidebar metrics.
  - Add collapsed chip row horizontal bleed.
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`
  - Add static regression coverage for integrated layout, sidebar widths, hidden rail, main header content, and chip bleed.

---

## Desired Behavior

- Expanded home sidebar:
  - Extends from top to bottom of the window.
  - Uses `AppTheme.surface(for: theme)` and keeps the right divider.
  - Has a 52pt header row containing a sidebar toggle, app icon, and `Skill Flow` title.
  - Has width `244` on regular windows and `208` on narrow windows.
- Hidden sidebar:
  - Replaces the expanded sidebar with a 72pt rail.
  - Shows only the sidebar toggle near the native macOS traffic-light area.
  - Keeps the same surface background and divider.
- Home main header:
  - Has height 52pt.
  - Contains search, import, update, and settings controls.
  - Does not render `topBarTitleRow` on the home screen.
- Horizontal collapsed chip rows:
  - Scroll indicators stay hidden.
  - Fade/clip boundary reaches the sidebar body edges.
  - Chip content keeps readable internal padding.
- Projects:
  - Remain in `homeSidebarProjectSection`.
  - Stay a bottom vertical list.
  - Do not become a collapsible chip section.

---

## Task 1: Add Layout Regression Tests

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Add failing integrated-layout tests**

Append these tests before `private func sourceText(at:)` in `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`:

```swift
func testHomeLayoutUsesIntegratedSidebarHeaderShell() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertTrue(source.contains("private var homeShell"))
    XCTAssertTrue(source.contains("homeSidebarColumn(homeTagSnapshot: homeTagSnapshot)"))
    XCTAssertTrue(source.contains("homeMainColumn(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards)"))
    XCTAssertTrue(source.contains("if isHomePage {"))
    XCTAssertTrue(source.contains("homeShell(layout: layout)"))

    guard
        let bodyStart = source.range(of: "VStack(spacing: 0) {"),
        let bodyEnd = source.range(of: "\n                if isEditCustomAgentPresented", range: bodyStart.upperBound..<source.endIndex)
    else {
        XCTFail("Expected root body stack was not found")
        return
    }

    let bodySource = String(source[bodyStart.lowerBound..<bodyEnd.lowerBound])

    XCTAssertFalse(bodySource.contains("topBar(layout: layout)\n                    pageContent(layout: layout)"))
}

func testHomeSidebarHeaderAndHiddenRailAreAvailable() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertTrue(source.contains("@State private var isHomeSidebarVisible = true"))
    XCTAssertTrue(source.contains("private var homeSidebarHeader: some View"))
    XCTAssertTrue(source.contains("private var homeSidebarRail: some View"))
    XCTAssertTrue(source.contains("private var homeSidebarToggleButton: some View"))
    XCTAssertTrue(source.contains("headerLogoRow"))
    XCTAssertTrue(source.contains("isHomeSidebarVisible.toggle()"))
    XCTAssertTrue(source.contains(".accessibilityLabel(isHomeSidebarVisible ? \"Hide sidebar\" : \"Show sidebar\")"))
    XCTAssertTrue(source.contains(".frame(width: Self.homeSidebarRailWidth)"))
}

func testHomeMainHeaderOmitsTitleAndKeepsActions() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    guard
        let headerStart = source.range(of: "private var homeMainHeader: some View"),
        let headerEnd = source.range(of: "\n    private func configPage", range: headerStart.upperBound..<source.endIndex)
    else {
        XCTFail("Expected homeMainHeader was not found")
        return
    }

    let headerSource = String(source[headerStart.lowerBound..<headerEnd.lowerBound])

    XCTAssertTrue(headerSource.contains("searchField"))
    XCTAssertTrue(headerSource.contains("importButton"))
    XCTAssertTrue(headerSource.contains("homeUpdateButton"))
    XCTAssertTrue(headerSource.contains("settingsButton"))
    XCTAssertFalse(headerSource.contains("topBarTitleRow"))
    XCTAssertFalse(headerSource.contains("headerLogoRow"))
}

func testHomeSidebarWidthAndChipBleedAreExplicit() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertTrue(source.contains("static let homeSidebarRegularWidth: CGFloat = 244"))
    XCTAssertTrue(source.contains("static let homeSidebarNarrowWidth: CGFloat = 208"))
    XCTAssertTrue(source.contains("static let homeSidebarRailWidth: CGFloat = 72"))
    XCTAssertTrue(source.contains("static let homeSidebarHorizontalPadding: CGFloat = 12"))
    XCTAssertTrue(source.contains("static let homeSidebarChipBleed: CGFloat = 12"))
    XCTAssertTrue(source.contains(".padding(.horizontal, Self.homeSidebarHorizontalPadding)"))
    XCTAssertTrue(source.contains(".padding(.horizontal, Self.homeSidebarChipBleed)"))
    XCTAssertTrue(source.contains(".padding(.horizontal, -Self.homeSidebarChipBleed)"))
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeLayoutUsesIntegratedSidebarHeaderShell
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarHeaderAndHiddenRailAreAvailable
swift test --filter DesktopInteractionRegressionTests/testHomeMainHeaderOmitsTitleAndKeepsActions
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarWidthAndChipBleedAreExplicit
```

Expected: FAIL because the integrated home shell, hidden rail, new width constants, and chip bleed constants do not exist yet.

- [ ] **Step 3: Commit tests**

Do not commit failing tests alone. Keep them staged only after implementation passes in later tasks.

---

## Task 2: Add Sidebar Visibility State And Width Constants

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Add local sidebar visibility state**

In `MainView`, near the other `@State` properties, add:

```swift
@State private var isHomeSidebarVisible = true
```

- [ ] **Step 2: Add layout constants**

Inside `private enum SelfSizing`, or wherever the file currently defines static layout constants near `headerLeadingWidth`, add:

```swift
static let homeSidebarRegularWidth: CGFloat = 244
static let homeSidebarNarrowWidth: CGFloat = 208
static let homeSidebarRailWidth: CGFloat = 72
static let homeSidebarHeaderHeight: CGFloat = 52
static let homeSidebarHorizontalPadding: CGFloat = 12
static let homeSidebarChipBleed: CGFloat = 12
```

If the current constants are stored directly on `MainView`, add them alongside `headerLeadingWidth` instead.

- [ ] **Step 3: Update layout metrics**

In `LayoutMetrics.homeSidebarWidth`, replace:

```swift
width <= 760 ? 184 : 220
```

with:

```swift
width <= 760 ? MainView.homeSidebarNarrowWidth : MainView.homeSidebarRegularWidth
```

Do not include `homeSidebarRailWidth` in `homeGridAvailableWidth` yet. The hidden rail is handled by the integrated shell layout in Task 3.

- [ ] **Step 4: Run width tests and verify partial pass**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarWidthAndChipBleedAreExplicit
```

Expected: still FAIL because the chip bleed modifiers are not added until Task 4, but width constants should now be present.

---

## Task 3: Integrate Home Sidebar Into Header

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Replace root home layout branch**

In `body`, replace the current unconditional stack:

```swift
VStack(spacing: 0) {
    topBar(layout: layout)
    pageContent(layout: layout)
}
.frame(maxWidth: .infinity, maxHeight: .infinity)
```

with:

```swift
Group {
    if isHomePage {
        homeShell(layout: layout)
    } else {
        VStack(spacing: 0) {
            topBar(layout: layout)
            pageContent(layout: layout)
        }
    }
}
.frame(maxWidth: .infinity, maxHeight: .infinity)
```

- [ ] **Step 2: Add `homeShell(layout:)`**

Add this method near `pageContent(layout:)`:

```swift
private func homeShell(layout: LayoutMetrics) -> some View {
    let homeTagSnapshot = homeContainer.homeTagSnapshot(locale: locale)
    let visibleCards = homeContainer.visibleGroupCards(
        from: viewModel.groupCards,
        snapshot: homeTagSnapshot
    )

    return HStack(alignment: .top, spacing: 0) {
        if isHomeSidebarVisible {
            homeSidebarColumn(homeTagSnapshot: homeTagSnapshot)
                .frame(width: layout.homeSidebarWidth)
        } else {
            homeSidebarRail
                .frame(width: Self.homeSidebarRailWidth)
        }

        homeMainColumn(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards)
    }
    .contentShape(Rectangle())
    .onTapGesture {
        NotificationCenter.default.post(name: .groupTagEditorDismissRequested, object: nil)
    }
}
```

- [ ] **Step 3: Add expanded sidebar column**

Add this method near `homeSidebar(homeTagSnapshot:)`:

```swift
private func homeSidebarColumn(homeTagSnapshot: GroupTagController.HomeSnapshot) -> some View {
    VStack(spacing: 0) {
        homeSidebarHeader
        homeSidebar(homeTagSnapshot: homeTagSnapshot)
    }
    .frame(maxHeight: .infinity, alignment: .topLeading)
    .background(AppTheme.surface(for: theme))
    .overlay(alignment: .trailing) {
        Rectangle()
            .fill(AppTheme.cardBorder(for: theme))
            .frame(width: 0.5)
    }
}
```

- [ ] **Step 4: Add sidebar header and rail**

Add these properties near `homeSidebarColumn`:

```swift
private var homeSidebarHeader: some View {
    HStack(spacing: 8) {
        homeSidebarToggleButton
        headerLogoRow
            .lineLimit(1)
        Spacer(minLength: 0)
    }
    .padding(.horizontal, Self.homeSidebarHorizontalPadding)
    .frame(height: Self.homeSidebarHeaderHeight)
}

private var homeSidebarRail: some View {
    VStack(spacing: 0) {
        HStack {
            homeSidebarToggleButton
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Self.homeSidebarHorizontalPadding)
        .frame(height: Self.homeSidebarHeaderHeight)
        Spacer(minLength: 0)
    }
    .frame(maxHeight: .infinity)
    .background(AppTheme.surface(for: theme))
    .overlay(alignment: .trailing) {
        Rectangle()
            .fill(AppTheme.cardBorder(for: theme))
            .frame(width: 0.5)
    }
}

private var homeSidebarToggleButton: some View {
    Button {
        withAnimation(.easeInOut(duration: 0.18)) {
            isHomeSidebarVisible.toggle()
        }
    } label: {
        Image(systemName: "sidebar.left")
            .font(.system(size: 13, weight: .semibold))
            .frame(width: 28, height: 28)
            .foregroundStyle(AppTheme.textMuted(for: theme))
            .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(isHomeSidebarVisible ? "Hide sidebar" : "Show sidebar")
}
```

- [ ] **Step 5: Add main column and home main header**

Add these methods near `configPage(layout:)`:

```swift
private func homeMainColumn(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    visibleCards: [MainViewModel.GroupCardModel]
) -> some View {
    VStack(spacing: 0) {
        homeMainHeader
        homeContent(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}

private var homeMainHeader: some View {
    HStack(spacing: 12) {
        searchField
        Spacer(minLength: 0)
        importButton
        homeUpdateButton
        settingsButton
    }
    .padding(.horizontal, 16)
    .frame(height: Self.homeSidebarHeaderHeight)
    .background(AppTheme.headerBackground(for: theme))
}

private func homeContent(
    layout: LayoutMetrics,
    homeTagSnapshot: GroupTagController.HomeSnapshot,
    visibleCards: [MainViewModel.GroupCardModel]
) -> some View {
    Group {
        if visibleCards.isEmpty {
            gridSection(layout: layout, homeTagSnapshot: homeTagSnapshot, groupCards: visibleCards)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
            ScrollView {
                gridSection(layout: layout, homeTagSnapshot: homeTagSnapshot, groupCards: visibleCards)
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
            }
        }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}
```

- [ ] **Step 6: Simplify `configPage(layout:)`**

Replace `configPage(layout:)` with a wrapper around `homeShell(layout:)` only if all call sites now use `homeShell` directly. Otherwise, preserve `configPage(layout:)` by moving its card-grid body into `homeContent(...)` and calling `homeShell(layout:)` for the home route.

The desired final state is:

```swift
private func configPage(layout: LayoutMetrics) -> some View {
    homeShell(layout: layout)
}
```

if `configPage` remains referenced by `pageContent`.

- [ ] **Step 7: Run integrated-layout tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeLayoutUsesIntegratedSidebarHeaderShell
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarHeaderAndHiddenRailAreAvailable
swift test --filter DesktopInteractionRegressionTests/testHomeMainHeaderOmitsTitleAndKeepsActions
```

Expected: PASS.

---

## Task 4: Align Collapsed Chip Row Bleed

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Use sidebar horizontal padding constant**

In `homeSidebar(homeTagSnapshot:)`, replace:

```swift
.padding(.horizontal, 12)
```

with:

```swift
.padding(.horizontal, Self.homeSidebarHorizontalPadding)
```

- [ ] **Step 2: Add collapsed row bleed modifiers**

In the collapsed branch of `homeSidebarChipSection`, update:

```swift
ScrollView(.horizontal, showsIndicators: false) {
    LazyHStack(spacing: 6) {
        ForEach(options) { option in
            homeSidebarChip(option: option, isSelected: selectedId == option.id) {
                onSelect(option.id)
            }
        }
    }
}
```

to:

```swift
ScrollView(.horizontal, showsIndicators: false) {
    LazyHStack(spacing: 6) {
        ForEach(options) { option in
            homeSidebarChip(option: option, isSelected: selectedId == option.id) {
                onSelect(option.id)
            }
        }
    }
    .padding(.horizontal, Self.homeSidebarChipBleed)
}
.padding(.horizontal, -Self.homeSidebarChipBleed)
```

- [ ] **Step 3: Run chip bleed test**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarWidthAndChipBleedAreExplicit
```

Expected: PASS.

---

## Task 5: Update Existing Regression Tests

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Update sidebar background test block boundaries**

If `testHomeSidebarUsesSurfaceBackgroundAndKeepsTrailingDivider` still searches for `homeSidebar(homeTagSnapshot:)` directly inside `configPage`, update it to inspect `homeSidebarColumn(homeTagSnapshot:)`.

Use this replacement body:

```swift
func testHomeSidebarUsesSurfaceBackgroundAndKeepsTrailingDivider() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    guard
        let sidebarStart = source.range(of: "private func homeSidebarColumn("),
        let sidebarEnd = source.range(of: "\n    private var homeSidebarHeader", range: sidebarStart.upperBound..<source.endIndex)
    else {
        XCTFail("Expected home sidebar column block was not found")
        return
    }

    let sidebarBlock = String(source[sidebarStart.lowerBound..<sidebarEnd.lowerBound])

    XCTAssertTrue(sidebarBlock.contains(".background(AppTheme.surface(for: theme))"))
    XCTAssertTrue(sidebarBlock.contains(".overlay(alignment: .trailing)"))
    XCTAssertTrue(sidebarBlock.contains(".fill(AppTheme.cardBorder(for: theme))"))
    XCTAssertFalse(sidebarBlock.contains(".background(AppTheme.headerBackground(for: theme))"))
}
```

- [ ] **Step 2: Preserve Projects tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHeaderOmitsObsoleteProjectToggleButtonAndKeepsSidebarProjectScopeEntry
swift test --filter DesktopInteractionRegressionTests/testProjectScopePillsUseSharedChipMotion
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarOrdersAgentBeforeProjectsAndAddsStatusAndSourceType
```

Expected: PASS. If any fail because source block boundaries changed, update only the test search strings while preserving the same behavioral assertions.

- [ ] **Step 3: Run all interaction regression tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
```

Expected: PASS with 0 failures.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "feat: integrate home sidebar with header"
```

---

## Task 6: Final Verification

**Files:**
- No source files expected unless verification finds defects.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
swift test --filter MainViewModelSelectionTests/testHomeStatusAndSourceFilterDefaultsAreAvailable
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Build desktop app**

Run:

```bash
cd apps/desktop-mac
swift build
```

Expected: PASS.

- [ ] **Step 3: Optional runtime smoke**

Run:

```bash
cd apps/desktop-mac
swift run SkillFlowDesktop
```

Expected: app launches. Stop it with `Ctrl-C` after confirming the home screen renders.

- [ ] **Step 4: Check git state**

Run:

```bash
git status --short --branch
```

Expected: only intentional untracked `.superpowers/` and ignored build/package artifacts.

---

## Self-Review Checklist

- Spec coverage:
  - Sidebar through header is covered by Task 3.
  - Sidebar hide/show rail is covered by Task 3.
  - Wider sidebar is covered by Task 2.
  - Chip bleed is covered by Task 4.
  - Projects unchanged is covered by Task 5.
- Placeholder scan:
  - No placeholders or deferred implementation notes remain.
- Type consistency:
  - `homeShell`, `homeSidebarColumn`, `homeMainHeader`, and `homeSidebarRail` are introduced before tests depend on them.

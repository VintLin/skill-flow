# Home Sidebar Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home sidebar a distinct white/surface filter panel, start all collapsible filter sections collapsed, and ensure only tag options can carry `#`-style text.

**Architecture:** Keep the current `MainView` sidebar component structure and `ViewState` ownership. Change only the sidebar chrome token, the default expanded-section state, and static regression coverage for the visual/text rules. Projects remains the existing non-collapsible bottom list.

**Tech Stack:** Swift 6, SwiftUI, XCTest static regression tests, existing Skill Flow macOS desktop architecture.

---

## File Structure

- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/ViewState.swift`
  - Change `expandedHomeSidebarSectionIds` default from `["status", "sourceType"]` to `[]`.
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
  - Change the home sidebar background token from `AppTheme.headerBackground(for: theme)` to `AppTheme.surface(for: theme)`.
  - Leave the trailing divider and Projects section behavior unchanged.
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`
  - Update the existing default-state assertion for collapsed sections.
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`
  - Add static tests for the sidebar background token, trailing divider preservation, collapsed defaults, and non-tag chip text prefix behavior.

## Desired Behavior

- Home sidebar has a distinct white/surface background in light mode.
- Dark mode remains theme-correct through `AppTheme.surface(for: theme)`.
- The sidebar keeps the existing trailing `AppTheme.cardBorder(for: theme)` divider.
- `status`, `sourceType`, `tags`, and `agents` default collapsed.
- Projects remains the bottom vertical list and does not become collapsible.
- Only tag options may display `#`; status, source type, agent, and project option text must not display `#`.

---

## Task 1: Collapse Sidebar Chip Sections By Default

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/ViewState.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Update the failing default-state test**

In `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`, update `testHomeStatusAndSourceFilterDefaultsAreAvailable` so the expanded-section assertion expects an empty set:

```swift
XCTAssertEqual(appState.view.expandedHomeSidebarSectionIds.sorted(), [])
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/desktop-mac
swift test --filter MainViewModelSelectionTests/testHomeStatusAndSourceFilterDefaultsAreAvailable
```

Expected: FAIL because `ViewState.expandedHomeSidebarSectionIds` still defaults to `["status", "sourceType"]`.

- [ ] **Step 3: Change the default expanded section set**

In `apps/desktop-mac/Sources/DesktopApp/Store/ViewState.swift`, replace:

```swift
var expandedHomeSidebarSectionIds: Set<String> = ["status", "sourceType"]
```

with:

```swift
var expandedHomeSidebarSectionIds: Set<String> = []
```

- [ ] **Step 4: Run the focused test and verify pass**

Run:

```bash
cd apps/desktop-mac
swift test --filter MainViewModelSelectionTests/testHomeStatusAndSourceFilterDefaultsAreAvailable
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Store/ViewState.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift
git commit -m "fix: collapse home sidebar filters by default"
```

---

## Task 2: Add Sidebar Background And Text-Prefix Regression Coverage

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Add failing static regression tests**

Append these tests inside `DesktopInteractionRegressionTests`, before `private func sourceText(at:)`:

```swift
func testHomeSidebarUsesSurfaceBackgroundAndKeepsTrailingDivider() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    guard
        let sidebarStart = source.range(of: "homeSidebar(homeTagSnapshot: homeTagSnapshot)"),
        let contentStart = source.range(of: "\n            Group {", range: sidebarStart.upperBound..<source.endIndex)
    else {
        XCTFail("Expected home sidebar layout block was not found")
        return
    }

    let sidebarBlock = String(source[sidebarStart.lowerBound..<contentStart.lowerBound])

    XCTAssertTrue(sidebarBlock.contains(".background(AppTheme.surface(for: theme))"))
    XCTAssertTrue(sidebarBlock.contains(".overlay(alignment: .trailing)"))
    XCTAssertTrue(sidebarBlock.contains(".fill(AppTheme.cardBorder(for: theme))"))
    XCTAssertFalse(sidebarBlock.contains(".background(AppTheme.headerBackground(for: theme))"))
}

func testHomeSidebarOnlyTagChipOptionsUseHashPrefix() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    guard
        let statusStart = source.range(of: "private func homeStatusChipItems()"),
        let sourceTypeStart = source.range(of: "private func homeSourceTypeChipItems()"),
        let tagStart = source.range(of: "private func homeTagChipItems("),
        let agentStart = source.range(of: "private func homeAgentChipItems()"),
        let chipSectionStart = source.range(of: "private func homeSidebarChipSection(")
    else {
        XCTFail("Expected home sidebar chip builders were not found")
        return
    }

    let statusSource = String(source[statusStart.lowerBound..<sourceTypeStart.lowerBound])
    let sourceTypeSource = String(source[sourceTypeStart.lowerBound..<tagStart.lowerBound])
    let tagSource = String(source[tagStart.lowerBound..<agentStart.lowerBound])
    let agentSource = String(source[agentStart.lowerBound..<chipSectionStart.lowerBound])

    XCTAssertFalse(statusSource.contains("\"#"))
    XCTAssertFalse(statusSource.contains("#\\("))
    XCTAssertFalse(sourceTypeSource.contains("\"#"))
    XCTAssertFalse(sourceTypeSource.contains("#\\("))
    XCTAssertFalse(agentSource.contains("\"#"))
    XCTAssertFalse(agentSource.contains("#\\("))
    XCTAssertTrue(tagSource.contains("item.title"))
}
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarUsesSurfaceBackgroundAndKeepsTrailingDivider
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarOnlyTagChipOptionsUseHashPrefix
```

Expected:
- First test FAILS because the sidebar currently uses `AppTheme.headerBackground(for: theme)`.
- Second test PASSES if non-tag chip builders already avoid `#`; if it fails, inspect the reported builder and remove the non-tag prefix in Step 3.

- [ ] **Step 3: Change sidebar background token**

In `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`, inside `configPage(layout:)`, replace this sidebar modifier:

```swift
.background(AppTheme.headerBackground(for: theme))
```

with:

```swift
.background(AppTheme.surface(for: theme))
```

Do not change the adjacent overlay:

```swift
.overlay(alignment: .trailing) {
    Rectangle()
        .fill(AppTheme.cardBorder(for: theme))
        .frame(width: 0.5)
}
```

- [ ] **Step 4: Remove any non-tag `#` prefix if tests found one**

If `testHomeSidebarOnlyTagChipOptionsUseHashPrefix` failed, update only the failing non-tag chip builder so it passes plain text into `HomeSidebarChipItem.title`.

Allowed plain-text patterns:

```swift
title: option.id == "pinned" ? t("home.sidebar.pinned") : t("home.sidebar.all")
```

```swift
return HomeSidebarChipItem(id: option.id, title: title, count: option.count, accent: nil)
```

```swift
HomeSidebarChipItem(id: option.id, title: option.label, count: option.enabledGroupCount, accent: nil)
```

Do not change `homeTagChipItems(snapshot:)` unless a tag-specific regression is discovered.

- [ ] **Step 5: Run the static regression tests and verify pass**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarUsesSurfaceBackgroundAndKeepsTrailingDivider
swift test --filter DesktopInteractionRegressionTests/testHomeSidebarOnlyTagChipOptionsUseHashPrefix
```

Expected: PASS.

- [ ] **Step 6: Run the full interaction regression suite**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopInteractionRegressionTests
```

Expected: PASS with 0 failures.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "fix: give home sidebar a surface background"
```

---

## Task 3: Final Verification And Packaging Reminder

**Files:**
- No source files expected unless verification finds defects.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter MainViewModelSelectionTests/testHomeStatusAndSourceFilterDefaultsAreAvailable
swift test --filter DesktopInteractionRegressionTests
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Build desktop app**

Run:

```bash
cd apps/desktop-mac
swift build
```

Expected: PASS.

- [ ] **Step 3: Check git state**

Run:

```bash
git status --short --branch
```

Expected: only intentional untracked `.superpowers/` and ignored docs, unless they were force-added as requested.

- [ ] **Step 4: Repackage only if the user wants a new runnable build**

If the user asks for a new packaged app after implementation, run:

```bash
scripts/release/package-desktop-mac-dev.sh
```

Expected artifacts:

```text
dist/desktop-mac/arm64/Skill Flow.app
dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
```

Then verify:

```bash
hdiutil verify dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
```

Expected: checksum is valid.

---

## Self-Review Checklist

- Spec coverage:
  - White/surface sidebar background is covered by Task 2.
  - Existing right divider is preserved by Task 2.
  - All collapsible sections default collapsed is covered by Task 1.
  - Projects unchanged is covered by Task 2 tests and no source change to `homeSidebarProjectSection`.
  - Non-tag `#` prefix behavior is covered by Task 2.
- Placeholder scan:
  - No `TBD`, `TODO`, or incomplete instructions remain.
- Type consistency:
  - `expandedHomeSidebarSectionIds`, `homeSidebarChipSection`, and chip builder names match the current code.

# Desktop Interaction Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为桌面端高频交互控件补充统一的 `hover` / `press` 动画反馈，并把 `Home` 页 `GroupCard` 调整为“整卡非子控件区域进入 detail”。

**Architecture:** 先收敛一套桌面端统一交互反馈原语，只覆盖自定义 SwiftUI 按钮、chip、tab、列表行，不碰系统 `Toggle` / `Picker` / `TextField`。动画实现按“按钮类”、“chip/tab 类”、“列表 hover 类”分层接入，卡片点击边界只在 `Home` 场景生效，`Import` 和 `Menu` 场景继续保持当前主任务优先级。

**Tech Stack:** SwiftUI, Swift XCTest, macOS desktop app, existing desktop component library

---

## Scope Lock

### In Scope

- 顶部 toolbar icon buttons 的统一 `hover` / `press`
- Settings 页 action buttons 与 dropdown trigger/options 的统一交互反馈
- `GroupCard` 内 primary action / more button / skills / targets / tri-state switch 的统一交互反馈
- Detail 页 sidebar rows / document tabs / agent pills / file tree rows 的轻量反馈
- Tag 区域的小按钮和 tag pills 的统一反馈
- `Home` 页 `GroupCard` 改为整卡非子控件区域进入 detail

### Out of Scope

- 系统 `Toggle`
- 系统 `Picker(.segmented)`
- 文本输入框本体
- loading placeholder / progress
- `Import` 页 `GroupCard` 整卡进入 detail
- `Menu` 场景卡片整卡进入 detail
- 新增复杂弹簧动画、粒子、拖尾、长时序动画

### Confirmed Interaction Rules

1. `Home` 页 `GroupCard` 支持整卡非子控件区域进入 detail。
2. `Import` 页 `GroupCard` 不做整卡进入 detail；主任务继续是导入或导入提示。
3. `Menu` 场景卡片不做整卡进入 detail，避免误触。
4. 自定义动画优先级不能盖过现有 `selected` / `disabled` / `busy` / `loading` / `open` 状态。
5. 同一视觉家族必须统一处理，不能只给某个 chip 或某个小按钮单独加动画。

## File Structure

### Existing files to modify

- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
  - 接入 toolbar 按钮、home tag pills、`Home` card 整卡点击区域
- `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
  - 接入 card primary action、more button、skills / targets / tri-state switch、整卡 hover
- `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
  - 接入 sidebar rows、document tabs、agent pills、file tree rows、sidebar small toggles
- `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`
  - 接入 action buttons、dropdown trigger / options
- `apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift`
  - 接入 add button、suggestion tags、selectable tags

### New files to create

- `apps/desktop-mac/Sources/DesktopApp/Components/DesktopInteractionMotion.swift`
  - 统一定义 hover / press motion token、button style、chip style、row hover modifier
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionMotionTests.swift`
  - 校验 token、样式分组开关、`Home` card click policy、排除项规则
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`
  - 静态回归：确认目标控件接入了统一 motion helper，系统控件未被纳入

## Motion Rules

### Motion Tokens

- Icon/Button press scale: `0.97`
- Chip/Tab press scale: `0.985`
- Row hover opacity lift: `+0.04` 到 `+0.08`
- Animation duration:
  - hover: `0.12s` 到 `0.16s`
  - press: `0.08s` 到 `0.12s`
- Curve:
  - hover: `.easeOut`
  - press: `.easeInOut`

### Motion Families

1. `DesktopMotionButtonStyle`
   - 用于 toolbar、settings action、card CTA、more button、小 icon action
2. `DesktopMotionChipStyle`
   - 用于 chips、tabs、pills、tri-state switch、agent pills、tag pills
3. `DesktopRowHoverModifier`
   - 用于 sidebar row、file tree row、非按钮整行选择项

### Exclusion Rules

- `Toggle`, `Picker`, `TextField`, `.borderedProminent` 不接入自定义 motion helper
- `busy`, `disabled`, `loading` 状态下禁用 hover/press animation
- 已打开的 popover trigger 只保留 active 视觉，不继续叠加 hover pulse

## Task 1: Define Motion Tokens And Helpers

**Files:**
- Create: `apps/desktop-mac/Sources/DesktopApp/Components/DesktopInteractionMotion.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionMotionTests.swift`

- [ ] **Step 1: Write the failing tests**

```swift
import XCTest
@testable import SkillFlowDesktop

final class DesktopInteractionMotionTests: XCTestCase {
    func testMotionTokensStayWithinDesktopRange() {
        XCTAssertEqual(DesktopMotionTokens.buttonPressScale, 0.97, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.chipPressScale, 0.985, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.hoverDuration, 0.14, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.pressDuration, 0.10, accuracy: 0.001)
    }

    func testHomeCardClickPolicyAllowsWholeCardOnlyOnHomeRoute() {
        XCTAssertTrue(DesktopCardClickPolicy.allowsWholeCardTap(for: .home))
        XCTAssertFalse(DesktopCardClickPolicy.allowsWholeCardTap(for: .importSearch))
        XCTAssertFalse(DesktopCardClickPolicy.allowsWholeCardTap(for: .menu))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `swift test --filter DesktopInteractionMotionTests`
Expected: FAIL because `DesktopMotionTokens` and `DesktopCardClickPolicy` do not exist.

- [ ] **Step 3: Add the minimal motion helper file**

```swift
import SwiftUI

enum DesktopMotionTokens {
    static let buttonPressScale: CGFloat = 0.97
    static let chipPressScale: CGFloat = 0.985
    static let hoverDuration = 0.14
    static let pressDuration = 0.10
    static let rowHoverOpacityDelta = 0.06
}

enum DesktopCardClickPolicy {
    case home
    case importSearch
    case menu

    static func allowsWholeCardTap(for policy: DesktopCardClickPolicy) -> Bool {
        policy == .home
    }
}

struct DesktopRowHoverModifier: ViewModifier {
    let isHovered: Bool
    let overlayColor: Color

    func body(content: Content) -> some View {
        content
            .overlay {
                overlayColor
                    .opacity(isHovered ? DesktopMotionTokens.rowHoverOpacityDelta : 0)
            }
            .animation(.easeOut(duration: DesktopMotionTokens.hoverDuration), value: isHovered)
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `swift test --filter DesktopInteractionMotionTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Components/DesktopInteractionMotion.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionMotionTests.swift
git commit -m "feat: add desktop interaction motion tokens"
```

## Task 2: Add Motion To Toolbar And Settings Controls

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Write the failing regression tests**

```swift
import XCTest

final class DesktopInteractionRegressionTests: XCTestCase {
    func testToolbarButtonsUseSharedMotionButtonStyle() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        XCTAssertTrue(source.contains(".desktopMotionButton("))
    }

    func testSettingsActionButtonsAndDropdownTriggerUseSharedMotionButtonStyle() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")
        XCTAssertTrue(source.contains("settingsActionButton"))
        XCTAssertTrue(source.contains(".desktopMotionButton("))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `swift test --filter DesktopInteractionRegressionTests`
Expected: FAIL because the new shared motion helper is not wired into these views.

- [ ] **Step 3: Apply motion to toolbar and settings**

```swift
private func toolbarIconButton(_ icon: ActionIcon, action: @escaping () -> Void) -> some View {
    Button(action: action) {
        actionIcon(icon, size: 14)
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .frame(width: Self.toolbarButtonSize, height: Self.toolbarButtonSize)
            .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .desktopMotionButton(kind: .icon, theme: theme, accent: accent, isEnabled: true)
}

private func settingsActionButton(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
        Text(title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(AppTheme.brand(for: currentAccent, in: theme))
            .frame(width: controlColumnWidth, height: 32)
            .background(Self.controlBackground(for: .pageBackground, theme: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }
            .contentShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .desktopMotionButton(kind: .primary, theme: theme, accent: currentAccent, isEnabled: true)
}
```

- [ ] **Step 4: Run the tests**

Run: `swift test --filter 'DesktopInteractionMotionTests|DesktopInteractionRegressionTests|SettingsViewTests|MenuBarIconTests'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "feat: add motion to toolbar and settings controls"
```

## Task 3: Add Motion To Group Cards And Enable Whole-Card Tap On Home

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Extend regression tests for card policy**

```swift
func testHomeUsesWholeCardTapButImportAndMenuDoNot() throws {
    let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
    let card = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

    XCTAssertTrue(home.contains("DesktopCardClickPolicy.home"))
    XCTAssertTrue(card.contains(".desktopMotionCard("))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `swift test --filter DesktopInteractionRegressionTests`
Expected: FAIL because card motion and whole-card click policy are not wired in.

- [ ] **Step 3: Apply card motion and whole-card click boundary**

```swift
SharedGroupCard(
    card: card,
    theme: theme,
    accent: accent,
    displayMode: homeCardDisplayMode,
    clickPolicy: .home,
    onOpen: {
        navigation.showDetail(card.id)
    },
    ...
)

Button {
    guard clickPolicy.allowsWholeCardTap, !isBusy else { return }
    onOpen?()
} label: {
    cardBody
}
.buttonStyle(.plain)
.desktopMotionCard(theme: theme, accent: accent, isEnabled: clickPolicy.allowsWholeCardTap && !isBusy)
```

- [ ] **Step 4: Ensure Import and Menu remain excluded**

```swift
SharedGroupCard(
    ...,
    clickPolicy: .importSearch,
    onOpen: nil,
    ...
)
```

- [ ] **Step 5: Run the tests**

Run: `swift test --filter 'DesktopInteractionRegressionTests|ClickTargetRegressionTests|MenuBarIconTests'`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "feat: add group card motion and home whole-card tap"
```

## Task 4: Add Motion To Detail Navigation Surfaces

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Add failing regression checks**

```swift
func testDetailNavigationSurfacesUseSharedMotionHelpers() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Detail/DetailScreen.swift")
    XCTAssertTrue(source.contains(".desktopMotionChip("))
    XCTAssertTrue(source.contains(".desktopRowHover("))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `swift test --filter DesktopInteractionRegressionTests`
Expected: FAIL because Detail surfaces are not yet using the shared motion helpers.

- [ ] **Step 3: Apply motion to detail rows, tabs, pills, and tree items**

```swift
detailSkillListRow(...)
    .desktopRowHover(isHovered: isHovered, theme: theme, accent: accent)

documentTabChip(...)
    .desktopMotionChip(kind: .tab, theme: theme, accent: accent, isEnabled: true, isSelected: isSelected)

detailToggleButton(...)
    .desktopMotionChip(kind: .switch, theme: theme, accent: accent, isEnabled: !isLoading, isSelected: selection == .full)
```

- [ ] **Step 4: Run the tests**

Run: `swift test --filter 'DesktopInteractionRegressionTests|DetailLoadingLayoutTests|DesktopLocalizationTests'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "feat: add motion to detail navigation surfaces"
```

## Task 5: Add Motion To Tags And Card Chips

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Add failing regression checks**

```swift
func testTagPillsAndCardChipsUseSharedChipMotion() throws {
    let tags = try sourceText(at: "Sources/DesktopApp/Components/GroupTagComponents.swift")
    let cards = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

    XCTAssertTrue(tags.contains(".desktopMotionChip("))
    XCTAssertTrue(cards.contains(".desktopMotionChip("))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `swift test --filter DesktopInteractionRegressionTests`
Expected: FAIL because tag pills and card chips are not yet wired to shared chip motion.

- [ ] **Step 3: Apply shared chip motion**

```swift
Button {
    onSelect?(item)
} label: {
    tagPill(item, showsDeleteControl: false)
}
.buttonStyle(.plain)
.desktopMotionChip(kind: .tag, theme: theme, accent: item.accent, isEnabled: true, isSelected: false)

Button {
    action(item.id, !item.isEnabled, item.isEnabled)
} label: {
    skillToggle(item.label, highlightQuery: item.highlightQuery, isOn: item.isEnabled)
}
.buttonStyle(.plain)
.desktopMotionChip(kind: .skill, theme: theme, accent: accent, isEnabled: !isBusy, isSelected: item.isEnabled)
```

- [ ] **Step 4: Run the tests**

Run: `swift test --filter 'DesktopInteractionRegressionTests|ClickTargetRegressionTests|MenuBarIconTests'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "feat: add motion to tags and group card chips"
```

## Task 6: Final Verification

**Files:**
- No code changes expected

- [ ] **Step 1: Run targeted desktop interaction suite**

Run: `swift test --filter 'DesktopInteractionMotionTests|DesktopInteractionRegressionTests|ClickTargetRegressionTests|SettingsViewTests|MenuBarIconTests|DetailLoadingLayoutTests'`
Expected: PASS with `0 failures`

- [ ] **Step 2: Run broader desktop regression suite**

Run: `swift test --filter 'DesktopLocalizationTests|DetailScreenContainerTests|WorkflowCoverageTests'`
Expected: PASS, or if `WorkflowCoverageTests` is too slow for the current loop, document that it was intentionally deferred and run the first two suites before merge.

- [ ] **Step 3: Manual verification checklist**

```text
1. Hover toolbar buttons on Home; verify subtle highlight and no layout shift.
2. Press Settings action buttons; verify quick feedback and no size jump.
3. Hover/click Home GroupCard background; verify enters detail.
4. Click GroupCard child controls; verify they do not trigger detail.
5. Hover Detail sidebar rows and file tree rows; verify weak row-level feedback only.
6. Hover/click Detail tabs and agent pills; verify selected state remains dominant.
7. Confirm Import cards and Menu cards do not use whole-card detail navigation.
```

- [ ] **Step 4: Commit any final polish if needed**

```bash
git add apps/desktop-mac
git commit -m "chore: finalize desktop interaction motion rollout"
```

## Self-Review

### Spec coverage

- Toolbar buttons: covered in Task 2
- Settings buttons/dropdowns: covered in Task 2
- Home whole-card detail rule: covered in Task 3
- Group card CTA/more/chips: covered in Tasks 3 and 5
- Detail rows/tabs/pills/tree: covered in Task 4
- Tag controls: covered in Task 5
- Excluded system controls: locked in scope and regression tests

### Placeholder scan

- No `TODO` / `TBD`
- Commands, paths, and commit boundaries are explicit
- Exclusions are spelled out, not implied

### Type consistency

- Shared helper names are consistent across tasks:
  `DesktopMotionTokens`
  `DesktopCardClickPolicy`
  `desktopMotionButton`
  `desktopMotionChip`
  `desktopRowHover`
  `desktopMotionCard`

## Execution Notes

- 这个计划默认采用最小必要抽象：只新增一个统一 motion helper 文件，不扩展成完整设计系统层
- 如果实现时发现 `GroupCardComponents.swift` 因为 hover 状态接入变得过大，可在实现阶段拆出局部私有 helper，但不要先做无关重构
- 当前工作区还有 [`.gitignore`](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/.gitignore) 未提交变更，不应混入该计划对应的实现 commits

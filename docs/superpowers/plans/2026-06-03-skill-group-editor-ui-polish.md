# Skill Group Editor UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the desktop Skill Group Editor sheet with the confirmed A layout, imported `skill-group-editor.svg` icon, no Create/Merge target selector, empty target payloads, and `author · group name` skill source labels.

**Architecture:** Keep the existing desktop-only sheet and virtual group runtime contract. The view model supplies richer skill option metadata, while `MainView.swift` owns the sheet layout, target clearing, and empty target payload behavior.

**Tech Stack:** SwiftUI desktop app, Swift Package XCTest, SVG action icon resources, localized `.strings` files.

---

## Scope Check

This is one focused desktop polish task. It does not require TypeScript runtime or storage changes because the requested behavior only changes desktop UI collection and the `enabledTargets` values passed from desktop Create/Merge saves.

## File Structure

- `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/skill-group-editor.svg`: new imported icon copied from `/Users/Vint/Downloads/分组.svg`.
- `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/group-editor.svg`: remove only after `ActionIcon.groupEditor` no longer references it and tests pass.
- `apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift`: change `groupEditor` raw value to `skill-group-editor`.
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`: add `sourceSubtitle` to `VirtualGroupSkillOption` and compute `author · group name`.
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`: clear selections on tab changes, remove Create/Merge target UI, send empty `enabledTargets`, update sheet layout and backgrounds.
- `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`: add group editor name and summary strings.
- `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`: add group editor name and summary strings.
- `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`: add group editor name and summary strings.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift`: cover skill metadata, icon filename reference, source-level UI constraints, and empty target behavior by source assertions.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`: cover new localization keys.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/MenuBarIconTests.swift`: cover the renamed action icon loads.

Existing dirty files in the worktree must not be reverted:

- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- `packages/query/src/runtime.ts`
- `packages/query/src/tests/import-page-flow.test.ts`
- `.superpowers/`

---

### Task 1: Tests For Icon, Localization, And UI Contract

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MenuBarIconTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift`

- [ ] **Step 1: Add localization key expectations**

In `DesktopLocalizationTests.testGroupEditorLocalizationKeysExist()`, replace the `requiredKeys` array with:

```swift
let requiredKeys = [
    "group_editor.title",
    "group_editor.tab.create",
    "group_editor.tab.merge",
    "group_editor.tab.restore",
    "group_editor.name",
    "group_editor.summary.create",
    "group_editor.summary.merge",
    "group_editor.action.save",
    "group_editor.action.restore",
    "group_editor.validation.name_required",
    "group_editor.validation.skills_required",
    "group_editor.validation.groups_required",
    "group_editor.impact.create_virtual_group",
    "group_editor.impact.hide_groups",
    "group_editor.impact.clear_bindings",
    "group_editor.impact.save_restore_snapshot",
]
```

This deliberately removes `"group_editor.section.targets"` from the required set because Create and Merge no longer render a target section.

- [ ] **Step 2: Add action icon loading test**

In `MenuBarIconTests.swift`, near `testProjectActionIconsLoadTemplateSvgs()`, add:

```swift
func testSkillGroupEditorActionIconLoadsRenamedSvg() {
    let image = ActionIcon.groupEditor.image(size: 14)

    XCTAssertNotNil(image)
    XCTAssertEqual(image?.size, NSSize(width: 14, height: 14))
}
```

- [ ] **Step 3: Add source-level contract tests for the sheet**

In `MainViewModelVirtualGroupTests.swift`, after `testHomeCardDoesNotExposeDeleteActionForVirtualGroups()`, add:

```swift
func testGroupEditorSheetDoesNotRenderTargetsForCreateOrMerge() throws {
    let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertFalse(homeSource.contains("targetSection"))
    XCTAssertFalse(homeSource.contains("toggleTarget("))
    XCTAssertFalse(homeSource.contains("group_editor.section.targets"))
}

func testGroupEditorSaveSendsEmptyTargetsForCreateAndMerge() throws {
    let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertTrue(homeSource.contains("enabledTargets: []"))
    XCTAssertFalse(homeSource.contains("let targetIds = orderedGroupEditorSelectedTargetIds"))
    XCTAssertFalse(homeSource.contains("orderedGroupEditorSelectedTargetIds"))
}

func testGroupEditorTabChangeClearsSelectionsAndValidation() throws {
    let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertTrue(homeSource.contains("resetGroupEditorSelections(clearName: false)"))
    XCTAssertTrue(homeSource.contains("onResetSelections: { resetGroupEditorSelections(clearName: false) }"))
    XCTAssertTrue(homeSource.contains("onResetSelections()"))
    XCTAssertTrue(homeSource.contains("groupEditorSelectedSkills = []"))
    XCTAssertTrue(homeSource.contains("groupEditorSelectedSourceIds = []"))
    XCTAssertTrue(homeSource.contains("groupEditorSelectedTargetIds = []"))
    XCTAssertTrue(homeSource.contains("groupEditorValidationKey = nil"))
}
```

These tests use the existing `sourceText(at:)` helper in this file and intentionally lock down private SwiftUI behavior without needing to expose the sheet internals.

- [ ] **Step 4: Run the focused tests and verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.DesktopLocalizationTests/testGroupEditorLocalizationKeysExist
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MenuBarIconTests/testSkillGroupEditorActionIconLoadsRenamedSvg
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MainViewModelVirtualGroupTests/testGroupEditor
```

Expected: FAIL because the new localization keys, renamed icon resource, empty-target source contract, and reset helper are not implemented yet.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MenuBarIconTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift
git status --short
```

Expected: the three test files show modifications. Do not commit unless the user explicitly asks for commits.

---

### Task 2: Icon Resource And Localized Copy

**Files:**
- Create: `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/skill-group-editor.svg`
- Delete after verification: `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/group-editor.svg`
- Modify: `apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`

- [ ] **Step 1: Import the SVG under the new filename**

Copy the exact contents of `/Users/Vint/Downloads/分组.svg` into:

```text
apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/skill-group-editor.svg
```

The file content should be:

```xml
<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg t="1780458604356" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11240" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200"><path d="M400 400h176v-80H352c-17.673 0-32 14.327-32 32v224h80V400z" fill="#323338" p-id="11241"></path><path d="M130 704c-17.673 0-32-14.327-32-32V130c0-17.673 14.327-32 32-32h542c17.673 0 32 14.327 32 32v542c0 17.673-14.327 32-32 32H130z m48-80h446V178H178v446z" fill="#323338" p-id="11242"></path><path d="M320 894V752h80v94h446V400h-94v-80h142c17.673 0 32 14.327 32 32v542c0 17.673-14.327 32-32 32H352c-17.673 0-32-14.327-32-32z" fill="#323338" p-id="11243"></path></svg>
```

- [ ] **Step 2: Rename the action icon resource reference**

In `ActionIcon.swift`, change:

```swift
case groupEditor = "group-editor"
```

to:

```swift
case groupEditor = "skill-group-editor"
```

- [ ] **Step 3: Add English localization keys**

In `Resources/en.lproj/Localizable.strings`, near the existing `group_editor.*` block, add:

```text
"group_editor.name" = "Group Name";
"group_editor.summary.create" = "Combine skills from different groups into a new virtual group.";
"group_editor.summary.merge" = "Combine selected groups into one virtual group and hide the source groups.";
```

- [ ] **Step 4: Add Simplified Chinese localization keys**

In `Resources/zh-Hans.lproj/Localizable.strings`, near the existing `group_editor.*` block, add:

```text
"group_editor.name" = "分组名称";
"group_editor.summary.create" = "自由组合不同分组的技能，创建新的虚拟分组。";
"group_editor.summary.merge" = "合并选中的分组为一个虚拟分组，并隐藏来源分组。";
```

- [ ] **Step 5: Add Japanese localization keys**

In `Resources/ja.lproj/Localizable.strings`, near the existing `group_editor.*` block, add:

```text
"group_editor.name" = "グループ名";
"group_editor.summary.create" = "複数のグループのスキルを組み合わせて、新しい仮想グループを作成します。";
"group_editor.summary.merge" = "選択したグループを1つの仮想グループに結合し、元のグループを非表示にします。";
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.DesktopLocalizationTests/testGroupEditorLocalizationKeysExist
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MenuBarIconTests/testSkillGroupEditorActionIconLoadsRenamedSvg
```

Expected: PASS for the localization and icon tests.

- [ ] **Step 7: Remove the old icon file after the renamed icon test passes**

Delete:

```text
apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/group-editor.svg
```

Then run:

```bash
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MenuBarIconTests/testSkillGroupEditorActionIconLoadsRenamedSvg
```

Expected: PASS, confirming the app no longer depends on the old filename.

- [ ] **Step 8: Checkpoint**

Run:

```bash
git diff -- apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings
git status --short
```

Expected: new `skill-group-editor.svg`, deleted `group-editor.svg`, and modified localization/icon files. Do not commit unless the user explicitly asks for commits.

---

### Task 3: Skill Source Metadata In ViewModel

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift`

- [ ] **Step 1: Write the failing metadata expectation**

In `testCreateVirtualGroupDraftValidatesNameAndSelection()`, update the expected `VirtualGroupSkillOption` values to include `sourceSubtitle`.

Replace the first expected option with:

```swift
MainViewModel.VirtualGroupSkillOption(
    id: "alpha:alpha-a",
    sourceId: "alpha",
    sourceTitle: "Alpha",
    sourceSubtitle: "@github · Alpha",
    leafId: "alpha-a",
    title: "Browse",
    isEnabled: true
)
```

Replace the second expected option with:

```swift
MainViewModel.VirtualGroupSkillOption(
    id: "alpha:alpha-b",
    sourceId: "alpha",
    sourceTitle: "Alpha",
    sourceSubtitle: "@github · Alpha",
    leafId: "alpha-b",
    title: "Review",
    isEnabled: false
)
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MainViewModelVirtualGroupTests/testCreateVirtualGroupDraftValidatesNameAndSelection
```

Expected: FAIL because `VirtualGroupSkillOption` has no `sourceSubtitle` field.

- [ ] **Step 3: Add the new option field**

In `MainViewModel.VirtualGroupSkillOption`, change the struct to:

```swift
struct VirtualGroupSkillOption: Identifiable, Equatable {
    let id: String
    let sourceId: String
    let sourceTitle: String
    let sourceSubtitle: String
    let leafId: String
    let title: String
    let isEnabled: Bool
}
```

- [ ] **Step 4: Add helper methods for source subtitle formatting**

In `MainViewModel`, near `virtualGroupSkillOptions(for:)`, add:

```swift
private func virtualGroupSkillSourceSubtitle(for card: GroupCardModel) -> String {
    let author = Self.normalizedVirtualGroupAuthor(from: card.author)
    if let author {
        return "\(author) · \(card.title)"
    }
    return card.title
}

nonisolated private static func normalizedVirtualGroupAuthor(from byline: String) -> String? {
    let trimmed = byline.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        return nil
    }
    if trimmed.lowercased().hasPrefix("by ") {
        let value = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
    return trimmed
}
```

- [ ] **Step 5: Populate `sourceSubtitle`**

In `virtualGroupSkillOptions(for:)`, add:

```swift
let sourceSubtitle = virtualGroupSkillSourceSubtitle(for: card)
```

Then update the option construction to:

```swift
VirtualGroupSkillOption(
    id: "\(card.id):\(skill.id)",
    sourceId: card.id,
    sourceTitle: card.title,
    sourceSubtitle: sourceSubtitle,
    leafId: skill.id,
    title: skill.label,
    isEnabled: skill.isEnabled
)
```

- [ ] **Step 6: Run the focused test**

Run:

```bash
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MainViewModelVirtualGroupTests/testCreateVirtualGroupDraftValidatesNameAndSelection
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Run:

```bash
git diff -- apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift
git status --short
```

Expected: `VirtualGroupSkillOption` has `sourceSubtitle`, tests expect `@github · Alpha`. Do not commit unless the user explicitly asks for commits.

---

### Task 4: Sheet State, Empty Targets, And Layout

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift`

- [ ] **Step 1: Remove target ordering from save flow**

Delete the `orderedGroupEditorSelectedTargetIds` computed property.

In `openGroupEditor()`, replace:

```swift
groupEditorTab = .create
groupEditorName = ""
groupEditorSelectedSkills = []
groupEditorSelectedSourceIds = []
groupEditorSelectedTargetIds = Set(viewModel.visibleTargets.map(\.id))
groupEditorValidationKey = nil
isGroupEditorPresented = true
```

with:

```swift
groupEditorTab = .create
groupEditorName = ""
resetGroupEditorSelections(clearName: false)
isGroupEditorPresented = true
```

Add this helper near `openGroupEditor()`:

```swift
private func resetGroupEditorSelections(clearName: Bool) {
    if clearName {
        groupEditorName = ""
    }
    groupEditorSelectedSkills = []
    groupEditorSelectedSourceIds = []
    groupEditorSelectedTargetIds = []
    groupEditorValidationKey = nil
}
```

- [ ] **Step 2: Send empty targets from Create and Merge**

In `saveGroupEditor()`, in the `.create` valid case, replace:

```swift
let targetIds = orderedGroupEditorSelectedTargetIds
closeGroupEditor()
Task {
    await viewModel.createVirtualGroup(
        displayName: displayName,
        skills: skills,
        enabledTargets: targetIds
    )
}
```

with:

```swift
closeGroupEditor()
Task {
    await viewModel.createVirtualGroup(
        displayName: displayName,
        skills: skills,
        enabledTargets: []
    )
}
```

In the `.merge` valid case, replace:

```swift
let targetIds = orderedGroupEditorSelectedTargetIds
closeGroupEditor()
Task {
    await viewModel.mergeGroups(
        displayName: displayName,
        sourceIds: sourceIds,
        enabledTargets: targetIds
    )
}
```

with:

```swift
closeGroupEditor()
Task {
    await viewModel.mergeGroups(
        displayName: displayName,
        sourceIds: sourceIds,
        enabledTargets: []
    )
}
```

- [ ] **Step 3: Clear selections when changing tabs**

At the `GroupEditorSheet` call site, add:

```swift
onResetSelections: { resetGroupEditorSelections(clearName: false) },
```

In `GroupEditorSheet`, add this stored closure:

```swift
let onResetSelections: () -> Void
```

Then update the segmented picker `onChange` from:

```swift
.onChange(of: selectedTab) { _, _ in
    validationKey = nil
}
```

to:

```swift
.onChange(of: selectedTab) { _, _ in
    onResetSelections()
}
```

This keeps the private parent state reset in `MainView` and lets the sheet trigger it without owning parent state details.

- [ ] **Step 4: Remove target section UI**

Delete:

```swift
targetSection
```

from `createPanel` and `mergePanel`.

Delete the `targetSection` computed property.

Delete `toggleTarget(_:)` if it has no remaining callers.

Remove the `selectedTargetIds` binding from `GroupEditorSheet` and from the call site because target state remains parent-owned and is reset through `resetGroupEditorSelections(clearName:)`.

- [ ] **Step 5: Apply the confirmed A layout**

Replace `createPanel` with:

```swift
private var createPanel: some View {
    VStack(alignment: .leading, spacing: 12) {
        functionSummary("group_editor.summary.create")
        labeledNameField
        optionSection(title: t("group_card.section.skills")) {
            ForEach(skillOptions) { option in
                selectableRow(
                    title: option.title,
                    subtitle: option.sourceSubtitle,
                    isSelected: selectedSkills.contains(skillRef(for: option))
                ) {
                    toggleSkill(option)
                }
            }
        }
        impactList(["group_editor.impact.create_virtual_group"])
    }
}
```

Replace `mergePanel` with:

```swift
private var mergePanel: some View {
    VStack(alignment: .leading, spacing: 12) {
        functionSummary("group_editor.summary.merge")
        labeledNameField
        optionSection(title: t("group_card.section.skills")) {
            ForEach(sourceOptions) { option in
                selectableRow(
                    title: option.title,
                    subtitle: "\(option.skillCount)",
                    isSelected: selectedSourceIds.contains(option.id)
                ) {
                    toggleSource(option.id)
                }
            }
        }
        impactList([
            "group_editor.impact.hide_groups",
            "group_editor.impact.clear_bindings",
            "group_editor.impact.save_restore_snapshot",
        ])
    }
}
```

Add:

```swift
private func functionSummary(_ key: String) -> some View {
    Text(t(key))
        .font(.system(size: 12, weight: .regular))
        .foregroundStyle(AppTheme.textMuted(for: theme))
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
}

private var labeledNameField: some View {
    VStack(alignment: .leading, spacing: 6) {
        Text(t("group_editor.name"))
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(AppTheme.textMuted(for: theme))
            .textCase(.uppercase)
        nameField
    }
}
```

- [ ] **Step 6: Apply sheet and control backgrounds**

In `GroupEditorSheet.body`, replace:

```swift
.background(AppTheme.surface(for: theme))
```

with:

```swift
.background(AppTheme.pageBackground(for: theme))
```

In `nameField`, replace:

```swift
.background(AppTheme.headerControlFill(for: theme))
.clipShape(RoundedRectangle(cornerRadius: 8))
.overlay {
    RoundedRectangle(cornerRadius: 8)
        .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
}
```

with:

```swift
.background(AppTheme.groupCardFill(for: theme))
.clipShape(RoundedRectangle(cornerRadius: 8))
```

In `optionSection`, replace:

```swift
.background(AppTheme.toolbarButtonBackground(for: theme))
```

with:

```swift
.background(AppTheme.groupCardFill(for: theme))
```

In `selectableRow`, replace the unselected row background:

```swift
AppTheme.headerControlFill(for: theme)
```

with:

```swift
AppTheme.groupCardFill(for: theme)
```

Keep the selected row brand opacity background.

- [ ] **Step 7: Run the focused source contract tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MainViewModelVirtualGroupTests/testGroupEditor
```

Expected: PASS for the added source-level UI contract tests.

- [ ] **Step 8: Checkpoint**

Run:

```bash
git diff -- apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift
git status --short
```

Expected: Create/Merge no longer call `targetSection`, save calls send `enabledTargets: []`, and the sheet uses page background plus group card fill. Do not commit unless the user explicitly asks for commits.

---

### Task 5: Focused Verification And Packaging Readiness

**Files:**
- Verify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Verify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Verify: `apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift`
- Verify: `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/skill-group-editor.svg`
- Verify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/*`

- [ ] **Step 1: Run all touched Swift tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MainViewModelVirtualGroupTests
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.DesktopLocalizationTests/testGroupEditorLocalizationKeysExist
cd apps/desktop-mac && swift test --filter SkillFlowDesktopTests.MenuBarIconTests/testSkillGroupEditorActionIconLoadsRenamedSvg
```

Expected: all commands PASS.

- [ ] **Step 2: Run desktop Swift test suite**

Run:

```bash
cd apps/desktop-mac && swift test
```

Expected: PASS.

- [ ] **Step 3: Run repository build if Swift tests pass**

Run:

```bash
npm run build
```

Expected: PASS. If unrelated dirty TypeScript files cause failures, record the exact failing package and error without reverting those files.

- [ ] **Step 4: Inspect target-related source**

Run:

```bash
rg -n "targetSection|orderedGroupEditorSelectedTargetIds|group_editor.section.targets|enabledTargets: targetIds" apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift
```

Expected: no matches.

Run:

```bash
rg -n "skill-group-editor|group-editor" apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons
```

Expected: `ActionIcon.swift` and the resource directory reference `skill-group-editor`; no remaining dependency on `group-editor.svg`.

- [ ] **Step 5: Prepare for user manual testing**

If all verification passes, build the dev desktop package with the existing project packaging command used for this branch:

```bash
npm run build:desktop:dev
```

If that command is not present, find the exact script with:

```bash
npm run | rg "desktop|package|dmg"
```

Then run the matching dev packaging script already used in this repo.

Expected package outputs, if the existing packaging script succeeds:

```text
dist/desktop-mac/arm64/Skill Flow.app
dist/desktop-mac/arm64/Skill-Flow-arm64-dev.dmg
```

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
git diff --stat
```

Expected: only files from this plan plus pre-existing dirty files are modified. Do not commit unless the user explicitly asks for commits.

## Plan Self-Review

- Spec coverage: icon import and rename are covered by Task 2; header style is preserved by reusing existing button path in Task 2 and not changing the button call; A layout, Color 3 sheet background, Color 1 input/list backgrounds, and no input border are covered by Task 4; source metadata is covered by Task 3; empty target behavior and tab reset are covered by Task 4; testing and packaging readiness are covered by Task 5.
- Placeholder scan: the plan contains no placeholder work items.
- Type consistency: `VirtualGroupSkillOption.sourceSubtitle` is introduced in Task 3 and consumed in Task 4. `resetGroupEditorSelections(clearName:)` is introduced in Task 4 and referenced by the Task 1 contract test.

# Home Group Card Tag Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort Home group cards by pinned state, first tag sidebar order, and stable name/pinyin order, while allowing users to persistently reorder Home sidebar tag chips.

**Architecture:** Keep group tag order in the existing desktop-local `GroupTagCollection`. `GroupTagController` remains the single owner of tag metadata and tag order, while `HomeScreenContainer` performs final Home-only card sorting using `HomeSnapshot`.

**Tech Stack:** Swift, SwiftUI, UserDefaults JSON persistence, XCTest, Swift Package Manager.

---

## File Structure

- Modify `apps/desktop-mac/Sources/DesktopApp/Store/GroupTagState.swift`
  - Add `orderedTagKeys` to `GroupTagCollection`.
  - Add explicit `Codable` conformance so old v2 data without `orderedTagKeys` decodes to an empty order.
- Modify `apps/desktop-mac/Sources/DesktopApp/ViewModels/GroupTagController.swift`
  - Add tag order reconciliation.
  - Add `tagRankByID` to `HomeSnapshot`.
  - Add a reorder method for Home sidebar tag keys.
- Modify `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
  - Sort visible cards with `HomeSnapshot`.
  - Expose a tag reorder method to the view.
- Modify `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
  - Enable reorder only for the Home tags section.
  - Keep `All` fixed and non-draggable.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`
  - Add focused tag order and persistence tests.
- Create `apps/desktop-mac/Tests/SkillFlowDesktopTests/HomeScreenContainerSortingTests.swift`
  - Verify final Home visible card sorting.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`
  - Verify only tag chips wire reorder behavior.

## Task 1: Persist Global Tag Order

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/GroupTagState.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`

- [ ] **Step 1: Add failing decode and save tests**

Add these tests before `private func makeController`:

```swift
func testTagCollectionDecodesMissingOrderedTagKeysAsEmpty() throws {
    let data = """
    {
      "schemaVersion": 2,
      "tagsByGroupKey": {
        "source:alpha": [
          { "title": "设计", "accentRawValue": "pink" }
        ]
      }
    }
    """.data(using: .utf8)!

    let decoded = try JSONDecoder().decode(GroupTagCollection.self, from: data)

    XCTAssertEqual(decoded.tagsByGroupKey["source:alpha"]?.map(\.title), ["设计"])
    XCTAssertEqual(decoded.orderedTagKeys, [])
}

func testTagCollectionEncodesOrderedTagKeys() throws {
    let collection = GroupTagCollection(
        tagsByGroupKey: [:],
        orderedTagKeys: ["custom:设计", "preset:general"]
    )

    let data = try JSONEncoder().encode(collection)
    let decoded = try JSONDecoder().decode(GroupTagCollection.self, from: data)

    XCTAssertEqual(decoded.orderedTagKeys, ["custom:设计", "preset:general"])
}
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests/testTagCollection
```

Expected: compile or decode failure because `orderedTagKeys` does not exist.

- [ ] **Step 3: Implement `orderedTagKeys` with compatible decoding**

Replace `GroupTagCollection` in `GroupTagState.swift` with:

```swift
struct GroupTagCollection: Codable, Equatable {
    static let currentSchemaVersion = 2

    var schemaVersion: Int
    var tagsByGroupKey: [String: [GroupTagPreference]]
    var orderedTagKeys: [String]

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        tagsByGroupKey: [String: [GroupTagPreference]] = [:],
        orderedTagKeys: [String] = []
    ) {
        self.schemaVersion = schemaVersion
        self.tagsByGroupKey = tagsByGroupKey
        self.orderedTagKeys = orderedTagKeys
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case tagsByGroupKey
        case orderedTagKeys
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        self.tagsByGroupKey = try container.decode([String: [GroupTagPreference]].self, forKey: .tagsByGroupKey)
        self.orderedTagKeys = try container.decodeIfPresent([String].self, forKey: .orderedTagKeys) ?? []
    }
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests/testTagCollection
```

Expected: both new tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Store/GroupTagState.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift
git commit -m "feat(desktop): persist home tag order"
```

## Task 2: Order Home Snapshot Tags

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/GroupTagController.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`

- [ ] **Step 1: Add failing HomeSnapshot order tests**

Add these tests before `private func makeController`:

```swift
func testHomeSnapshotAvailableTagsFollowSavedOrder() {
    let state = DesktopAppState()
    state.groupTags.tagCollection.tagsByGroupKey = [
        "source:alpha": [GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)],
        "source:beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)],
        "source:gamma": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.orange.rawValue)]
    ]
    state.groupTags.tagCollection.orderedTagKeys = ["custom:研究", "custom:设计", "custom:增长"]
    let controller = makeController(state: state)

    let snapshot = controller.homeSnapshot(sourceIds: ["alpha", "beta", "gamma"], locale: Locale(identifier: "zh-Hans"))

    XCTAssertEqual(snapshot.availableTags.map(\.title), ["研究", "设计", "增长"])
    XCTAssertEqual(snapshot.tagRankByID["custom:研究"], 0)
    XCTAssertEqual(snapshot.tagRankByID["custom:设计"], 1)
    XCTAssertEqual(snapshot.tagRankByID["custom:增长"], 2)
}

func testHomeSnapshotAppendsUnknownTagsAfterSavedOrderAndPersistsThem() {
    let suiteName = #function
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let state = DesktopAppState()
    state.groupTags.tagCollection.tagsByGroupKey = [
        "source:alpha": [GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)],
        "source:beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
    ]
    state.groupTags.tagCollection.orderedTagKeys = ["custom:研究"]
    let controller = makeController(state: state, userDefaults: defaults)

    let snapshot = controller.homeSnapshot(sourceIds: ["alpha", "beta"], locale: Locale(identifier: "zh-Hans"))

    XCTAssertEqual(snapshot.availableTags.map(\.title), ["研究", "设计"])
    XCTAssertEqual(state.groupTags.tagCollection.orderedTagKeys, ["custom:研究", "custom:设计"])
    XCTAssertEqual(
        DesktopGroupTagStore(userDefaults: defaults).loadTagCollection().orderedTagKeys,
        ["custom:研究", "custom:设计"]
    )
}

func testHomeSnapshotKeepsHiddenGlobalOrderKeys() {
    let state = DesktopAppState()
    state.groupTags.tagCollection.tagsByGroupKey = [
        "source:alpha": [GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)],
        "source:beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
    ]
    state.groupTags.tagCollection.orderedTagKeys = ["custom:研究", "custom:设计"]
    let controller = makeController(state: state)

    let snapshot = controller.homeSnapshot(sourceIds: ["alpha"], locale: Locale(identifier: "zh-Hans"))

    XCTAssertEqual(snapshot.availableTags.map(\.title), ["设计"])
    XCTAssertEqual(state.groupTags.tagCollection.orderedTagKeys, ["custom:研究", "custom:设计"])
}

func testReorderHomeTagsMovesSourceBeforeTargetAndPersists() {
    let suiteName = #function
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let state = DesktopAppState()
    state.groupTags.tagCollection.orderedTagKeys = ["custom:设计", "custom:研究", "custom:增长"]
    let controller = makeController(state: state, userDefaults: defaults)

    controller.moveHomeTag(sourceTagID: "custom:增长", targetTagID: "custom:设计", placement: .before)

    XCTAssertEqual(state.groupTags.tagCollection.orderedTagKeys, ["custom:增长", "custom:设计", "custom:研究"])
    XCTAssertEqual(
        DesktopGroupTagStore(userDefaults: defaults).loadTagCollection().orderedTagKeys,
        ["custom:增长", "custom:设计", "custom:研究"]
    )
}
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests/testHomeSnapshot
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests/testReorderHomeTags
```

Expected: compile failure for `tagRankByID`, `moveHomeTag`, or `HomeTagMovePlacement`.

- [ ] **Step 3: Add snapshot ranking and reorder API**

In `GroupTagController.swift`, add:

```swift
enum HomeTagMovePlacement {
    case before
    case after
}
```

Add `tagRankByID` to `HomeSnapshot`:

```swift
let tagRankByID: [String: Int]
```

After `availableTags` is built in `homeSnapshot`, replace the current title sort with:

```swift
let orderedTags = reconciledAvailableTags(availableTags)
let tagRankByID = Dictionary(uniqueKeysWithValues: orderedTags.enumerated().map { index, item in
    (item.id, index)
})
```

Return `orderedTags` and `tagRankByID` in the snapshot.

Add:

```swift
func moveHomeTag(sourceTagID: String, targetTagID: String, placement: HomeTagMovePlacement) {
    guard sourceTagID != targetTagID else {
        return
    }
    var ordered = state.groupTags.tagCollection.orderedTagKeys
    guard let sourceIndex = ordered.firstIndex(of: sourceTagID),
          let targetIndex = ordered.firstIndex(of: targetTagID) else {
        return
    }

    let source = ordered.remove(at: sourceIndex)
    let adjustedTargetIndex = ordered.firstIndex(of: targetTagID) ?? targetIndex
    let insertionIndex = placement == .before ? adjustedTargetIndex : adjustedTargetIndex + 1
    ordered.insert(source, at: min(insertionIndex, ordered.count))
    state.groupTags.tagCollection.orderedTagKeys = ordered
    store.saveTagCollection(state.groupTags.tagCollection)
}
```

Add a private helper:

```swift
private func reconciledAvailableTags(_ tags: [GroupTagDisplayItem]) -> [GroupTagDisplayItem] {
    let tagsByID = Dictionary(uniqueKeysWithValues: tags.map { ($0.id, $0) })
    let existingGlobalTagIDs = Set(
        state.groupTags.tagCollection.tagsByGroupKey.values
            .flatMap { $0.map(Self.tagKey) }
    )
    let currentOrder = state.groupTags.tagCollection.orderedTagKeys.filter { existingGlobalTagIDs.contains($0) }
    let orderedVisible = currentOrder.compactMap { tagsByID[$0] }
    let orderedVisibleIDs = Set(orderedVisible.map(\.id))
    let appended = tags
        .filter { !orderedVisibleIDs.contains($0.id) }
        .sorted(by: Self.sortTags)
    let reconciledOrder = currentOrder + appended.map(\.id)

    if reconciledOrder != state.groupTags.tagCollection.orderedTagKeys {
        state.groupTags.tagCollection.orderedTagKeys = reconciledOrder
        store.saveTagCollection(state.groupTags.tagCollection)
    }

    return orderedVisible + appended
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests/testHomeSnapshot
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests/testReorderHomeTags
```

Expected: all new HomeSnapshot and reorder tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/GroupTagController.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift
git commit -m "feat(desktop): order home sidebar tags"
```

## Task 3: Sort Home Group Cards by Tag Order and Pinyin

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/HomeScreenContainerSortingTests.swift`

- [ ] **Step 1: Create failing Home card sorting tests**

Create `apps/desktop-mac/Tests/SkillFlowDesktopTests/HomeScreenContainerSortingTests.swift`:

```swift
import XCTest
@testable import SkillFlowDesktop

@MainActor
final class HomeScreenContainerSortingTests: XCTestCase {
    func testSortsByPinnedFirstThenFirstTagRankThenNameKey() {
        let snapshot = GroupTagController.HomeSnapshot(
            availableTags: [],
            tagCountsByID: [:],
            selectedKey: nil,
            visibleSourceIDs: ["alpha", "beta", "gamma", "delta"],
            tagsBySourceID: [
                "alpha": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "beta": [GroupTagDisplayItem(id: "custom:设计", title: "设计", accent: .pink)],
                "gamma": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "delta": []
            ],
            suggestionsBySourceID: [:],
            tagRankByID: ["custom:设计": 0, "custom:研究": 1],
            visibleSourceIDSet: Set(["alpha", "beta", "gamma", "delta"])
        )
        let cards = [
            card(id: "alpha", title: "Research", isPinned: false),
            card(id: "beta", title: "设计工具", isPinned: false),
            card(id: "gamma", title: "Gamma", isPinned: true),
            card(id: "delta", title: "No Tags", isPinned: false)
        ]

        let sorted = HomeScreenContainer.sortedHomeGroupCards(cards, snapshot: snapshot, pinnedSourceIds: ["gamma"])

        XCTAssertEqual(sorted.map(\.id), ["gamma", "beta", "alpha", "delta"])
    }

    func testSortsChineseNamesByPinyinWhenTagRankMatches() {
        let snapshot = GroupTagController.HomeSnapshot(
            availableTags: [],
            tagCountsByID: [:],
            selectedKey: nil,
            visibleSourceIDs: ["shu", "she", "zi"],
            tagsBySourceID: [
                "shu": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "she": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)],
                "zi": [GroupTagDisplayItem(id: "custom:研究", title: "研究", accent: .yellow)]
            ],
            suggestionsBySourceID: [:],
            tagRankByID: ["custom:研究": 0],
            visibleSourceIDSet: Set(["shu", "she", "zi"])
        )
        let cards = [
            card(id: "shu", title: "数据助手", isPinned: false),
            card(id: "she", title: "设计工具", isPinned: false),
            card(id: "zi", title: "自动化", isPinned: false)
        ]

        let sorted = HomeScreenContainer.sortedHomeGroupCards(cards, snapshot: snapshot, pinnedSourceIds: [])

        XCTAssertEqual(sorted.map(\.id), ["she", "shu", "zi"])
    }

    private func card(id: String, title: String, isPinned: Bool) -> MainViewModel.GroupCardModel {
        MainViewModel.GroupCardModel(
            id: id,
            title: title,
            byline: nil,
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "https://example.com/\(id)",
            isPinned: isPinned,
            health: "HEALTHY",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(skillCount: 0, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )
    }
}
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
swift test --package-path apps/desktop-mac --filter HomeScreenContainerSortingTests
```

Expected: compile failure because `sortedHomeGroupCards` does not exist or `HomeSnapshot` initializer is not accessible.

- [ ] **Step 3: Implement Home sorting helper**

In `GroupTagController.HomeSnapshot`, make `visibleSourceIDSet` internal so tests can construct snapshots:

```swift
let visibleSourceIDSet: Set<String>
```

In `HomeScreenContainer.swift`, change `visibleGroupCards(from:snapshot:)` to:

```swift
let filtered = cards.filter { card in
    snapshot.contains(sourceId: card.id)
        && mainViewModel.matchesHomeSidebarFilters(card)
}
return Self.sortedHomeGroupCards(
    filtered,
    snapshot: snapshot,
    pinnedSourceIds: mainViewModel.pinnedSourceIds
)
```

Add:

```swift
static func sortedHomeGroupCards(
    _ cards: [MainViewModel.GroupCardModel],
    snapshot: GroupTagController.HomeSnapshot,
    pinnedSourceIds: [String]
) -> [MainViewModel.GroupCardModel] {
    cards.sorted { lhs, rhs in
        let leftPin = pinRank(for: lhs.id, pinnedSourceIds: pinnedSourceIds)
        let rightPin = pinRank(for: rhs.id, pinnedSourceIds: pinnedSourceIds)
        if leftPin != rightPin {
            return leftPin < rightPin
        }

        let leftTag = firstTagRank(for: lhs.id, snapshot: snapshot)
        let rightTag = firstTagRank(for: rhs.id, snapshot: snapshot)
        if leftTag != rightTag {
            return leftTag < rightTag
        }

        let leftName = homeNameSortKey(lhs.title)
        let rightName = homeNameSortKey(rhs.title)
        if leftName != rightName {
            return leftName < rightName
        }

        return lhs.id.localizedCaseInsensitiveCompare(rhs.id) == .orderedAscending
    }
}
```

Add private static helpers:

```swift
private static func pinRank(for sourceId: String, pinnedSourceIds: [String]) -> Int {
    pinnedSourceIds.firstIndex(of: sourceId) ?? Int.max
}

private static func firstTagRank(for sourceId: String, snapshot: GroupTagController.HomeSnapshot) -> Int {
    guard let firstTag = snapshot.tagsBySourceID[sourceId]?.first else {
        return Int.max
    }
    return snapshot.tagRankByID[firstTag.id] ?? Int.max - 1
}

private static func homeNameSortKey(_ title: String) -> String {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let latin = trimmed.applyingTransform(.mandarinToLatin, reverse: false) ?? trimmed
    let stripped = latin.applyingTransform(.stripCombiningMarks, reverse: false) ?? latin
    return stripped.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
swift test --package-path apps/desktop-mac --filter HomeScreenContainerSortingTests
```

Expected: both sorting tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift apps/desktop-mac/Sources/DesktopApp/ViewModels/GroupTagController.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/HomeScreenContainerSortingTests.swift
git commit -m "feat(desktop): sort home groups by tag order"
```

## Task 4: Enable Sidebar Tag Drag Reordering

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift`

- [ ] **Step 1: Add failing UI wiring regression test**

Add to `DesktopInteractionRegressionTests`:

```swift
func testHomeSidebarOnlyTagSectionEnablesTagReordering() throws {
    let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

    XCTAssertTrue(source.contains("onMoveTag: { sourceTagID, targetTagID, placement in"))
    XCTAssertTrue(source.contains("homeContainer.moveHomeTag(sourceTagID: sourceTagID, targetTagID: targetTagID, placement: placement)"))
    XCTAssertTrue(source.contains("HomeSidebarTagDropDelegate"))

    guard
        let tagSection = source.range(of: "homeSidebarChipSection(sectionId: HomeSidebarSectionID.tags"),
        let agentSection = source.range(of: "homeSidebarChipSection(sectionId: HomeSidebarSectionID.agents")
    else {
        XCTFail("Expected Home sidebar tag and agent sections were not found")
        return
    }

    let tagBlock = String(source[tagSection.lowerBound..<agentSection.lowerBound])
    XCTAssertTrue(tagBlock.contains("onMoveTag:"))
    XCTAssertFalse(String(source[..<tagSection.lowerBound]).contains("onMoveTag:"))
}
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopInteractionRegressionTests/testHomeSidebarOnlyTagSectionEnablesTagReordering
```

Expected: failure because reorder wiring does not exist.

- [ ] **Step 3: Expose Home tag move from container**

Add to `HomeScreenContainer.swift`:

```swift
func moveHomeTag(sourceTagID: String, targetTagID: String, placement: HomeTagMovePlacement) {
    groupTagController.moveHomeTag(
        sourceTagID: sourceTagID,
        targetTagID: targetTagID,
        placement: placement
    )
}
```

- [ ] **Step 4: Add tag reorder wiring to `MainView`**

Update `homeSidebarChipSection` signature:

```swift
private func homeSidebarChipSection(
    sectionId: String,
    title: String,
    options: [HomeSidebarChipItem],
    selectedId: String,
    onSelect: @escaping (String) -> Void,
    onMoveTag: ((String, String, HomeTagMovePlacement) -> Void)? = nil
) -> some View
```

Update the tags call:

```swift
homeSidebarChipSection(
    sectionId: HomeSidebarSectionID.tags,
    title: t("home.sidebar.tags"),
    options: homeTagChipItems(snapshot: homeTagSnapshot),
    selectedId: homeTagSnapshot.selectedKey ?? "all",
    onSelect: { optionId in
        homeContainer.setSelectedHomeTagFilterKey(optionId == "all" ? nil : optionId)
    },
    onMoveTag: { sourceTagID, targetTagID, placement in
        homeContainer.moveHomeTag(sourceTagID: sourceTagID, targetTagID: targetTagID, placement: placement)
    }
)
```

Add `onMoveTag` to the chip rendering:

```swift
homeSidebarChip(option: option, isSelected: selectedId == option.id, onMoveTag: onMoveTag) {
    onSelect(option.id)
}
```

Update `homeSidebarChip`:

```swift
private func homeSidebarChip(
    option: HomeSidebarChipItem,
    isSelected: Bool,
    onMoveTag: ((String, String, HomeTagMovePlacement) -> Void)? = nil,
    action: @escaping () -> Void
) -> some View {
    homeFilterPill(
        title: option.title,
        count: option.count,
        accent: option.accent ?? accent,
        showsHashPrefix: option.showsHashPrefix,
        isSelected: isSelected,
        tagID: option.id == "all" ? nil : option.id,
        onMoveTag: onMoveTag,
        action: action
    )
}
```

Update `homeFilterPill` to accept `tagID` and `onMoveTag`, and add drag/drop only when both are non-nil:

```swift
.modifier(HomeSidebarTagReorderModifier(tagID: tagID, onMoveTag: onMoveTag))
```

Add these helper types near `HomeSidebarChipTitleFormatter`:

```swift
private struct HomeSidebarTagReorderModifier: ViewModifier {
    let tagID: String?
    let onMoveTag: ((String, String, HomeTagMovePlacement) -> Void)?

    func body(content: Content) -> some View {
        guard let tagID, let onMoveTag else {
            return AnyView(content)
        }
        return AnyView(
            content
                .onDrag {
                    NSItemProvider(object: tagID as NSString)
                }
                .background {
                    GeometryReader { proxy in
                        Color.clear
                            .onDrop(
                                of: [.text],
                                delegate: HomeSidebarTagDropDelegate(
                                    targetTagID: tagID,
                                    targetWidth: proxy.size.width,
                                    onMoveTag: onMoveTag
                                )
                            )
                    }
                }
        )
    }
}

private struct HomeSidebarTagDropDelegate: DropDelegate {
    let targetTagID: String
    let targetWidth: CGFloat
    let onMoveTag: (String, String, HomeTagMovePlacement) -> Void

    func performDrop(info: DropInfo) -> Bool {
        guard let provider = info.itemProviders(for: [.text]).first else {
            return false
        }
        provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { item, _ in
            let value: String?
            if let data = item as? Data {
                value = String(data: data, encoding: .utf8)
            } else if let string = item as? NSString {
                value = string as String
            } else {
                value = item as? String
            }
            guard let sourceTagID = value?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !sourceTagID.isEmpty,
                  sourceTagID != targetTagID else {
                return
            }
            let placement: HomeTagMovePlacement = info.location.x < targetWidth / 2 ? .before : .after
            DispatchQueue.main.async {
                onMoveTag(sourceTagID, targetTagID, placement)
            }
        }
        return true
    }
}
```

Add `import UniformTypeIdentifiers` to `MainView.swift`.

- [ ] **Step 5: Run the focused UI wiring test**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopInteractionRegressionTests/testHomeSidebarOnlyTagSectionEnablesTagReordering
```

Expected: test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopInteractionRegressionTests.swift
git commit -m "feat(desktop): reorder home sidebar tags"
```

## Task 5: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run the full desktop test suite**

Run:

```bash
swift test --package-path apps/desktop-mac
```

Expected: all tests pass.

- [ ] **Step 2: Run git status**

Run:

```bash
git status --short
```

Expected: no unstaged changes unless the implementation intentionally leaves docs or generated artifacts to commit.

- [ ] **Step 3: Commit any final test or polish changes**

If Step 1 required fixes, commit them:

```bash
git add apps/desktop-mac
git commit -m "test(desktop): verify home tag ordering"
```

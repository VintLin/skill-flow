# Group Tag Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist desktop group tags by stable group identity so default tags, added tags, and deleted tags stay fixed across refreshes.

**Architecture:** Keep tag persistence desktop-local. Replace the source-id keyed tag map with a v2 UserDefaults collection keyed by `repo:`, `locator:`, or `source:` group identity. Recommendation tags become one-time initialization data and are never used to overwrite an existing v2 entry, including an empty array.

**Tech Stack:** Swift, SwiftUI desktop app state, UserDefaults JSON persistence, XCTest, Swift Package Manager.

---

## File Structure

- Modify `apps/desktop-mac/Sources/DesktopApp/Store/GroupTagState.swift`
  - Add `GroupTagCollection`.
  - Replace `customTagsBySourceId` with `tagCollection`.
- Modify `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopGroupTagStore.swift`
  - Add v2 key `desktop.groupTags.v2.tagsByGroupKey`.
  - Replace old custom tag load/save methods with collection load/save methods.
  - Do not migrate old `desktop.groupTags.customTagsBySourceId`.
- Modify `apps/desktop-mac/Sources/DesktopApp/App/DesktopAppContainer.swift`
  - Load the v2 collection into runtime state at startup.
- Modify `apps/desktop-mac/Sources/DesktopApp/ViewModels/GroupTagController.swift`
  - Resolve stable group keys.
  - Initialize default recommendation tags once.
  - Read/add/delete only through v2 saved tags.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`
  - Update tests and helpers from source-id storage to group-key storage.
  - Add regressions for default tag persistence, deletion persistence, empty saved state, and source-id changes.

## Task 1: Add Failing Persistence Tests

**Files:**
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`

- [ ] **Step 1: Replace source-id storage assertions with v2 collection assertions in existing tests**

In `GroupTagControllerTests`, replace assertions that read `state.groupTags.customTagsBySourceId` or `loadCustomTags()` with `state.groupTags.tagCollection.tagsByGroupKey` or `loadTagCollection()`.

Use these replacements:

```swift
XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["source:alpha"]?.map(\.title), ["设计系统"])
XCTAssertEqual(
    DesktopGroupTagStore(userDefaults: defaults).loadTagCollection().tagsByGroupKey["source:alpha"]?.map(\.title),
    ["设计系统"]
)
```

For test setup, replace:

```swift
state.groupTags.customTagsBySourceId["alpha"] = [
    GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)
]
```

with:

```swift
state.groupTags.tagCollection.tagsByGroupKey["source:alpha"] = [
    GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)
]
```

For multi-source setup, replace:

```swift
state.groupTags.customTagsBySourceId = [
    "alpha": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue)],
    "beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
]
```

with:

```swift
state.groupTags.tagCollection.tagsByGroupKey = [
    "source:alpha": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue)],
    "source:beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
]
```

- [ ] **Step 2: Add tests for v2 behavior**

Add these tests before `private func makeController`:

```swift
func testResolvedRecommendationTagInitializesV2Store() {
    let suiteName = #function
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let state = DesktopAppState()
    let controller = makeController(
        state: state,
        recommendations: [
            ImportRecommendationEntry(
                canonicalRepo: "anthropics/skills",
                locator: "https://github.com/anthropics/skills.git",
                categoryId: "general",
                primaryTagId: "general",
                secondaryTagIds: [],
                descriptionKey: "desc",
                sortOrder: 1
            )
        ],
        userDefaults: defaults,
        sourceCanonicalRepo: { sourceId in sourceId == "alpha" ? "Anthropics/Skills" : nil },
        sourceLocator: { sourceId in sourceId == "alpha" ? "https://github.com/anthropics/skills.git" : nil }
    )

    let tags = controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en"))

    XCTAssertEqual(tags.map(\.title), ["General"])
    XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"]?.map(\.tagId), ["general"])
    XCTAssertEqual(
        DesktopGroupTagStore(userDefaults: defaults)
            .loadTagCollection()
            .tagsByGroupKey["repo:anthropics/skills"]?
            .map(\.tagId),
        ["general"]
    )
}

func testRemoveDefaultTagPersistsEmptyV2OverrideAcrossControllerRebuild() {
    let suiteName = #function
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let firstState = DesktopAppState()
    let recommendations = [
        ImportRecommendationEntry(
            canonicalRepo: "anthropics/skills",
            locator: "https://github.com/anthropics/skills.git",
            categoryId: "general",
            primaryTagId: "general",
            secondaryTagIds: [],
            descriptionKey: "desc",
            sortOrder: 1
        )
    ]
    let firstController = makeController(
        state: firstState,
        recommendations: recommendations,
        userDefaults: defaults,
        sourceCanonicalRepo: { sourceId in sourceId == "alpha" ? "anthropics/skills" : nil },
        sourceLocator: { sourceId in sourceId == "alpha" ? "https://github.com/anthropics/skills.git" : nil }
    )

    XCTAssertEqual(firstController.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en")).map(\.title), ["General"])
    let result = firstController.removeCustomTag("preset:general", fromSourceId: "alpha", locale: Locale(identifier: "en"))

    let secondState = DesktopAppState()
    secondState.groupTags.tagCollection = DesktopGroupTagStore(userDefaults: defaults).loadTagCollection()
    let secondController = makeController(
        state: secondState,
        recommendations: recommendations,
        userDefaults: defaults,
        sourceCanonicalRepo: { sourceId in sourceId == "alpha" ? "anthropics/skills" : nil },
        sourceLocator: { sourceId in sourceId == "alpha" ? "https://github.com/anthropics/skills.git" : nil }
    )

    XCTAssertEqual(result, .removed)
    XCTAssertEqual(secondState.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"], [])
    XCTAssertEqual(secondController.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en")).map(\.title), [])
}

func testAddedTagPersistsAcrossControllerRebuild() {
    let suiteName = #function
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let firstState = DesktopAppState()
    let firstController = makeController(state: firstState, userDefaults: defaults)

    let result = firstController.addCustomTag("设计", accent: .pink, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

    let secondState = DesktopAppState()
    secondState.groupTags.tagCollection = DesktopGroupTagStore(userDefaults: defaults).loadTagCollection()
    let secondController = makeController(state: secondState, userDefaults: defaults)

    XCTAssertEqual(result, .added)
    XCTAssertEqual(secondController.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "zh-Hans")).map(\.title), ["设计"])
}

func testSavedTagsFollowCanonicalRepoWhenSourceIdChanges() {
    let state = DesktopAppState()
    state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"] = [
        GroupTagPreference(title: "固定", accentRawValue: DesktopAccentColor.pink.rawValue)
    ]
    let controller = makeController(
        state: state,
        sourceCanonicalRepo: { sourceId in
            sourceId == "alpha-renamed" ? "Anthropics/Skills" : nil
        },
        sourceLocator: { sourceId in
            sourceId == "alpha-renamed" ? "https://github.com/anthropics/skills.git" : nil
        }
    )

    let tags = controller.resolvedTags(forSourceId: "alpha-renamed", locale: Locale(identifier: "zh-Hans"))

    XCTAssertEqual(tags.map(\.title), ["固定"])
}

func testSavedEmptyTagsDoNotFallbackToRecommendation() {
    let state = DesktopAppState()
    state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"] = []
    let controller = makeController(
        state: state,
        recommendations: [
            ImportRecommendationEntry(
                canonicalRepo: "anthropics/skills",
                locator: "https://github.com/anthropics/skills.git",
                categoryId: "general",
                primaryTagId: "general",
                secondaryTagIds: [],
                descriptionKey: "desc",
                sortOrder: 1
            )
        ],
        sourceCanonicalRepo: { sourceId in sourceId == "alpha" ? "anthropics/skills" : nil },
        sourceLocator: { sourceId in sourceId == "alpha" ? "https://github.com/anthropics/skills.git" : nil }
    )

    let tags = controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en"))

    XCTAssertEqual(tags, [])
}
```

- [ ] **Step 3: Update the test helper signature**

Replace the helper at the bottom of the test file with this signature and body:

```swift
private func makeController(
    state: DesktopAppState = DesktopAppState(),
    recommendations: [ImportRecommendationEntry] = [],
    userDefaults: UserDefaults = .standard,
    sourceCanonicalRepo: @escaping (String) -> String? = { _ in nil },
    sourceLocator: @escaping (String) -> String? = { _ in nil }
) -> GroupTagController {
    GroupTagController(
        state: state,
        store: DesktopGroupTagStore(userDefaults: userDefaults),
        recommendationsProvider: { recommendations },
        sourceCanonicalRepo: sourceCanonicalRepo,
        sourceLocator: sourceLocator,
        randomAccent: { .blue }
    )
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests
```

Expected: FAIL at compile time because `GroupTagCollection`, `tagCollection`, and `loadTagCollection()` do not exist yet.

- [ ] **Step 5: Commit failing tests**

Do not commit failing tests by themselves. Continue to Task 2 and commit once the first implementation slice passes.

## Task 2: Add V2 State and Store

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/GroupTagState.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopGroupTagStore.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/App/DesktopAppContainer.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`

- [ ] **Step 1: Replace group tag state shape**

Replace `GroupTagState.swift` with:

```swift
import Foundation

struct GroupTagPreference: Codable, Equatable {
    let title: String
    let accentRawValue: String
    let tagId: String?

    var accent: DesktopAccentColor {
        DesktopAccentColor(rawValue: accentRawValue) ?? .blue
    }

    init(title: String, accentRawValue: String, tagId: String? = nil) {
        self.title = title
        self.accentRawValue = accentRawValue
        self.tagId = tagId
    }
}

struct GroupTagCollection: Codable, Equatable {
    static let currentSchemaVersion = 2

    let schemaVersion: Int
    var tagsByGroupKey: [String: [GroupTagPreference]]

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        tagsByGroupKey: [String: [GroupTagPreference]] = [:]
    ) {
        self.schemaVersion = schemaVersion
        self.tagsByGroupKey = tagsByGroupKey
    }
}

struct GroupTagState {
    var tagCollection = GroupTagCollection()
    var selectedHomeFilterKey: String? = nil
}
```

- [ ] **Step 2: Replace group tag store**

Replace `DesktopGroupTagStore.swift` with:

```swift
import Foundation

struct DesktopGroupTagStore {
    static let tagCollectionKey = "desktop.groupTags.v2.tagsByGroupKey"

    let userDefaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func loadTagCollection() -> GroupTagCollection {
        guard let data = userDefaults.data(forKey: Self.tagCollectionKey),
              let decoded = try? decoder.decode(GroupTagCollection.self, from: data),
              decoded.schemaVersion == GroupTagCollection.currentSchemaVersion
        else {
            return GroupTagCollection()
        }

        return decoded
    }

    func saveTagCollection(_ tagCollection: GroupTagCollection) {
        let encoded = try? encoder.encode(tagCollection)
        userDefaults.set(encoded, forKey: Self.tagCollectionKey)
    }
}
```

- [ ] **Step 3: Update app startup load**

In `DesktopAppContainer.swift`, replace:

```swift
resolvedRuntime.state.groupTags.customTagsBySourceId = groupTagStore.loadCustomTags()
```

with:

```swift
resolvedRuntime.state.groupTags.tagCollection = groupTagStore.loadTagCollection()
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests
```

Expected: still FAIL because `GroupTagController` still references `customTagsBySourceId`, `loadCustomTags()`, and `saveCustomTags()`.

## Task 3: Implement Stable Group-Key Controller Semantics

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/GroupTagController.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift`

- [ ] **Step 1: Replace source-id reads and writes in `GroupTagController`**

Replace `resolvedTags(forSourceId:locale:)` with:

```swift
func resolvedTags(forSourceId sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
    savedTagPreferences(forSourceId: sourceId, locale: locale)
        .prefix(Self.maximumTagCount)
        .map { preference in
            GroupTagDisplayItem(
                id: Self.tagKey(for: preference),
                title: Self.displayTitle(for: preference, locale: locale),
                accent: preference.accent
            )
        }
}
```

Replace `addCustomTag` with:

```swift
func addCustomTag(
    _ rawTitle: String,
    accent: DesktopAccentColor?,
    toSourceId sourceId: String,
    locale: Locale
) -> GroupTagMutationResult {
    guard canAddTag(forSourceId: sourceId, locale: locale) else {
        return .limitReached
    }

    let normalized = Self.normalizedTagInput(rawTitle, locale: locale)
    guard !normalized.title.isEmpty else {
        return .empty
    }

    let groupKey = groupKey(forSourceId: sourceId)
    var current = savedTagPreferences(forSourceId: sourceId, locale: locale)
    let existingIdentities = Set(current.flatMap(Self.tagIdentities))
    let candidateIdentities = Self.tagIdentities(
        forTitle: normalized.title,
        tagId: normalized.tagId
    )
    guard existingIdentities.isDisjoint(with: candidateIdentities) else {
        return .duplicate
    }

    current.append(
        GroupTagPreference(
            title: normalized.title,
            accentRawValue: (accent ?? randomAccent()).rawValue,
            tagId: normalized.tagId
        )
    )
    state.groupTags.tagCollection.tagsByGroupKey[groupKey] = Array(current.prefix(Self.maximumTagCount))
    store.saveTagCollection(state.groupTags.tagCollection)
    return .added
}
```

Replace `removeCustomTag` with:

```swift
func removeCustomTag(_ tagID: String, fromSourceId sourceId: String, locale: Locale) -> GroupTagMutationResult {
    let groupKey = groupKey(forSourceId: sourceId)
    let current = savedTagPreferences(forSourceId: sourceId, locale: locale)
    let next = current.filter { Self.tagKey(for: $0) != tagID }

    guard next.count != current.count else {
        return .notFound
    }

    state.groupTags.tagCollection.tagsByGroupKey[groupKey] = next
    store.saveTagCollection(state.groupTags.tagCollection)
    return .removed
}
```

- [ ] **Step 2: Replace `effectiveTagPreferences` with saved initialization**

Delete `effectiveTagPreferences(forSourceId:locale:)` and add this method in its place:

```swift
private func savedTagPreferences(forSourceId sourceId: String, locale: Locale) -> [GroupTagPreference] {
    let groupKey = groupKey(forSourceId: sourceId)
    if let stored = state.groupTags.tagCollection.tagsByGroupKey[groupKey] {
        return Array(stored.prefix(Self.maximumTagCount))
    }

    let defaults = Array(
        (presetTags(
            canonicalRepo: sourceCanonicalRepo(sourceId),
            locator: sourceLocator(sourceId),
            locale: locale
        ) ?? []).prefix(Self.maximumTagCount)
    )
    state.groupTags.tagCollection.tagsByGroupKey[groupKey] = defaults
    store.saveTagCollection(state.groupTags.tagCollection)
    return defaults
}
```

- [ ] **Step 3: Add stable group key helpers**

Add these private static and instance helpers below `matchingRecommendation`:

```swift
private func groupKey(forSourceId sourceId: String) -> String {
    if let canonicalRepo = Self.normalizedGroupKeyMaterial(sourceCanonicalRepo(sourceId)) {
        return "repo:\(canonicalRepo)"
    }

    if let locator = Self.normalizedGroupKeyMaterial(sourceLocator(sourceId)) {
        return "locator:\(locator)"
    }

    return "source:\(Self.normalizedKey(sourceId))"
}

private static func normalizedGroupKeyMaterial(_ value: String?) -> String? {
    let normalized = (value ?? "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        .lowercased()
    return normalized.isEmpty ? nil : normalized
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests
```

Expected: PASS for `GroupTagControllerTests`.

- [ ] **Step 5: Commit state/store/controller implementation**

Run:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Store/GroupTagState.swift \
  apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopGroupTagStore.swift \
  apps/desktop-mac/Sources/DesktopApp/App/DesktopAppContainer.swift \
  apps/desktop-mac/Sources/DesktopApp/ViewModels/GroupTagController.swift \
  apps/desktop-mac/Tests/SkillFlowDesktopTests/GroupTagControllerTests.swift
git commit -m "fix(desktop): persist group tags by stable key"
```

## Task 4: Update Remaining Desktop Tests and Compile Breaks

**Files:**
- Modify: any `apps/desktop-mac/Tests/SkillFlowDesktopTests/*.swift` file that still references `customTagsBySourceId`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/*.swift`

- [ ] **Step 1: Find remaining old API references**

Run:

```bash
rg -n "customTagsBySourceId|loadCustomTags|saveCustomTags|customTagsKey" apps/desktop-mac/Sources/DesktopApp apps/desktop-mac/Tests/SkillFlowDesktopTests
```

Expected after Task 3: references only appear in no files. If references remain in tests, convert them to v2 shape.

- [ ] **Step 2: Convert remaining test setup**

Use this conversion for every remaining test setup:

```swift
appState.groupTags.tagCollection.tagsByGroupKey = [
    "source:alpha": [GroupTagPreference(title: "shared", accentRawValue: DesktopAccentColor.blue.rawValue)],
    "source:beta": [GroupTagPreference(title: "shared", accentRawValue: DesktopAccentColor.green.rawValue)]
]
```

Use `repo:<canonicalRepo>` only when the test configures `sourceCanonicalRepo`; otherwise use `source:<sourceId>`.

- [ ] **Step 3: Run desktop tests**

Run:

```bash
swift test --package-path apps/desktop-mac
```

Expected: PASS for the desktop Swift package.

- [ ] **Step 4: Commit compile/test updates if needed**

If Task 4 changed files after the Task 3 commit, run:

```bash
git add apps/desktop-mac/Tests/SkillFlowDesktopTests
git commit -m "test(desktop): align tag fixtures with v2 storage"
```

If no files changed, skip this commit.

## Task 5: Final Verification

**Files:**
- Verify: whole repo or relevant package

- [ ] **Step 1: Run focused regression tests again**

Run:

```bash
swift test --package-path apps/desktop-mac --filter GroupTagControllerTests
```

Expected: PASS.

- [ ] **Step 2: Run full desktop test target**

Run:

```bash
swift test --package-path apps/desktop-mac
```

Expected: PASS.

- [ ] **Step 3: Check no unintended files changed**

Run:

```bash
git status --short
git diff --stat
```

Expected: working tree is clean if commits were made; otherwise only intended files are listed.

- [ ] **Step 4: Report result**

Summarize:

- v2 key used: `desktop.groupTags.v2.tagsByGroupKey`
- old source-id tag storage intentionally not migrated
- tests run and pass/fail status
- commit hashes created during implementation

## Self-Review

- Spec coverage:
  - Default tags as initial data: Task 3 `savedTagPreferences` initializes and saves defaults.
  - Added/deleted tags persist: Task 1 tests and Task 3 mutations write v2 collection.
  - Empty tags are valid: Task 1 `testSavedEmptyTagsDoNotFallbackToRecommendation`.
  - Stable key across source-id changes: Task 1 `testSavedTagsFollowCanonicalRepoWhenSourceIdChanges`.
  - Desktop-only scope: all tasks stay under `apps/desktop-mac`.
- Placeholder scan:
  - No task uses vague deferred-work language or unspecified "handle later" language.
- Type consistency:
  - `GroupTagCollection`, `tagCollection`, `loadTagCollection()`, and `saveTagCollection(_:)` are introduced before controller use.

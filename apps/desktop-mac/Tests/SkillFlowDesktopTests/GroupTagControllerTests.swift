import XCTest
@testable import SkillFlowDesktop

@MainActor
final class GroupTagControllerTests: XCTestCase {
    func testResolvedTagsMergePresetAndCustomTags() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId["alpha"] = [
            GroupTagPreference(title: "Ops", accentRawValue: DesktopAccentColor.orange.rawValue)
        ]
        let controller = makeController(
            state: state,
            recommendations: [
                ImportRecommendationEntry(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: ["development"],
                    descriptionKey: "desc",
                    sortOrder: 1
                )
            ],
            sourceCanonicalRepo: { sourceId in sourceId == "alpha" ? "anthropics/skills" : nil }
        )

        let tags = controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en"))

        XCTAssertEqual(tags.map(\.title), ["General", "Development", "Ops"])
        XCTAssertEqual(tags.map(\.isRemovable), [false, false, true])
    }

    func testAddCustomTagPersistsTrimmedTitle() {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let state = DesktopAppState()
        let controller = makeController(state: state, userDefaults: defaults)

        let result = controller.addCustomTag("设计系统扩展", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .added)
        XCTAssertEqual(state.groupTags.customTagsBySourceId["alpha"]?.map(\.title), ["设计系统"])
        XCTAssertEqual(DesktopGroupTagStore(userDefaults: defaults).loadCustomTags()["alpha"]?.map(\.title), ["设计系统"])
    }

    func testAddCustomTagRejectsDuplicateAgainstExistingTags() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId["alpha"] = [
            GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)
        ]
        let controller = makeController(state: state)

        let result = controller.addCustomTag("设计", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .duplicate)
    }

    func testAddCustomTagRejectsWhenMaximumReached() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId["alpha"] = [
            GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue),
            GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue),
            GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.orange.rawValue)
        ]
        let controller = makeController(state: state)

        let result = controller.addCustomTag("效率", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .limitReached)
    }

    func testTagSuggestionsExcludeCurrentGroupTags() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId = [
            "alpha": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue)],
            "beta": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.orange.rawValue)],
            "gamma": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
        ]
        let controller = makeController(state: state)

        let suggestions = controller.tagSuggestions(
            sourceIds: ["alpha", "beta", "gamma"],
            excluding: "alpha",
            locale: Locale(identifier: "zh-Hans")
        )

        XCTAssertEqual(suggestions.map(\.title), ["研究"])
    }

    func testRemoveCustomTagDeletesOnlyRequestedTag() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId["alpha"] = [
            GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue),
            GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)
        ]
        let controller = makeController(state: state)

        let result = controller.removeCustomTag("custom:增长", fromSourceId: "alpha")

        XCTAssertEqual(result, .removed)
        XCTAssertEqual(state.groupTags.customTagsBySourceId["alpha"]?.map(\.title), ["研究"])
    }

    func testMatchesHomeFilterUsesEffectiveSelection() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId = [
            "alpha": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue)],
            "beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
        ]
        state.groupTags.selectedHomeFilterKey = "custom:增长"
        let controller = makeController(state: state)

        XCTAssertTrue(
            controller.matchesHomeFilter(
                sourceId: "alpha",
                sourceIds: ["alpha", "beta"],
                locale: Locale(identifier: "zh-Hans")
            )
        )
        XCTAssertFalse(
            controller.matchesHomeFilter(
                sourceId: "beta",
                sourceIds: ["alpha", "beta"],
                locale: Locale(identifier: "zh-Hans")
            )
        )
    }

    private func makeController(
        state: DesktopAppState = DesktopAppState(),
        recommendations: [ImportRecommendationEntry] = [],
        userDefaults: UserDefaults = .standard,
        sourceCanonicalRepo: @escaping (String) -> String? = { _ in nil }
    ) -> GroupTagController {
        GroupTagController(
            state: state,
            store: DesktopGroupTagStore(userDefaults: userDefaults),
            recommendationsProvider: { recommendations },
            sourceCanonicalRepo: sourceCanonicalRepo,
            sourceLocator: { _ in nil },
            randomAccent: { .blue }
        )
    }
}

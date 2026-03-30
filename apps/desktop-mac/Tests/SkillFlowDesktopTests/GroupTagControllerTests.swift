import XCTest
@testable import SkillFlowDesktop

@MainActor
final class GroupTagControllerTests: XCTestCase {
    func testPresetTagsOverrideCustomTags() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId["alpha"] = GroupTagPreference(
            title: "自定义",
            accentRawValue: DesktopAccentColor.purple.rawValue
        )
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = DesktopGroupTagStore(userDefaults: defaults)
        let controller = GroupTagController(
            state: state,
            store: store,
            recommendationsProvider: {
                [
                    ImportRecommendationEntry(
                        canonicalRepo: "anthropics/skills",
                        locator: "anthropics/skills",
                        categoryId: "general",
                        primaryTagId: "general",
                        secondaryTagIds: ["development"],
                        descriptionKey: "desc",
                        sortOrder: 1
                    )
                ]
            },
            sourceCanonicalRepo: { sourceId in
                sourceId == "alpha" ? "anthropics/skills" : nil
            },
            sourceLocator: { _ in nil },
            randomAccent: { .green }
        )

        let tags = controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en"))

        XCTAssertEqual(tags.map(\.title), ["General", "Development"])
        XCTAssertEqual(tags.map(\.accent), [.blue, .green])
    }

    func testAddCustomTagPersistsTrimmedTitle() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = DesktopGroupTagStore(userDefaults: defaults)
        let state = DesktopAppState()
        let controller = GroupTagController(
            state: state,
            store: store,
            recommendationsProvider: { [] },
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { _ in nil },
            randomAccent: { .orange }
        )

        controller.addCustomTag("设计系统扩展", accent: nil, toSourceId: "alpha")

        XCTAssertEqual(state.groupTags.customTagsBySourceId["alpha"]?.title, "设计系统")
        XCTAssertEqual(state.groupTags.customTagsBySourceId["alpha"]?.accent, .orange)
        XCTAssertEqual(store.loadCustomTags()["alpha"]?.title, "设计系统")
    }

    func testHomeAvailableTagsDeduplicatesAndSorts() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId = [
            "alpha": GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue),
            "beta": GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.orange.rawValue),
            "gamma": GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)
        ]
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = DesktopGroupTagStore(userDefaults: defaults)
        let controller = GroupTagController(
            state: state,
            store: store,
            recommendationsProvider: { [] },
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { _ in nil },
            randomAccent: { .blue }
        )

        let tags = controller.availableHomeTags(sourceIds: ["beta", "alpha", "gamma"], locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(tags.map(\.title), ["研究", "增长"])
    }

    func testMatchesHomeFilterUsesEffectiveSelection() {
        let state = DesktopAppState()
        state.groupTags.customTagsBySourceId = [
            "alpha": GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue),
            "beta": GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)
        ]
        state.groupTags.selectedHomeFilterKey = "custom:增长"
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = DesktopGroupTagStore(userDefaults: defaults)
        let controller = GroupTagController(
            state: state,
            store: store,
            recommendationsProvider: { [] },
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { _ in nil },
            randomAccent: { .blue }
        )

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
}

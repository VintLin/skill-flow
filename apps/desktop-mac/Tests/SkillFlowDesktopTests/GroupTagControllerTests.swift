import XCTest
@testable import SkillFlowDesktop

@MainActor
final class GroupTagControllerTests: XCTestCase {
    func testResolvedTagsFallBackToRecommendationTags() {
        let state = DesktopAppState()
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

        XCTAssertEqual(tags.map(\.title), ["General"])
    }

    func testAddCustomTagPersistsTrimmedTitle() {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let state = DesktopAppState()
        let controller = makeController(state: state, userDefaults: defaults)

        let result = controller.addCustomTag("设计系统扩展", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .added)
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["source:alpha"]?.map(\.title), ["设计系统"])
        XCTAssertEqual(
            DesktopGroupTagStore(userDefaults: defaults).loadTagCollection().tagsByGroupKey["source:alpha"]?.map(\.title),
            ["设计系统"]
        )
    }

    func testNormalizedInputTitleUsesEnglishWordLimit() {
        XCTAssertEqual(
            GroupTagController.normalizedInputTitle(
                "frontend platform automation workflows",
                locale: Locale(identifier: "en")
            ),
            "frontend platform"
        )
    }

    func testNormalizedInputTitleUsesJapaneseCharacterLimit() {
        XCTAssertEqual(
            GroupTagController.normalizedInputTitle(
                "マーケティング戦略設計",
                locale: Locale(identifier: "ja")
            ),
            "マーケティング"
        )
    }

    func testAddCustomTagRecognizesLocalizedPresetTagInput() {
        let state = DesktopAppState()
        let controller = makeController(state: state)

        let result = controller.addCustomTag("开发", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .added)
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["source:alpha"]?.first?.tagId, "development")
        XCTAssertEqual(
            controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en")).map(\.title),
            ["Development"]
        )
    }

    func testAddCustomTagRecognizesNewLocalizedTagInput() {
        let state = DesktopAppState()
        let controller = makeController(state: state)

        let result = controller.addCustomTag("前端", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .added)
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["source:alpha"]?.first?.tagId, "frontend")
        XCTAssertEqual(
            controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "ja")).map(\.title),
            ["フロントエンド"]
        )
    }

    func testAddCustomTagRecognizesKnowledgeTagAcrossLanguages() {
        let state = DesktopAppState()
        let controller = makeController(state: state)

        let result = controller.addCustomTag("Knowledge", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "en"))

        XCTAssertEqual(result, .added)
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["source:alpha"]?.first?.tagId, "knowledge")
        XCTAssertEqual(
            controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "zh-Hans")).map(\.title),
            ["知识管理"]
        )
    }

    func testAddCustomTagRejectsDuplicateAgainstExistingTags() {
        let state = DesktopAppState()
        state.groupTags.tagCollection.tagsByGroupKey["source:alpha"] = [
            GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)
        ]
        let controller = makeController(state: state)

        let result = controller.addCustomTag("设计", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .duplicate)
    }

    func testAddCustomTagRejectsDuplicateAcrossLocalizedPresetTags() {
        let state = DesktopAppState()
        state.groupTags.tagCollection.tagsByGroupKey["source:alpha"] = [
            GroupTagPreference(title: "Development", accentRawValue: DesktopAccentColor.pink.rawValue, tagId: "development")
        ]
        let controller = makeController(state: state)

        let result = controller.addCustomTag("开发", accent: nil, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .duplicate)
    }

    func testAddCustomTagRejectsWhenMaximumReached() {
        let state = DesktopAppState()
        state.groupTags.tagCollection.tagsByGroupKey["source:alpha"] = [
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
        state.groupTags.tagCollection.tagsByGroupKey = [
            "source:alpha": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue)],
            "source:beta": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.orange.rawValue)],
            "source:gamma": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
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
        state.groupTags.tagCollection.tagsByGroupKey["source:alpha"] = [
            GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue),
            GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)
        ]
        let controller = makeController(state: state)

        let result = controller.removeCustomTag("custom:增长", fromSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .removed)
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["source:alpha"]?.map(\.title), ["研究"])
    }

    func testRemoveRecommendationTagPersistsEmptyOverride() {
        let state = DesktopAppState()
        let controller = makeController(
            state: state,
            recommendations: [
                ImportRecommendationEntry(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "desc",
                    sortOrder: 1
                )
            ],
            sourceCanonicalRepo: { sourceId in sourceId == "alpha" ? "anthropics/skills" : nil }
        )

        let result = controller.removeCustomTag("preset:general", fromSourceId: "alpha", locale: Locale(identifier: "en"))

        XCTAssertEqual(result, .removed)
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"], [])
        XCTAssertEqual(controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en")).map(\.title), [])
    }

    func testMatchesHomeFilterUsesEffectiveSelection() {
        let state = DesktopAppState()
        state.groupTags.tagCollection.tagsByGroupKey = [
            "source:alpha": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue)],
            "source:beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)]
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

    func testHomeSnapshotPrecomputesAvailableTagsSuggestionsAndVisibleSourceIDs() {
        let state = DesktopAppState()
        state.groupTags.tagCollection.tagsByGroupKey = [
            "source:alpha": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.pink.rawValue)],
            "source:beta": [GroupTagPreference(title: "研究", accentRawValue: DesktopAccentColor.yellow.rawValue)],
            "source:gamma": [GroupTagPreference(title: "增长", accentRawValue: DesktopAccentColor.orange.rawValue)]
        ]
        state.groupTags.selectedHomeFilterKey = "custom:增长"
        let controller = makeController(state: state)

        let snapshot = controller.homeSnapshot(
            sourceIds: ["alpha", "beta", "gamma"],
            locale: Locale(identifier: "zh-Hans")
        )

        XCTAssertEqual(snapshot.availableTags.map(\.title), ["研究", "增长"])
        XCTAssertEqual(snapshot.tagCountsByID["custom:增长"], 2)
        XCTAssertEqual(snapshot.tagCountsByID["custom:研究"], 1)
        XCTAssertEqual(snapshot.selectedKey, "custom:增长")
        XCTAssertEqual(snapshot.visibleSourceIDs, ["alpha", "gamma"])
        XCTAssertEqual(snapshot.tagsBySourceID["alpha"]?.map(\.title), ["增长"])
        XCTAssertEqual(snapshot.suggestionsBySourceID["alpha"]?.map(\.title), ["研究"])
        XCTAssertEqual(snapshot.suggestionsBySourceID["beta"]?.map(\.title), ["增长"])
    }

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

    func testLocatorOnlyTrailingSlashInitializesRecommendationTag() {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let state = DesktopAppState()
        let controller = makeController(
            state: state,
            recommendations: [
                ImportRecommendationEntry(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "desc",
                    sortOrder: 1
                )
            ],
            userDefaults: defaults,
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { sourceId in sourceId == "alpha" ? "anthropics/skills/" : nil }
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

    func testGitHubRepoLocatorFormsInitializeRecommendationTagUnderRepoKey() {
        let recommendations = [
            ImportRecommendationEntry(
                canonicalRepo: "anthropics/skills",
                locator: "anthropics/skills",
                categoryId: "general",
                primaryTagId: "general",
                secondaryTagIds: [],
                descriptionKey: "desc",
                sortOrder: 1
            )
        ]
        let forms = [
            "https://github.com/anthropics/skills.git",
            "https://github.com/anthropics/skills/",
            "git@github.com:anthropics/skills.git",
            "Anthropics/Skills.git",
        ]

        for form in forms {
            let suiteName = "\(#function)-\(form)"
            let defaults = UserDefaults(suiteName: suiteName)!
            defaults.removePersistentDomain(forName: suiteName)
            let state = DesktopAppState()
            let controller = makeController(
                state: state,
                recommendations: recommendations,
                userDefaults: defaults,
                sourceCanonicalRepo: { _ in nil },
                sourceLocator: { sourceId in sourceId == "alpha" ? form : nil }
            )

            let tags = controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en"))

            XCTAssertEqual(tags.map(\.title), ["General"], form)
            XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"]?.map(\.tagId), ["general"], form)
            XCTAssertNil(state.groupTags.tagCollection.tagsByGroupKey["locator:\(form.lowercased())"], form)
            XCTAssertEqual(
                DesktopGroupTagStore(userDefaults: defaults)
                    .loadTagCollection()
                    .tagsByGroupKey["repo:anthropics/skills"]?
                    .map(\.tagId),
                ["general"],
                form
            )
        }
    }

    func testGitHubRepoAliasInitializesRecommendationTagUnderCanonicalRepoKey() {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let state = DesktopAppState()
        let controller = makeController(
            state: state,
            recommendations: [
                ImportRecommendationEntry(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "desc",
                    sortOrder: 1
                )
            ],
            userDefaults: defaults,
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { sourceId in sourceId == "alpha" ? "https://github.com/anthropic/skills.git" : nil }
        )

        let tags = controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "en"))

        XCTAssertEqual(tags.map(\.title), ["General"])
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"]?.map(\.tagId), ["general"])
    }

    func testImportRepositoryIdentityRejectsNonGitHubAndRelativeLocators() {
        let rejectedForms = [
            "/Users/x/local-skills",
            "~/skills",
            "../skills",
            "docs/skills",
            "https://gitlab.com/owner/repo.git",
            "https://github.com/owner/repo?tab=readme",
            "https://github.com/owner/repo/tree/main",
        ]

        for form in rejectedForms {
            XCTAssertNil(ImportRepositoryIdentity.normalizedGitHubRepo(form), form)
        }
    }

    func testNonGitHubRelativeLocatorPersistsUnderLocatorKey() {
        let state = DesktopAppState()
        let controller = makeController(
            state: state,
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { sourceId in sourceId == "alpha" ? "docs/skills" : nil }
        )

        let result = controller.addCustomTag("设计", accent: .pink, toSourceId: "alpha", locale: Locale(identifier: "zh-Hans"))

        XCTAssertEqual(result, .added)
        XCTAssertNil(state.groupTags.tagCollection.tagsByGroupKey["repo:docs/skills"])
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["locator:docs/skills"]?.map(\.title), ["设计"])
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

    func testLegacySourceIdTagsLoadAfterAppUpdate() throws {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let legacyTags = [
            "alpha": [
                GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)
            ]
        ]
        defaults.set(try JSONEncoder().encode(legacyTags), forKey: "desktop.groupTags.customTagsBySourceId")

        let state = DesktopAppState()
        state.groupTags.tagCollection = DesktopGroupTagStore(userDefaults: defaults).loadTagCollection()
        let controller = makeController(state: state, userDefaults: defaults)

        XCTAssertEqual(controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "zh-Hans")).map(\.title), ["设计"])
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["source:alpha"]?.map(\.title), ["设计"])
    }

    func testLegacySourceIdTagsMigrateToStableRepoKeyAfterAppUpdate() throws {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let legacyTags = [
            "old-alpha": [
                GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)
            ]
        ]
        defaults.set(try JSONEncoder().encode(legacyTags), forKey: "desktop.groupTags.customTagsBySourceId")

        let state = DesktopAppState()
        state.groupTags.tagCollection = DesktopGroupTagStore(userDefaults: defaults).loadTagCollection()
        let controller = makeController(
            state: state,
            userDefaults: defaults,
            sourceCanonicalRepo: { sourceId in
                sourceId == "old-alpha" ? "anthropics/skills" : nil
            },
            sourceLocator: { sourceId in
                sourceId == "old-alpha" ? "https://github.com/anthropics/skills.git" : nil
            }
        )

        XCTAssertEqual(controller.resolvedTags(forSourceId: "old-alpha", locale: Locale(identifier: "zh-Hans")).map(\.title), ["设计"])
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"]?.map(\.title), ["设计"])
        XCTAssertNil(state.groupTags.tagCollection.tagsByGroupKey["source:old-alpha"])
        XCTAssertEqual(
            DesktopGroupTagStore(userDefaults: defaults)
                .loadTagCollection()
                .tagsByGroupKey["repo:anthropics/skills"]?
                .map(\.title),
            ["设计"]
        )
    }

    func testLegacyLocatorTagsMigrateToStableRepoKeyAfterAppUpdate() {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let state = DesktopAppState()
        state.groupTags.tagCollection = GroupTagCollection(
            tagsByGroupKey: [
                "locator:https://github.com/anthropics/skills.git": [
                    GroupTagPreference(title: "设计", accentRawValue: DesktopAccentColor.pink.rawValue)
                ]
            ]
        )
        DesktopGroupTagStore(userDefaults: defaults).saveTagCollection(state.groupTags.tagCollection)
        let controller = makeController(
            state: state,
            userDefaults: defaults,
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { sourceId in
                sourceId == "alpha" ? "https://github.com/anthropics/skills.git" : nil
            }
        )

        XCTAssertEqual(controller.resolvedTags(forSourceId: "alpha", locale: Locale(identifier: "zh-Hans")).map(\.title), ["设计"])
        XCTAssertEqual(state.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"]?.map(\.title), ["设计"])
        XCTAssertNil(state.groupTags.tagCollection.tagsByGroupKey["locator:https://github.com/anthropics/skills.git"])
    }

    func testAddedTagFollowsGitHubRepoAcrossSourceIdAndLocatorShapeChanges() {
        let suiteName = #function
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let firstState = DesktopAppState()
        let firstController = makeController(
            state: firstState,
            userDefaults: defaults,
            sourceCanonicalRepo: { sourceId in
                sourceId == "old-alpha" ? "https://github.com/anthropics/skills.git" : nil
            },
            sourceLocator: { sourceId in
                sourceId == "old-alpha" ? "https://github.com/anthropics/skills.git" : nil
            }
        )

        let result = firstController.addCustomTag("设计", accent: .pink, toSourceId: "old-alpha", locale: Locale(identifier: "zh-Hans"))

        let secondState = DesktopAppState()
        secondState.groupTags.tagCollection = DesktopGroupTagStore(userDefaults: defaults).loadTagCollection()
        let secondController = makeController(
            state: secondState,
            userDefaults: defaults,
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { sourceId in
                sourceId == "new-alpha" ? "git@github.com:anthropics/skills.git" : nil
            }
        )

        XCTAssertEqual(result, .added)
        XCTAssertEqual(firstState.groupTags.tagCollection.tagsByGroupKey["repo:anthropics/skills"]?.map(\.title), ["设计"])
        XCTAssertEqual(secondController.resolvedTags(forSourceId: "new-alpha", locale: Locale(identifier: "zh-Hans")).map(\.title), ["设计"])
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
}

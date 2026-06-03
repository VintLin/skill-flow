import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DesktopLocalizationTests: XCTestCase {
    private func loadRecommendations() -> [ImportRecommendationEntry] {
        let configurationURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/DesktopApp/Resources/ImportRecommendations/recommendations.json")
        let data = try! Data(contentsOf: configurationURL)
        return try! JSONDecoder().decode([ImportRecommendationEntry].self, from: data)
    }

    func testDesktopLanguageNormalizesSupportedIdentifiers() {
        XCTAssertEqual(DesktopLanguage.supportedIdentifier(for: "en-US"), "en")
        XCTAssertEqual(DesktopLanguage.supportedIdentifier(for: "ja_JP"), "ja")
        XCTAssertEqual(DesktopLanguage.supportedIdentifier(for: "zh-Hans-CN"), "zh-Hans")
        XCTAssertEqual(DesktopLanguage.supportedIdentifier(for: "zh_CN"), "zh-Hans")
        XCTAssertNil(DesktopLanguage.supportedIdentifier(for: "zh-Hant-HK"))
    }

    func testDesktopLanguageFallsThroughPreferredLanguagesThenFallsBackToEnglish() {
        XCTAssertEqual(
            DesktopLanguage.resolveSupportedIdentifier(preferredLanguages: ["fr-FR", "ja-JP", "en-US"]),
            "ja"
        )
        XCTAssertEqual(
            DesktopLanguage.resolveSupportedIdentifier(preferredLanguages: ["fr-FR", "de-DE"]),
            "en"
        )
    }

    func testL10nLoadsLocalizedStringsFromModuleBundle() {
        XCTAssertEqual(L10n.string("page.settings.title", locale: Locale(identifier: "en")), "Settings")
        XCTAssertEqual(L10n.string("page.settings.title", locale: Locale(identifier: "zh-Hans")), "设置")
        XCTAssertEqual(L10n.string("page.settings.title", locale: Locale(identifier: "ja")), "設定")
        XCTAssertEqual(L10n.string("project_scope.global", locale: Locale(identifier: "en")), "Global")
        XCTAssertEqual(L10n.string("project_scope.global", locale: Locale(identifier: "zh-Hans")), "全局")
        XCTAssertEqual(L10n.string("project_scope.global", locale: Locale(identifier: "ja")), "グローバル")
    }

    func testL10nFallsBackToEnglishBundleWhenKeyMissingInSelectedLocale() {
        XCTAssertEqual(L10n.string("test.fallback.only_en", locale: Locale(identifier: "ja")), "Only English")
    }

    func testL10nLoadsDetailDerivedLocalizationKeys() {
        XCTAssertEqual(L10n.string("detail.document.file_tree", locale: Locale(identifier: "en")), "File Tree")
        XCTAssertEqual(L10n.string("detail.document.file_tree", locale: Locale(identifier: "zh-Hans")), "文件树")
        XCTAssertEqual(L10n.string("source.metadata.status_value.unsupported", locale: Locale(identifier: "ja")), "非対応")
        XCTAssertEqual(L10n.string("detail.updated.unavailable", locale: Locale(identifier: "ja")), "更新時刻を取得できません")
    }

    func testSkillManagementFilterAndRenameKeysExistInAllSupportedLocales() {
        let requiredKeys = [
            "home.sidebar.status",
            "home.sidebar.source_type",
            "home.sidebar.tags",
            "home.sidebar.agents",
            "home.sidebar.projects",
            "home.sidebar.all_agents",
            "home.sidebar.all",
            "home.sidebar.pinned",
            "home.sidebar.local",
            "home.sidebar.remote",
            "home.sidebar.virtual",
            "home.sidebar.expand",
            "home.sidebar.collapse",
            "group_card.action.rename",
            "rename.dialog.title",
            "rename.dialog.save",
            "rename.dialog.cancel",
            "toast.rename.empty",
            "toast.rename.success",
            "toast.rename.reset_success",
            "toast.rename.failed",
        ]
        let locales = [
            Locale(identifier: "zh-Hans"),
            Locale(identifier: "en"),
            Locale(identifier: "ja"),
        ]

        for locale in locales {
            for key in requiredKeys {
                let value = L10n.string(key, locale: locale)
                XCTAssertNotEqual(value, key, "Missing localization for \(key) in \(locale.identifier)")
            }
        }

        let staleKeys = [
            "toast.rename_source.success",
            "toast.rename_source.failed",
        ]
        for locale in locales {
            for key in staleKeys {
                XCTAssertEqual(L10n.string(key, locale: locale), key, "Unexpected stale localization for \(key)")
            }
        }
    }

    func testGroupEditorLocalizationKeysExist() {
        let requiredKeys = [
            "group_editor.title",
            "group_editor.tab.create",
            "group_editor.tab.merge",
            "group_editor.tab.restore",
            "group_editor.action.save",
            "group_editor.action.restore",
            "group_editor.section.targets",
            "group_editor.validation.name_required",
            "group_editor.validation.skills_required",
            "group_editor.validation.groups_required",
            "group_editor.impact.create_virtual_group",
            "group_editor.impact.hide_groups",
            "group_editor.impact.clear_bindings",
            "group_editor.impact.save_restore_snapshot",
        ]
        let locales = [
            Locale(identifier: "zh-Hans"),
            Locale(identifier: "en"),
            Locale(identifier: "ja"),
        ]

        for locale in locales {
            for key in requiredKeys {
                let value = L10n.string(key, locale: locale)
                XCTAssertNotEqual(value, key, "Missing localization for \(key) in \(locale.identifier)")
                XCTAssertFalse(value.isEmpty, "Empty localization for \(key) in \(locale.identifier)")
            }
        }
    }

    func testGroupTagInputPlaceholderStaysShortEnoughForCompactTagField() {
        XCTAssertEqual(L10n.string("group_tag.input.placeholder", locale: Locale(identifier: "en")), "Tag")
        XCTAssertEqual(L10n.string("group_tag.input.placeholder", locale: Locale(identifier: "zh-Hans")), "标签")
        XCTAssertEqual(L10n.string("group_tag.input.placeholder", locale: Locale(identifier: "ja")), "タグ")
    }

    func testImportFailureReasonKeysExistInAllSupportedLocales() {
        let requiredKeys = [
            "toast.import.failed.provider_not_supported",
            "toast.import.failed.provider_data_unavailable",
            "toast.import.failed.provider_rate_limited",
            "toast.import.failed.provider_response_invalid",
            "toast.import.failed.provider_request_failed",
            "toast.import.failed.no_valid_leafs",
            "toast.import.failed.source_path_not_found",
            "toast.import.failed.add_agent_not_available",
            "toast.import.failed.invalid_response",
            "toast.import.failed.generic",
            "import.reason.no_valid_leafs",
            "import.reason.source_path_not_found",
            "import.reason.add_agent_not_available",
        ]
        let locales = [
            Locale(identifier: "zh-Hans"),
            Locale(identifier: "en"),
            Locale(identifier: "ja"),
        ]

        for locale in locales {
            for key in requiredKeys {
                let value = L10n.string(key, locale: locale)
                XCTAssertNotEqual(value, key, "Missing localization for \(key) in \(locale.identifier)")
                XCTAssertFalse(value.contains("provider_request_failed"), "User-facing import message leaked a reason code")
            }
        }
    }

    func testChinesePinnedStatusUsesPinnedWording() {
        XCTAssertEqual(L10n.string("home.sidebar.pinned", locale: Locale(identifier: "zh-Hans")), "置顶")
    }

    @MainActor
    func testDetailScreenLocalizesGroupFileTreeDocumentTitlePerLocale() {
        let fileTreeDocument = MainViewModel.DocumentDescriptor(
            id: "group:filetree",
            title: "File Tree",
            path: ".",
            metadata: [],
            renderCacheKey: "group:filetree:.",
            externalURL: nil
        )
        let markdownDocument = MainViewModel.DocumentDescriptor(
            id: "group:README.md",
            title: "README.md",
            path: "README.md",
            metadata: [],
            renderCacheKey: "group:README.md",
            externalURL: nil
        )

        XCTAssertEqual(
            DetailScreen.localizedDocumentTitle(fileTreeDocument, locale: Locale(identifier: "en")),
            "File Tree"
        )
        XCTAssertEqual(
            DetailScreen.localizedDocumentTitle(fileTreeDocument, locale: Locale(identifier: "zh-Hans")),
            "文件树"
        )
        XCTAssertEqual(
            DetailScreen.localizedDocumentTitle(fileTreeDocument, locale: Locale(identifier: "ja")),
            "ファイルツリー"
        )
        XCTAssertEqual(
            DetailScreen.localizedDocumentTitle(markdownDocument, locale: Locale(identifier: "zh-Hans")),
            "README.md"
        )
    }

    func testBridgeClientErrorsUseSelectedDesktopLanguage() {
        UserDefaults.standard.set(DesktopLanguage.ja.rawValue, forKey: DesktopLanguage.storageKey)
        XCTAssertEqual(
            BridgeClientError.helperMissing.errorDescription,
            "同梱 helper が見つかりません。Skill Flow Desktop を再インストールしてください。"
        )
        XCTAssertEqual(BridgeClientError.timeout(250).errorDescription, "250ms 後に操作がタイムアウトしました。")
        XCTAssertEqual(
            BridgeClientError.missingDependency(.node).errorDescription,
            "Skill Flow Desktop の実行には Node.js 20 以降が必要です。インストール後に再試行してください。README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
        )

        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
        XCTAssertEqual(
            BridgeClientError.concurrentMutationRejected.errorDescription,
            "Another write task is already running."
        )
        XCTAssertEqual(
            BridgeClientError.missingDependency(.npx).errorDescription,
            "`npx` is required for ClawHub imports. Install Node.js/npm, then retry. README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
        )
    }

    func testImportRecommendationDescriptionKeysExistInAllSupportedLocales() {
        let recommendations = loadRecommendations()
        XCTAssertFalse(recommendations.isEmpty)

        let locales = [
            Locale(identifier: "zh-Hans"),
            Locale(identifier: "en"),
            Locale(identifier: "ja"),
        ]

        for recommendation in recommendations {
            for locale in locales {
                let value = L10n.string(recommendation.descriptionKey, locale: locale)
                XCTAssertNotEqual(
                    value,
                    recommendation.descriptionKey,
                    "Missing localization for \(recommendation.descriptionKey) in \(locale.identifier)"
                )
            }
        }
    }

    func testImportRecommendationLoaderLoadsBundledConfiguration() {
        let recommendations = ImportRecommendationLoader.load()

        XCTAssertFalse(recommendations.isEmpty)
        XCTAssertTrue(
            recommendations.contains(where: { $0.canonicalRepo == "anthropics/skills" }),
            "Expected bundled recommendations to include anthropics/skills"
        )
    }

    func testImportRecommendationUsesPrimaryTagAsOnlyGroupingCategory() {
        let recommendations = loadRecommendations()
        XCTAssertFalse(recommendations.isEmpty)

        for recommendation in recommendations {
            XCTAssertEqual(
                recommendation.categoryId,
                recommendation.primaryTagId,
                "Primary tag must be the grouping category for \(recommendation.canonicalRepo)"
            )
            XCTAssertLessThanOrEqual(
                recommendation.secondaryTagIds.count,
                2,
                "Secondary tags should remain badges only for \(recommendation.canonicalRepo)"
            )
            XCTAssertFalse(
                recommendation.secondaryTagIds.contains(recommendation.primaryTagId),
                "Secondary tags must not duplicate primary tag for \(recommendation.canonicalRepo)"
            )
        }
    }

    func testImportRecommendationCategoryAndTagKeysExistInAllSupportedLocales() {
        let recommendations = loadRecommendations()
        let locales = [
            Locale(identifier: "zh-Hans"),
            Locale(identifier: "en"),
            Locale(identifier: "ja"),
        ]

        for recommendation in recommendations {
            let tagIds = [recommendation.primaryTagId] + recommendation.secondaryTagIds
            for locale in locales {
                let categoryValue = L10n.string("import.recommendation.category.\(recommendation.categoryId)", locale: locale)
                XCTAssertNotEqual(
                    categoryValue,
                    "import.recommendation.category.\(recommendation.categoryId)",
                    "Missing category localization for \(recommendation.categoryId) in \(locale.identifier)"
                )

                for tagId in tagIds {
                    let tagKey = "import.recommendation.tag.\(tagId)"
                    let tagValue = L10n.string(tagKey, locale: locale)
                    XCTAssertNotEqual(
                        tagValue,
                        tagKey,
                        "Missing tag localization for \(tagId) in \(locale.identifier)"
                    )
                }
            }
        }
    }

    func testRenameOriginalNameStringsResolvePerLocale() {
        XCTAssertEqual(
            L10n.string("toast.rename.reset_success", locale: Locale(identifier: "zh-Hans"), arguments: ["anthropic-skills"]),
            "已恢复原名 anthropic-skills"
        )
    }

}

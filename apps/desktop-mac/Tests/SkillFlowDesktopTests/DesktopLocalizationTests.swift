import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DesktopLocalizationTests: XCTestCase {
    private enum DesktopLocalizedStringsLoadError: Error {
        case fileNotFound(URL)
        case invalidPropertyList(URL, underlying: Error)
        case invalidRootObject(URL, actualType: String)
        case nonStringValue(URL, key: String, actualType: String)
    }

    private let supportedLocales = [
        Locale(identifier: "zh-Hans"),
        Locale(identifier: "en"),
        Locale(identifier: "ja"),
    ]

    private func loadRecommendations() -> [ImportRecommendationEntry] {
        let configurationURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/DesktopApp/Resources/ImportRecommendations/recommendations.json")
        let data = try! Data(contentsOf: configurationURL)
        return try! JSONDecoder().decode([ImportRecommendationEntry].self, from: data)
    }

    private func loadDesktopLocalizedStrings(localeIdentifier: String) throws -> [String: String] {
        let fileURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/DesktopApp/Resources/\(localeIdentifier).lproj/Localizable.strings")
        return try loadDesktopLocalizedStrings(from: fileURL)
    }

    private func loadDesktopLocalizedStrings(from fileURL: URL) throws -> [String: String] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw DesktopLocalizedStringsLoadError.fileNotFound(fileURL)
        }

        let data = try Data(contentsOf: fileURL)

        let propertyList: Any
        do {
            propertyList = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
        } catch {
            throw DesktopLocalizedStringsLoadError.invalidPropertyList(fileURL, underlying: error)
        }

        guard let dictionary = propertyList as? [String: Any] else {
            throw DesktopLocalizedStringsLoadError.invalidRootObject(
                fileURL,
                actualType: String(describing: type(of: propertyList))
            )
        }

        var localizedStrings: [String: String] = [:]
        localizedStrings.reserveCapacity(dictionary.count)

        for key in dictionary.keys.sorted() {
            guard let value = dictionary[key] else {
                continue
            }
            guard let stringValue = value as? String else {
                throw DesktopLocalizedStringsLoadError.nonStringValue(
                    fileURL,
                    key: key,
                    actualType: String(describing: type(of: value))
                )
            }
            localizedStrings[key] = stringValue
        }

        return localizedStrings
    }

    private func makeTemporaryFileURL(filename: String = UUID().uuidString) throws -> URL {
        let directoryURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "DesktopLocalizationTests-\(UUID().uuidString)",
            isDirectory: true
        )
        try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        addTeardownBlock {
            try? FileManager.default.removeItem(at: directoryURL)
        }
        return directoryURL.appendingPathComponent(filename)
    }

    private func userFacingDesktopLocalizedStrings(localeIdentifier: String) throws -> [(key: String, value: String)] {
        let localizedStrings = try loadDesktopLocalizedStrings(localeIdentifier: localeIdentifier)
        return localizedStrings
            .filter { key, _ in
                key.hasPrefix("toast.") || key.hasPrefix("bridge.error.") || key.hasPrefix("issue.detail.")
            }
            .sorted { lhs, rhs in lhs.key < rhs.key }
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

    func testLoadDesktopLocalizedStringsThrowsWhenLocaleFileIsMissing() {
        let missingFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent("Localizable.strings")

        XCTAssertThrowsError(try loadDesktopLocalizedStrings(from: missingFileURL))
    }

    func testLoadDesktopLocalizedStringsThrowsWhenStringsFileCannotBeParsed() throws {
        let fileURL = try makeTemporaryFileURL(filename: "Broken.strings")
        try Data("not a plist".utf8).write(to: fileURL)

        XCTAssertThrowsError(try loadDesktopLocalizedStrings(from: fileURL))
    }

    func testLoadDesktopLocalizedStringsThrowsWhenStringsFileContainsNonStringValues() throws {
        let fileURL = try makeTemporaryFileURL(filename: "Typed.strings")
        let data = try PropertyListSerialization.data(
            fromPropertyList: ["toast.issue.generic": 599],
            format: .xml,
            options: 0
        )
        try data.write(to: fileURL)

        XCTAssertThrowsError(try loadDesktopLocalizedStrings(from: fileURL))
    }

    func testUserFacingLocalizedCopyDoesNotLeakInternalReasonCodes() throws {
        for locale in supportedLocales {
            let entries = try userFacingDesktopLocalizedStrings(localeIdentifier: locale.identifier)
            XCTAssertFalse(entries.isEmpty, "Expected user-facing localized strings for \(locale.identifier)")
            _ = try XCTUnwrap(entries.first, "Expected at least one user-facing localized string in \(locale.identifier)")

            for entry in entries {
                XCTAssertFalse(entry.value.contains("IMPORT_"), "\(locale.identifier):\(entry.key)")
                XCTAssertFalse(entry.value.contains("BRIDGE_"), "\(locale.identifier):\(entry.key)")
                XCTAssertFalse(entry.value.contains("STATE_MIGRATION_"), "\(locale.identifier):\(entry.key)")
            }
        }
    }

    func testL10nLoadsDetailDerivedLocalizationKeys() {
        XCTAssertEqual(L10n.string("detail.document.file_tree", locale: Locale(identifier: "en")), "File Tree")
        XCTAssertEqual(L10n.string("detail.document.file_tree", locale: Locale(identifier: "zh-Hans")), "文件树")
        XCTAssertEqual(L10n.string("source.metadata.status_value.unsupported", locale: Locale(identifier: "ja")), "非対応")
        XCTAssertEqual(L10n.string("detail.updated.unavailable", locale: Locale(identifier: "ja")), "更新時刻を取得できません")
    }

    func testSourceTypeCollectionLabelUsesCombinedCopy() {
        XCTAssertEqual(L10n.string("home.sidebar.collection", locale: Locale(identifier: "zh-Hans")), "组合")
        XCTAssertEqual(L10n.string("home.sidebar.collection", locale: Locale(identifier: "en")), "Combined")
        XCTAssertEqual(L10n.string("home.sidebar.collection", locale: Locale(identifier: "ja")), "組み合わせ")
    }

    func testGroupEditorUsesCombinedGroupCopy() {
        XCTAssertEqual(
            L10n.string("group_editor.summary.create", locale: Locale(identifier: "zh-Hans")),
            "自由组合不同分组的技能，创建新的组合分组。"
        )
        XCTAssertEqual(
            L10n.string("group_editor.summary.merge", locale: Locale(identifier: "en")),
            "Combine selected groups into one combined group and hide the source groups."
        )
        XCTAssertEqual(
            L10n.string("group_editor.impact.create_collection", locale: Locale(identifier: "ja")),
            "組み合わせグループを作成します。"
        )
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
            "home.sidebar.collection",
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
        let locales = supportedLocales

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
            "group_editor.name",
            "group_editor.summary.create",
            "group_editor.summary.merge",
            "group_editor.section.skill_groups",
            "group_editor.loading",
            "source.author.local",
            "source.author.collection",
            "group_editor.search.placeholder",
            "group_editor.search.empty",
            "group_editor.action.save",
            "group_editor.action.restore",
            "group_editor.validation.name_required",
            "group_editor.validation.skills_required",
            "group_editor.validation.groups_required",
            "group_editor.impact.create_collection",
            "group_editor.impact.hide_groups",
            "group_editor.impact.clear_bindings",
            "group_editor.impact.save_restore_snapshot",
        ]
        let locales = supportedLocales

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
            "toast.issue.generic",
            "toast.operation.source_not_found",
            "toast.operation.collection_not_found",
            "toast.state.migration_blocked",
            "toast.import.failed.provider_not_supported",
            "toast.import.failed.provider_data_unavailable",
            "toast.import.failed.provider_rate_limited",
            "toast.import.failed.provider_response_invalid",
            "toast.import.failed.provider_request_failed",
            "toast.import.failed.no_valid_leafs",
            "toast.import.failed.source_path_not_found",
            "toast.import.failed.add_agent_not_available",
            "toast.import.failed.add_skill_not_found",
            "toast.import.failed.selection_not_found",
            "toast.import.failed.selection_ambiguous",
            "toast.import.failed.selection_invalid",
            "toast.import.failed.import_prepare_failed",
            "toast.import.failed.preparation_stale",
            "toast.import.failed.invalid_response",
            "toast.import.failed.reason_code",
            "toast.import.warning.selection_drift",
            "toast.import.warning.selection_not_found",
            "toast.import.warning.selection_ambiguous",
            "import.reason.no_valid_leafs",
            "import.reason.source_path_not_found",
            "import.reason.add_agent_not_available",
        ]
        let locales = supportedLocales

        for locale in locales {
            for key in requiredKeys {
                let value = L10n.string(key, locale: locale)
                XCTAssertNotEqual(value, key, "Missing localization for \(key) in \(locale.identifier)")
                XCTAssertFalse(value.contains("provider_request_failed"), "User-facing import message leaked a reason code")
            }

            let genericValue = L10n.string("toast.issue.generic", locale: locale, arguments: ["599"])
            XCTAssertTrue(genericValue.contains("599"), "Missing generic issue code in \(locale.identifier)")

            let warningValue = L10n.string("toast.import.warning.selection_drift", locale: locale, arguments: ["103"])
            XCTAssertTrue(warningValue.contains("103"), "Missing warning issue code in \(locale.identifier)")
            XCTAssertFalse(warningValue.contains("Import failed"), "Warning copy regressed in \(locale.identifier)")

            let warningNotFoundValue = L10n.string("toast.import.warning.selection_not_found", locale: locale, arguments: ["101"])
            XCTAssertTrue(warningNotFoundValue.contains("101"), "Missing selector-not-found warning issue code in \(locale.identifier)")
            XCTAssertFalse(warningNotFoundValue.contains("Import failed"), "Selector-not-found warning regressed in \(locale.identifier)")

            let notFoundValue = L10n.string("toast.import.failed.selection_not_found", locale: locale, arguments: ["101"])
            XCTAssertTrue(notFoundValue.contains("101"), "Missing selection-not-found issue code in \(locale.identifier)")

            let invalidResponseValue = L10n.string("toast.issue.generic", locale: locale, arguments: ["502"])
            XCTAssertTrue(invalidResponseValue.contains("502"), "Missing bridge issue code in \(locale.identifier)")
            XCTAssertFalse(invalidResponseValue.contains("BRIDGE_REQUEST_INVALID"), "Bridge internal code leaked in \(locale.identifier)")
        }
    }

    func testImportLocalKeysExistInAllSupportedLocales() {
        let requiredKeys = [
            "import.mode.recommended",
            "import.mode.local_scan",
            "import.local.button",
            "import.local.button.help",
            "import.local.panel.prompt",
            "import.local.sources.title",
            "import.local.source.manual",
            "import.local.detected.title",
            "import.local.detected.description",
            "import.local.status.matched",
            "import.local.status.changed",
            "import.local.status.missing",
            "import.local.status.ambiguous",
            "import.local.status.origin_unavailable",
            "import.local.status.local_only",
            "import.local.action.choose_version",
            "toast.import.local_source_target_locked",
            "import.card.subtitle.local_scan",
            "import.card.meta.local_scan_sources",
            "import.error.scan_local",
        ]
        let locales = supportedLocales

        for locale in locales {
            for key in requiredKeys {
                let value = L10n.string(key, locale: locale)
                XCTAssertNotEqual(value, key, "Missing localization for \(key) in \(locale.identifier)")
            }

            let toastKey = "toast.import.local_scan_failed"
            let toastValue = L10n.string(toastKey, locale: locale, arguments: ["boom"])
            XCTAssertNotEqual(toastValue, toastKey, "Missing localization for \(toastKey) in \(locale.identifier)")
            XCTAssertTrue(toastValue.contains("boom"), "Missing scan error argument in \(locale.identifier)")

            let morePathsKey = "import.local.sources.more"
            let morePathsValue = L10n.string(morePathsKey, locale: locale, arguments: [2])
            XCTAssertNotEqual(morePathsValue, morePathsKey, "Missing localization for \(morePathsKey) in \(locale.identifier)")
            XCTAssertTrue(morePathsValue.contains("2"), "Missing source path count in \(locale.identifier)")

            let lockedTargetToastValue = L10n.string(
                "toast.import.local_source_target_locked",
                locale: locale,
                arguments: ["Claude Code"]
            )
            XCTAssertTrue(lockedTargetToastValue.contains("Claude Code"), "Missing locked target argument in \(locale.identifier)")

            let subtitleValue = L10n.string("import.card.meta.local_scan_sources", locale: locale, arguments: [2])
            XCTAssertTrue(subtitleValue.contains("2"), "Missing local scan subtitle count in \(locale.identifier)")
        }
    }

    func testChineseImportStringsUseZuInsteadOfEnglishGroup() {
        XCTAssertEqual(
            L10n.string("toast.import.exists", locale: Locale(identifier: "zh-Hans")),
            "该组已存在于本地。"
        )
        XCTAssertEqual(
            L10n.string("toast.import.preparing", locale: Locale(identifier: "zh-Hans")),
            "正在准备该组的导入。"
        )
        XCTAssertEqual(
            L10n.string("toast.import.in_progress", locale: Locale(identifier: "zh-Hans")),
            "该组正在导入。"
        )
    }

    func testChinesePinnedStatusUsesPinnedWording() {
        XCTAssertEqual(L10n.string("home.sidebar.pinned", locale: Locale(identifier: "zh-Hans")), "置顶")
    }

    @MainActor
    func testDetailScreenLocalizesGroupFileTreeDocumentTitlePerLocale() {
        let fileTreeDocument = DocumentDescriptor(
            id: "group:filetree",
            title: "File Tree",
            path: ".",
            metadata: [],
            renderCacheKey: "group:filetree:.",
            externalURL: nil
        )
        let markdownDocument = DocumentDescriptor(
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

        let locales = supportedLocales

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
        let locales = supportedLocales

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

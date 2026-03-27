import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DesktopLocalizationTests: XCTestCase {
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
}

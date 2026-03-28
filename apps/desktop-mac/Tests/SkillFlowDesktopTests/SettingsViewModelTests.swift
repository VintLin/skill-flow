import XCTest

@testable import SkillFlowDesktop

final class SettingsViewModelTests: XCTestCase {
    private let suiteName = "SettingsViewModelTests"

    override func setUp() {
        super.setUp()
        UserDefaults(suiteName: suiteName)!.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        UserDefaults(suiteName: suiteName)!.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    @MainActor
    func testLoadsStoredValuesAndNormalizesSelections() {
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.set(true, forKey: SettingsViewModel.autoLaunchKey)
        defaults.set("warn", forKey: SettingsViewModel.logLevelKey)
        defaults.set(true, forKey: SettingsViewModel.externalHelperKey)
        defaults.set(DesktopLanguage.ja.rawValue, forKey: DesktopLanguage.storageKey)
        defaults.set(DesktopThemeMode.dark.rawValue, forKey: SettingsViewModel.themeModeKey)
        defaults.set(DesktopAccentColor.green.rawValue, forKey: SettingsViewModel.themeAccentKey)
        defaults.set(false, forKey: SettingsViewModel.menuCompactCardsKey)

        let viewModel = SettingsViewModel(userDefaults: defaults)

        XCTAssertTrue(viewModel.autoLaunch)
        XCTAssertEqual(viewModel.logLevel, "warn")
        XCTAssertTrue(viewModel.experimentalExternalHelper)
        XCTAssertEqual(viewModel.desktopLanguageRawValue, DesktopLanguage.ja.rawValue)
        XCTAssertEqual(viewModel.themeModeRawValue, DesktopThemeMode.dark.rawValue)
        XCTAssertEqual(viewModel.themeAccentRawValue, DesktopAccentColor.green.rawValue)
        XCTAssertFalse(viewModel.menuCompactCards)
        XCTAssertEqual(viewModel.currentLanguage, DesktopLanguage.ja)
        XCTAssertEqual(viewModel.currentAccent, DesktopAccentColor.green)
    }

    @MainActor
    func testWritesPersistImmediately() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let viewModel = SettingsViewModel(userDefaults: defaults)

        viewModel.autoLaunch = true
        viewModel.logLevel = "error"
        viewModel.experimentalExternalHelper = true
        viewModel.desktopLanguageRawValue = DesktopLanguage.zhHans.rawValue
        viewModel.themeModeRawValue = DesktopThemeMode.dark.rawValue
        viewModel.themeAccentRawValue = DesktopAccentColor.orange.rawValue
        viewModel.menuCompactCards = false

        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.autoLaunchKey), true)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.logLevelKey), "error")
        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.externalHelperKey), true)
        XCTAssertEqual(defaults.string(forKey: DesktopLanguage.storageKey), DesktopLanguage.zhHans.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeModeKey), DesktopThemeMode.dark.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeAccentKey), DesktopAccentColor.orange.rawValue)
        XCTAssertEqual(defaults.object(forKey: SettingsViewModel.menuCompactCardsKey) as? Bool, false)
    }

    @MainActor
    func testFallsBackToDefaultsWhenUnsetOrInvalid() {
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.set("invalid-accent", forKey: SettingsViewModel.themeAccentKey)
        defaults.set("invalid-language", forKey: DesktopLanguage.storageKey)

        let viewModel = SettingsViewModel(userDefaults: defaults)

        XCTAssertFalse(viewModel.autoLaunch)
        XCTAssertEqual(viewModel.logLevel, "info")
        XCTAssertFalse(viewModel.experimentalExternalHelper)
        XCTAssertEqual(viewModel.themeModeRawValue, DesktopThemeMode.light.rawValue)
        XCTAssertEqual(viewModel.menuCompactCards, true)
        XCTAssertEqual(viewModel.currentAccent, DesktopAccentColor.blue)
        XCTAssertEqual(viewModel.currentLanguage, DesktopLanguage.system)
    }
}

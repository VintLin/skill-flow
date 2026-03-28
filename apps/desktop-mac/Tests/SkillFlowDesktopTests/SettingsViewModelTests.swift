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
        defaults.set(DesktopCardDensity.compact.rawValue, forKey: SettingsViewModel.homeCardDensityKey)
        defaults.set(DesktopCardDensity.comfortable.rawValue, forKey: SettingsViewModel.menuCardDensityKey)

        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        XCTAssertTrue(viewModel.autoLaunch)
        XCTAssertEqual(viewModel.logLevel, "warn")
        XCTAssertTrue(viewModel.experimentalExternalHelper)
        XCTAssertEqual(viewModel.desktopLanguageRawValue, DesktopLanguage.ja.rawValue)
        XCTAssertEqual(viewModel.themeModeRawValue, DesktopThemeMode.dark.rawValue)
        XCTAssertEqual(viewModel.themeAccentRawValue, DesktopAccentColor.green.rawValue)
        XCTAssertEqual(viewModel.homeCardDensityRawValue, DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(viewModel.menuCardDensityRawValue, DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(viewModel.currentLanguage, DesktopLanguage.ja)
        XCTAssertEqual(viewModel.currentAccent, DesktopAccentColor.green)
        XCTAssertEqual(viewModel.currentHomeCardDensity, .compact)
        XCTAssertEqual(viewModel.currentMenuCardDensity, .comfortable)
        XCTAssertEqual(state.settings.logLevel, "warn")
    }

    @MainActor
    func testWritesPersistImmediately() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        viewModel.autoLaunch = true
        viewModel.logLevel = "error"
        viewModel.experimentalExternalHelper = true
        viewModel.desktopLanguageRawValue = DesktopLanguage.zhHans.rawValue
        viewModel.themeModeRawValue = DesktopThemeMode.dark.rawValue
        viewModel.themeAccentRawValue = DesktopAccentColor.orange.rawValue
        viewModel.homeCardDensityRawValue = DesktopCardDensity.compact.rawValue
        viewModel.menuCardDensityRawValue = DesktopCardDensity.comfortable.rawValue

        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.autoLaunchKey), true)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.logLevelKey), "error")
        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.externalHelperKey), true)
        XCTAssertEqual(defaults.string(forKey: DesktopLanguage.storageKey), DesktopLanguage.zhHans.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeModeKey), DesktopThemeMode.dark.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeAccentKey), DesktopAccentColor.orange.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.homeCardDensityKey), DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.menuCardDensityKey), DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(state.settings.logLevel, "error")
        XCTAssertEqual(state.settings.themeAccentRawValue, DesktopAccentColor.orange.rawValue)
    }

    @MainActor
    func testFallsBackToDefaultsWhenUnsetOrInvalid() {
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.set("invalid-accent", forKey: SettingsViewModel.themeAccentKey)
        defaults.set("invalid-language", forKey: DesktopLanguage.storageKey)

        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults)
        )

        XCTAssertFalse(viewModel.autoLaunch)
        XCTAssertEqual(viewModel.logLevel, "info")
        XCTAssertFalse(viewModel.experimentalExternalHelper)
        XCTAssertEqual(viewModel.themeModeRawValue, DesktopThemeMode.light.rawValue)
        XCTAssertEqual(viewModel.homeCardDensityRawValue, DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(viewModel.menuCardDensityRawValue, DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(viewModel.currentAccent, DesktopAccentColor.blue)
        XCTAssertEqual(viewModel.currentLanguage, DesktopLanguage.system)
    }
}

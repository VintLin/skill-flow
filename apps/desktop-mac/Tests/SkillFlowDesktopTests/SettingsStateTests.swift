import XCTest

@testable import SkillFlowDesktop

@MainActor
final class SettingsStateTests: XCTestCase {
    func testDesktopAppStateStartsWithSettingsSlice() {
        let state = DesktopAppState()

        XCTAssertEqual(state.settings.logLevel, "info")
        XCTAssertEqual(state.settings.themeModeRawValue, DesktopThemeMode.light.rawValue)
        XCTAssertEqual(state.settings.themeAccentRawValue, DesktopAccentColor.blue.rawValue)
        XCTAssertTrue(state.settings.menuCompactCards)
    }

    func testSettingsStoreLoadsAndPersistsState() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = DesktopSettingsStore(userDefaults: defaults)

        var state = store.load()
        state.logLevel = "debug"
        state.menuCompactCards = false
        store.save(state)

        let reloaded = store.load()
        XCTAssertEqual(reloaded.logLevel, "debug")
        XCTAssertFalse(reloaded.menuCompactCards)
    }
}

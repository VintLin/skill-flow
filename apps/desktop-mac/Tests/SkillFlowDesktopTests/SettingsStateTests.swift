import XCTest

@testable import SkillFlowDesktop

@MainActor
final class SettingsStateTests: XCTestCase {
    func testDesktopAppStateStartsWithSettingsSlice() {
        let state = DesktopAppState()

        XCTAssertEqual(state.settings.logLevel, "info")
        XCTAssertEqual(state.settings.themeModeRawValue, DesktopThemeMode.light.rawValue)
        XCTAssertEqual(state.settings.themeAccentRawValue, DesktopAccentColor.blue.rawValue)
        XCTAssertEqual(state.settings.homeCardDensityRawValue, DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(state.settings.menuCardDensityRawValue, DesktopCardDensity.compact.rawValue)
        XCTAssertTrue(state.settings.agentDisplayPreferences.isEmpty)
    }

    func testSettingsStoreLoadsAndPersistsState() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = DesktopSettingsStore(userDefaults: defaults)

        var state = store.load()
        state.logLevel = "debug"
        state.homeCardDensityRawValue = DesktopCardDensity.compact.rawValue
        state.menuCardDensityRawValue = DesktopCardDensity.comfortable.rawValue
        state.agentDisplayPreferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
            AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 1),
        ]
        store.save(state)

        let reloaded = store.load()
        XCTAssertEqual(reloaded.logLevel, "debug")
        XCTAssertEqual(reloaded.homeCardDensityRawValue, DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(reloaded.menuCardDensityRawValue, DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(reloaded.agentDisplayPreferences.prefix(2).map(\.targetId), ["codex", "claude-code"])
        XCTAssertEqual(reloaded.agentDisplayPreferences.first?.isVisible, false)
    }
}

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
        XCTAssertEqual(state.settings.selectedProjectScope, .global)
        XCTAssertTrue(state.settings.recentProjectScopes.isEmpty)
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
        state.selectedProjectScope = .project("repo-a")
        state.recentProjectScopes = [
            RecentProjectScopeItem(
                projectId: "repo-a",
                title: "Repo A",
                lastActivityAt: "2026-03-31T12:00:00.000Z",
                tools: ["codex"]
            )
        ]
        state.agentDisplayPreferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
            AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 1),
        ]
        store.save(state)

        let reloaded = store.load()
        XCTAssertEqual(reloaded.logLevel, "debug")
        XCTAssertEqual(reloaded.homeCardDensityRawValue, DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(reloaded.menuCardDensityRawValue, DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(reloaded.selectedProjectScope, .project("repo-a"))
        XCTAssertEqual(reloaded.recentProjectScopes.first?.projectId, "repo-a")
        XCTAssertEqual(reloaded.recentProjectScopes.first?.title, "Repo A")
        XCTAssertEqual(reloaded.agentDisplayPreferences.prefix(2).map(\.targetId), ["codex", "claude-code"])
        XCTAssertEqual(reloaded.agentDisplayPreferences.first?.isVisible, false)
    }
}

import Foundation

struct DesktopSettingsStore {
    let userDefaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func load() -> SettingsState {
        SettingsState(
            autoLaunch: userDefaults.bool(forKey: SettingsViewModel.autoLaunchKey),
            logLevel: userDefaults.string(forKey: SettingsViewModel.logLevelKey) ?? "info",
            experimentalExternalHelper: userDefaults.bool(forKey: SettingsViewModel.externalHelperKey),
            desktopLanguageRawValue: userDefaults.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue,
            themeModeRawValue: userDefaults.string(forKey: SettingsViewModel.themeModeKey) ?? DesktopThemeMode.light.rawValue,
            themeAccentRawValue: userDefaults.string(forKey: SettingsViewModel.themeAccentKey) ?? DesktopAccentColor.blue.rawValue,
            homeCardDensityRawValue: userDefaults.string(forKey: SettingsViewModel.homeCardDensityKey) ?? DesktopCardDensity.comfortable.rawValue,
            menuCardDensityRawValue: userDefaults.string(forKey: SettingsViewModel.menuCardDensityKey) ?? DesktopCardDensity.compact.rawValue,
            selectedProjectScope: loadSelectedProjectScope(),
            recentProjectScopes: loadRecentProjectScopes(),
            agentDisplayPreferences: AgentDisplayCatalog.normalize(loadAgentDisplayPreferences())
        )
    }

    func save(_ state: SettingsState) {
        userDefaults.set(state.autoLaunch, forKey: SettingsViewModel.autoLaunchKey)
        userDefaults.set(state.logLevel, forKey: SettingsViewModel.logLevelKey)
        userDefaults.set(state.experimentalExternalHelper, forKey: SettingsViewModel.externalHelperKey)
        userDefaults.set(state.desktopLanguageRawValue, forKey: DesktopLanguage.storageKey)
        userDefaults.set(state.themeModeRawValue, forKey: SettingsViewModel.themeModeKey)
        userDefaults.set(state.themeAccentRawValue, forKey: SettingsViewModel.themeAccentKey)
        userDefaults.set(state.homeCardDensityRawValue, forKey: SettingsViewModel.homeCardDensityKey)
        userDefaults.set(state.menuCardDensityRawValue, forKey: SettingsViewModel.menuCardDensityKey)
        let encodedProjectScope = try? encoder.encode(state.selectedProjectScope)
        userDefaults.set(encodedProjectScope, forKey: SettingsViewModel.selectedProjectScopeKey)
        let encodedRecentProjectScopes = try? encoder.encode(state.recentProjectScopes)
        userDefaults.set(encodedRecentProjectScopes, forKey: SettingsViewModel.recentProjectScopesKey)
        let encodedPreferences = try? encoder.encode(AgentDisplayCatalog.normalize(state.agentDisplayPreferences))
        userDefaults.set(encodedPreferences, forKey: SettingsViewModel.agentDisplayPreferencesKey)
    }

    private func loadSelectedProjectScope() -> ProjectScopeSelection {
        guard let data = userDefaults.data(forKey: SettingsViewModel.selectedProjectScopeKey),
              let scope = try? decoder.decode(ProjectScopeSelection.self, from: data)
        else {
            return .global
        }
        return scope
    }

    private func loadRecentProjectScopes() -> [RecentProjectScopeItem] {
        guard let data = userDefaults.data(forKey: SettingsViewModel.recentProjectScopesKey) else {
            return []
        }
        return (try? decoder.decode([RecentProjectScopeItem].self, from: data)) ?? []
    }

    private func loadAgentDisplayPreferences() -> [AgentDisplayPreference] {
        guard let data = userDefaults.data(forKey: SettingsViewModel.agentDisplayPreferencesKey) else {
            return []
        }
        return (try? decoder.decode([AgentDisplayPreference].self, from: data)) ?? []
    }
}

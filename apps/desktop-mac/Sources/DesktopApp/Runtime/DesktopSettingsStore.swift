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
        let encodedPreferences = try? encoder.encode(AgentDisplayCatalog.normalize(state.agentDisplayPreferences))
        userDefaults.set(encodedPreferences, forKey: SettingsViewModel.agentDisplayPreferencesKey)
    }

    private func loadAgentDisplayPreferences() -> [AgentDisplayPreference] {
        guard let data = userDefaults.data(forKey: SettingsViewModel.agentDisplayPreferencesKey) else {
            return []
        }
        return (try? decoder.decode([AgentDisplayPreference].self, from: data)) ?? []
    }
}

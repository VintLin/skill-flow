import Foundation

struct DesktopSettingsStore {
    let userDefaults: UserDefaults
    let workspaceMemory: DesktopWorkspaceMemoryStore
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    /// - Parameters:
    ///   - userDefaults: Bundle-scoped chrome settings (`UserDefaults.standard` in production).
    ///   - workspaceMemory: Shared suite for agent display preferences. When `nil`, production uses
    ///     the shared suite; injected test suites reuse the same `userDefaults` for isolation.
    init(
        userDefaults: UserDefaults = .standard,
        workspaceMemory: DesktopWorkspaceMemoryStore? = nil
    ) {
        self.userDefaults = userDefaults
        if let workspaceMemory {
            self.workspaceMemory = workspaceMemory
        } else if userDefaults === UserDefaults.standard {
            self.workspaceMemory = .makeShared()
        } else {
            self.workspaceMemory = DesktopWorkspaceMemoryStore(
                userDefaults: userDefaults,
                legacyDomainNames: []
            )
        }
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
            agentDisplayPreferences: AgentDisplayCatalog.normalize(loadAgentDisplayPreferences(), customAgents: loadCustomAgents()),
            customAgents: loadCustomAgents()
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
        workspaceMemory.saveAgentDisplayPreferences(
            AgentDisplayCatalog.normalize(state.agentDisplayPreferences, customAgents: state.customAgents)
        )
        let encodedCustomAgents = try? encoder.encode(state.customAgents)
        userDefaults.set(encodedCustomAgents, forKey: SettingsViewModel.customAgentsKey)
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
        workspaceMemory.loadAgentDisplayPreferences()
    }

    private func loadCustomAgents() -> [CustomAgentDefinition] {
        guard let data = userDefaults.data(forKey: SettingsViewModel.customAgentsKey) else {
            return []
        }
        return (try? decoder.decode([CustomAgentDefinition].self, from: data)) ?? []
    }
}

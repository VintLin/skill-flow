import Foundation

enum DesktopCardDensity: String, CaseIterable, Equatable {
    case comfortable
    case compact
}

struct RecentProjectScopeItem: Codable, Equatable {
    var projectId: String
    var title: String
    var lastActivityAt: String
    var tools: [String]
}

struct SettingsState: Equatable {
    var autoLaunch: Bool = false
    var logLevel: String = "info"
    var experimentalExternalHelper: Bool = false
    var desktopLanguageRawValue: String = DesktopLanguage.system.rawValue
    var themeModeRawValue: String = DesktopThemeMode.light.rawValue
    var themeAccentRawValue: String = DesktopAccentColor.blue.rawValue
    var homeCardDensityRawValue: String = DesktopCardDensity.comfortable.rawValue
    var menuCardDensityRawValue: String = DesktopCardDensity.compact.rawValue
    var selectedProjectScope: ProjectScopeSelection = .global
    var recentProjectScopes: [RecentProjectScopeItem] = []
    var agentDisplayPreferences: [AgentDisplayPreference] = []
}

import Foundation
import Observation

@MainActor
@Observable
final class SettingsViewModel {
    static let autoLaunchKey = "desktop.autoLaunch"
    static let logLevelKey = "desktop.logLevel"
    static let externalHelperKey = "desktop.experimentalExternalHelper"
    static let themeModeKey = "desktop.themeMode"
    static let themeAccentKey = "desktop.themeAccent"
    static let menuCompactCardsKey = "desktop.menuCompactCards"

    private let userDefaults: UserDefaults

    var autoLaunch: Bool {
        didSet { userDefaults.set(autoLaunch, forKey: Self.autoLaunchKey) }
    }

    var logLevel: String {
        didSet { userDefaults.set(logLevel, forKey: Self.logLevelKey) }
    }

    var experimentalExternalHelper: Bool {
        didSet { userDefaults.set(experimentalExternalHelper, forKey: Self.externalHelperKey) }
    }

    var desktopLanguageRawValue: String {
        didSet { userDefaults.set(desktopLanguageRawValue, forKey: DesktopLanguage.storageKey) }
    }

    var themeModeRawValue: String {
        didSet { userDefaults.set(themeModeRawValue, forKey: Self.themeModeKey) }
    }

    var themeAccentRawValue: String {
        didSet { userDefaults.set(themeAccentRawValue, forKey: Self.themeAccentKey) }
    }

    var menuCompactCards: Bool {
        didSet { userDefaults.set(menuCompactCards, forKey: Self.menuCompactCardsKey) }
    }

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        self.autoLaunch = userDefaults.bool(forKey: Self.autoLaunchKey)
        self.logLevel = userDefaults.string(forKey: Self.logLevelKey) ?? "info"
        self.experimentalExternalHelper = userDefaults.bool(forKey: Self.externalHelperKey)
        self.desktopLanguageRawValue = userDefaults.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
        self.themeModeRawValue = userDefaults.string(forKey: Self.themeModeKey) ?? DesktopThemeMode.light.rawValue
        self.themeAccentRawValue = userDefaults.string(forKey: Self.themeAccentKey) ?? DesktopAccentColor.blue.rawValue
        self.menuCompactCards = userDefaults.object(forKey: Self.menuCompactCardsKey) as? Bool ?? true
    }

    var currentAccent: DesktopAccentColor {
        DesktopAccentColor(rawValue: themeAccentRawValue) ?? .blue
    }

    var currentLanguage: DesktopLanguage {
        DesktopLanguage(storageValue: desktopLanguageRawValue)
    }
}

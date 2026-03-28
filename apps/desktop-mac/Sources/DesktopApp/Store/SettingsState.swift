import Foundation

struct SettingsState: Equatable {
    var autoLaunch: Bool = false
    var logLevel: String = "info"
    var experimentalExternalHelper: Bool = false
    var desktopLanguageRawValue: String = DesktopLanguage.system.rawValue
    var themeModeRawValue: String = DesktopThemeMode.light.rawValue
    var themeAccentRawValue: String = DesktopAccentColor.blue.rawValue
    var menuCompactCards: Bool = true
}

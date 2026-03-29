import Foundation
import Observation

@MainActor
@Observable
final class SettingsViewModel {
    nonisolated static let autoLaunchKey = "desktop.autoLaunch"
    nonisolated static let logLevelKey = "desktop.logLevel"
    nonisolated static let externalHelperKey = "desktop.experimentalExternalHelper"
    nonisolated static let themeModeKey = "desktop.themeMode"
    nonisolated static let themeAccentKey = "desktop.themeAccent"
    nonisolated static let homeCardDensityKey = "desktop.homeCardDensity"
    nonisolated static let menuCardDensityKey = "desktop.menuCardDensity"

    private let state: DesktopAppState
    private let store: DesktopSettingsStore
    private let cacheMaintenance: DesktopCacheMaintenance

    var autoLaunch: Bool {
        get { state.settings.autoLaunch }
        set {
            state.settings.autoLaunch = newValue
            store.save(state.settings)
        }
    }

    var logLevel: String {
        get { state.settings.logLevel }
        set {
            state.settings.logLevel = newValue
            store.save(state.settings)
        }
    }

    var experimentalExternalHelper: Bool {
        get { state.settings.experimentalExternalHelper }
        set {
            state.settings.experimentalExternalHelper = newValue
            store.save(state.settings)
        }
    }

    var desktopLanguageRawValue: String {
        get { state.settings.desktopLanguageRawValue }
        set {
            state.settings.desktopLanguageRawValue = newValue
            store.save(state.settings)
        }
    }

    var themeModeRawValue: String {
        get { state.settings.themeModeRawValue }
        set {
            state.settings.themeModeRawValue = newValue
            store.save(state.settings)
        }
    }

    var themeAccentRawValue: String {
        get { state.settings.themeAccentRawValue }
        set {
            state.settings.themeAccentRawValue = newValue
            store.save(state.settings)
        }
    }

    var homeCardDensityRawValue: String {
        get { state.settings.homeCardDensityRawValue }
        set {
            state.settings.homeCardDensityRawValue = newValue
            store.save(state.settings)
        }
    }

    var menuCardDensityRawValue: String {
        get { state.settings.menuCardDensityRawValue }
        set {
            state.settings.menuCardDensityRawValue = newValue
            store.save(state.settings)
        }
    }

    init(
        state: DesktopAppState,
        store: DesktopSettingsStore = DesktopSettingsStore(),
        cacheMaintenance: DesktopCacheMaintenance = DesktopCacheMaintenance()
    ) {
        self.state = state
        self.store = store
        self.cacheMaintenance = cacheMaintenance
        self.state.settings = store.load()
    }

    var currentAccent: DesktopAccentColor {
        DesktopAccentColor(rawValue: themeAccentRawValue) ?? .blue
    }

    var currentThemeMode: DesktopThemeMode {
        DesktopThemeMode(rawValue: themeModeRawValue) ?? .light
    }

    var currentLanguage: DesktopLanguage {
        DesktopLanguage(storageValue: desktopLanguageRawValue)
    }

    var currentHomeCardDensity: DesktopCardDensity {
        DesktopCardDensity(rawValue: homeCardDensityRawValue) ?? .comfortable
    }

    var currentMenuCardDensity: DesktopCardDensity {
        DesktopCardDensity(rawValue: menuCardDensityRawValue) ?? .compact
    }

    var selectedLocale: Locale {
        currentLanguage.locale
    }

    func resetConfiguration() {
        state.settings = SettingsState()
        store.save(state.settings)
    }

    func clearMetadataCache() {
        cacheMaintenance.clearMetadataCache()
    }
}

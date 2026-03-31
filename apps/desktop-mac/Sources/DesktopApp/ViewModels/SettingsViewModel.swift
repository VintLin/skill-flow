import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class SettingsViewModel {
    nonisolated static let latestReleasesURL = URL(string: "https://github.com/VintLin/skill-flow/releases/latest")!

    enum UpdateStatus: Equatable {
        case idle
        case checking
        case upToDate
        case updateAvailable
        case failed
    }

    struct AgentDisplayRow: Identifiable, Equatable {
        let targetId: String
        let title: String
        let shortLabel: String
        let mountPath: String
        let isVisible: Bool

        var id: String { targetId }
    }

    nonisolated static let autoLaunchKey = "desktop.autoLaunch"
    nonisolated static let logLevelKey = "desktop.logLevel"
    nonisolated static let externalHelperKey = "desktop.experimentalExternalHelper"
    nonisolated static let themeModeKey = "desktop.themeMode"
    nonisolated static let themeAccentKey = "desktop.themeAccent"
    nonisolated static let homeCardDensityKey = "desktop.homeCardDensity"
    nonisolated static let menuCardDensityKey = "desktop.menuCardDensity"
    nonisolated static let agentDisplayPreferencesKey = "desktop.agentDisplayPreferences"

    private let state: DesktopAppState
    private let store: DesktopSettingsStore
    private let cacheMaintenance: DesktopCacheMaintenance
    private let updateChecker: any DesktopUpdateChecking
    private let currentVersionProvider: () -> String
    private let releaseURLOpener: (URL) -> Void
    private var hasPerformedBackgroundUpdateCheck = false

    private(set) var updateStatus: UpdateStatus = .idle
    private(set) var currentVersion: String
    private(set) var latestVersion: String?
    var releaseURL: URL?

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
        cacheMaintenance: DesktopCacheMaintenance = DesktopCacheMaintenance(),
        updateChecker: any DesktopUpdateChecking = DesktopGitHubUpdateChecker(),
        currentVersionProvider: @escaping () -> String = {
            Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        },
        releaseURLOpener: @escaping (URL) -> Void = { NSWorkspace.shared.open($0) }
    ) {
        self.state = state
        self.store = store
        self.cacheMaintenance = cacheMaintenance
        self.updateChecker = updateChecker
        self.currentVersionProvider = currentVersionProvider
        self.releaseURLOpener = releaseURLOpener
        self.currentVersion = currentVersionProvider()
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

    func detectedAgentRows(detectedTargetIds: [String]) -> [AgentDisplayRow] {
        let detectedSet = Set(detectedTargetIds)
        return normalizedAgentDisplayPreferences()
            .filter { detectedSet.contains($0.targetId) }
            .map { preference in
                AgentDisplayRow(
                    targetId: preference.targetId,
                    title: AgentDisplayCatalog.label(for: preference.targetId),
                    shortLabel: AgentDisplayCatalog.shortLabel(for: preference.targetId),
                    mountPath: AgentDisplayCatalog.mountPath(for: preference.targetId),
                    isVisible: preference.isVisible
                )
            }
    }

    func setAgentVisibility(targetId: String, isVisible: Bool) {
        var preferences = normalizedAgentDisplayPreferences()
        guard let index = preferences.firstIndex(where: { $0.targetId == targetId }) else {
            return
        }
        preferences[index].isVisible = isVisible
        persistAgentDisplayPreferences(preferences)
    }

    func moveAgents(from offsets: IndexSet, to destination: Int, detectedTargetIds: [String]) {
        let detectedOrder = AgentDisplayCatalog.orderedTargetIds(in: detectedTargetIds)
        let detectedSet = Set(detectedOrder)
        var preferences = normalizedAgentDisplayPreferences()
        var reorderedDetected = preferences.filter { detectedSet.contains($0.targetId) }

        guard !reorderedDetected.isEmpty else {
            return
        }

        reorderedDetected.move(fromOffsets: offsets, toOffset: destination)
        var reorderedIterator = reorderedDetected.makeIterator()

        preferences = preferences.map { preference in
            guard detectedSet.contains(preference.targetId), let reordered = reorderedIterator.next() else {
                return preference
            }
            return AgentDisplayPreference(
                targetId: reordered.targetId,
                isVisible: reordered.isVisible,
                sortOrder: preference.sortOrder
            )
        }

        persistAgentDisplayPreferences(preferences)
    }

    func resetAgentDisplayPreferences() {
        persistAgentDisplayPreferences(AgentDisplayCatalog.defaultPreferences())
    }

    func resetConfiguration() {
        state.settings = SettingsState()
        store.save(state.settings)
    }

    func clearMetadataCache() {
        cacheMaintenance.clearMetadataCache()
    }

    func checkForUpdates() async {
        updateStatus = .checking
        currentVersion = currentVersionProvider()

        do {
            let release = try await updateChecker.fetchLatestRelease()
            latestVersion = release.version
            releaseURL = release.releaseURL
            updateStatus = Self.isVersion(release.version, newerThan: currentVersion) ? .updateAvailable : .upToDate
        } catch {
            latestVersion = nil
            releaseURL = nil
            updateStatus = .failed
        }
    }

    func checkForUpdatesIfNeeded() async {
        guard !hasPerformedBackgroundUpdateCheck else {
            return
        }
        hasPerformedBackgroundUpdateCheck = true
        await checkForUpdates()
    }

    func openReleasePage() {
        releaseURLOpener(releaseURL ?? Self.latestReleasesURL)
    }

    private static func isVersion(_ lhs: String, newerThan rhs: String) -> Bool {
        lhs.compare(rhs, options: .numeric) == .orderedDescending
    }

    private func normalizedAgentDisplayPreferences() -> [AgentDisplayPreference] {
        AgentDisplayCatalog.normalize(state.settings.agentDisplayPreferences)
    }

    private func persistAgentDisplayPreferences(_ preferences: [AgentDisplayPreference]) {
        state.settings.agentDisplayPreferences = AgentDisplayCatalog.normalize(preferences)
        store.save(state.settings)
    }
}

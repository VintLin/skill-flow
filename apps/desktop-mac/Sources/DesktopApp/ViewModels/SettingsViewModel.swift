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
        case installing
        case installerOpened
        case upToDate
        case updateAvailable
        case runningNewerBuild
        case failed
    }

    struct AgentDisplayRow: Identifiable, Equatable {
        let targetId: String
        let title: String
        let shortLabel: String
        let mountPath: String
        let projectPath: String?
        let isVisible: Bool
        let isBuiltIn: Bool

        var id: String { targetId }
    }

    struct CustomAgentDraft: Equatable {
        var name: String = ""
        var globalPath: String = ""
        var projectPathTemplate: String = ""
        var strategy: String = "symlink"
    }

    nonisolated static let autoLaunchKey = "desktop.autoLaunch"
    nonisolated static let logLevelKey = "desktop.logLevel"
    nonisolated static let externalHelperKey = "desktop.experimentalExternalHelper"
    nonisolated static let themeModeKey = "desktop.themeMode"
    nonisolated static let themeAccentKey = "desktop.themeAccent"
    nonisolated static let homeCardDensityKey = "desktop.homeCardDensity"
    nonisolated static let menuCardDensityKey = "desktop.menuCardDensity"
    nonisolated static let selectedProjectScopeKey = "desktop.selectedProjectScope"
    nonisolated static let recentProjectScopesKey = "desktop.recentProjectScopes"
    nonisolated static let agentDisplayPreferencesKey = "desktop.agentDisplayPreferences"
    nonisolated static let customAgentsKey = "desktop.customAgents"

    private let state: DesktopAppState
    private let store: DesktopSettingsStore
    private let commandFacade: (any DesktopCommanding)?
    private let cacheMaintenance: DesktopCacheMaintenance
    private let updateChecker: any DesktopUpdateChecking
    private let currentVersionProvider: () -> String
    private let releaseURLOpener: (URL) -> Void
    private let updateInstaller: (URL) async throws -> Void
    private var hasPerformedBackgroundUpdateCheck = false

    private(set) var updateStatus: UpdateStatus = .idle
    private(set) var currentVersion: String
    private(set) var latestVersion: String?
    var releaseURL: URL?
    var installerURL: URL?

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
        commandFacade: (any DesktopCommanding)? = nil,
        cacheMaintenance: DesktopCacheMaintenance = DesktopCacheMaintenance(),
        updateChecker: any DesktopUpdateChecking = DesktopGitHubUpdateChecker(),
        currentVersionProvider: @escaping () -> String = {
            Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        },
        releaseURLOpener: @escaping (URL) -> Void = { NSWorkspace.shared.open($0) },
        updateInstaller: @escaping (URL) async throws -> Void = { try await DesktopUpdateInstaller.install(from: $0) }
    ) {
        self.state = state
        self.store = store
        self.commandFacade = commandFacade
        self.cacheMaintenance = cacheMaintenance
        self.updateChecker = updateChecker
        self.currentVersionProvider = currentVersionProvider
        self.releaseURLOpener = releaseURLOpener
        self.updateInstaller = updateInstaller
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
        return allAgentRows()
            .filter { $0.isBuiltIn ? detectedSet.contains($0.targetId) : true }
    }

    func allAgentRows() -> [AgentDisplayRow] {
        normalizedAgentDisplayPreferences().map { preference in
                AgentDisplayRow(
                    targetId: preference.targetId,
                    title: AgentDisplayCatalog.label(for: preference.targetId, customAgents: state.settings.customAgents),
                    shortLabel: AgentDisplayCatalog.shortLabel(for: preference.targetId, customAgents: state.settings.customAgents),
                    mountPath: AgentDisplayCatalog.mountPath(for: preference.targetId, customAgents: state.settings.customAgents),
                    projectPath: AgentDisplayCatalog.projectPath(for: preference.targetId, customAgents: state.settings.customAgents),
                    isVisible: preference.isVisible,
                    isBuiltIn: AgentDisplayCatalog.isBuiltIn(targetId: preference.targetId)
                )
            }
    }

    func customAgentDraft(editingId: String? = nil) -> CustomAgentDraft {
        guard let editingId, let customAgent = state.settings.customAgents.first(where: { $0.id == editingId }) else {
            return CustomAgentDraft()
        }
        return CustomAgentDraft(
            name: customAgent.name,
            globalPath: customAgent.globalPath,
            projectPathTemplate: customAgent.projectPathTemplate,
            strategy: customAgent.strategy
        )
    }

    func setAgentVisibility(targetId: String, isVisible: Bool) {
        var preferences = normalizedAgentDisplayPreferences()
        guard let index = preferences.firstIndex(where: { $0.targetId == targetId }) else {
            return
        }
        preferences[index].isVisible = isVisible
        persistAgentDisplayPreferences(preferences)
        syncSharedSettings()
    }

    func moveAgents(from offsets: IndexSet, to destination: Int, detectedTargetIds: [String]) {
        let detectedSet = Set(detectedTargetIds)
        let customTargetIds = Set(state.settings.customAgents.map(\.id))
        var preferences = normalizedAgentDisplayPreferences()
        var reorderedDetected = preferences.filter { preference in
            detectedSet.contains(preference.targetId) || customTargetIds.contains(preference.targetId)
        }

        guard !reorderedDetected.isEmpty else {
            return
        }

        reorderedDetected.move(fromOffsets: offsets, toOffset: destination)
        var reorderedIterator = reorderedDetected.makeIterator()

        preferences = preferences.map { preference in
            guard (detectedSet.contains(preference.targetId) || customTargetIds.contains(preference.targetId)),
                  let reordered = reorderedIterator.next() else {
                return preference
            }
            return AgentDisplayPreference(
                targetId: reordered.targetId,
                isVisible: reordered.isVisible,
                sortOrder: preference.sortOrder
            )
        }

        persistAgentDisplayPreferences(preferences)
        syncSharedSettings()
    }

    func resetAgentDisplayPreferences() {
        persistAgentDisplayPreferences(AgentDisplayCatalog.defaultPreferences(customAgents: state.settings.customAgents))
        syncSharedSettings()
    }

    var customAgents: [CustomAgentDefinition] {
        state.settings.customAgents.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    func upsertCustomAgent(
        _ draft: CustomAgentDraft,
        editingId: String? = nil
    ) -> [String: String] {
        let errors = validateCustomAgent(draft, editingId: editingId)
        guard errors.isEmpty else {
            return errors
        }

        let now = ISO8601DateFormatter().string(from: Date())
        let normalizedProjectPath = normalizeProjectPath(draft.projectPathTemplate) ?? draft.projectPathTemplate
        let trimmedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedGlobalPath = draft.globalPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedId = editingId ?? makeCustomAgentID(from: trimmedName)

        var customAgents = state.settings.customAgents
        if let index = customAgents.firstIndex(where: { $0.id == editingId }) {
            let createdAt = customAgents[index].createdAt
            customAgents[index] = CustomAgentDefinition(
                id: resolvedId,
                name: trimmedName,
                globalPath: trimmedGlobalPath,
                projectPathTemplate: normalizedProjectPath,
                strategy: draft.strategy,
                createdAt: createdAt,
                updatedAt: now
            )
        } else {
            customAgents.append(
                CustomAgentDefinition(
                    id: resolvedId,
                    name: trimmedName,
                    globalPath: trimmedGlobalPath,
                    projectPathTemplate: normalizedProjectPath,
                    strategy: draft.strategy,
                    createdAt: now,
                    updatedAt: now
                )
            )
        }

        state.settings.customAgents = customAgents
        var preferences = normalizedAgentDisplayPreferences()
        if !preferences.contains(where: { $0.targetId == resolvedId }) {
            preferences.append(AgentDisplayPreference(targetId: resolvedId, isVisible: true, sortOrder: preferences.count))
        }
        persistAgentDisplayPreferences(preferences)
        syncSharedSettings()
        return [:]
    }

    func deleteCustomAgent(id: String) {
        state.settings.customAgents.removeAll { $0.id == id }
        persistAgentDisplayPreferences(
            normalizedAgentDisplayPreferences().filter { $0.targetId != id }
        )
        syncSharedSettings()
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
            installerURL = release.installerURL
            if Self.isVersion(release.version, newerThan: currentVersion) {
                updateStatus = .updateAvailable
            } else if Self.isVersion(currentVersion, newerThan: release.version) {
                updateStatus = .runningNewerBuild
            } else {
                updateStatus = .upToDate
            }
        } catch {
            latestVersion = nil
            releaseURL = nil
            installerURL = nil
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

    func installUpdate() async {
        guard let installerURL else {
            openReleasePage()
            return
        }

        updateStatus = .installing
        do {
            try await updateInstaller(installerURL)
            updateStatus = .installerOpened
        } catch {
            updateStatus = .failed
        }
    }

    private static func isVersion(_ lhs: String, newerThan rhs: String) -> Bool {
        let lhsComponents = semanticVersionComponents(lhs)
        let rhsComponents = semanticVersionComponents(rhs)
        guard !lhsComponents.isEmpty, !rhsComponents.isEmpty else {
            return lhs.compare(rhs, options: [.caseInsensitive, .numeric]) == .orderedDescending
        }

        let count = max(lhsComponents.count, rhsComponents.count)
        for index in 0..<count {
            let lhsValue = index < lhsComponents.count ? lhsComponents[index] : 0
            let rhsValue = index < rhsComponents.count ? rhsComponents[index] : 0
            if lhsValue != rhsValue {
                return lhsValue > rhsValue
            }
        }
        return false
    }

    private static func semanticVersionComponents(_ rawValue: String) -> [Int] {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let withoutPrefix = trimmed.hasPrefix("v") || trimmed.hasPrefix("V")
            ? String(trimmed.dropFirst())
            : trimmed
        let prefix = withoutPrefix.split(separator: "-", maxSplits: 1).first.map(String.init) ?? withoutPrefix
        let components = prefix.split(separator: ".").compactMap { Int($0) }
        return components.count == prefix.split(separator: ".").count ? components : []
    }

    private func normalizedAgentDisplayPreferences() -> [AgentDisplayPreference] {
        AgentDisplayCatalog.normalize(state.settings.agentDisplayPreferences, customAgents: state.settings.customAgents)
    }

    private func persistAgentDisplayPreferences(_ preferences: [AgentDisplayPreference]) {
        state.settings.agentDisplayPreferences = AgentDisplayCatalog.normalize(preferences, customAgents: state.settings.customAgents)
        store.save(state.settings)
    }

    private func syncSharedSettings() {
        guard let commandFacade else {
            return
        }

        let customTargets = state.settings.customAgents.map { agent in
            [
                "id": agent.id,
                "name": agent.name,
                "globalPath": agent.globalPath,
                "projectPathTemplate": agent.projectPathTemplate,
                "strategy": agent.strategy,
                "createdAt": agent.createdAt,
                "updatedAt": agent.updatedAt,
            ]
        }
        let order = normalizedAgentDisplayPreferences().map(\.targetId)

        Task {
            _ = try? await commandFacade.saveSettings(
                customTargets: customTargets,
                agentDisplayOrder: order
            )
        }
    }

    private func validateCustomAgent(_ draft: CustomAgentDraft, editingId: String?) -> [String: String] {
        var errors: [String: String] = [:]
        let trimmedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedGlobalPath = draft.globalPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedProjectPath = normalizeProjectPath(draft.projectPathTemplate)

        if trimmedName.isEmpty {
            errors["name"] = "Name is required."
        }

        if trimmedGlobalPath.isEmpty {
            errors["globalPath"] = "Global path is required."
        } else if !trimmedGlobalPath.hasPrefix("/") {
            errors["globalPath"] = "Global path must be absolute."
        }

        if normalizedProjectPath == nil {
            errors["projectPathTemplate"] = "Project path must be relative."
        }

        if state.settings.customAgents.contains(where: {
            $0.name.compare(trimmedName, options: .caseInsensitive) == .orderedSame && $0.id != editingId
        }) {
            errors["name"] = "Name is already in use."
        }

        return errors
    }

    private func normalizeProjectPath(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.hasPrefix("/") else {
            return nil
        }
        let normalized = trimmed.replacingOccurrences(of: "\\", with: "/")
            .replacingOccurrences(of: #"^\./+"#, with: "", options: .regularExpression)
        guard !normalized.isEmpty, !normalized.hasPrefix("../"), normalized != ".", normalized != ".." else {
            return nil
        }
        return normalized
    }

    private func makeCustomAgentID(from name: String) -> String {
        let builtInIds = Set(AgentDisplayCatalog.defaultTargetOrder)
        let slug = name
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let base = slug.isEmpty ? "custom-agent" : slug
        var candidate = base
        var suffix = 2

        while builtInIds.contains(candidate) || state.settings.customAgents.contains(where: { $0.id == candidate }) {
            candidate = "\(base)-\(suffix)"
            suffix += 1
        }

        return candidate
    }
}

import Foundation

private final class DesktopTagCollectionSnapshot {
    var value: GroupTagCollection?
}

private final class DesktopFileMigrationState {
    var blocked = false
}

private struct DesktopWorkspaceFile: Codable {
    static let currentSchemaVersion = 1
    var schemaVersion: Int = Self.currentSchemaVersion
    var migrationGeneration: String
    var agentDisplayVisibility: [String: Bool]
    var groupTags: GroupTagCollection
}

/// Durable desktop-only organization state.
///
/// Production uses `~/.skillflow/desktop.json`; injected UserDefaults remain available
/// for isolated legacy tests. UserDefaults are read-only migration inputs in production.
struct DesktopWorkspaceMemoryStore {
    static let suiteName = "com.skillflow.desktop.shared"
    static let migrationCompletedKey = "desktop.workspaceMemory.migrationCompleted"

    static let agentDisplayPreferencesKey = "desktop.agentDisplayPreferences"
    static let tagCollectionKey = "desktop.groupTags.v2.tagsByGroupKey"
    static let legacyCustomTagsKey = GroupTagMigration.legacyCustomTagsKey

    private static let workspaceMemoryKeys = [
        agentDisplayPreferencesKey,
        tagCollectionKey,
        legacyCustomTagsKey,
    ]

    static let knownLegacyBundleDomains: [String] = [
        "com.skillflow.desktop.universal",
        "com.skillflow.desktop.arm64",
        "com.skillflow.desktop.x86_64",
        "com.skillflow.desktop.dev.universal",
        "com.skillflow.desktop.dev.arm64",
        "com.skillflow.desktop.dev.x86_64",
    ]

    let userDefaults: UserDefaults
    private let stateRootURL: URL?
    private let legacyDomainNames: [String]
    private let legacyDomainReader: (String) -> [String: Any]?
    private let tagCollectionSnapshot = DesktopTagCollectionSnapshot()
    private let fileMigrationState = DesktopFileMigrationState()
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    static func makeShared() -> DesktopWorkspaceMemoryStore {
        let store = DesktopWorkspaceMemoryStore(
            stateRootURL: defaultStateRootURL(),
            suiteUserDefaults: makeSharedSuiteUserDefaults()
        )
        store.ensureMigratedFromLegacyDomains()
        return store
    }

    static func makeSharedSuiteUserDefaults() -> UserDefaults {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            preconditionFailure("DesktopWorkspaceMemoryStore: failed to open shared suite \(suiteName)")
        }
        return defaults
    }

    static func defaultLegacyDomainNames() -> [String] {
        var names = knownLegacyBundleDomains
        if let bundleId = Bundle.main.bundleIdentifier, !names.contains(bundleId) {
            names.append(bundleId)
        }
        return names
    }

    static func defaultStateRootURL() -> URL {
        if let rawRoot = ProcessInfo.processInfo.environment["SKILL_FLOW_STATE_ROOT"], !rawRoot.isEmpty {
            return URL(fileURLWithPath: rawRoot, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".skillflow", isDirectory: true)
    }

    init(
        userDefaults: UserDefaults,
        legacyDomainNames: [String] = DesktopWorkspaceMemoryStore.defaultLegacyDomainNames(),
        legacyDomainReader: @escaping (String) -> [String: Any]? = { UserDefaults.standard.persistentDomain(forName: $0) }
    ) {
        self.userDefaults = userDefaults
        self.stateRootURL = nil
        self.legacyDomainNames = legacyDomainNames
        self.legacyDomainReader = legacyDomainReader
    }

    init(
        stateRootURL: URL,
        suiteUserDefaults: UserDefaults,
        legacyDomainNames: [String] = DesktopWorkspaceMemoryStore.defaultLegacyDomainNames(),
        legacyDomainReader: @escaping (String) -> [String: Any]? = { UserDefaults.standard.persistentDomain(forName: $0) }
    ) {
        self.userDefaults = suiteUserDefaults
        self.stateRootURL = stateRootURL
        self.legacyDomainNames = legacyDomainNames
        self.legacyDomainReader = legacyDomainReader
    }

    func loadAgentDisplayPreferences() -> [AgentDisplayPreference] {
        ensureMigratedFromLegacyDomains()
        if stateRootURL != nil {
            guard let file = readDesktopFile() else { return [] }
            var preferences = AgentDisplayCatalog.defaultPreferences().map { preference in
                var preference = preference
                preference.isVisible = file.agentDisplayVisibility[preference.targetId] ?? true
                return preference
            }
            let knownTargetIds = Set(preferences.map(\.targetId))
            let unknownPreferences = file.agentDisplayVisibility.keys
                .filter { !knownTargetIds.contains($0) }
                .sorted()
                .enumerated()
                .map { index, targetId in
                    AgentDisplayPreference(
                        targetId: targetId,
                        isVisible: file.agentDisplayVisibility[targetId] ?? true,
                        sortOrder: preferences.count + index
                    )
                }
            preferences.append(contentsOf: unknownPreferences)
            return preferences
        }
        guard let data = userDefaults.data(forKey: Self.agentDisplayPreferencesKey) else { return [] }
        return (try? decoder.decode([AgentDisplayPreference].self, from: data)) ?? []
    }

    func saveAgentDisplayPreferences(_ preferences: [AgentDisplayPreference]) {
        ensureMigratedFromLegacyDomains()
        if stateRootURL != nil {
            updateDesktopFile { file in
                var next = file
                next.agentDisplayVisibility = Dictionary(uniqueKeysWithValues: preferences.map { ($0.targetId, $0.isVisible) })
                return next
            }
            return
        }
        userDefaults.set(try? encoder.encode(preferences), forKey: Self.agentDisplayPreferencesKey)
    }

    func loadTagCollection() -> GroupTagCollection {
        ensureMigratedFromLegacyDomains()
        if stateRootURL != nil {
            let collection = readDesktopFile()?.groupTags ?? GroupTagCollection()
            tagCollectionSnapshot.value = collection
            return collection
        }

        let collection: GroupTagCollection
        if let data = userDefaults.data(forKey: Self.tagCollectionKey),
           let decoded = try? decoder.decode(GroupTagCollection.self, from: data),
           decoded.schemaVersion <= GroupTagCollection.currentSchemaVersion {
            collection = decoded
        } else {
            collection = migrateLegacyStoredTagsIfNeeded() ?? GroupTagCollection()
        }
        tagCollectionSnapshot.value = collection
        return collection
    }

    func saveTagCollection(_ tagCollection: GroupTagCollection) {
        ensureMigratedFromLegacyDomains()
        if stateRootURL != nil {
            updateDesktopFile { file in
                var next = file
                next.groupTags = mergeTagCollection(tagCollection, onto: file.groupTags, baseline: tagCollectionSnapshot.value)
                return next
            }
            tagCollectionSnapshot.value = readDesktopFile()?.groupTags
            return
        }

        let latest = readTagCollectionFromSuite() ?? GroupTagCollection()
        let merged = mergeTagCollection(tagCollection, onto: latest, baseline: tagCollectionSnapshot.value)
        writeTagCollection(merged)
        tagCollectionSnapshot.value = merged
    }

    /// Creates `desktop.json` from read-only UserDefaults snapshots.
    /// A malformed new file is backed up and left in place, so this path cannot replace it with empty state.
    func ensureMigratedFromLegacyDomains() {
        guard let stateRootURL else {
            ensureSuiteMigratedFromLegacyDomains()
            return
        }
        guard !fileMigrationState.blocked else { return }
        let fileURL = desktopFileURL(for: stateRootURL)
        guard !FileManager.default.fileExists(atPath: fileURL.path) else {
            if readDesktopFile() == nil { fileMigrationState.blocked = true }
            return
        }
        writeDesktopFile(migrateLegacyCandidates(legacyCandidates()))
    }

    func suiteHasWorkspaceMemoryData() -> Bool {
        Self.workspaceMemoryKeys.contains { userDefaults.data(forKey: $0) != nil }
    }

    private func readDesktopFile() -> DesktopWorkspaceFile? {
        guard let stateRootURL else { return nil }
        guard !fileMigrationState.blocked else { return nil }
        let fileURL = desktopFileURL(for: stateRootURL)
        guard let data = try? Data(contentsOf: fileURL),
              let file = try? decoder.decode(DesktopWorkspaceFile.self, from: data),
              file.schemaVersion == DesktopWorkspaceFile.currentSchemaVersion,
              file.migrationGeneration.hasPrefix("mg_"),
              file.groupTags.schemaVersion <= GroupTagCollection.currentSchemaVersion else {
            if FileManager.default.fileExists(atPath: fileURL.path) { backupInvalidDesktopFile(fileURL, stateRootURL: stateRootURL) }
            return nil
        }
        return file
    }

    private func writeDesktopFile(_ file: DesktopWorkspaceFile) {
        guard let stateRootURL, !fileMigrationState.blocked else { return }
        do {
            try FileManager.default.createDirectory(at: stateRootURL, withIntermediateDirectories: true)
            try withDesktopFileLock(stateRootURL: stateRootURL) {
                try encoder.encode(file).write(to: desktopFileURL(for: stateRootURL), options: .atomic)
            }
        } catch {
            assertionFailure("DesktopWorkspaceMemoryStore failed to write desktop.json: \(error)")
        }
    }

    private func updateDesktopFile(_ update: (DesktopWorkspaceFile) -> DesktopWorkspaceFile) {
        guard let stateRootURL, !fileMigrationState.blocked else { return }
        do {
            try withDesktopFileLock(stateRootURL: stateRootURL) {
                guard let current = readDesktopFile() else { return }
                try encoder.encode(update(current)).write(to: desktopFileURL(for: stateRootURL), options: .atomic)
            }
        } catch {
            assertionFailure("DesktopWorkspaceMemoryStore failed to update desktop.json: \(error)")
        }
    }

    private func backupInvalidDesktopFile(_ fileURL: URL, stateRootURL: URL) {
        let backup = stateRootURL.appendingPathComponent(
            "desktop.json.invalid-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString).bak"
        )
        try? FileManager.default.copyItem(at: fileURL, to: backup)
    }

    private func desktopFileURL(for stateRootURL: URL) -> URL {
        stateRootURL.appendingPathComponent("desktop.json", isDirectory: false)
    }

    private func withDesktopFileLock<T>(stateRootURL: URL, _ body: () throws -> T) throws -> T {
        let fileManager = FileManager.default
        let lockURL = stateRootURL.appendingPathComponent(".desktop-workspace.lock", isDirectory: true)
        let deadline = Date().addingTimeInterval(120)
        while true {
            do {
                try fileManager.createDirectory(at: lockURL, withIntermediateDirectories: false)
                defer { try? fileManager.removeItem(at: lockURL) }
                return try body()
            } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileWriteFileExistsError {
                guard Date() < deadline else { throw error }
                usleep(25_000)
            }
        }
    }

    private func legacyCandidates() -> [LegacyWorkspaceCandidate] {
        var candidates: [LegacyWorkspaceCandidate] = []
        if let candidate = LegacyWorkspaceCandidate(priority: 300, values: workspaceValues(from: userDefaults)) {
            candidates.append(candidate)
        }
        for domainName in legacyDomainNames {
            guard let values = legacyDomainReader(domainName),
                  let candidate = LegacyWorkspaceCandidate(
                    priority: domainName.contains(".dev.") ? 100 : 200,
                    values: values
                  ) else { continue }
            candidates.append(candidate)
        }
        return candidates.sorted { $0.priority > $1.priority }
    }

    private func workspaceValues(from defaults: UserDefaults) -> [String: Any] {
        var values: [String: Any] = [:]
        for key in Self.workspaceMemoryKeys {
            if let data = defaults.data(forKey: key) { values[key] = data }
        }
        return values
    }

    private func migrateLegacyCandidates(_ candidates: [LegacyWorkspaceCandidate]) -> DesktopWorkspaceFile {
        var visibility: [String: Bool] = [:]
        var tagsByGroupKey: [String: [GroupTagPreference]] = [:]
        var orderedTagKeys: [String] = []
        var orderingMode: TagOrderingMode = .defaultCount

        for candidate in candidates {
            for preference in candidate.agentDisplayPreferences where visibility[preference.targetId] == nil {
                visibility[preference.targetId] = preference.isVisible
            }
            guard let collection = candidate.groupTags else { continue }
            for (key, tags) in collection.tagsByGroupKey where !tags.isEmpty && tagsByGroupKey[key] == nil {
                tagsByGroupKey[key] = tags
            }
            if orderedTagKeys.isEmpty && !collection.orderedTagKeys.isEmpty { orderedTagKeys = collection.orderedTagKeys }
            if orderingMode == .defaultCount && collection.orderingMode != .defaultCount { orderingMode = collection.orderingMode }
        }

        return DesktopWorkspaceFile(
            migrationGeneration: "mg_\(UUID().uuidString)",
            agentDisplayVisibility: visibility,
            groupTags: GroupTagCollection(
                schemaVersion: GroupTagCollection.currentSchemaVersion,
                tagsByGroupKey: tagsByGroupKey,
                orderedTagKeys: orderedTagKeys,
                orderingMode: orderingMode
            )
        )
    }

    private func ensureSuiteMigratedFromLegacyDomains() {
        if userDefaults.bool(forKey: Self.migrationCompletedKey) { return }
        for candidate in legacyCandidates() { copyMissingWorkspaceKeys(from: candidate.values) }
        userDefaults.set(true, forKey: Self.migrationCompletedKey)
    }

    private func migrateLegacyStoredTagsIfNeeded() -> GroupTagCollection? {
        let collection = GroupTagMigration.migrateLegacyStoredTags(
            legacyData: userDefaults.data(forKey: Self.legacyCustomTagsKey),
            decoder: decoder
        )
        if let collection { writeTagCollection(collection) }
        return collection
    }

    private func writeTagCollection(_ tagCollection: GroupTagCollection) {
        userDefaults.set(try? encoder.encode(tagCollection), forKey: Self.tagCollectionKey)
    }

    private func readTagCollectionFromSuite() -> GroupTagCollection? {
        guard let data = userDefaults.data(forKey: Self.tagCollectionKey),
              let decoded = try? decoder.decode(GroupTagCollection.self, from: data),
              decoded.schemaVersion <= GroupTagCollection.currentSchemaVersion else { return nil }
        return decoded
    }

    private func mergeTagCollection(
        _ incoming: GroupTagCollection,
        onto latest: GroupTagCollection,
        baseline: GroupTagCollection?
    ) -> GroupTagCollection {
        guard let baseline else { return incoming }
        var merged = latest
        let groupKeys = Set(baseline.tagsByGroupKey.keys).union(incoming.tagsByGroupKey.keys)
        for key in groupKeys where baseline.tagsByGroupKey[key] != incoming.tagsByGroupKey[key] {
            if let tags = incoming.tagsByGroupKey[key] { merged.tagsByGroupKey[key] = tags }
            else { merged.tagsByGroupKey.removeValue(forKey: key) }
        }
        if baseline.schemaVersion != incoming.schemaVersion { merged.schemaVersion = incoming.schemaVersion }
        if baseline.orderedTagKeys != incoming.orderedTagKeys { merged.orderedTagKeys = incoming.orderedTagKeys }
        if baseline.orderingMode != incoming.orderingMode { merged.orderingMode = incoming.orderingMode }
        return merged
    }

    private func copyMissingWorkspaceKeys(from values: [String: Any]) {
        for key in Self.workspaceMemoryKeys {
            guard userDefaults.data(forKey: key) == nil, let data = values[key] as? Data else { continue }
            userDefaults.set(data, forKey: key)
        }
    }
}

private struct LegacyWorkspaceCandidate {
    let priority: Int
    let values: [String: Any]
    let agentDisplayPreferences: [AgentDisplayPreference]
    let groupTags: GroupTagCollection?

    init?(priority: Int, values: [String: Any]) {
        self.priority = priority
        self.values = values
        let decoder = JSONDecoder()
        let agentData = values[DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey] as? Data
        self.agentDisplayPreferences = agentData.flatMap { try? decoder.decode([AgentDisplayPreference].self, from: $0) } ?? []

        if let tagData = values[DesktopWorkspaceMemoryStore.tagCollectionKey] as? Data,
           let collection = try? decoder.decode(GroupTagCollection.self, from: tagData),
           collection.schemaVersion <= GroupTagCollection.currentSchemaVersion {
            self.groupTags = collection
        } else {
            self.groupTags = GroupTagMigration.migrateLegacyStoredTags(
                legacyData: values[DesktopWorkspaceMemoryStore.legacyCustomTagsKey] as? Data,
                decoder: decoder
            )
        }

        guard !agentDisplayPreferences.isEmpty || groupTags != nil else { return nil }
    }
}

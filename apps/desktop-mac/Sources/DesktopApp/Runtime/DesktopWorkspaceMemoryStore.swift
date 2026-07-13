import Foundation

/// Shared Desktop Suite storage for Desktop Workspace Memory (agent display preferences + group tags).
/// Cross-bundle on one Mac; not part of Shared Skill State (`~/.skillflow`).
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

    /// Known Skill Flow desktop package domains (production + dev packaging variants).
    static let knownLegacyBundleDomains: [String] = [
        "com.skillflow.desktop.universal",
        "com.skillflow.desktop.arm64",
        "com.skillflow.desktop.x86_64",
        "com.skillflow.desktop.dev.universal",
        "com.skillflow.desktop.dev.arm64",
        "com.skillflow.desktop.dev.x86_64",
    ]

    let userDefaults: UserDefaults
    private let legacyDomainNames: [String]
    private let legacyDomainReader: (String) -> [String: Any]?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    /// Production store backed by the fixed shared suite, with one-shot legacy migration.
    /// Each call returns a lightweight value over the same suite; migration is idempotent.
    static func makeShared() -> DesktopWorkspaceMemoryStore {
        let store = DesktopWorkspaceMemoryStore(userDefaults: makeSharedSuiteUserDefaults())
        store.ensureMigratedFromLegacyDomains()
        return store
    }

    static func makeSharedSuiteUserDefaults() -> UserDefaults {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            preconditionFailure(
                "DesktopWorkspaceMemoryStore: failed to open shared suite \(suiteName)"
            )
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

    init(
        userDefaults: UserDefaults,
        legacyDomainNames: [String] = DesktopWorkspaceMemoryStore.defaultLegacyDomainNames(),
        legacyDomainReader: @escaping (String) -> [String: Any]? = { UserDefaults.standard.persistentDomain(forName: $0) }
    ) {
        self.userDefaults = userDefaults
        self.legacyDomainNames = legacyDomainNames
        self.legacyDomainReader = legacyDomainReader
    }

    // MARK: - Agent display preferences

    func loadAgentDisplayPreferences() -> [AgentDisplayPreference] {
        ensureMigratedFromLegacyDomains()
        guard let data = userDefaults.data(forKey: Self.agentDisplayPreferencesKey) else {
            return []
        }
        return (try? decoder.decode([AgentDisplayPreference].self, from: data)) ?? []
    }

    func saveAgentDisplayPreferences(_ preferences: [AgentDisplayPreference]) {
        ensureMigratedFromLegacyDomains()
        let encoded = try? encoder.encode(preferences)
        userDefaults.set(encoded, forKey: Self.agentDisplayPreferencesKey)
    }

    // MARK: - Group tags

    func loadTagCollection() -> GroupTagCollection {
        ensureMigratedFromLegacyDomains()
        guard let data = userDefaults.data(forKey: Self.tagCollectionKey) else {
            return migrateLegacyStoredTagsIfNeeded() ?? GroupTagCollection()
        }

        guard let decoded = try? decoder.decode(GroupTagCollection.self, from: data),
              decoded.schemaVersion == GroupTagCollection.currentSchemaVersion else {
            return migrateLegacyStoredTagsIfNeeded() ?? GroupTagCollection()
        }

        return decoded
    }

    func saveTagCollection(_ tagCollection: GroupTagCollection) {
        ensureMigratedFromLegacyDomains()
        writeTagCollection(tagCollection)
    }

    // MARK: - One-shot suite migration

    /// One-shot import from the best legacy per-bundle domain.
    ///
    /// Invariants:
    /// - Gated only by `migrationCompletedKey` (not by partial suite data).
    /// - Picks a single legacy domain; never field-merges multiple domains.
    /// - Copies only keys that are still missing in the suite so an early partial write
    ///   cannot permanently suppress import of the other key family.
    /// - Never deletes or mutates legacy domain keys.
    func ensureMigratedFromLegacyDomains() {
        if userDefaults.bool(forKey: Self.migrationCompletedKey) {
            return
        }

        let candidates = legacyDomainNames.compactMap { domainName -> LegacyDomainCandidate? in
            guard let values = legacyDomainReader(domainName) else {
                return nil
            }
            let candidate = LegacyDomainCandidate(domainName: domainName, values: values, decoder: decoder)
            guard candidate.hasAnyWorkspaceMemory else {
                return nil
            }
            return candidate
        }

        if let best = candidates.max(by: { $0.selectionRank < $1.selectionRank }) {
            copyMissingWorkspaceKeys(from: best.values)
        }

        userDefaults.set(true, forKey: Self.migrationCompletedKey)
    }

    func suiteHasWorkspaceMemoryData() -> Bool {
        Self.workspaceMemoryKeys.contains { userDefaults.data(forKey: $0) != nil }
    }

    // MARK: - Private

    private func migrateLegacyStoredTagsIfNeeded() -> GroupTagCollection? {
        let collection = GroupTagMigration.migrateLegacyStoredTags(
            legacyData: userDefaults.data(forKey: Self.legacyCustomTagsKey),
            decoder: decoder
        )
        if let collection {
            // Write directly: migration already ran for this load path.
            writeTagCollection(collection)
        }
        return collection
    }

    private func writeTagCollection(_ tagCollection: GroupTagCollection) {
        let encoded = try? encoder.encode(tagCollection)
        userDefaults.set(encoded, forKey: Self.tagCollectionKey)
    }

    /// Copy workspace keys from one legacy domain without overwriting suite values already present.
    private func copyMissingWorkspaceKeys(from values: [String: Any]) {
        for key in Self.workspaceMemoryKeys {
            guard userDefaults.data(forKey: key) == nil else {
                continue
            }
            if let data = values[key] as? Data {
                userDefaults.set(data, forKey: key)
            }
        }
    }
}

// MARK: - Legacy candidate selection

private struct LegacyDomainCandidate {
    let domainName: String
    let values: [String: Any]
    let hasHiddenAgents: Bool
    let hasGroupTagsWithContent: Bool
    let hasAnyWorkspaceMemory: Bool

    init(domainName: String, values: [String: Any], decoder: JSONDecoder) {
        self.domainName = domainName
        self.values = values

        let agentData = values[DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey] as? Data
        let tagData = values[DesktopWorkspaceMemoryStore.tagCollectionKey] as? Data
        let legacyTagData = values[DesktopWorkspaceMemoryStore.legacyCustomTagsKey] as? Data

        self.hasAnyWorkspaceMemory = agentData != nil || tagData != nil || legacyTagData != nil

        if let agentData,
           let preferences = try? decoder.decode([AgentDisplayPreference].self, from: agentData) {
            self.hasHiddenAgents = preferences.contains(where: { !$0.isVisible })
        } else {
            self.hasHiddenAgents = false
        }

        var tagsWithContent = false
        if let tagData,
           let collection = try? decoder.decode(GroupTagCollection.self, from: tagData),
           collection.tagsByGroupKey.contains(where: { !$0.value.isEmpty }) {
            tagsWithContent = true
        }
        if !tagsWithContent, let legacyTagData {
            if let multi = try? decoder.decode([String: [GroupTagPreference]].self, from: legacyTagData),
               multi.contains(where: { !$0.value.isEmpty }) {
                tagsWithContent = true
            } else if let single = try? decoder.decode([String: GroupTagPreference].self, from: legacyTagData),
                      !single.isEmpty {
                tagsWithContent = true
            }
        }
        self.hasGroupTagsWithContent = tagsWithContent
    }

    var isDevDomain: Bool {
        domainName.contains(".dev.")
    }

    var isSubstantial: Bool {
        hasHiddenAgents || hasGroupTagsWithContent
    }

    /// Higher is better: substantial first, then non-dev.
    /// Candidates are pre-filtered to those with workspace memory data.
    var selectionRank: (Int, Int) {
        (
            isSubstantial ? 1 : 0,
            isDevDomain ? 0 : 1
        )
    }
}

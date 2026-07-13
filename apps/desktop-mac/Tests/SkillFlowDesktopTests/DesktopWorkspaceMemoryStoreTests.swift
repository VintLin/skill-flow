import XCTest

@testable import SkillFlowDesktop

final class DesktopWorkspaceMemoryStoreTests: XCTestCase {
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    func testEmptySuiteMigratesVisibilityAndTagsFromRichLegacyDomain() throws {
        let suiteName = uniqueName("migrate-rich")
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)

        let productionDomain = "com.skillflow.desktop.universal"
        let preferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
            AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 1),
        ]
        let tags = GroupTagCollection(tagsByGroupKey: [
            "source:alpha": [GroupTagPreference(title: "Design", accentRawValue: DesktopAccentColor.blue.rawValue)]
        ])
        let legacyValues = try workspaceValues(preferences: preferences, tags: tags)

        let store = DesktopWorkspaceMemoryStore(
            userDefaults: suite,
            legacyDomainNames: [productionDomain, "com.skillflow.desktop.dev.arm64"],
            legacyDomainReader: { domain in
                domain == productionDomain ? legacyValues : nil
            }
        )

        store.ensureMigratedFromLegacyDomains()

        let loadedPreferences = store.loadAgentDisplayPreferences()
        XCTAssertEqual(loadedPreferences.map(\.targetId), ["codex", "claude-code"])
        XCTAssertEqual(loadedPreferences.first?.isVisible, false)
        XCTAssertEqual(
            store.loadTagCollection().tagsByGroupKey["source:alpha"]?.map(\.title),
            ["Design"]
        )
        XCTAssertTrue(suite.bool(forKey: DesktopWorkspaceMemoryStore.migrationCompletedKey))
    }

    func testPrefersNonDevRichDomainOverEmptyLookingDevDomain() throws {
        let suiteName = uniqueName("prefer-non-dev")
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)

        let productionDomain = "com.skillflow.desktop.universal"
        let devDomain = "com.skillflow.desktop.dev.arm64"

        let richPreferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
            AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 1),
        ]
        let emptyLookingPreferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: true, sortOrder: 0),
            AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 1),
        ]
        let richTags = GroupTagCollection(tagsByGroupKey: [
            "source:prod": [GroupTagPreference(title: "ProdTag", accentRawValue: DesktopAccentColor.purple.rawValue)]
        ])

        let productionValues = try workspaceValues(preferences: richPreferences, tags: richTags)
        let devValues = try workspaceValues(preferences: emptyLookingPreferences, tags: GroupTagCollection())

        let store = DesktopWorkspaceMemoryStore(
            userDefaults: suite,
            legacyDomainNames: [devDomain, productionDomain],
            legacyDomainReader: { domain in
                switch domain {
                case productionDomain: return productionValues
                case devDomain: return devValues
                default: return nil
                }
            }
        )

        store.ensureMigratedFromLegacyDomains()

        XCTAssertEqual(store.loadAgentDisplayPreferences().first?.isVisible, false)
        XCTAssertEqual(
            store.loadTagCollection().tagsByGroupKey["source:prod"]?.map(\.title),
            ["ProdTag"]
        )
    }

    func testSuiteAlreadyPopulatedDoesNotOverwriteExistingKeysFromLegacy() throws {
        let suiteName = uniqueName("no-remigrate")
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)

        let existingPreferences = [
            AgentDisplayPreference(targetId: "cursor", isVisible: false, sortOrder: 0),
        ]
        let existingTags = GroupTagCollection(tagsByGroupKey: [
            "source:suite": [GroupTagPreference(title: "SuiteTag", accentRawValue: DesktopAccentColor.green.rawValue)]
        ])
        suite.set(try encoder.encode(existingPreferences), forKey: DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey)
        suite.set(try encoder.encode(existingTags), forKey: DesktopWorkspaceMemoryStore.tagCollectionKey)

        let productionDomain = "com.skillflow.desktop.universal"
        let legacyPreferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
        ]
        let legacyTags = GroupTagCollection(tagsByGroupKey: [
            "source:legacy": [GroupTagPreference(title: "LegacyTag", accentRawValue: DesktopAccentColor.orange.rawValue)]
        ])
        let legacyValues = try workspaceValues(preferences: legacyPreferences, tags: legacyTags)

        let store = DesktopWorkspaceMemoryStore(
            userDefaults: suite,
            legacyDomainNames: [productionDomain],
            legacyDomainReader: { _ in legacyValues }
        )

        store.ensureMigratedFromLegacyDomains()

        XCTAssertEqual(store.loadAgentDisplayPreferences().map(\.targetId), ["cursor"])
        XCTAssertEqual(
            store.loadTagCollection().tagsByGroupKey["source:suite"]?.map(\.title),
            ["SuiteTag"]
        )
        XCTAssertNil(store.loadTagCollection().tagsByGroupKey["source:legacy"])
        XCTAssertTrue(suite.bool(forKey: DesktopWorkspaceMemoryStore.migrationCompletedKey))
    }

    func testPartialSuiteStillImportsMissingKeyFamilyFromLegacy() throws {
        let suiteName = uniqueName("partial-suite")
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)

        // Early write of agent prefs only (as if save ran before full migration).
        suite.set(
            try encoder.encode([
                AgentDisplayPreference(targetId: "cursor", isVisible: true, sortOrder: 0),
            ]),
            forKey: DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey
        )

        let productionDomain = "com.skillflow.desktop.universal"
        let legacyValues = try workspaceValues(
            preferences: [
                AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
            ],
            tags: GroupTagCollection(tagsByGroupKey: [
                "source:legacy": [GroupTagPreference(title: "Imported", accentRawValue: DesktopAccentColor.blue.rawValue)]
            ])
        )

        let store = DesktopWorkspaceMemoryStore(
            userDefaults: suite,
            legacyDomainNames: [productionDomain],
            legacyDomainReader: { domain in
                domain == productionDomain ? legacyValues : nil
            }
        )
        store.ensureMigratedFromLegacyDomains()

        // Existing agent prefs are preserved; missing tags are filled from the same best domain.
        XCTAssertEqual(store.loadAgentDisplayPreferences().map(\.targetId), ["cursor"])
        XCTAssertEqual(
            store.loadTagCollection().tagsByGroupKey["source:legacy"]?.map(\.title),
            ["Imported"]
        )
    }

    func testMigrationCompletedFlagSkipsLegacyReadsEvenWhenSuiteEmpty() throws {
        let suiteName = uniqueName("flag-gates")
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)
        suite.set(true, forKey: DesktopWorkspaceMemoryStore.migrationCompletedKey)

        let productionDomain = "com.skillflow.desktop.universal"
        let legacyValues = try workspaceValues(
            preferences: [
                AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
            ],
            tags: GroupTagCollection(tagsByGroupKey: [
                "source:legacy": [GroupTagPreference(title: "ShouldNotImport", accentRawValue: DesktopAccentColor.blue.rawValue)]
            ])
        )

        var readCount = 0
        let store = DesktopWorkspaceMemoryStore(
            userDefaults: suite,
            legacyDomainNames: [productionDomain],
            legacyDomainReader: { _ in
                readCount += 1
                return legacyValues
            }
        )

        store.ensureMigratedFromLegacyDomains()
        store.ensureMigratedFromLegacyDomains()

        XCTAssertEqual(readCount, 0)
        XCTAssertTrue(store.loadAgentDisplayPreferences().isEmpty)
        XCTAssertTrue(store.loadTagCollection().tagsByGroupKey.isEmpty)
    }

    func testMigrationLeavesLegacyDomainValuesUnchanged() throws {
        let suiteName = uniqueName("legacy-intact")
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)

        let productionDomain = "com.skillflow.desktop.universal"
        let preferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
        ]
        let tags = GroupTagCollection(tagsByGroupKey: [
            "source:alpha": [GroupTagPreference(title: "Design", accentRawValue: DesktopAccentColor.blue.rawValue)]
        ])
        let originalLegacy = try workspaceValues(preferences: preferences, tags: tags)
        let legacyBox = LegacyDomainBox(values: originalLegacy)

        let store = DesktopWorkspaceMemoryStore(
            userDefaults: suite,
            legacyDomainNames: [productionDomain],
            legacyDomainReader: { domain in
                domain == productionDomain ? legacyBox.values : nil
            }
        )

        store.ensureMigratedFromLegacyDomains()
        store.saveAgentDisplayPreferences([
            AgentDisplayPreference(targetId: "cursor", isVisible: true, sortOrder: 0),
        ])
        store.saveTagCollection(GroupTagCollection())

        XCTAssertEqual(
            legacyBox.values[DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey] as? Data,
            originalLegacy[DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey] as? Data
        )
        XCTAssertEqual(
            legacyBox.values[DesktopWorkspaceMemoryStore.tagCollectionKey] as? Data,
            originalLegacy[DesktopWorkspaceMemoryStore.tagCollectionKey] as? Data
        )
        XCTAssertEqual(legacyBox.values.count, originalLegacy.count)
    }

    func testSecondStoreInstanceSeesWritesToSameSuite() throws {
        let suiteName = uniqueName("shared-write")
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)

        let writer = DesktopWorkspaceMemoryStore(userDefaults: suite, legacyDomainNames: [])
        writer.saveAgentDisplayPreferences([
            AgentDisplayPreference(targetId: "grok-build", isVisible: false, sortOrder: 0),
        ])
        writer.saveTagCollection(
            GroupTagCollection(tagsByGroupKey: [
                "source:beta": [GroupTagPreference(title: "Beta", accentRawValue: DesktopAccentColor.blue.rawValue)]
            ])
        )

        let reader = DesktopWorkspaceMemoryStore(userDefaults: suite, legacyDomainNames: [])
        XCTAssertEqual(reader.loadAgentDisplayPreferences().first?.targetId, "grok-build")
        XCTAssertEqual(reader.loadAgentDisplayPreferences().first?.isVisible, false)
        XCTAssertEqual(
            reader.loadTagCollection().tagsByGroupKey["source:beta"]?.map(\.title),
            ["Beta"]
        )
    }

    func testThemeAndChromeStayOnBundleScopedDefaultsNotSuite() throws {
        let bundleSuiteName = uniqueName("bundle-chrome")
        let memorySuiteName = uniqueName("memory-suite")
        let bundleDefaults = UserDefaults(suiteName: bundleSuiteName)!
        let memoryDefaults = UserDefaults(suiteName: memorySuiteName)!
        bundleDefaults.removePersistentDomain(forName: bundleSuiteName)
        memoryDefaults.removePersistentDomain(forName: memorySuiteName)

        let workspaceMemory = DesktopWorkspaceMemoryStore(
            userDefaults: memoryDefaults,
            legacyDomainNames: []
        )
        let store = DesktopSettingsStore(
            userDefaults: bundleDefaults,
            workspaceMemory: workspaceMemory
        )

        var state = store.load()
        state.themeModeRawValue = DesktopThemeMode.dark.rawValue
        state.themeAccentRawValue = DesktopAccentColor.purple.rawValue
        state.logLevel = "debug"
        state.agentDisplayPreferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
        ]
        state.customAgents = [
            CustomAgentDefinition(
                id: "my-agent",
                name: "My Agent",
                globalPath: "/Users/test/.my-agent/skills",
                projectPathTemplate: ".my-agent/skills",
                strategy: "copy",
                createdAt: "2026-04-08T00:00:00.000Z",
                updatedAt: "2026-04-08T01:00:00.000Z"
            )
        ]
        store.save(state)

        XCTAssertEqual(
            bundleDefaults.string(forKey: SettingsViewModel.themeModeKey),
            DesktopThemeMode.dark.rawValue
        )
        XCTAssertEqual(
            bundleDefaults.string(forKey: SettingsViewModel.themeAccentKey),
            DesktopAccentColor.purple.rawValue
        )
        XCTAssertEqual(bundleDefaults.string(forKey: SettingsViewModel.logLevelKey), "debug")
        XCTAssertNil(bundleDefaults.data(forKey: SettingsViewModel.agentDisplayPreferencesKey))
        XCTAssertNil(memoryDefaults.string(forKey: SettingsViewModel.themeModeKey))
        XCTAssertEqual(
            SettingsViewModel.agentDisplayPreferencesKey,
            DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey
        )

        let reloadedPreferences = try decoder.decode(
            [AgentDisplayPreference].self,
            from: try XCTUnwrap(memoryDefaults.data(forKey: DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey))
        )
        XCTAssertEqual(reloadedPreferences.first?.targetId, "codex")
        XCTAssertEqual(reloadedPreferences.first?.isVisible, false)

        let reloadedCustomAgents = try decoder.decode(
            [CustomAgentDefinition].self,
            from: try XCTUnwrap(bundleDefaults.data(forKey: SettingsViewModel.customAgentsKey))
        )
        XCTAssertEqual(reloadedCustomAgents.first?.id, "my-agent")
        XCTAssertNil(memoryDefaults.data(forKey: SettingsViewModel.customAgentsKey))

        let settingsAndTags = DesktopGroupTagStore(workspaceMemory: workspaceMemory)
        settingsAndTags.saveTagCollection(
            GroupTagCollection(tagsByGroupKey: [
                "source:chrome-test": [GroupTagPreference(title: "Keep", accentRawValue: DesktopAccentColor.blue.rawValue)]
            ])
        )
        XCTAssertNil(bundleDefaults.data(forKey: DesktopGroupTagStore.tagCollectionKey))
        XCTAssertNotNil(memoryDefaults.data(forKey: DesktopWorkspaceMemoryStore.tagCollectionKey))
    }

    // MARK: - Helpers

    private final class LegacyDomainBox {
        var values: [String: Any]

        init(values: [String: Any]) {
            self.values = values
        }
    }

    private func uniqueName(_ label: String) -> String {
        "DesktopWorkspaceMemoryStoreTests.\(label).\(UUID().uuidString)"
    }

    private func workspaceValues(
        preferences: [AgentDisplayPreference],
        tags: GroupTagCollection
    ) throws -> [String: Any] {
        [
            DesktopWorkspaceMemoryStore.agentDisplayPreferencesKey: try encoder.encode(preferences),
            DesktopWorkspaceMemoryStore.tagCollectionKey: try encoder.encode(tags),
        ]
    }
}

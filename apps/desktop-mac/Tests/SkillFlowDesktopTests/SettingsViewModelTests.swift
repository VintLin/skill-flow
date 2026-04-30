import XCTest

@testable import SkillFlowDesktop

final class SettingsViewModelTests: XCTestCase {
    private let suiteName = "SettingsViewModelTests"

    override func setUp() {
        super.setUp()
        UserDefaults(suiteName: suiteName)!.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        UserDefaults(suiteName: suiteName)!.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    @MainActor
    func testLoadsStoredValuesAndNormalizesSelections() {
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.set(true, forKey: SettingsViewModel.autoLaunchKey)
        defaults.set("warn", forKey: SettingsViewModel.logLevelKey)
        defaults.set(true, forKey: SettingsViewModel.externalHelperKey)
        defaults.set(DesktopLanguage.ja.rawValue, forKey: DesktopLanguage.storageKey)
        defaults.set(DesktopThemeMode.dark.rawValue, forKey: SettingsViewModel.themeModeKey)
        defaults.set(DesktopAccentColor.green.rawValue, forKey: SettingsViewModel.themeAccentKey)
        defaults.set(DesktopCardDensity.compact.rawValue, forKey: SettingsViewModel.homeCardDensityKey)
        defaults.set(DesktopCardDensity.comfortable.rawValue, forKey: SettingsViewModel.menuCardDensityKey)
        defaults.set(
            try! JSONEncoder().encode([
                AgentDisplayPreference(targetId: "codex", isVisible: false, sortOrder: 0),
                AgentDisplayPreference(targetId: "unknown", isVisible: true, sortOrder: 1),
            ]),
            forKey: SettingsViewModel.agentDisplayPreferencesKey
        )

        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        XCTAssertTrue(viewModel.autoLaunch)
        XCTAssertEqual(viewModel.logLevel, "warn")
        XCTAssertTrue(viewModel.experimentalExternalHelper)
        XCTAssertEqual(viewModel.desktopLanguageRawValue, DesktopLanguage.ja.rawValue)
        XCTAssertEqual(viewModel.themeModeRawValue, DesktopThemeMode.dark.rawValue)
        XCTAssertEqual(viewModel.themeAccentRawValue, DesktopAccentColor.green.rawValue)
        XCTAssertEqual(viewModel.homeCardDensityRawValue, DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(viewModel.menuCardDensityRawValue, DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(viewModel.currentLanguage, DesktopLanguage.ja)
        XCTAssertEqual(viewModel.currentAccent, DesktopAccentColor.green)
        XCTAssertEqual(viewModel.currentHomeCardDensity, .compact)
        XCTAssertEqual(viewModel.currentMenuCardDensity, .comfortable)
        XCTAssertEqual(viewModel.detectedAgentRows(detectedTargetIds: ["codex", "claude-code"]).map(\.targetId), ["codex", "claude-code"])
        XCTAssertEqual(viewModel.detectedAgentRows(detectedTargetIds: ["codex"]).first?.mountPath, AgentDisplayCatalog.mountPath(for: "codex"))
        XCTAssertEqual(state.settings.agentDisplayPreferences.first?.targetId, "codex")
        XCTAssertEqual(state.settings.agentDisplayPreferences.first?.isVisible, false)
        XCTAssertEqual(state.settings.logLevel, "warn")
    }

    @MainActor
    func testDetectedAgentRowsIncludeCustomAgentsButHideUndetectedBuiltIns() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let store = DesktopSettingsStore(userDefaults: defaults)
        let state = DesktopAppState()
        var settings = SettingsState()
        settings.customAgents = [
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
        settings.agentDisplayPreferences = AgentDisplayCatalog.normalize(
            [
                AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 0),
                AgentDisplayPreference(targetId: "cursor", isVisible: true, sortOrder: 1),
                AgentDisplayPreference(targetId: "my-agent", isVisible: true, sortOrder: 2),
            ],
            customAgents: settings.customAgents
        )
        store.save(settings)
        let viewModel = SettingsViewModel(state: state, store: store)

        let rows = viewModel.detectedAgentRows(detectedTargetIds: ["cursor"])

        XCTAssertEqual(rows.map(\.targetId), ["cursor", "my-agent"])
    }

    @MainActor
    func testWritesPersistImmediately() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        viewModel.autoLaunch = true
        viewModel.logLevel = "error"
        viewModel.experimentalExternalHelper = true
        viewModel.desktopLanguageRawValue = DesktopLanguage.zhHans.rawValue
        viewModel.themeModeRawValue = DesktopThemeMode.dark.rawValue
        viewModel.themeAccentRawValue = DesktopAccentColor.orange.rawValue
        viewModel.homeCardDensityRawValue = DesktopCardDensity.compact.rawValue
        viewModel.menuCardDensityRawValue = DesktopCardDensity.comfortable.rawValue
        viewModel.setAgentVisibility(targetId: "codex", isVisible: false)

        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.autoLaunchKey), true)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.logLevelKey), "error")
        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.externalHelperKey), true)
        XCTAssertEqual(defaults.string(forKey: DesktopLanguage.storageKey), DesktopLanguage.zhHans.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeModeKey), DesktopThemeMode.dark.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeAccentKey), DesktopAccentColor.orange.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.homeCardDensityKey), DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.menuCardDensityKey), DesktopCardDensity.comfortable.rawValue)
        let storedAgentPreferences = try! JSONDecoder().decode(
            [AgentDisplayPreference].self,
            from: try XCTUnwrap(defaults.data(forKey: SettingsViewModel.agentDisplayPreferencesKey))
        )
        XCTAssertEqual(storedAgentPreferences.first?.targetId, "claude-code")
        XCTAssertEqual(storedAgentPreferences.first(where: { $0.targetId == "codex" })?.isVisible, false)
        XCTAssertEqual(state.settings.logLevel, "error")
        XCTAssertEqual(state.settings.themeAccentRawValue, DesktopAccentColor.orange.rawValue)
    }

    @MainActor
    func testFallsBackToDefaultsWhenUnsetOrInvalid() {
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.set("invalid-accent", forKey: SettingsViewModel.themeAccentKey)
        defaults.set("invalid-language", forKey: DesktopLanguage.storageKey)

        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults)
        )

        XCTAssertFalse(viewModel.autoLaunch)
        XCTAssertEqual(viewModel.logLevel, "info")
        XCTAssertFalse(viewModel.experimentalExternalHelper)
        XCTAssertEqual(viewModel.themeModeRawValue, DesktopThemeMode.light.rawValue)
        XCTAssertEqual(viewModel.homeCardDensityRawValue, DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(viewModel.menuCardDensityRawValue, DesktopCardDensity.compact.rawValue)
        XCTAssertEqual(viewModel.currentAccent, DesktopAccentColor.blue)
        XCTAssertEqual(viewModel.currentLanguage, DesktopLanguage.system)
        XCTAssertEqual(viewModel.detectedAgentRows(detectedTargetIds: ["claude-code", "codex"]).map(\.targetId), ["claude-code", "codex"])
    }

    @MainActor
    func testMoveAgentsUpdatesDetectedOrderAndKeepsUndetectedPreferencesStable() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        viewModel.moveAgents(from: IndexSet(integer: 1), to: 0, detectedTargetIds: ["claude-code", "codex", "cursor"])

        XCTAssertEqual(state.settings.agentDisplayPreferences.prefix(3).map(\.targetId), ["codex", "claude-code", "cursor"])
        XCTAssertEqual(state.settings.agentDisplayPreferences.prefix(3).map(\.sortOrder), [0, 1, 2])
    }

    @MainActor
    func testMoveAgentsSyncsSharedSettingsOrder() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let saveExpectation = expectation(description: "save settings after move")
        let commandFacade = RecordingSettingsCommandFacade(saveExpectation: saveExpectation)
        let viewModel = SettingsViewModel(
            state: state,
            store: DesktopSettingsStore(userDefaults: defaults),
            commandFacade: commandFacade
        )

        viewModel.moveAgents(from: IndexSet(integer: 1), to: 0, detectedTargetIds: ["claude-code", "codex", "cursor"])

        await fulfillment(of: [saveExpectation], timeout: 1.0)
        XCTAssertEqual(commandFacade.saveSettingsCalls.last?.agentDisplayOrder.prefix(3).map { $0 }, ["codex", "claude-code", "cursor"])
    }

    @MainActor
    func testMoveAgentsAllowsCustomAgentsToReorderWithinUnifiedDetectedList() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let store = DesktopSettingsStore(userDefaults: defaults)
        let state = DesktopAppState()
        var settings = SettingsState()
        settings.customAgents = [
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
        settings.agentDisplayPreferences = AgentDisplayCatalog.normalize(
            [
                AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 0),
                AgentDisplayPreference(targetId: "my-agent", isVisible: true, sortOrder: 1),
                AgentDisplayPreference(targetId: "cursor", isVisible: true, sortOrder: 2),
            ],
            customAgents: settings.customAgents
        )
        store.save(settings)

        let viewModel = SettingsViewModel(state: state, store: store)

        viewModel.moveAgents(from: IndexSet(integer: 1), to: 0, detectedTargetIds: ["claude-code", "cursor"])

        XCTAssertEqual(
            state.settings.agentDisplayPreferences.prefix(3).map(\.targetId),
            ["my-agent", "claude-code", "cursor"]
        )
        XCTAssertEqual(
            state.settings.agentDisplayPreferences.prefix(3).map(\.sortOrder),
            [0, 1, 2]
        )
    }

    @MainActor
    func testAddCustomAgentPersistsAndJoinsUnifiedDisplayOrder() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        let result = viewModel.upsertCustomAgent(
            SettingsViewModel.CustomAgentDraft(
                name: "My Agent",
                globalPath: "/Users/test/.my-agent/skills",
                projectPathTemplate: ".my-agent/skills",
                strategy: "copy"
            )
        )

        XCTAssertTrue(result.isEmpty)
        XCTAssertEqual(state.settings.customAgents.map(\.id), ["my-agent"])
        XCTAssertTrue(state.settings.agentDisplayPreferences.contains(where: { $0.targetId == "my-agent" }))
        XCTAssertEqual(viewModel.detectedAgentRows(detectedTargetIds: ["my-agent"]).first?.title, "My Agent")
        XCTAssertEqual(viewModel.detectedAgentRows(detectedTargetIds: ["my-agent"]).first?.mountPath, "/Users/test/.my-agent/skills")
    }

    @MainActor
    func testEditCustomAgentUpdatesPersistedValues() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        state.settings.customAgents = [
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
        state.settings.agentDisplayPreferences = AgentDisplayCatalog.normalize(
            AgentDisplayCatalog.defaultPreferences() + [AgentDisplayPreference(targetId: "my-agent", isVisible: true, sortOrder: 99)],
            customAgents: state.settings.customAgents
        )
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        let result = viewModel.upsertCustomAgent(
            SettingsViewModel.CustomAgentDraft(
                name: "Team Agent",
                globalPath: "/Users/test/.team-agent/skills",
                projectPathTemplate: ".team-agent/skills",
                strategy: "symlink"
            ),
            editingId: "my-agent"
        )

        XCTAssertTrue(result.isEmpty)
        XCTAssertEqual(state.settings.customAgents.first?.name, "Team Agent")
        XCTAssertEqual(state.settings.customAgents.first?.globalPath, "/Users/test/.team-agent/skills")
        XCTAssertEqual(viewModel.detectedAgentRows(detectedTargetIds: ["my-agent"]).first?.shortLabel, "TA")
    }

    @MainActor
    func testDeleteCustomAgentRemovesItFromSettingsAndDisplayPreferences() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        state.settings.customAgents = [
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
        state.settings.agentDisplayPreferences = AgentDisplayCatalog.normalize(
            AgentDisplayCatalog.defaultPreferences() + [AgentDisplayPreference(targetId: "my-agent", isVisible: true, sortOrder: 99)],
            customAgents: state.settings.customAgents
        )
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        viewModel.deleteCustomAgent(id: "my-agent")

        XCTAssertTrue(state.settings.customAgents.isEmpty)
        XCTAssertFalse(state.settings.agentDisplayPreferences.contains(where: { $0.targetId == "my-agent" }))
    }

    @MainActor
    func testRejectsAbsoluteProjectPathAndGeneratesUniqueCustomAgentID() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        let absolutePathErrors = viewModel.upsertCustomAgent(
            SettingsViewModel.CustomAgentDraft(
                name: "My Agent",
                globalPath: "/Users/test/.my-agent/skills",
                projectPathTemplate: "/Users/test/project/skills",
                strategy: "copy"
            )
        )
        let generatedIDResult = viewModel.upsertCustomAgent(
            SettingsViewModel.CustomAgentDraft(
                name: "Codex",
                globalPath: "/Users/test/.codex-alt/skills",
                projectPathTemplate: ".codex-alt/skills",
                strategy: "copy"
            )
        )

        XCTAssertEqual(absolutePathErrors["projectPathTemplate"], "Project path must be relative.")
        XCTAssertTrue(generatedIDResult.isEmpty)
        XCTAssertEqual(state.settings.customAgents.map(\.id), ["codex-2"])
    }

    @MainActor
    func testResetAgentDisplayPreferencesRestoresDefaultOrderAndVisibility() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        viewModel.setAgentVisibility(targetId: "codex", isVisible: false)
        viewModel.moveAgents(from: IndexSet(integer: 1), to: 0, detectedTargetIds: ["claude-code", "codex", "cursor"])

        viewModel.resetAgentDisplayPreferences()

        let rows = viewModel.detectedAgentRows(detectedTargetIds: ["claude-code", "codex", "cursor"])
        XCTAssertEqual(rows.map(\.targetId), ["claude-code", "codex", "cursor"])
        XCTAssertTrue(rows.allSatisfy(\.isVisible))
    }

    @MainActor
    func testResetAgentDisplayPreferencesSyncsSharedSettingsOrder() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let saveExpectation = expectation(description: "save settings after reset")
        let commandFacade = RecordingSettingsCommandFacade(saveExpectation: saveExpectation)
        let viewModel = SettingsViewModel(
            state: state,
            store: DesktopSettingsStore(userDefaults: defaults),
            commandFacade: commandFacade
        )

        viewModel.moveAgents(from: IndexSet(integer: 1), to: 0, detectedTargetIds: ["claude-code", "codex", "cursor"])
        await fulfillment(of: [saveExpectation], timeout: 1.0)

        let resetExpectation = expectation(description: "save settings after reset order")
        commandFacade.saveExpectation = resetExpectation
        viewModel.resetAgentDisplayPreferences()

        await fulfillment(of: [resetExpectation], timeout: 1.0)
        XCTAssertEqual(commandFacade.saveSettingsCalls.last?.agentDisplayOrder.prefix(3).map { $0 }, ["claude-code", "codex", "cursor"])
    }

    func testAgentDisplayCatalogReturnsMountPaths() {
        let homePath = FileManager.default.homeDirectoryForCurrentUser.path

        XCTAssertEqual(AgentDisplayCatalog.mountPath(for: "codex"), "\(homePath)/.codex/skills")
        XCTAssertEqual(AgentDisplayCatalog.mountPath(for: "amp"), "\(homePath)/.config/agents/skills")
        XCTAssertEqual(AgentDisplayCatalog.mountPath(for: "trae"), "\(homePath)/.trae/skills")
        XCTAssertEqual(AgentDisplayCatalog.mountPath(for: "unknown"), "unknown")
    }

    @MainActor
    func testResetConfigurationRestoresDefaultSettingsValues() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let state = DesktopAppState()
        let viewModel = SettingsViewModel(state: state, store: DesktopSettingsStore(userDefaults: defaults))

        viewModel.autoLaunch = true
        viewModel.logLevel = "error"
        viewModel.experimentalExternalHelper = true
        viewModel.desktopLanguageRawValue = DesktopLanguage.ja.rawValue
        viewModel.themeModeRawValue = DesktopThemeMode.dark.rawValue
        viewModel.themeAccentRawValue = DesktopAccentColor.orange.rawValue
        viewModel.homeCardDensityRawValue = DesktopCardDensity.compact.rawValue
        viewModel.menuCardDensityRawValue = DesktopCardDensity.comfortable.rawValue

        viewModel.resetConfiguration()

        XCTAssertEqual(state.settings, SettingsState())
        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.autoLaunchKey), false)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.logLevelKey), "info")
        XCTAssertEqual(defaults.bool(forKey: SettingsViewModel.externalHelperKey), false)
        XCTAssertEqual(defaults.string(forKey: DesktopLanguage.storageKey), DesktopLanguage.system.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeModeKey), DesktopThemeMode.light.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.themeAccentKey), DesktopAccentColor.blue.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.homeCardDensityKey), DesktopCardDensity.comfortable.rawValue)
        XCTAssertEqual(defaults.string(forKey: SettingsViewModel.menuCardDensityKey), DesktopCardDensity.compact.rawValue)
    }

    @MainActor
    func testClearMetadataCacheRemovesCatalogMetadataFilesOnly() throws {
        let defaults = UserDefaults(suiteName: suiteName)!
        let stateRoot = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let catalogRoot = stateRoot.appendingPathComponent("catalog", isDirectory: true)
        try FileManager.default.createDirectory(at: catalogRoot, withIntermediateDirectories: true)
        let importDataPath = catalogRoot.appendingPathComponent("import-data.json")
        let sourceMetadataPath = catalogRoot.appendingPathComponent("source-metadata.json")
        let preferencesPath = stateRoot.appendingPathComponent("preferences.json")
        try "{}".write(to: importDataPath, atomically: true, encoding: .utf8)
        try "{}".write(to: sourceMetadataPath, atomically: true, encoding: .utf8)
        try "{}".write(to: preferencesPath, atomically: true, encoding: .utf8)

        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            cacheMaintenance: DesktopCacheMaintenance(stateRootProvider: { stateRoot.path })
        )

        viewModel.clearMetadataCache()

        XCTAssertFalse(FileManager.default.fileExists(atPath: importDataPath.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: sourceMetadataPath.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: preferencesPath.path))
    }

    @MainActor
    func testCheckForUpdatesMarksUpdateAvailableWhenLatestVersionIsNewer() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.3.1")!
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            updateChecker: FakeUpdateChecker(result: .success(.init(version: "1.3.1", releaseURL: releaseURL))),
            currentVersionProvider: { "1.1.0" }
        )

        await viewModel.checkForUpdates()

        XCTAssertEqual(viewModel.currentVersion, "1.1.0")
        XCTAssertEqual(viewModel.latestVersion, "1.3.1")
        XCTAssertEqual(viewModel.updateStatus, .updateAvailable)
        XCTAssertEqual(viewModel.releaseURL, releaseURL)
    }

    @MainActor
    func testCheckForUpdatesMarksUpToDateWhenCurrentVersionMatchesLatest() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.1.0")!
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            updateChecker: FakeUpdateChecker(result: .success(.init(version: "1.1.0", releaseURL: releaseURL))),
            currentVersionProvider: { "1.1.0" }
        )

        await viewModel.checkForUpdates()

        XCTAssertEqual(viewModel.updateStatus, .upToDate)
        XCTAssertEqual(viewModel.latestVersion, "1.1.0")
        XCTAssertEqual(viewModel.releaseURL, releaseURL)
    }

    @MainActor
    func testCheckForUpdatesMarksNewerLocalBuildWhenCurrentVersionExceedsLatestRelease() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.3.5")!
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            updateChecker: FakeUpdateChecker(result: .success(.init(version: "1.3.5", releaseURL: releaseURL))),
            currentVersionProvider: { "1.3.6" }
        )

        await viewModel.checkForUpdates()

        XCTAssertEqual(viewModel.currentVersion, "1.3.6")
        XCTAssertEqual(viewModel.latestVersion, "1.3.5")
        XCTAssertEqual(viewModel.updateStatus, .runningNewerBuild)
        XCTAssertEqual(viewModel.releaseURL, releaseURL)
    }

    @MainActor
    func testCheckForUpdatesComparesPatchVersionsNumerically() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.3.10")!
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            updateChecker: FakeUpdateChecker(result: .success(.init(version: "1.3.10", releaseURL: releaseURL))),
            currentVersionProvider: { "1.3.6" }
        )

        await viewModel.checkForUpdates()

        XCTAssertEqual(viewModel.updateStatus, .updateAvailable)
        XCTAssertEqual(viewModel.latestVersion, "1.3.10")
    }

    @MainActor
    func testCheckForUpdatesStoresFailureState() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            updateChecker: FakeUpdateChecker(result: .failure(FakeUpdateError.requestFailed)),
            currentVersionProvider: { "1.1.0" }
        )

        await viewModel.checkForUpdates()

        XCTAssertEqual(viewModel.updateStatus, .failed)
        XCTAssertNil(viewModel.releaseURL)
    }

    @MainActor
    func testOpenReleasePageUsesInjectedOpener() {
        let defaults = UserDefaults(suiteName: suiteName)!
        let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/latest")!
        var openedURL: URL?
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            updateChecker: FakeUpdateChecker(result: .success(.init(version: "1.3.1", releaseURL: releaseURL))),
            currentVersionProvider: { "1.1.0" },
            releaseURLOpener: { openedURL = $0 }
        )

        viewModel.releaseURL = releaseURL
        viewModel.openReleasePage()

        XCTAssertEqual(openedURL, releaseURL)
    }

    @MainActor
    func testCheckForUpdatesIfNeededOnlyRunsOnce() async {
        let defaults = UserDefaults(suiteName: suiteName)!
        let checker = CountingUpdateChecker(
            result: .success(.init(version: "1.3.1", releaseURL: URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.3.1")!))
        )
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults),
            updateChecker: checker,
            currentVersionProvider: { "1.1.0" }
        )

        await viewModel.checkForUpdatesIfNeeded()
        await viewModel.checkForUpdatesIfNeeded()

        XCTAssertEqual(checker.callCount, 1)
    }
}

private struct FakeUpdateChecker: DesktopUpdateChecking {
    let result: Result<DesktopReleaseInfo, Error>

    func fetchLatestRelease() async throws -> DesktopReleaseInfo {
        try result.get()
    }
}

private enum FakeUpdateError: Error {
    case requestFailed
}

private final class CountingUpdateChecker: DesktopUpdateChecking, @unchecked Sendable {
    let result: Result<DesktopReleaseInfo, Error>
    private(set) var callCount = 0

    init(result: Result<DesktopReleaseInfo, Error>) {
        self.result = result
    }

    func fetchLatestRelease() async throws -> DesktopReleaseInfo {
        callCount += 1
        return try result.get()
    }
}

private final class RecordingSettingsCommandFacade: DesktopCommanding, @unchecked Sendable {
    struct SaveSettingsCall: Equatable {
        let customTargets: [[String: String]]
        let agentDisplayOrder: [String]
    }

    var saveExpectation: XCTestExpectation?
    private(set) var saveSettingsCalls: [SaveSettingsCall] = []

    init(saveExpectation: XCTestExpectation? = nil) {
        self.saveExpectation = saveExpectation
    }

    func saveSettings(customTargets: [[String : String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        saveSettingsCalls.append(SaveSettingsCall(customTargets: customTargets, agentDisplayOrder: agentDisplayOrder))
        saveExpectation?.fulfill()
        return .success(command: .saveSettings, payload: [:])
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func doctor() async throws -> BridgeResponse {
        fatalError("unused")
    }
}

private extension BridgeResponse {
    static func success(command: BridgeCommand, payload: [String: Any]) -> BridgeResponse {
        BridgeResponse(
            protocolVersion: "1.0",
            requestId: UUID().uuidString,
            command: command,
            ok: true,
            data: AnyCodable(payload),
            warnings: [],
            errors: []
        )
    }
}

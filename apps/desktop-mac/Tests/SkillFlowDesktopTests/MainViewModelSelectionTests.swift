import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelSelectionTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
    }

    override func tearDown() {
        MainActor.assumeIsolated {
            MainViewModel.currentDateProvider = Date.init
        }
        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
        super.tearDown()
    }

    func testSelectionFallbackTriStateAndGroupSourceIds() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.visibleTargets.map(\.id), ["claude-code", "cursor"])
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.skillSelectionState(sourceId: "beta"), .empty)
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.selectedGroupSourceIds, ["alpha", "beta"])
        XCTAssertTrue(model.isSkillEnabled("alpha-a", sourceId: "alpha"))
        XCTAssertFalse(model.isSkillEnabled("alpha-b", sourceId: "alpha"))
        XCTAssertFalse(model.isSkillEnabled("beta-a", sourceId: "beta"))
        XCTAssertFalse(model.isSkillEnabled("beta-b", sourceId: "beta"))

        await model.toggleAllSkills(sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .full)
        await model.toggleAllSkills(sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .empty)
        XCTAssertFalse(model.isSkillEnabled("alpha-a", sourceId: "alpha"))

        await model.setSkillEnabled("alpha-b", enabled: true, sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .partial)
        XCTAssertTrue(model.isSkillEnabled("alpha-b", sourceId: "alpha"))

        await model.toggleAllTargets(sourceId: "alpha")
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .full)
        await model.toggleAllTargets(sourceId: "alpha")
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .empty)
    }

    func testHomeStatusAndSourceFilterDefaultsAreAvailable() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.kind = "git"
        state.sources["beta"]?.kind = "local"
        state.sources["beta"]?.locator = "~/skills/beta"
        state.pinnedSourceIds = ["beta"]
        try fixture.reset(state: state)

        let appState = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(appState)
        await model.bootstrap()

        XCTAssertEqual(appState.view.selectedHomeStatusFilterId, "all")
        XCTAssertEqual(appState.view.selectedHomeSourceTypeFilterId, "all")
        XCTAssertEqual(appState.view.expandedHomeSidebarSectionIds.sorted(), ["sourceType", "status"])
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.sourceKind, "git")
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "beta" })?.sourceKind, "local")
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "beta" })?.sourceLocator, "~/skills/beta")
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "beta" })?.isPinned, true)
    }

    func testVisibleTargetsFollowSettingsOrderAndVisibility() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let state = DesktopAppState()
        state.settings.agentDisplayPreferences = [
            AgentDisplayPreference(targetId: "cursor", isVisible: true, sortOrder: 0),
            AgentDisplayPreference(targetId: "claude-code", isVisible: false, sortOrder: 1),
        ]

        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(state)
        await model.bootstrap()
        await model.selectSource("alpha")
        try await fixture.waitForDetailHydration(model, sourceId: "alpha")

        XCTAssertEqual(model.visibleTargets.map(\.id), ["cursor"])
        XCTAssertEqual(model.groupCards.first?.targets.map(\.id), ["cursor"])
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.targets.map(\.id), ["cursor"])
    }

    func testShowAllTargetsStillHonorsVisibilityAndUserOrder() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let state = DesktopAppState()
        state.settings.agentDisplayPreferences = [
            AgentDisplayPreference(targetId: "codex", isVisible: true, sortOrder: 0),
            AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 1),
            AgentDisplayPreference(targetId: "cursor", isVisible: false, sortOrder: 2),
        ]

        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(state)
        await model.bootstrap()
        model.showAllTargets = true

        XCTAssertEqual(model.visibleTargets.prefix(3).map(\.id), ["codex", "claude-code", "github-copilot"])
        XCTAssertFalse(model.visibleTargets.map(\.id).contains("cursor"))
    }

    func testCustomAgentsRemainVisibleInGroupCardsWithoutDetection() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

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
            [
                AgentDisplayPreference(targetId: "my-agent", isVisible: true, sortOrder: 0),
                AgentDisplayPreference(targetId: "claude-code", isVisible: true, sortOrder: 1),
            ],
            customAgents: state.settings.customAgents
        )

        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(state)
        await model.bootstrap()

        XCTAssertEqual(model.visibleTargets.prefix(2).map(\.id), ["my-agent", "claude-code"])
        XCTAssertEqual(model.groupCards.first?.targets.prefix(2).map(\.id), ["my-agent", "claude-code"])
    }

    func testAgentFilterOptionsCountEnabledTargetsAcrossGroupCards() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["beta"]?.enabledTargets = ["cursor"]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()

        XCTAssertEqual(
            model.homeAgentFilterOptions,
            [
                MainViewModel.HomeAgentFilterOption(id: "claude-code", label: "Claude Code", enabledGroupCount: 1),
                MainViewModel.HomeAgentFilterOption(id: "cursor", label: "Cursor", enabledGroupCount: 1),
            ]
        )
    }

    func testSelectedAgentFilterNarrowsHomeGroupCards() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["beta"]?.enabledTargets = ["cursor"]
        try fixture.reset(state: state)

        let appState = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(appState)
        await model.bootstrap()

        XCTAssertEqual(model.filteredHomeGroupCards(locale: Locale(identifier: "en")).map(\.id), ["alpha", "beta"])

        model.setSelectedHomeAgentFilter("cursor")

        XCTAssertEqual(appState.view.selectedHomeAgentFilterId, "cursor")
        XCTAssertEqual(model.selectedHomeAgentFilterId, "cursor")
        XCTAssertEqual(model.filteredHomeGroupCards(locale: Locale(identifier: "en")).map(\.id), ["beta"])
    }

    func testAgentFilterReconcileClearsStaleSelectedId() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let appState = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(appState)
        await model.bootstrap()

        model.setSelectedHomeAgentFilter("missing-agent")
        XCTAssertEqual(appState.view.selectedHomeAgentFilterId, "missing-agent")

        model.reconcileHomeAgentFilter()

        XCTAssertNil(appState.view.selectedHomeAgentFilterId)
        XCTAssertNil(model.selectedHomeAgentFilterId)
    }

    func testHomeContainerProjectionAppliesTagAndAgentFilterWithoutClearingStaleSelection() async throws {
        let fixture = try TestFixture.install()
        var fixtureState = TestFixture.State.baseline
        fixtureState.sources["beta"]?.enabledTargets = ["cursor"]
        try fixture.reset(state: fixtureState)

        let appState = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let userDefaults = UserDefaults(suiteName: "MainViewModelSelectionTests-\(UUID().uuidString)")!
        let groupTagController = GroupTagController(
            state: appState,
            store: DesktopGroupTagStore(userDefaults: userDefaults),
            recommendationsProvider: { [] },
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { _ in nil },
            randomAccent: { .blue }
        )
        let settingsViewModel = SettingsViewModel(
            state: appState,
            store: DesktopSettingsStore(userDefaults: userDefaults),
            commandFacade: nil
        )
        let importContainer = ImportScreenContainer(
            state: appState,
            mainViewModel: model,
            recommendationsProvider: { [] }
        )
        let detailContainer = DetailScreenContainer(
            state: appState,
            groupTagController: groupTagController,
            detailSnapshot: { [weak model] sourceId in
                model?.detailSnapshot(for: sourceId)
            }
        )
        let container = HomeScreenContainer(
            state: appState,
            mainViewModel: model,
            groupTagController: groupTagController,
            settingsViewModel: settingsViewModel,
            importContainer: importContainer,
            detailContainer: detailContainer
        )
        await model.bootstrap()

        appState.groupTags.customTagsBySourceId = [
            "alpha": [GroupTagPreference(title: "shared", accentRawValue: DesktopAccentColor.blue.rawValue)],
            "beta": [GroupTagPreference(title: "shared", accentRawValue: DesktopAccentColor.green.rawValue)]
        ]
        appState.groupTags.selectedHomeFilterKey = "custom:shared"
        model.setSelectedHomeAgentFilter("cursor")

        let snapshot = container.homeTagSnapshot(locale: Locale(identifier: "en"))

        XCTAssertEqual(
            container.visibleGroupCards(from: model.groupCards, snapshot: snapshot).map(\.id),
            ["beta"]
        )

        model.setSelectedHomeAgentFilter("missing-agent")

        XCTAssertEqual(
            container.visibleGroupCards(from: model.groupCards, snapshot: snapshot).map(\.id),
            ["alpha", "beta"]
        )
        XCTAssertEqual(appState.view.selectedHomeAgentFilterId, "missing-agent")
    }

    func testSaveFailureRollsBackOptimisticEdit() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .failureBaseline)

        let model = try await fixture.makeModel()

        await model.setTargetEnabled("cursor", enabled: true)
        XCTAssertEqual(model.saveState(for: "alpha").phase, .failed)
        XCTAssertEqual(model.saveState(for: "alpha").detail, "Primary cause: missing leaf mapping")
        XCTAssertFalse(model.isTargetEnabled("cursor"))
        XCTAssertEqual(model.toast?.style, .error)
    }

    func testRefreshListReconcilesExistingDraftsWithServerSummary() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        XCTAssertTrue(model.isTargetEnabled("claude-code"))

        var state = TestFixture.State.baseline
        state.sources["alpha"]?.enabledTargets = []
        state.sources["alpha"]?.selectedLeafIds = []
        try fixture.reset(state: state)

        await model.refreshList()

        XCTAssertFalse(model.isTargetEnabled("claude-code"))
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .empty)
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.enabledTargetCount, 0)
    }

    func testSetTargetEnabledIgnoresStaleRenderedState() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.setTargetEnabled(
            "cursor",
            enabled: true,
            sourceId: "alpha",
            expectedCurrentEnabled: false
        )
        XCTAssertTrue(model.isTargetEnabled("cursor"))

        await model.setTargetEnabled(
            "cursor",
            enabled: false,
            sourceId: "alpha",
            expectedCurrentEnabled: false
        )
        XCTAssertTrue(model.isTargetEnabled("cursor"))
    }

    func testTargetStaysEnabledAfterClearingSkillsAndRefreshing() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.setTargetEnabled(
            "claude-code",
            enabled: false,
            sourceId: "alpha",
            expectedCurrentEnabled: true
        )
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .empty)

        await model.setSkillEnabled("alpha-a", enabled: false, sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .empty)

        await model.setTargetEnabled(
            "cursor",
            enabled: true,
            sourceId: "alpha",
            expectedCurrentEnabled: false
        )
        XCTAssertTrue(model.isTargetEnabled("cursor"))
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .partial)

        await model.refreshList()

        XCTAssertTrue(model.isTargetEnabled("cursor"))
        XCTAssertFalse(model.isTargetEnabled("claude-code"))
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.enabledTargetLabels, ["Cursor"])
    }

    func testTargetToggleKeepsLoadingVisibleForMinimumDuration() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        let startedAt = ContinuousClock.now

        await model.setTargetEnabled(
            "cursor",
            enabled: true,
            sourceId: "alpha",
            expectedCurrentEnabled: false
        )

        let elapsed = startedAt.duration(to: ContinuousClock.now)
        XCTAssertGreaterThanOrEqual(elapsed, .milliseconds(200))
        XCTAssertEqual(model.saveState(for: "alpha").phase, .saved)
    }

    func testTargetToggleUsesApplyFreshStateWithoutDeferredListRefresh() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        let listCountBefore = fixture.loggedRequests().filter { $0.command == "list" }.count

        await model.setTargetEnabled(
            "cursor",
            enabled: true,
            sourceId: "alpha",
            expectedCurrentEnabled: false
        )
        try await Task.sleep(nanoseconds: 400_000_000)

        let requests = fixture.loggedRequests()
        let listCountAfter = requests.filter { $0.command == "list" }.count

        XCTAssertEqual(listCountAfter, listCountBefore)
        XCTAssertTrue(model.isTargetEnabled("cursor"))
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.enabledTargetLabels.sorted(), ["Claude Code", "Cursor"])
    }

    func testClawhubGroupSelectionIncludesAllClawhubSources() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.selectedGroupSourceIds, ["alpha", "beta"])
        XCTAssertEqual(model.selectedGroupId, "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "beta"), .empty)
    }

    func testAlternateGroupCardQueryDoesNotMutatePrimarySearchState() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        model.searchQuery = "beta"

        let cards = model.groupCards(matching: "alpha")

        XCTAssertEqual(cards.map(\.id), ["alpha"])
        XCTAssertEqual(model.searchQuery, "beta")
        XCTAssertEqual(model.groupCards.map(\.id), ["beta"])
    }

    func testRenameSourceUpdatesCardsAndDetailTitleAfterBridgeSuccess() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.sourceSnapshotTitle = "Old Snapshot Title"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Old Snapshot Title")

        await model.renameSource(sourceId: "alpha", displayName: "Writing Tools")

        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.title, "Writing Tools")
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Writing Tools")
        let request = fixture.loggedRequests().last(where: { $0.command == "rename-source" })
        XCTAssertEqual(request?.payload?["sourceId"]?.value as? String, "alpha")
        XCTAssertEqual(request?.payload?["displayName"]?.value as? String, "Writing Tools")
    }

    func testRenameSourceUpdatesDetailEnrichmentSnapshotTitleAfterBridgeSuccess() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.inspectEnrichmentDelayMilliseconds = 400
        state.sources["alpha"]?.enrichmentSourceSnapshotTitle = "Old Enrichment Title"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        try await fixture.waitForLoggedRequest(
            command: "inspect-enrichment",
            sourceId: "alpha",
            model: model,
            expectedDetailTitle: "Old Enrichment Title"
        )
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Old Enrichment Title")

        await model.renameSource(sourceId: "alpha", displayName: "Writing Tools")

        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Writing Tools")
    }

    func testRenameSourceKeepsDetailTitleWhenInFlightEnrichmentReturnsOldSnapshot() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.inspectEnrichmentDelayMilliseconds = 400
        state.sources["alpha"]?.inspectEnrichmentTotalInstalls = 987_654
        state.sources["alpha"]?.enrichmentSourceSnapshotTitle = "Old Enrichment Title"
        try fixture.reset(state: state)

        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.bootstrap()
        await model.selectSource("alpha")
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Old Enrichment Title")

        await model.renameSource(sourceId: "alpha", displayName: "Writing Tools")
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Writing Tools")

        try await fixture.waitForLoggedRequest(
            command: "inspect-enrichment",
            sourceId: "alpha",
            model: model,
            expectedDetailTitle: "Writing Tools",
            expectedDownloadCount: 987_654
        )

        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Writing Tools")
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.sourceFacts.first, "2026-03-25T12:00:00Z")
    }

    func testRenameSourceRefreshClearsOverrideAfterServerConfirmsDisplayName() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.renameSource(sourceId: "alpha", displayName: "Writing Tools")
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.title, "Writing Tools")

        await model.refreshList()
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.title, "Writing Tools")

        var nextState = try fixture.readState()
        nextState.sources["alpha"]?.displayName = "Backend Fresh Name"
        try fixture.reset(state: nextState)

        await model.refreshList()

        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.title, "Backend Fresh Name")
    }

    func testRenameSourceKeepsDisplayNameWhenStaleListResponseReturnsOldSummary() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.listDelayMilliseconds = 400
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let refreshTask = Task { @MainActor in
            await model.refreshList()
        }
        try await fixture.waitForLoggedRequest(command: "list", minimumCount: 1)

        await model.renameSource(sourceId: "alpha", displayName: "Writing Tools")
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.title, "Writing Tools")

        await refreshTask.value

        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.title, "Writing Tools")
        XCTAssertFalse(model.groupCards.contains(where: { $0.id == "alpha" && $0.title == "AlphaHub" }))
    }

    func testRenameSourceKeepsDetailTitleWhenStaleInspectResponseReturnsOldPayload() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.inspectDelayMilliseconds = 400
        state.sources["alpha"]?.sourceSnapshotTitle = "Old Snapshot Title"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Old Snapshot Title")

        let inspectTask = Task { @MainActor in
            await model.selectSource("alpha")
        }
        try await fixture.waitForLoggedRequest(command: "inspect", sourceId: "alpha", minimumCount: 2)

        await model.renameSource(sourceId: "alpha", displayName: "Writing Tools")
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Writing Tools")

        await inspectTask.value

        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Writing Tools")
    }

    func testRenameSourceFailureKeepsCardsDetailSelectionAndShowsError() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.sourceSnapshotTitle = "Old Snapshot Title"
        state.sources["alpha"]?.renameFailures = ["Skills group id 'alpha' is not registered."]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()

        await model.renameSource(sourceId: "alpha", displayName: "Writing Tools")

        XCTAssertEqual(model.groupCards.first(where: { $0.id == "alpha" })?.title, "AlphaHub")
        XCTAssertFalse(model.groupCards.contains(where: { $0.title == "Writing Tools" }))
        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.title, "Old Snapshot Title")
        XCTAssertEqual(model.selectedGroupId, "alpha")
        XCTAssertEqual(model.selectedSourceId, "alpha")
        XCTAssertEqual(model.toast?.style, .error)
        XCTAssertFalse(model.toast?.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    func testGroupCardsHydrateCachedMetadataDuringBootstrap() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.bootstrap()

        let alpha = model.groupCards.first(where: { $0.id == "alpha" })

        XCTAssertEqual(alpha?.stats.skillCount, 2)
        XCTAssertEqual(alpha?.stats.downloadCount, 5045)
        XCTAssertEqual(alpha?.stats.starCount, 1200)
        XCTAssertTrue(alpha?.groupPath?.hasSuffix("/docs/alpha") == true)
        XCTAssertTrue(alpha?.stats.localPath?.hasSuffix("/docs/alpha") == true)
    }

    func testDetailSnapshotUsesInspectPayload() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        let deadline = Date().addingTimeInterval(1)
        var detail = model.detailSnapshot(for: "alpha")
        while Date() < deadline {
            if let snapshot = model.detailSnapshot(for: "alpha"),
               snapshot.groupStats.starCount == 1200,
               snapshot.groupStats.downloadCount == 5045,
               snapshot.skills.first?.starCount == 1200 {
                detail = snapshot
                break
            }
            try await Task.sleep(nanoseconds: 20_000_000)
            detail = model.detailSnapshot(for: "alpha")
        }

        XCTAssertEqual(detail?.title, "AlphaHub")
        XCTAssertEqual(detail?.subtitle, "clawhub")
        XCTAssertEqual(detail?.groupStats.skillCount, 2)
        XCTAssertEqual(detail?.groupStats.downloadCount, 5045)
        XCTAssertEqual(detail?.groupStats.starCount, 1200)
        XCTAssertNil(detail?.groupStats.githubURL)
        XCTAssertEqual(detail?.enabledTargetLabels, ["Claude Code"])
        XCTAssertEqual(detail?.enabledSkillCount, 1)
        XCTAssertEqual(detail?.totalSkillCount, 2)
        XCTAssertEqual(detail?.enabledTargetCount, 1)
        XCTAssertEqual(detail?.saveState.phase, .idle)
        XCTAssertEqual(detail?.targetSelection, .partial)
        XCTAssertEqual(detail?.targets.map(\.id), ["claude-code", "cursor"])
        XCTAssertEqual(detail?.targets.first?.isEnabled, true)
        XCTAssertEqual(detail?.targets.last?.isEnabled, false)
        XCTAssertEqual(detail?.sourceFacts.first, "2026-03-25T12:00:00Z")
        XCTAssertTrue(detail?.deploymentFacts.first?.contains("Claude Code") == true)
        XCTAssertEqual(detail?.groupDocuments.map(\.title), ["File Tree", "README.md", "README.zh.md", "CHANGELOG.md"])
        XCTAssertEqual(detail?.groupDocuments.first(where: { $0.title == "README.md" })?.externalURL, "https://github.com/acme/alpha-hub/blob/HEAD/README.md")
        XCTAssertEqual(detail?.fileTree.first?.title, "alpha")
        XCTAssertTrue(detail?.fileTree.first?.isDirectory == true)
        XCTAssertEqual(detail?.fileTree.first?.children.map(\.title), ["alpha-a", "alpha-b", "README.md", "README.zh.md", "CHANGELOG.md"])
        XCTAssertTrue(detail?.fileTree.first?.children.contains(where: { $0.title == "alpha-a" && $0.isSkillRoot && $0.skillId == "alpha-a" }) == true)
        XCTAssertTrue(detail?.fileTree.first?.children.first(where: { $0.skillId == "alpha-a" })?.children.contains(where: { $0.title == "SKILL.md" && $0.skillId == "alpha-a" }) == true)
        XCTAssertTrue(detail?.skills.first?.detailLines.contains(where: { $0.contains("SKILL.md") }) == true)
        XCTAssertTrue(detail?.skills.first?.documents.first?.metadata.isEmpty == true)
        XCTAssertEqual(detail?.skills.first?.documents.first?.content, "")
        XCTAssertTrue(detail?.skills.first?.documents.first?.renderCacheKey.isEmpty == false)
        XCTAssertEqual(detail?.skills.first?.starCount, 1200)
    }

    func testDetailSnapshotBuildsGroupDocumentsWithoutReadingMarkdownBodies() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        let snapshot = try XCTUnwrap(model.detailSnapshot(for: "alpha"))

        XCTAssertFalse(snapshot.groupDocuments.isEmpty)
        XCTAssertTrue(snapshot.groupDocuments.allSatisfy { !$0.renderCacheKey.isEmpty })
    }

    func testDetailSnapshotBuildsSkillDocumentsWithoutReadingMarkdownBodies() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        let snapshot = try XCTUnwrap(model.detailSnapshot(for: "alpha"))
        let skillDocuments = try XCTUnwrap(snapshot.skills.first?.documents)

        XCTAssertFalse(skillDocuments.isEmpty)
        XCTAssertTrue(skillDocuments.allSatisfy { $0.metadata.isEmpty })
        XCTAssertTrue(skillDocuments.allSatisfy { $0.content.isEmpty })
        XCTAssertTrue(skillDocuments.allSatisfy { !$0.renderCacheKey.isEmpty })
    }

    func testDetailSnapshotChangesRenderCacheKeyWhenMarkdownContentChangesWithoutMetadataDelta() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let fixedDate = Date(timeIntervalSince1970: 1_710_000_000)
        try fixture.writeGroupDocument(sourceId: "alpha", name: "README.md", content: "alpha")
        try fixture.setModificationDate(fixedDate, forGroupDocumentIn: "alpha", name: "README.md")

        let initialModel = try await fixture.makeModel()
        let initialSnapshot = try XCTUnwrap(initialModel.detailSnapshot(for: "alpha"))
        let initialKey = try XCTUnwrap(initialSnapshot.groupDocuments.first(where: { $0.title == "README.md" })?.renderCacheKey)

        try fixture.writeGroupDocument(sourceId: "alpha", name: "README.md", content: "bravo")
        try fixture.setModificationDate(fixedDate, forGroupDocumentIn: "alpha", name: "README.md")

        let updatedModel = try await fixture.makeModel()
        let updatedSnapshot = try XCTUnwrap(updatedModel.detailSnapshot(for: "alpha"))
        let updatedKey = try XCTUnwrap(updatedSnapshot.groupDocuments.first(where: { $0.title == "README.md" })?.renderCacheKey)

        XCTAssertNotEqual(initialKey, updatedKey)
    }

    func testDetailFileTreeKeepsSkillRootFilesButPrunesNonSkillNestedDirectories() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)
        try fixture.writeSkillSidecarDocument(sourceId: "alpha", leafId: "alpha-a", name: "README.md", content: "# Local Skill Readme")
        try fixture.writeReferenceDocument(sourceId: "alpha", leafId: "alpha-a", name: "deep.md", content: "# Hidden nested")

        let model = try await fixture.makeModel()
        let detail = model.detailSnapshot(for: "alpha")

        let alphaSkillRoot = detail?.fileTree.first?.children.first(where: { $0.skillId == "alpha-a" })
        XCTAssertEqual(alphaSkillRoot?.children.map(\.title), ["README.md", "SKILL.md"])
        XCTAssertFalse(alphaSkillRoot?.children.contains(where: { $0.title == "references" }) == true)
    }

    func testDetailSnapshotBuildsLocalContentBeforeInspectPayloadArrives() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.bootstrap()

        XCTAssertFalse(model.hasInspectPayload(for: "alpha"))

        let detail = model.detailSnapshot(for: "alpha")

        XCTAssertEqual(detail?.title, "AlphaHub")
        XCTAssertEqual(detail?.skills.map(\.id), ["alpha-a", "alpha-b"])
        XCTAssertEqual(detail?.enabledTargetLabels, ["Claude Code"])
        XCTAssertEqual(detail?.groupStats.skillCount, 2)
        XCTAssertEqual(detail?.groupStats.starCount, 1200)
        XCTAssertNil(detail?.groupStats.githubURL)
        XCTAssertEqual(detail?.targets.map(\.id), ["claude-code", "cursor"])
    }

    func testDetailSnapshotAppliesEnrichmentAfterLocalInspectShell() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.bootstrap()
        await model.selectSource("alpha")

        let initialDetail = model.detailSnapshot(for: "alpha")
        XCTAssertTrue(model.hasInspectPayload(for: "alpha"))
        XCTAssertEqual(initialDetail?.title, "AlphaHub")
        XCTAssertEqual(initialDetail?.groupStats.starCount, 1200)
        XCTAssertNil(initialDetail?.groupStats.githubURL)

        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline {
            if let detail = model.detailSnapshot(for: "alpha"),
               detail.groupStats.starCount == 1200,
               detail.groupStats.downloadCount == 5045
            {
                let inspectRequests = fixture.loggedRequests().filter {
                    $0.command == "inspect" && $0.payload?["sourceId"]?.value as? String == "alpha"
                }
                XCTAssertEqual(inspectRequests.count, 1)
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }

        XCTFail("Timed out waiting for detail enrichment")
    }

    func testDetailSnapshotShowsUnsupportedMetadataState() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.metadataStatus = "unsupported"
        state.sources["alpha"]?.metadataReasonCode = "provider_data_unavailable"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailSnapshot(for: "alpha")

        XCTAssertNil(detail?.groupStats.starCount)
        XCTAssertEqual(detail?.groupStats.skillCount, 2)
    }

    func testDetailSnapshotShowsFailedMetadataState() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.metadataStatus = "failed"
        state.sources["alpha"]?.metadataReasonCode = "provider_rate_limited"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailSnapshot(for: "alpha")

        XCTAssertNil(detail?.groupStats.starCount)
        XCTAssertEqual(detail?.groupStats.skillCount, 2)
    }

    func testDetailSnapshotShowsDisabledMetadataState() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.metadataStatus = "disabled"
        state.sources["alpha"]?.metadataReasonCode = nil
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailSnapshot(for: "alpha")

        XCTAssertNil(detail?.groupStats.starCount)
        XCTAssertEqual(detail?.groupStats.skillCount, 2)
    }

    func testDetailDocumentResolutionFallsBackWhenSkillDocumentIsMissing() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)
        try fixture.removeSkillDocument(sourceId: "alpha", leafId: "alpha-a")

        let model = try await fixture.makeModel()
        let detail = try XCTUnwrap(model.detailSnapshot(for: "alpha"))
        let documentId = try XCTUnwrap(detail.skills.first?.documents.first?.id)
        let document = await model.groupDocument(for: "alpha", documentId: documentId)

        XCTAssertEqual(document?.content, "SKILL.md unavailable.")
    }

    func testDetailDocumentResolutionLoadsSkillMarkdownBody() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        let detail = try XCTUnwrap(model.detailSnapshot(for: "alpha"))
        let documentId = try XCTUnwrap(detail.skills.first?.documents.first?.id)
        let document = await model.groupDocument(for: "alpha", documentId: documentId)

        XCTAssertTrue(document?.content.contains("## Usage") == true)
        XCTAssertFalse(document?.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    func testDetailDocumentResolutionReturnsTerminalErrorContentForNonMissingReadFailure() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)
        try fixture.replaceSkillDocumentWithDirectory(sourceId: "alpha", leafId: "alpha-a")

        let model = try await fixture.makeModel()
        let detail = try XCTUnwrap(model.detailSnapshot(for: "alpha"))
        let documentId = try XCTUnwrap(detail.skills.first?.documents.first?.id)
        let document = await model.groupDocument(for: "alpha", documentId: documentId)

        XCTAssertEqual(document?.content, "Failed to load document.")
        XCTAssertEqual(document?.isLoaded, true)
    }

    func testDetailSnapshotLocalizesDerivedDetailCopyForJapanese() async throws {
        UserDefaults.standard.set(DesktopLanguage.ja.rawValue, forKey: DesktopLanguage.storageKey)

        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.locator = ""
        state.sources["alpha"]?.metadataStatus = "unsupported"
        state.sources["alpha"]?.metadataReasonCode = "provider_data_unavailable"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailSnapshot(for: "alpha")

        XCTAssertEqual(detail?.groupDocuments.first?.title, "ファイルツリー")
    }

    func testDetailSnapshotLocalizesUpdatedRelativeWithSelectedLanguage() async throws {
        let formatter = ISO8601DateFormatter()
        MainViewModel.currentDateProvider = {
            formatter.date(from: "2026-03-27T00:00:00Z")!
        }

        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.detailSnapshot(for: "alpha")?.updatedRelative, "Updated 1 day ago")

        UserDefaults.standard.set(DesktopLanguage.ja.rawValue, forKey: DesktopLanguage.storageKey)

        let localizedRelative = model.detailSnapshot(for: "alpha")?.updatedRelative
        XCTAssertTrue(localizedRelative?.contains("更新") == true)
        XCTAssertFalse(localizedRelative?.contains("Updated") == true)
    }

    func testDetailSkillTitleDoesNotDependOnSkillMarkdownMetadata() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)
        try fixture.writeSkillDocument(
            sourceId: "alpha",
            leafId: "alpha-a",
            content: """
            ---
            name: Browser Metadata Name
            description: Browse things.
            ---

            # browse
            """
        )

        let model = try await fixture.makeModel()

        let detail = model.detailSnapshot(for: "alpha")

        XCTAssertEqual(detail?.skills.first?.title, "alpha-a")
    }

    func testFileTreeUsesProjectedNameWhenSkillWouldBeDeduped() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["beta"]?.leafs = [
            TestFixture.LeafState(
                id: "beta-a",
                linkName: "browse",
                name: "browse",
                description: "Browse elsewhere.",
                metadataWarnings: []
            )
        ]
        state.sources["beta"]?.enabledTargets = ["claude-code"]
        state.sources["beta"]?.targetLeafIdsByTarget = ["claude-code": ["beta-a"]]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        await model.selectSource("beta")
        try await fixture.waitForDetailHydration(model, sourceId: "beta")

        let detail = model.detailSnapshot(for: "beta")

        XCTAssertTrue(detail?.fileTree.containsSkillRoot(skillId: "beta-a") == true)
    }

    func testDetailWarmupDoesNotBlockMainActor() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        let heavyLeaf = TestFixture.LeafState(
            id: "alpha-heavy",
            linkName: "skill-heavy",
            name: "skill-heavy",
            description: "Heavy skill.",
            metadataWarnings: []
        )
        state.sources["alpha"]?.leafs = [heavyLeaf]
        state.sources["alpha"]?.selectedLeafIds = [heavyLeaf.id]
        state.sources["alpha"]?.enabledTargets = ["claude-code"]
        state.sources["alpha"]?.targetLeafIdsByTarget = ["claude-code": [heavyLeaf.id]]
        try fixture.reset(state: state)

        try fixture.writeSkillDocument(
            sourceId: "alpha",
            leafId: heavyLeaf.id,
            content: heavySkillDocument(name: heavyLeaf.name)
        )
        for index in 0..<1800 {
            try fixture.writeReferenceDocument(
                sourceId: "alpha",
                leafId: heavyLeaf.id,
                name: "ref-\(index).md",
                content: heavyReferenceDocument(index: index)
            )
        }

        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.bootstrap()
        await model.selectSource("alpha")

        let mainActorFlag = ThreadSafeFlag()
        let pingTask = Task.detached {
            try await Task.sleep(nanoseconds: 60_000_000)
            await MainActor.run {
                mainActorFlag.setTrue()
            }
        }

        try await Task.sleep(nanoseconds: 140_000_000)
        XCTAssertTrue(
            mainActorFlag.value,
            "Detail warmup should not block unrelated MainActor work."
        )

        try await pingTask.value
        try await fixture.waitForDetailHydration(model, sourceId: "alpha", timeoutNanoseconds: 3_000_000_000)
    }

    func testDetailWarmupIgnoresStalePreparedContentAfterNewerInspectPayloadArrives() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.locator = "https://github.com/acme/alpha-old"
        try fixture.reset(state: state)

        let model = MainViewModel(bridgeClient: BridgeClient())
        model.detailWarmupDelay = .milliseconds(200)
        await model.bootstrap()
        await model.selectSource("alpha")

        var nextState = state
        nextState.sources["alpha"]?.locator = "https://github.com/acme/alpha-new"
        try fixture.reset(state: nextState)
        await model.selectSource("alpha")

        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            if let document = model.detailSnapshot(for: "alpha")?
                .groupDocuments
                .first(where: { $0.title == "README.md" }),
               document.externalURL?.contains("/acme/alpha-new/") == true {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }

        let document = model.detailSnapshot(for: "alpha")?
            .groupDocuments
            .first(where: { $0.title == "README.md" })
        XCTAssertTrue(document?.externalURL?.contains("/acme/alpha-new/") == true)
    }

    func testDetailSnapshotEventuallyHydratesSkillDocumentsAfterSelectSource() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = MainViewModel(bridgeClient: BridgeClient())
        model.detailWarmupDelay = .milliseconds(200)
        await model.bootstrap()
        await model.selectSource("alpha")

        let initialDetail = model.detailSnapshot(for: "alpha")
        XCTAssertTrue(initialDetail?.skills.contains(where: { $0.documents.isEmpty }) == true)

        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            if let detail = model.detailSnapshot(for: "alpha"),
               detail.skills.allSatisfy({ !$0.documents.isEmpty }) {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }

        XCTAssertTrue(model.detailSnapshot(for: "alpha")?.skills.allSatisfy({ !$0.documents.isEmpty }) == true)
    }

    func testHydratedSkillDocumentTabsRemainUnloadedUntilOpened() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        let detail = try XCTUnwrap(model.detailSnapshot(for: "alpha"))
        let document = try XCTUnwrap(detail.skills.first?.documents.first)

        XCTAssertFalse(document.isLoaded)
        XCTAssertTrue(document.content.isEmpty)
    }

    func testHydratedSkillDocumentContentFeedsSubtitleMetrics() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        let detail = try XCTUnwrap(model.detailSnapshot(for: "alpha"))
        let skill = try XCTUnwrap(detail.skills.first)

        XCTAssertFalse(skill.documentContent.isEmpty)
        XCTAssertNotNil(DetailInfoLayout.wordCount(from: skill.documentContent))
    }

    private func heavySkillDocument(name: String) -> String {
        let repeatedSection = String(repeating: """
        ## Notes

        This is intentionally heavy markdown content for \(name).
        It exists to exercise background detail warmup work without changing behavior.

        - step one
        - step two
        - step three

        ```swift
        let value = "\(name)"
        print(value)
        ```

        """, count: 260)

        return """
        ---
        name: \(name)
        description: Heavy \(name).
        ---

        # \(name)

        \(repeatedSection)

        Final verification line.
        """
    }

    private func heavyReferenceDocument(index: Int) -> String {
        let body = String(repeating: """
        # Reference \(index)

        This reference document is intentionally large to stress detail warmup scheduling.

        ```json
        { "index": \(index), "status": "heavy" }
        ```

        """, count: 32)

        return """
        ---
        name: reference-\(index)
        description: Heavy reference \(index)
        ---

        \(body)
        """
    }
}

private extension Array where Element == MainViewModel.FileTreeItem {
    func containsSkillRoot(skillId: String) -> Bool {
        for item in self {
            if item.skillId == skillId, item.isSkillRoot {
                return true
            }
            if item.children.containsSkillRoot(skillId: skillId) {
                return true
            }
        }
        return false
    }
}

private final class ThreadSafeFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var storedValue = false

    var value: Bool {
        lock.lock()
        defer { lock.unlock() }
        return storedValue
    }

    func setTrue() {
        lock.lock()
        storedValue = true
        lock.unlock()
    }
}

@MainActor
private struct TestFixture {
    struct LeafState: Codable, Equatable {
        var id: String
        var linkName: String
        var name: String
        var description: String
        var metadataWarnings: [String]
    }

    struct SourceState: Codable, Equatable {
        var kind: String
        var displayName: String
        var locator: String
        var starCount: Int?
        var metadataStatus: String?
        var metadataProvider: String?
        var metadataReasonCode: String?
        var health: String
        var updatedAt: String
        var leafs: [LeafState]
        var selectedLeafIds: [String]
        var enabledTargets: [String]
        var targetLeafIdsByTarget: [String: [String]]
        var applyFailures: [String]
        var renameFailures: [String] = []
        var sourceSnapshotTitle: String? = nil
        var enrichmentSourceSnapshotTitle: String? = nil
        var inspectEnrichmentTotalInstalls: Int? = nil
    }

    struct State: Codable, Equatable {
        var availableTargets: [String]
        var sources: [String: SourceState]
        var pinnedSourceIds: [String]
        var listDelayMilliseconds: Int? = nil
        var inspectDelayMilliseconds: Int? = nil
        var inspectEnrichmentDelayMilliseconds: Int? = nil

        static let baseline = State(
            availableTargets: ["cursor", "claude-code"],
            sources: [
                "alpha": SourceState(
                    kind: "clawhub",
                    displayName: "AlphaHub",
                    locator: "https://github.com/acme/alpha-hub",
                    starCount: 1200,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "alpha-a", linkName: "browse", name: "browse", description: "Browse things.", metadataWarnings: []),
                        LeafState(id: "alpha-b", linkName: "review", name: "review", description: "Review things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: [],
                    enabledTargets: ["claude-code"],
                    targetLeafIdsByTarget: [
                        "claude-code": ["alpha-a"],
                        "cursor": ["alpha-b"]
                    ],
                    applyFailures: []
                ),
                "beta": SourceState(
                    kind: "clawhub",
                    displayName: "BetaHub",
                    locator: "https://github.com/acme/beta-hub",
                    starCount: 88,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "beta-a", linkName: "draft", name: "draft", description: "Draft things.", metadataWarnings: []),
                        LeafState(id: "beta-b", linkName: "ship", name: "ship", description: "Ship things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: [],
                    enabledTargets: [],
                    targetLeafIdsByTarget: [:],
                    applyFailures: []
                )
            ],
            pinnedSourceIds: []
        )

        static let failureBaseline = State(
            availableTargets: ["cursor", "claude-code"],
            sources: [
                "alpha": SourceState(
                    kind: "clawhub",
                    displayName: "AlphaHub",
                    locator: "https://github.com/acme/alpha-hub",
                    starCount: 1200,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "alpha-a", linkName: "browse", name: "browse", description: "Browse things.", metadataWarnings: []),
                        LeafState(id: "alpha-b", linkName: "review", name: "review", description: "Review things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: ["alpha-a"],
                    enabledTargets: ["claude-code"],
                    targetLeafIdsByTarget: [
                        "claude-code": ["alpha-a"],
                        "cursor": ["alpha-b"]
                    ],
                    applyFailures: [
                        "Primary cause: missing leaf mapping",
                        "Secondary cause: stale target state"
                    ]
                ),
                "beta": SourceState(
                    kind: "clawhub",
                    displayName: "BetaHub",
                    locator: "https://github.com/acme/beta-hub",
                    starCount: 88,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "beta-a", linkName: "draft", name: "draft", description: "Draft things.", metadataWarnings: []),
                        LeafState(id: "beta-b", linkName: "ship", name: "ship", description: "Ship things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: [],
                    enabledTargets: [],
                    targetLeafIdsByTarget: [:],
                    applyFailures: []
                )
            ],
            pinnedSourceIds: []
        )
    }

    struct LoggedRequest: Codable {
        let command: String
        let payload: [String: AnyJSON]?
    }

    struct AnyJSON: Codable {
        let value: Any

        init(_ value: Any) {
            self.value = value
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let boolValue = try? container.decode(Bool.self) {
                value = boolValue
            } else if let intValue = try? container.decode(Int.self) {
                value = intValue
            } else if let doubleValue = try? container.decode(Double.self) {
                value = doubleValue
            } else if let stringValue = try? container.decode(String.self) {
                value = stringValue
            } else if let arrayValue = try? container.decode([AnyJSON].self) {
                value = arrayValue.map(\.value)
            } else if let dictionaryValue = try? container.decode([String: AnyJSON].self) {
                value = dictionaryValue.mapValues(\.value)
            } else if container.decodeNil() {
                value = NSNull()
            } else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
            }
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch value {
            case let boolValue as Bool:
                try container.encode(boolValue)
            case let intValue as Int:
                try container.encode(intValue)
            case let doubleValue as Double:
                try container.encode(doubleValue)
            case let stringValue as String:
                try container.encode(stringValue)
            case let arrayValue as [Any]:
                try container.encode(arrayValue.map(AnyJSON.init))
            case let dictionaryValue as [String: Any]:
                try container.encode(dictionaryValue.mapValues(AnyJSON.init))
            case is NSNull:
                try container.encodeNil()
            default:
                try container.encodeNil()
            }
        }
    }

    private let stateURL: URL
    private let logURL: URL
    private let rootURL: URL

    static func install() throws -> TestFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-selection-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        let stateURL = rootURL.appendingPathComponent("state.json")
        let logURL = rootURL.appendingPathComponent("requests.log")
        let helperScript = Self.helperScriptTemplate
            .replacingOccurrences(of: "__STATE_PATH__", with: jsStringLiteral(stateURL.path))
            .replacingOccurrences(of: "__LOG_PATH__", with: jsStringLiteral(logURL.path))
            .replacingOccurrences(of: "__ROOT_PATH__", with: jsStringLiteral(rootURL.path))

        try helperScript.write(to: helperURL, atomically: true, encoding: .utf8)
        try Data("".utf8).write(to: logURL)

        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return TestFixture(stateURL: stateURL, logURL: logURL, rootURL: rootURL)
    }

    func reset(state: State) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(state)
        try data.write(to: stateURL)
        try Data("".utf8).write(to: logURL)
        try writeSkillDocuments(state: state)
    }

    func readState() throws -> State {
        let data = try Data(contentsOf: stateURL)
        return try JSONDecoder().decode(State.self, from: data)
    }

    func makeModel() async throws -> MainViewModel {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(state)
        await model.bootstrap()
        switch model.loadState {
        case .ready:
            break
        default:
            XCTFail("Expected model to be ready after bootstrap")
        }
        XCTAssertEqual(model.selectedGroupId, "alpha")
        await model.selectSource("alpha")
        try await waitForDetailHydration(model, sourceId: "alpha")
        return model
    }

    func waitForDetailHydration(
        _ model: MainViewModel,
        sourceId: String,
        timeoutNanoseconds: UInt64 = 1_000_000_000
    ) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        while Date() < deadline {
            if let detail = model.detailSnapshot(for: sourceId),
               !detail.groupDocuments.isEmpty,
               !detail.fileTree.isEmpty,
               detail.skills.allSatisfy({ !$0.documents.isEmpty }) {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Timed out waiting for detail hydration for \(sourceId)")
    }

    func waitForLoggedRequest(
        command: String,
        sourceId: String? = nil,
        minimumCount: Int = 1,
        model: MainViewModel? = nil,
        expectedDetailTitle: String? = nil,
        expectedDownloadCount: Int? = nil,
        timeoutNanoseconds: UInt64 = 1_000_000_000
    ) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        while Date() < deadline {
            let matchingRequests = loggedRequests().filter { request in
                guard request.command == command else {
                    return false
                }
                if let sourceId {
                    return request.payload?["sourceId"]?.value as? String == sourceId
                }
                return true
            }
            let hasExpectedRequestCount = matchingRequests.count >= minimumCount
            let hasExpectedDetailTitle = expectedDetailTitle.map { expectedTitle in
                guard let sourceId, let model else {
                    return false
                }
                return model.detailSnapshot(for: sourceId)?.title == expectedTitle
            } ?? true
            let hasExpectedDownloadCount = expectedDownloadCount.map { expectedDownloadCount in
                guard let sourceId, let model else {
                    return false
                }
                return model.detailSnapshot(for: sourceId)?.groupStats.downloadCount == expectedDownloadCount
            } ?? true
            if hasExpectedRequestCount, hasExpectedDetailTitle, hasExpectedDownloadCount {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Timed out waiting for \(command) request")
    }

    func loggedRequests() -> [LoggedRequest] {
        guard let raw = try? String(contentsOf: logURL, encoding: .utf8), !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return []
        }

        return raw
            .split(whereSeparator: \.isNewline)
            .compactMap { line in
                guard let data = String(line).data(using: .utf8) else { return nil }
                return try? JSONDecoder().decode(LoggedRequest.self, from: data)
            }
    }

    func removeSkillDocument(sourceId: String, leafId: String) throws {
        let url = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(leafId, isDirectory: true)
            .appendingPathComponent("SKILL.md")
        try FileManager.default.removeItem(at: url)
    }

    func writeSkillDocument(sourceId: String, leafId: String, content: String) throws {
        let url = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(leafId, isDirectory: true)
            .appendingPathComponent("SKILL.md")
        try content.write(to: url, atomically: true, encoding: .utf8)
    }

    func replaceSkillDocumentWithDirectory(sourceId: String, leafId: String) throws {
        let url = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(leafId, isDirectory: true)
            .appendingPathComponent("SKILL.md", isDirectory: false)
        try? FileManager.default.removeItem(at: url)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    func writeReferenceDocument(sourceId: String, leafId: String, name: String, content: String) throws {
        let referencesURL = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(leafId, isDirectory: true)
            .appendingPathComponent("references", isDirectory: true)
        try FileManager.default.createDirectory(at: referencesURL, withIntermediateDirectories: true)
        try content.write(
            to: referencesURL.appendingPathComponent(name),
            atomically: true,
            encoding: .utf8
        )
    }

    func writeSkillSidecarDocument(sourceId: String, leafId: String, name: String, content: String) throws {
        let folderURL = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(leafId, isDirectory: true)
        try content.write(
            to: folderURL.appendingPathComponent(name),
            atomically: true,
            encoding: .utf8
        )
    }

    func writeGroupDocument(sourceId: String, name: String, content: String) throws {
        let folderURL = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
        try content.write(
            to: folderURL.appendingPathComponent(name),
            atomically: true,
            encoding: .utf8
        )
    }

    func setModificationDate(_ date: Date, forGroupDocumentIn sourceId: String, name: String) throws {
        let url = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(name)
        try FileManager.default.setAttributes([.modificationDate: date], ofItemAtPath: url.path)
    }

    private func writeSkillDocuments(state: State) throws {
        let docsRoot = rootURL.appendingPathComponent("docs", isDirectory: true)
        try? FileManager.default.removeItem(at: docsRoot)
        try FileManager.default.createDirectory(at: docsRoot, withIntermediateDirectories: true)

        for (sourceId, source) in state.sources {
            let sourceRoot = docsRoot.appendingPathComponent(sourceId, isDirectory: true)
            try FileManager.default.createDirectory(at: sourceRoot, withIntermediateDirectories: true)
            try """
            # \(source.displayName)

            Root README for \(sourceId).
            """.write(to: sourceRoot.appendingPathComponent("README.md"), atomically: true, encoding: .utf8)
            try """
            # \(source.displayName) README.zh

            Chinese README for \(sourceId).
            """.write(to: sourceRoot.appendingPathComponent("README.zh.md"), atomically: true, encoding: .utf8)
            try """
            # Changelog

            Changes for \(sourceId).
            """.write(to: sourceRoot.appendingPathComponent("CHANGELOG.md"), atomically: true, encoding: .utf8)

            for leaf in source.leafs {
                let leafDir = sourceRoot.appendingPathComponent(leaf.id, isDirectory: true)
                try FileManager.default.createDirectory(at: leafDir, withIntermediateDirectories: true)
                let content = """
                ---
                name: \(leaf.name)
                description: \(leaf.description)
                ---

                # \(leaf.name)

                \(leaf.description)

                ## Usage

                Run this skill when you need the \(leaf.name) workflow.

                ## Notes

                Final verification line.
                """
                try content.write(to: leafDir.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
            }
        }
    }

    private static func jsStringLiteral(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
    }

    private static let helperScriptTemplate = """
    const fs = require('fs');
    const path = require('path');

    const statePath = '__STATE_PATH__';
    const logPath = '__LOG_PATH__';
    const rootPath = '__ROOT_PATH__';

    function readState() {
      try {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch (error) {
        return {
          availableTargets: [],
          sources: {}
        };
      }
    }

    function writeState(state) {
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    }

    function logRequest(request) {
      fs.appendFileSync(logPath, JSON.stringify({
        command: request.command,
        payload: request.payload ?? null
      }) + '\\n');
    }

    function buildSummaries(state) {
      const targetIds = state.availableTargets || [];
      return Object.entries(state.sources || {}).map(([sourceId, source]) => {
        const enabledTargets = source.enabledTargets || [];
        const bindingsTargets = {};
        for (const targetId of targetIds) {
          bindingsTargets[targetId] = {
            enabled: enabledTargets.includes(targetId),
            leafIds: (source.targetLeafIdsByTarget && source.targetLeafIdsByTarget[targetId]) || []
          };
        }

        return {
          source: {
            id: sourceId,
            kind: source.kind,
            displayName: source.displayName,
            locator: source.locator
          },
          lock: {
            updatedAt: source.updatedAt || '-'
          },
          leafs: (source.leafs || []).map((leaf) => ({
            id: leaf.id,
            linkName: leaf.linkName,
            name: leaf.name,
            description: leaf.description,
            metadataWarnings: leaf.metadataWarnings || []
          })),
          bindings: {
            selectedLeafIds: source.selectedLeafIds || [],
            targets: bindingsTargets
          },
          health: source.health || 'HEALTHY',
          issueCounts: {
            warning: 0,
            error: 0
          }
        };
      });
    }

    function buildSourceSnapshot(source, title) {
      return {
        canonicalRepo: source.locator.replace(/^https:\\/\\/github.com\\//, ''),
        title,
        sourceUrl: source.locator,
        repoUrl: source.locator,
        repoLabel: source.locator.replace(/^https:\\/\\/github.com\\//, ''),
        provider: source.metadataProvider || 'clawhub',
        owner: {
          slug: 'acme',
          sourceUrl: 'https://github.com/acme'
        },
        repoStars: source.starCount ?? null,
        skills: []
      };
    }

    function buildGroupCardEnrichment(state) {
      return Object.fromEntries(Object.entries(state.sources || {}).map(([sourceId, source]) => {
        const status = source.metadataStatus || 'ready';
        const provider = source.metadataProvider || 'clawhub';
        const groupPath = path.join(rootPath, 'docs', sourceId);
        const sourceMetadata = status === 'ready'
          ? {
              status: 'ready',
              provider,
              data: {
                provider,
                starCount: source.starCount ?? null,
                totalInstalls: 5045,
                weeklyInstalls: 4921,
                downloadCount: 211898,
                ownerHandle: '@steipete',
                ownerDisplayName: 'Peter Steinberger'
              }
            }
          : {
              status,
              provider,
              ...(source.metadataReasonCode ? { reasonCode: source.metadataReasonCode } : {}),
              ...(status === 'failed' ? { retryable: true } : {})
            };

        return [sourceId, {
          sourceMetadata,
          groupPath,
          ...(source.enrichmentSourceSnapshotTitle ? {
            sourceSnapshot: buildSourceSnapshot(source, source.enrichmentSourceSnapshotTitle)
          } : {})
        }];
      }));
    }

    function buildInspectPayload(state, sourceId) {
      const source = (state.sources || {})[sourceId] || {};
      const targetIds = state.availableTargets || [];
      const bindingsTargets = {};
      for (const targetId of targetIds) {
        bindingsTargets[targetId] = {
          enabled: (source.enabledTargets || []).includes(targetId),
          leafIds: (source.targetLeafIdsByTarget && source.targetLeafIdsByTarget[targetId]) || []
        };
      }

      return {
        summary: buildSummaries(state).find((item) => item.source.id === sourceId) || null,
        source: {
          id: sourceId,
          kind: source.kind,
          displayName: source.displayName,
          locator: source.locator,
          addedAt: '2026-03-25T12:00:00Z',
          selectionMode: 'partial'
        },
        binding: {
          selectedLeafIds: source.selectedLeafIds || [],
          targets: bindingsTargets
        },
        leafs: (source.leafs || []).map((leaf) => ({
          id: leaf.id,
          sourceId,
          title: leaf.name,
          name: leaf.name,
          linkName: leaf.linkName,
          description: leaf.description,
          relativePath: `${leaf.id}`,
          absolutePath: path.join(rootPath, 'docs', sourceId, leaf.id),
          skillFilePath: path.join(rootPath, 'docs', sourceId, leaf.id, 'SKILL.md'),
          metadataWarnings: leaf.metadataWarnings || []
        })),
        deployments: (source.enabledTargets || []).map((target) => ({
          sourceId,
          leafId: ((source.targetLeafIdsByTarget && source.targetLeafIdsByTarget[target]) || [])[0] || null,
          target,
          status: 'active'
        })),
        ...(source.sourceSnapshotTitle ? {
          sourceSnapshot: buildSourceSnapshot(source, source.sourceSnapshotTitle)
        } : {})
      };
    }

    function responseFor(request, ok, data, warnings, errors) {
      return {
        protocolVersion: '1.0',
        requestId: request.requestId || null,
        command: request.command,
        ok,
        data: data === undefined ? null : data,
        warnings: warnings || [],
        errors: errors || []
      };
    }

    function main() {
      const request = JSON.parse(fs.readFileSync(0, 'utf8'));
      const state = readState();
      logRequest(request);

      if (request.command === 'bootstrap') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          availableTargets: state.availableTargets || [],
          pinnedSourceIds: state.pinnedSourceIds || [],
          summaries: buildSummaries(state),
          groupCardEnrichmentBySourceId: buildGroupCardEnrichment(state),
          audit: {
            issues: []
          },
          initialDrafts: Object.fromEntries(Object.entries(state.sources || {}).map(([sourceId, source]) => {
            const enabledTargets = source.enabledTargets || [];
            const targetLeafIdsByTarget = source.targetLeafIdsByTarget || {};
            const selectedLeafIds = (source.selectedLeafIds && source.selectedLeafIds.length > 0)
              ? source.selectedLeafIds
              : enabledTargets.flatMap((target) => targetLeafIdsByTarget[target] || []);
            return [sourceId, {
              selectedLeafIds,
              enabledTargets
            }];
          }))
        }, [], [])));
        return;
      }

      if (request.command === 'list') {
        const response = JSON.stringify(responseFor(request, true, {
          pinnedSourceIds: state.pinnedSourceIds || [],
          summaries: buildSummaries(state),
          groupCardEnrichmentBySourceId: buildGroupCardEnrichment(state)
        }, [], []));
        if (state.listDelayMilliseconds > 0) {
          setTimeout(() => process.stdout.write(response), state.listDelayMilliseconds);
        } else {
          process.stdout.write(response);
        }
        return;
      }

      if (request.command === 'inspect') {
        const sourceId = request.payload && request.payload.sourceId;
        const response = JSON.stringify(responseFor(request, true, buildInspectPayload(state, sourceId), [], []));
        if (state.inspectDelayMilliseconds > 0) {
          setTimeout(() => process.stdout.write(response), state.inspectDelayMilliseconds);
        } else {
          process.stdout.write(response);
        }
        return;
      }

      if (request.command === 'inspect-enrichment') {
        const sourceId = request.payload && request.payload.sourceId;
        const source = (state.sources || {})[sourceId] || {};
        const sourceMetadata = (() => {
          const status = source.metadataStatus || 'ready';
          const provider = source.metadataProvider || 'clawhub';
          if (status === 'ready') {
            return {
              status: 'ready',
              provider,
              data: {
                provider,
                starCount: source.starCount ?? null,
                totalInstalls: source.inspectEnrichmentTotalInstalls ?? 5045,
                weeklyInstalls: 4921,
                downloadCount: 211898,
                ownerHandle: '@steipete',
                ownerDisplayName: 'Peter Steinberger'
              }
            };
          }

          const metadata = {
            status,
            provider
          };
          if (source.metadataReasonCode) {
            metadata.reasonCode = source.metadataReasonCode;
          }
          if (status === 'failed') {
            metadata.retryable = true;
          }
          return metadata;
        })();
        const response = JSON.stringify(responseFor(request, true, {
          sourceMetadata,
          ...(source.enrichmentSourceSnapshotTitle ? {
            sourceSnapshot: buildSourceSnapshot(source, source.enrichmentSourceSnapshotTitle)
          } : {})
        }, [], []));
        if (state.inspectEnrichmentDelayMilliseconds > 0) {
          setTimeout(() => process.stdout.write(response), state.inspectEnrichmentDelayMilliseconds);
        } else {
          process.stdout.write(response);
        }
        return;
      }

      if (request.command === 'apply') {
        const sourceId = request.payload && request.payload.sourceId;
        const draft = request.payload && request.payload.draft ? request.payload.draft : {};
        const failures = ((state.sources || {})[sourceId] || {}).applyFailures || [];
        if (failures.length > 0) {
          process.stdout.write(JSON.stringify(responseFor(request, false, null, [], failures.map((message) => ({
            code: 'apply_failed',
            message
          })))));
          return;
        }

        if (!state.sources || !state.sources[sourceId]) {
          process.stdout.write(JSON.stringify(responseFor(request, false, null, [], [{
            code: 'missing_source',
            message: 'Unknown source.'
          }])));
          return;
        }

        state.sources[sourceId].selectedLeafIds = draft.selectedLeafIds || [];
        state.sources[sourceId].enabledTargets = draft.enabledTargets || [];
        state.sources[sourceId].targetLeafIdsByTarget = Object.fromEntries(
          (state.availableTargets || []).map((targetId) => [
            targetId,
            (draft.enabledTargets || []).includes(targetId)
              ? (draft.selectedLeafIds || [])
              : []
          ])
        );
        writeState(state);
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          sourceId,
          summary: buildSummaries(state).find((item) => item.source.id === sourceId) || null,
          inspect: buildInspectPayload(state, sourceId)
        }, [], [])));
        return;
      }

      if (request.command === 'rename-source') {
        const sourceId = request.payload?.sourceId;
        const displayName = String(request.payload?.displayName || '').trim();
        const renameFailures = ((state.sources || {})[sourceId] || {}).renameFailures || [];
        if (renameFailures.length > 0) {
          process.stdout.write(JSON.stringify(responseFor(request, false, null, [], renameFailures.map((message) => ({
            code: 'SOURCE_NOT_FOUND',
            message
          })))));
          return;
        }
        if (!state.sources[sourceId]) {
          process.stdout.write(JSON.stringify(responseFor(request, false, null, [], [{
            code: 'SOURCE_NOT_FOUND',
            message: `Skills group id '${sourceId}' is not registered.`
          }])));
          return;
        }
        state.sources[sourceId].displayName = displayName;
        writeState(state);
        process.stdout.write(JSON.stringify(responseFor(request, true, { sourceId, displayName }, [], [])));
        return;
      }

      if (request.command === 'update') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          updated: []
        }, [], [])));
        return;
      }

      if (request.command === 'doctor') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          issues: []
        }, [], [])));
        return;
      }

      process.stdout.write(JSON.stringify(responseFor(request, true, null, [], [])));
    }

    main();
    """
}

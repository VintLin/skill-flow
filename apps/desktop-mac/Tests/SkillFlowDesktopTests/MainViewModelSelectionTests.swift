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
        let document = model.groupDocument(for: "alpha", documentId: documentId)

        XCTAssertEqual(document?.content, "SKILL.md unavailable.")
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
    }

    struct State: Codable, Equatable {
        var availableTargets: [String]
        var sources: [String: SourceState]

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
            ]
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
            ]
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

        return [sourceId, { sourceMetadata, groupPath }];
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
        }))
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
      logRequest(request);

      const state = readState();

      if (request.command === 'bootstrap') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          availableTargets: state.availableTargets || [],
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
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          summaries: buildSummaries(state),
          groupCardEnrichmentBySourceId: buildGroupCardEnrichment(state)
        }, [], [])));
        return;
      }

      if (request.command === 'inspect') {
        const sourceId = request.payload && request.payload.sourceId;
        process.stdout.write(JSON.stringify(responseFor(request, true, buildInspectPayload(state, sourceId), [], [])));
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
                totalInstalls: 5045,
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
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          sourceMetadata,
        }, [], [])));
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

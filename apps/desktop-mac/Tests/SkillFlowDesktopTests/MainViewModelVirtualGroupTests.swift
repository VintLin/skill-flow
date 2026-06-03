import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelVirtualGroupTests: XCTestCase {
    func testVirtualHomeSourcePredicateMatchesVirtualCards() {
        XCTAssertTrue(MainViewModel.isVirtualHomeSource(groupCard(sourceKind: " virtual ")))
        XCTAssertFalse(MainViewModel.isVirtualHomeSource(groupCard(sourceKind: "git")))
    }

    func testCreateVirtualGroupDraftValidatesNameAndSelection() async {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: VirtualGroupQueryStub(),
            commandFacade: RecordingVirtualGroupCommandFacade()
        )

        await model.bootstrap()

        XCTAssertEqual(
            model.validateVirtualGroupCreate(
                displayName: "  ",
                selectedSkills: [VirtualGroupSkillRef(sourceId: "alpha", leafId: "alpha-a")]
            ),
            .nameRequired
        )
        XCTAssertEqual(
            model.validateVirtualGroupCreate(displayName: "Virtual Group", selectedSkills: []),
            .skillsRequired
        )
        XCTAssertEqual(
            model.validateVirtualGroupCreate(
                displayName: "Virtual Group",
                selectedSkills: [VirtualGroupSkillRef(sourceId: "alpha", leafId: "alpha-a")]
            ),
            .valid
        )

        XCTAssertEqual(
            model.virtualGroupSourceOptions,
            [
                MainViewModel.VirtualGroupSourceOption(id: "alpha", title: "Alpha", skillCount: 2, isVirtual: false),
                MainViewModel.VirtualGroupSourceOption(id: "beta", title: "Beta", skillCount: 1, isVirtual: true),
            ]
        )
        XCTAssertEqual(
            model.virtualGroupSkillOptions(for: "alpha"),
            [
                MainViewModel.VirtualGroupSkillOption(
                    id: "alpha:alpha-a",
                    sourceId: "alpha",
                    sourceTitle: "Alpha",
                    leafId: "alpha-a",
                    title: "Browse",
                    isEnabled: true
                ),
                MainViewModel.VirtualGroupSkillOption(
                    id: "alpha:alpha-b",
                    sourceId: "alpha",
                    sourceTitle: "Alpha",
                    leafId: "alpha-b",
                    title: "Review",
                    isEnabled: false
                ),
            ]
        )
    }

    func testMergeVirtualGroupRequiresTwoGroups() async {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: VirtualGroupQueryStub(),
            commandFacade: RecordingVirtualGroupCommandFacade()
        )

        await model.bootstrap()

        XCTAssertEqual(
            model.validateVirtualGroupMerge(displayName: "  ", sourceIds: ["alpha", "beta"]),
            .nameRequired
        )
        XCTAssertEqual(
            model.validateVirtualGroupMerge(displayName: "Merged", sourceIds: []),
            .groupsRequired
        )
        XCTAssertEqual(
            model.validateVirtualGroupMerge(displayName: "Merged", sourceIds: ["alpha", "alpha"]),
            .groupsRequired
        )
        XCTAssertEqual(
            model.validateVirtualGroupMerge(displayName: "Merged", sourceIds: ["alpha", "beta", "alpha"]),
            .valid
        )
    }

    func testCreateVirtualGroupCallsCommandFacade() async {
        let query = VirtualGroupQueryStub()
        let command = RecordingVirtualGroupCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )

        await model.bootstrap()
        await model.createVirtualGroup(
            displayName: "Team Tools",
            skills: [
                VirtualGroupSkillRef(sourceId: "alpha", leafId: "alpha-a"),
                VirtualGroupSkillRef(sourceId: "beta", leafId: "beta-a"),
            ],
            enabledTargets: ["codex", "claude-code"]
        )

        XCTAssertEqual(
            command.createCalls,
            [
                RecordingVirtualGroupCommandFacade.CreateCall(
                    displayName: "Team Tools",
                    skills: [
                        VirtualGroupSkillRef(sourceId: "alpha", leafId: "alpha-a"),
                        VirtualGroupSkillRef(sourceId: "beta", leafId: "beta-a"),
                    ],
                    enabledTargets: ["codex", "claude-code"]
                )
            ]
        )
        XCTAssertEqual(query.listCallCount, 1)
    }

    private func groupCard(sourceKind: String) -> MainViewModel.GroupCardModel {
        MainViewModel.GroupCardModel(
            id: "alpha",
            title: "Alpha",
            byline: nil,
            groupPath: nil,
            sourceKind: sourceKind,
            sourceLocator: "https://example.com/alpha",
            isPinned: false,
            health: "HEALTHY",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(
                skillCount: nil,
                downloadCount: nil,
                starCount: nil,
                githubURL: nil,
                localPath: nil
            ),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )
    }
}

@MainActor
private final class VirtualGroupQueryStub: DesktopQuerying {
    private(set) var listCallCount = 0

    func bootstrap() async throws -> BridgeResponse {
        BridgeResponse.success(command: .bootstrap, payload: payload())
    }

    func list() async throws -> BridgeResponse {
        listCallCount += 1
        return BridgeResponse.success(command: .list, payload: payload())
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        BridgeResponse.success(command: .inspect, payload: [:])
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        BridgeResponse.success(command: .inspectEnrichment, payload: [:])
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        BridgeResponse.success(command: .searchImportGroups, payload: ["groups": []])
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        BridgeResponse.success(command: .previewImportSource, payload: [:])
    }

    private func payload() -> [String: Any] {
        [
            "availableTargets": ["codex", "claude-code"],
            "summaries": [
                summary(
                    sourceId: "alpha",
                    kind: "git",
                    displayName: "Alpha",
                    leafs: [
                        ("alpha-a", "Browse"),
                        ("alpha-b", "Review"),
                    ],
                    selectedLeafIds: ["alpha-a"],
                    enabledTargets: ["codex"]
                ),
                summary(
                    sourceId: "beta",
                    kind: "virtual",
                    displayName: "Beta",
                    leafs: [
                        ("beta-a", "Plan"),
                    ],
                    selectedLeafIds: ["beta-a"],
                    enabledTargets: ["claude-code"]
                ),
            ],
        ]
    }

    private func summary(
        sourceId: String,
        kind: String,
        displayName: String,
        leafs: [(String, String)],
        selectedLeafIds: [String],
        enabledTargets: [String]
    ) -> [String: Any] {
        [
            "source": [
                "id": sourceId,
                "kind": kind,
                "displayName": displayName,
                "locator": "https://example.com/\(sourceId)",
            ],
            "lock": [
                "updatedAt": "2026-04-01T00:00:00.000Z",
            ],
            "leafs": leafs.map { leafId, title in
                [
                    "id": leafId,
                    "linkName": leafId,
                    "name": title,
                    "description": "",
                    "metadataWarnings": [],
                ] as [String: Any]
            },
            "bindings": [
                "selectedLeafIds": selectedLeafIds,
                "targets": Dictionary(
                    uniqueKeysWithValues: enabledTargets.map { target in
                        (target, [
                            "enabled": true,
                            "leafIds": selectedLeafIds,
                        ] as [String: Any])
                    }
                ),
            ],
            "issueCounts": [
                "warning": 0,
                "error": 0,
            ],
            "health": "HEALTHY",
        ]
    }
}

@MainActor
private final class RecordingVirtualGroupCommandFacade: DesktopCommanding {
    struct CreateCall: Equatable {
        let displayName: String
        let skills: [VirtualGroupSkillRef]
        let enabledTargets: [String]
    }

    private(set) var createCalls: [CreateCall] = []

    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        fatalError("unused")
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

    func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
        createCalls.append(CreateCall(displayName: displayName, skills: skills, enabledTargets: enabledTargets))
        return BridgeResponse.success(command: .createVirtualGroup, payload: ["sourceId": "virtual-team-tools"])
    }

    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func restoreMergedGroups(virtualGroupId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse {
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
            requestId: "test",
            command: command,
            ok: true,
            data: AnyCodable(payload),
            warnings: [],
            errors: []
        )
    }
}

import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelProjectScopeTests: XCTestCase {
    func testProjectScopedDraftsStayIsolatedFromGlobalDrafts() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()

        XCTAssertEqual(model.loadState, .ready)
        XCTAssertEqual(state.settings.selectedProjectScope, .global)
        XCTAssertEqual(state.settings.recentProjectScopes.map(\.projectId), ["repo-a"])
        XCTAssertTrue(model.isSkillEnabled("alpha-a", sourceId: "alpha"))
        XCTAssertFalse(model.isSkillEnabled("alpha-b", sourceId: "alpha"))
        XCTAssertEqual(model.saveState(for: "alpha").phase, .idle)

        state.settings.selectedProjectScope = .project("repo-a")

        XCTAssertFalse(model.isSkillEnabled("alpha-a", sourceId: "alpha"))
        XCTAssertTrue(model.isSkillEnabled("alpha-b", sourceId: "alpha"))
        XCTAssertEqual(model.saveState(for: "alpha").phase, .idle)

        await model.setSkillEnabled("alpha-a", enabled: true, sourceId: "alpha")

        XCTAssertEqual(command.recordedScopes, [.project("repo-a")])
        XCTAssertEqual(model.saveState(for: "alpha").phase, .saved)

        state.settings.selectedProjectScope = .global

        XCTAssertTrue(model.isSkillEnabled("alpha-a", sourceId: "alpha"))
        XCTAssertFalse(model.isSkillEnabled("alpha-b", sourceId: "alpha"))
        XCTAssertEqual(model.saveState(for: "alpha").phase, .idle)

        state.settings.selectedProjectScope = .project("repo-a")

        XCTAssertTrue(model.isSkillEnabled("alpha-a", sourceId: "alpha"))
        XCTAssertTrue(model.isSkillEnabled("alpha-b", sourceId: "alpha"))
        XCTAssertEqual(model.saveState(for: "alpha").phase, .saved)
    }

    func testRefreshFallsBackToGlobalWhenSelectedProjectDisappears() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        await model.selectProjectScope(.project("repo-a"))

        query.listRecentProjects = []
        query.listSelectedScope = .global

        await model.refreshList()

        XCTAssertEqual(model.selectedProjectScope, .global)
        XCTAssertTrue(model.recentProjectScopes.isEmpty)
    }

    func testSelectProjectScopeShowsLocalizedToast() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        await model.selectProjectScope(.project("repo-a"))

        XCTAssertEqual(model.toast?.style, .success)
        XCTAssertEqual(model.toast?.message, "Switched to Repo A.")

        await model.selectProjectScope(.global)

        XCTAssertEqual(model.toast?.style, .success)
        XCTAssertEqual(model.toast?.message, "Switched to Global.")
    }

    func testSelectingProjectScopeInitializesMissingProjectDraftWithAllSkillsAndNoTargets() async {
        let query = ProjectScopeQueryStub()
        query.bootstrapProjectDrafts = [:]
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()

        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .full)

        await model.selectProjectScope(.project("repo-a"))

        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .full)
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .empty)
    }

    func testSelectingProjectScopeDoesNotReinitializeExistingProjectDraft() async {
        let query = ProjectScopeQueryStub()
        query.bootstrapProjectDrafts = [:]
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        await model.selectProjectScope(.project("repo-a"))
        await model.setTargetEnabled("codex", enabled: true, sourceId: "alpha")
        await model.selectProjectScope(.global)
        await model.selectProjectScope(.project("repo-a"))

        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .full)
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .full)
    }

    func testSelectingProjectScopeShowsInitializationToastOnlyWhenProjectDraftsAreCreated() async {
        let query = ProjectScopeQueryStub()
        query.bootstrapProjectDrafts = [:]
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        await model.selectProjectScope(.project("repo-a"))

        XCTAssertEqual(model.toast?.style, .success)
        XCTAssertEqual(model.toast?.message, "Initialized project config for Repo A.")

        model.dismissToast()
        await model.selectProjectScope(.global)
        await model.selectProjectScope(.project("repo-a"))

        XCTAssertEqual(model.toast?.message, "Switched to Repo A.")
    }

    func testBootstrapParsesRecentProjectPath() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()

        XCTAssertEqual(model.recentProjectScopes.first?.projectPath, "/Users/test/src/repo-a")
    }

    func testProjectScopedDetailSurfacesProjectLocalDeploymentPath() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        await model.selectProjectScope(.project("repo-a"))
        await model.selectSource("alpha")
        let deadline = Date().addingTimeInterval(1)
        var detail = model.detailSnapshot(for: "alpha")
        while Date() < deadline, detail?.deploymentFacts.contains(where: { $0.contains(".agents/skills/review") }) != true {
            try? await Task.sleep(nanoseconds: 20_000_000)
            detail = model.detailSnapshot(for: "alpha")
        }

        XCTAssertTrue(detail?.deploymentFacts.contains(where: { $0.contains(".agents/skills/review") }) == true)
    }

    func testGlobalTargetTogglePreservesRecentProjectScopesWhenApplyOmitsProjectState() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        XCTAssertEqual(model.recentProjectScopes.map(\.projectId), ["repo-a"])

        await model.setTargetEnabled("codex", enabled: false, sourceId: "alpha")

        XCTAssertEqual(command.recordedScopes, [.global])
        XCTAssertEqual(model.recentProjectScopes.map(\.projectId), ["repo-a"])
        XCTAssertEqual(state.settings.recentProjectScopes.map(\.projectId), ["repo-a"])
    }

    func testGlobalTargetToggleClearsRecentProjectScopesWhenApplyExplicitlyReturnsEmptyProjects() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        command.applyProjectScopePayload = [
            "recentProjects": [],
            "selectedProjectScope": [
                "kind": "global"
            ]
        ]
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        XCTAssertEqual(model.recentProjectScopes.map(\.projectId), ["repo-a"])

        await model.setTargetEnabled("codex", enabled: false, sourceId: "alpha")

        XCTAssertEqual(command.recordedScopes, [.global])
        XCTAssertTrue(model.recentProjectScopes.isEmpty)
        XCTAssertTrue(state.settings.recentProjectScopes.isEmpty)
    }

    func testFailedProjectSaveAppliesReturnedProjectScopeState() async {
        let query = ProjectScopeQueryStub()
        let command = ProjectScopeCommandStub()
        command.applyError = .commandFailed(
            "Project scope 'repo-a' is unavailable.",
            response: BridgeResponse(
                protocolVersion: "1.0",
                requestId: UUID().uuidString,
                command: .apply,
                ok: false,
                data: AnyCodable([
                    "recentProjects": [],
                    "selectedProjectScope": [
                        "kind": "global"
                    ]
                ]),
                warnings: [],
                errors: [
                    BridgeIssue(
                        code: "PROJECT_SCOPE_PATH_UNAVAILABLE",
                        message: "Project scope 'repo-a' is unavailable."
                    )
                ]
            )
        )
        let state = DesktopAppState()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )
        model.bindRouteState(state)

        await model.bootstrap()
        await model.selectProjectScope(.project("repo-a"))
        await model.setTargetEnabled("codex", enabled: false, sourceId: "alpha")

        XCTAssertEqual(model.selectedProjectScope, .global)
        XCTAssertTrue(model.recentProjectScopes.isEmpty)
        XCTAssertEqual(state.settings.selectedProjectScope, .global)
        XCTAssertTrue(state.settings.recentProjectScopes.isEmpty)
    }
}

@MainActor
private final class ProjectScopeQueryStub: DesktopQuerying {
    var bootstrapProjectDrafts: [String: [String: [String: Any]]] = [
        "repo-a": [
            "alpha": [
                "selectedLeafIds": ["alpha-b"],
                "enabledTargets": ["codex"]
            ]
        ]
    ]
    var listRecentProjects: [[String: Any]] = [
        [
            "projectId": "repo-a",
            "title": "Repo A",
            "lastActivityAt": "2026-03-31T12:00:00.000Z",
            "projectPath": "/Users/test/src/repo-a",
            "tools": ["codex"]
        ]
    ]
    var listSelectedScope: ProjectScopeSelection = .global

    func bootstrap() async throws -> BridgeResponse {
        BridgeResponse.success(command: .bootstrap, payload: [
            "availableTargets": ["codex"],
            "summaries": [
                summaryPayload(
                    sourceId: "alpha",
                    selectedLeafIds: ["alpha-a"],
                    enabledTargets: ["codex"]
                )
            ],
            "initialDrafts": [
                "alpha": [
                    "selectedLeafIds": ["alpha-a"],
                    "enabledTargets": ["codex"]
                ]
            ],
            "recentProjects": [
                [
                    "projectId": "repo-a",
                    "title": "Repo A",
                    "lastActivityAt": "2026-03-31T12:00:00.000Z",
                    "projectPath": "/Users/test/src/repo-a",
                    "tools": ["codex"]
                ]
            ],
            "selectedProjectScope": [
                "kind": "global"
            ],
            "projectDrafts": bootstrapProjectDrafts,
            "audit": [
                "issues": []
            ]
        ])
    }

    func list() async throws -> BridgeResponse {
        BridgeResponse.success(command: .list, payload: [
            "summaries": [
                summaryPayload(
                    sourceId: "alpha",
                    selectedLeafIds: ["alpha-a"],
                    enabledTargets: ["codex"]
                )
            ],
            "recentProjects": listRecentProjects,
            "selectedProjectScope": [
                "kind": listSelectedScope.kindValue,
                "projectId": listSelectedScope.projectIdValue as Any
            ].compactMapValues { $0 }
        ])
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        BridgeResponse.success(command: .inspect, payload: [
            "source": [
                "id": sourceId
            ],
            "deployments": [
                [
                    "target": "codex",
                    "status": "active",
                    "leafId": scope == .global ? "alpha-a" : "alpha-b",
                    "targetPath": scope == .global
                        ? "/Users/test/.codex/skills/review"
                        : "/Users/test/src/repo-a/.agents/skills/review"
                ]
            ],
            "summary": summaryPayload(
                sourceId: sourceId,
                selectedLeafIds: scope == .global ? ["alpha-a"] : ["alpha-b"],
                enabledTargets: ["codex"]
            )
        ])
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

    private func summaryPayload(
        sourceId: String,
        selectedLeafIds: [String],
        enabledTargets: [String]
    ) -> [String: Any] {
        [
            "source": [
                "id": sourceId,
                "kind": "clawhub",
                "displayName": "Alpha",
                "locator": "https://example.com/\(sourceId)"
            ],
            "lock": [
                "updatedAt": "2026-03-31T12:00:00.000Z"
            ],
            "leafs": [
                [
                    "id": "alpha-a",
                    "linkName": "browse",
                    "name": "browse",
                    "description": "Browse",
                    "metadataWarnings": []
                ],
                [
                    "id": "alpha-b",
                    "linkName": "review",
                    "name": "review",
                    "description": "Review",
                    "metadataWarnings": []
                ]
            ],
            "bindings": [
                "selectedLeafIds": selectedLeafIds,
                "targets": Dictionary(
                    uniqueKeysWithValues: enabledTargets.map { target in
                        (target, [
                            "enabled": true,
                            "leafIds": selectedLeafIds
                        ] as [String: Any])
                    }
                )
            ],
            "issueCounts": [
                "warning": 0,
                "error": 0
            ],
            "health": "HEALTHY"
        ]
    }
}

private extension ProjectScopeSelection {
    var kindValue: String {
        switch self {
        case .global:
            return "global"
        case .project:
            return "project"
        }
    }

    var projectIdValue: String? {
        switch self {
        case .global:
            return nil
        case .project(let projectId):
            return projectId
        }
    }
}

@MainActor
private final class ProjectScopeCommandStub: DesktopCommanding {
    private(set) var recordedScopes: [ProjectScopeSelection] = []
    var applyProjectScopePayload: [String: Any] = [:]
    var applyError: BridgeClientError?

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
        recordedScopes.append(scope)
        if let applyError {
            throw applyError
        }
        return BridgeResponse.success(command: .apply, payload: [
            "summary": [
                "source": [
                    "id": sourceId,
                    "kind": "clawhub",
                    "displayName": "Alpha",
                    "locator": "https://example.com/\(sourceId)"
                ],
                "lock": [
                    "updatedAt": "2026-03-31T12:00:00.000Z"
                ],
                "leafs": [
                    [
                        "id": "alpha-a",
                        "linkName": "browse",
                        "name": "browse",
                        "description": "Browse",
                        "metadataWarnings": []
                    ],
                    [
                        "id": "alpha-b",
                        "linkName": "review",
                        "name": "review",
                        "description": "Review",
                        "metadataWarnings": []
                    ]
                ],
                "bindings": [
                    "selectedLeafIds": selectedLeafIds,
                    "targets": [
                        "codex": [
                            "enabled": true,
                            "leafIds": selectedLeafIds
                        ]
                    ]
                ],
                "issueCounts": [
                    "warning": 0,
                    "error": 0
                ],
                "health": "HEALTHY"
            ],
            "inspect": [
                "source": [
                    "id": sourceId
                ]
            ]
        ].merging(applyProjectScopePayload) { _, updated in updated })
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

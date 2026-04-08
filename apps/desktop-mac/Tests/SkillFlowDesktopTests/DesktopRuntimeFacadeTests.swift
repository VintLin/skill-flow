import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopRuntimeFacadeTests: XCTestCase {
    func testBridgeQueryFacadeForwardsBootstrapAndInspectCalls() async throws {
        let bridge = StubBridgeTransport()
        let facade = DesktopBridgeQueryFacade(bridgeClient: bridge)

        _ = try await facade.bootstrap()
        _ = try await facade.inspect(sourceId: "alpha", scope: .project("repo-a"))
        _ = try await facade.inspectEnrichment(sourceId: "alpha")

        XCTAssertEqual(bridge.recordedCommands, [
            "bootstrap",
            "inspect:alpha:project(repo-a)",
            "inspect-enrichment:alpha",
        ])
    }

    func testBridgeCommandFacadeForwardsMutationCalls() async throws {
        let bridge = StubBridgeTransport()
        let facade = DesktopBridgeCommandFacade(bridgeClient: bridge)

        _ = try await facade.saveSettings(customTargets: [], agentDisplayOrder: ["codex"])
        _ = try await facade.togglePinnedSource(sourceId: "alpha")
        _ = try await facade.updateSources(["alpha"])
        _ = try await facade.apply(sourceId: "alpha", scope: .project("repo-a"), selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"])

        XCTAssertEqual(bridge.recordedCommands, [
            "save-settings:[\"codex\"]",
            "toggle-pin:alpha",
            "update:[\"alpha\"]",
            "apply:alpha:project(repo-a)",
        ])
    }
}

private final class StubBridgeTransport: DesktopBridgeTransporting, @unchecked Sendable {
    private(set) var recordedCommands: [String] = []

    func bootstrap() async throws -> BridgeResponse {
        recordedCommands.append("bootstrap")
        return .success(command: .bootstrap)
    }

    func list() async throws -> BridgeResponse {
        recordedCommands.append("list")
        return .success(command: .list)
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        recordedCommands.append("inspect:\(sourceId):\(describe(scope))")
        return .success(command: .inspect)
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        recordedCommands.append("inspect-enrichment:\(sourceId)")
        return .success(command: .inspectEnrichment)
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        recordedCommands.append("search-import-groups:\(query ?? "nil")")
        return .success(command: .searchImportGroups)
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        recordedCommands.append("preview-import-source:\(locator)")
        return .success(command: .previewImportSource)
    }

    func saveSettings(customTargets: [[String : String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        recordedCommands.append("save-settings:\(agentDisplayOrder)")
        return .success(command: .saveSettings, payload: [:])
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        recordedCommands.append("toggle-pin:\(sourceId)")
        return .success(command: .togglePin)
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        recordedCommands.append("update:\(sourceIds ?? [])")
        return .success(command: .update)
    }

    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        recordedCommands.append("import-source:\(locator)")
        return .success(command: .importSource)
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        recordedCommands.append("uninstall:\(sourceIds)")
        return .success(command: .uninstall)
    }

    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        recordedCommands.append("apply:\(sourceId):\(describe(scope))")
        return .success(command: .apply)
    }

    func doctor() async throws -> BridgeResponse {
        recordedCommands.append("doctor")
        return .success(command: .doctor)
    }
}

private func describe(_ scope: ProjectScopeSelection) -> String {
    switch scope {
    case .global:
        return "global"
    case .project(let projectId):
        return "project(\(projectId))"
    }
}

private extension BridgeResponse {
    static func success(command: BridgeCommand, payload: [String: Any]? = nil) -> BridgeResponse {
        BridgeResponse(
            protocolVersion: "1.0",
            requestId: UUID().uuidString,
            command: command,
            ok: true,
            data: payload.map(AnyCodable.init),
            warnings: [],
            errors: []
        )
    }
}

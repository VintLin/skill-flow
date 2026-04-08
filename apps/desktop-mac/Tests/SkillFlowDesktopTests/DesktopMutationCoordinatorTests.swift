import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopMutationCoordinatorTests: XCTestCase {
    func testTogglePinnedDelegatesToCommandFacadeAndReturnsPinnedIds() async throws {
        let command = RecordingDesktopCommandFacade()
        let coordinator = DesktopMutationCoordinator(commandFacade: command)

        let result = try await coordinator.togglePinned(sourceId: "alpha")

        XCTAssertEqual(command.recordedMutations, ["toggle-pin:alpha"])
        XCTAssertEqual(result.pinnedSourceIds, ["alpha"])
    }

    func testUpdateSelectedSourceRequiresSelection() async throws {
        let command = RecordingDesktopCommandFacade()
        let coordinator = DesktopMutationCoordinator(commandFacade: command)

        let result = try await coordinator.updateSelectedSource(nil)

        switch result {
        case .missingSelection:
            break
        case .submitted:
            XCTFail("Expected missing selection")
        }
    }
}

private final class RecordingDesktopCommandFacade: DesktopCommanding, @unchecked Sendable {
    private(set) var recordedMutations: [String] = []

    func saveSettings(customTargets: [[String : String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        recordedMutations.append("save-settings:\(agentDisplayOrder)")
        return .success(command: .saveSettings, payload: [:])
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        recordedMutations.append("toggle-pin:\(sourceId)")
        return .success(
            command: .togglePin,
            payload: ["pinnedSourceIds": [sourceId]]
        )
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        recordedMutations.append("update:\(sourceIds ?? [])")
        return .success(command: .update)
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

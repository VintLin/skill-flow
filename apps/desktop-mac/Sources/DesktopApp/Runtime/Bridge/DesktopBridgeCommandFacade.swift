import Foundation

struct DesktopBridgeCommandFacade<Transport: DesktopBridgeTransporting>: DesktopCommanding {
    let bridgeClient: Transport

    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        try await bridgeClient.saveSettings(customTargets: customTargets, agentDisplayOrder: agentDisplayOrder)
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        try await bridgeClient.togglePinnedSource(sourceId: sourceId)
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        try await bridgeClient.updateSources(sourceIds)
    }

    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await bridgeClient.importSource(locator: locator, selectedSkillIds: selectedSkillIds, enabledTargets: enabledTargets)
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        try await bridgeClient.uninstall(sourceIds: sourceIds)
    }

    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await bridgeClient.apply(sourceId: sourceId, scope: scope, selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
    }

    func doctor() async throws -> BridgeResponse {
        try await bridgeClient.doctor()
    }
}

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

    func commitImportSource(preparationId: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await bridgeClient.commitImportSource(preparationId: preparationId, selectedSkillIds: selectedSkillIds, enabledTargets: enabledTargets)
    }

    func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
        try await bridgeClient.createVirtualGroup(displayName: displayName, skills: skills, enabledTargets: enabledTargets)
    }

    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await bridgeClient.mergeGroups(displayName: displayName, sourceIds: sourceIds, enabledTargets: enabledTargets)
    }

    func restoreMergedGroups(virtualGroupId: String) async throws -> BridgeResponse {
        try await bridgeClient.restoreMergedGroups(virtualGroupId: virtualGroupId)
    }

    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse {
        try await bridgeClient.renameSource(sourceId: sourceId, displayName: displayName)
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

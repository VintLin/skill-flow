import Foundation

protocol DesktopCommanding: Sendable {
    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse
    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse
    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse
    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse
    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String], skillSelectionMode: ImportSkillSelectionMode) async throws -> BridgeResponse
    func commitImportSource(preparationId: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse
    func commitImportSource(preparationId: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String], skillSelectionMode: ImportSkillSelectionMode) async throws -> BridgeResponse
    func createCollection(displayName: String, skills: [CollectionSkillRef], enabledTargets: [String]) async throws -> BridgeResponse
    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
    func restoreCollectionSources(collectionId: String) async throws -> BridgeResponse
    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse
    func uninstall(sourceIds: [String]) async throws -> BridgeResponse
    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
    func doctor() async throws -> BridgeResponse
}

extension DesktopCommanding {
    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }

    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String], skillSelectionMode: ImportSkillSelectionMode) async throws -> BridgeResponse {
        try await importSource(locator: locator, selectedSkills: selectedSkills, enabledTargets: enabledTargets)
    }

    func commitImportSource(preparationId: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }

    func commitImportSource(preparationId: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String], skillSelectionMode: ImportSkillSelectionMode) async throws -> BridgeResponse {
        try await commitImportSource(preparationId: preparationId, selectedSkills: selectedSkills, enabledTargets: enabledTargets)
    }
}

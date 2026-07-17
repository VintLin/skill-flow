import Foundation

protocol DesktopSettingsCommanding: Sendable {
    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse
}

protocol DesktopSourceMutationCommanding: Sendable {
    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse
    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse
    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse
}

protocol DesktopSourceApplying: Sendable {
    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
}

protocol DesktopImportCommanding: Sendable {
    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse
    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String], skillSelectionMode: ImportSkillSelectionMode) async throws -> BridgeResponse
    func commitImportSource(preparationId: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse
    func commitImportSource(preparationId: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String], skillSelectionMode: ImportSkillSelectionMode) async throws -> BridgeResponse
}

protocol DesktopCollectionCommanding: Sendable {
    func createCollection(displayName: String, skills: [CollectionSkillRef], enabledTargets: [String]) async throws -> BridgeResponse
    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
    func restoreCollectionSources(collectionId: String) async throws -> BridgeResponse
}

/// Composition-root transport. Feature modules depend only on their own
/// command interface above.
protocol DesktopCommandTransporting: DesktopSettingsCommanding, DesktopSourceMutationCommanding, DesktopSourceApplying, DesktopImportCommanding, DesktopCollectionCommanding {}

extension DesktopSettingsCommanding {
    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }
}

extension DesktopSourceMutationCommanding {
    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
}

extension DesktopSourceApplying {
    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }
}

extension DesktopImportCommanding {
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

extension DesktopCollectionCommanding {
    func createCollection(displayName: String, skills: [CollectionSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }
    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }
    func restoreCollectionSources(collectionId: String) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }
}

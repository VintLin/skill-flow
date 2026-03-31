import Foundation

protocol DesktopQuerying: Sendable {
    func bootstrap() async throws -> BridgeResponse
    func list() async throws -> BridgeResponse
    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse
    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse
    func searchImportGroups(query: String?) async throws -> BridgeResponse
    func previewImportSource(locator: String) async throws -> BridgeResponse
}

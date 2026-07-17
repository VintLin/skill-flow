import Foundation

protocol DesktopSourceQuerying: Sendable {
    func bootstrap() async throws -> BridgeResponse
    func list() async throws -> BridgeResponse
    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse
}

protocol DesktopImportQuerying: Sendable {
    func searchImportGroups(query: String?) async throws -> BridgeResponse
    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse
    func prepareImportSource(locator: String) async throws -> BridgeResponse
    func previewImportSource(locator: String) async throws -> BridgeResponse
}

protocol DesktopDetailEnrichmentQuerying: Sendable {
    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse
}

/// Composition-root transport. Feature modules depend only on one of the
/// narrow query interfaces above.
protocol DesktopQueryTransporting: DesktopSourceQuerying, DesktopImportQuerying, DesktopDetailEnrichmentQuerying {}

extension DesktopSourceQuerying {
    func bootstrap() async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
    func list() async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        throw BridgeClientError.invalidResponse
    }
}

extension DesktopImportQuerying {
    func searchImportGroups(query: String?) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
    func prepareImportSource(locator: String) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
    func previewImportSource(locator: String) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
}

extension DesktopDetailEnrichmentQuerying {
    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse { throw BridgeClientError.invalidResponse }
}

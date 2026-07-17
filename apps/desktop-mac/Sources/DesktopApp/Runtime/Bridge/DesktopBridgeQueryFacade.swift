import Foundation

protocol DesktopBridgeTransporting: DesktopQueryTransporting, DesktopCommandTransporting {}

extension BridgeClient: DesktopBridgeTransporting {}

struct DesktopBridgeQueryFacade<Transport: DesktopBridgeTransporting>: DesktopQueryTransporting {
    let bridgeClient: Transport

    func bootstrap() async throws -> BridgeResponse { try await bridgeClient.bootstrap() }
    func list() async throws -> BridgeResponse { try await bridgeClient.list() }
    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        try await bridgeClient.inspect(sourceId: sourceId, scope: scope)
    }
    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse { try await bridgeClient.inspectEnrichment(sourceId: sourceId) }
    func searchImportGroups(query: String?) async throws -> BridgeResponse { try await bridgeClient.searchImportGroups(query: query) }
    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse { try await bridgeClient.scanLocalImportGroups(path: path) }
    func prepareImportSource(locator: String) async throws -> BridgeResponse { try await bridgeClient.prepareImportSource(locator: locator) }
    func previewImportSource(locator: String) async throws -> BridgeResponse { try await bridgeClient.previewImportSource(locator: locator) }
}

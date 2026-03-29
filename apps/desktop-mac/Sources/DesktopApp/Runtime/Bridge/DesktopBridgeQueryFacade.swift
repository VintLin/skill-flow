import Foundation

protocol DesktopBridgeTransporting: DesktopQuerying, DesktopCommanding {}

extension BridgeClient: DesktopBridgeTransporting {}

struct DesktopBridgeQueryFacade<Transport: DesktopBridgeTransporting>: DesktopQuerying {
    let bridgeClient: Transport

    func bootstrap() async throws -> BridgeResponse { try await bridgeClient.bootstrap() }
    func list() async throws -> BridgeResponse { try await bridgeClient.list() }
    func inspect(sourceId: String) async throws -> BridgeResponse { try await bridgeClient.inspect(sourceId: sourceId) }
    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse { try await bridgeClient.inspectEnrichment(sourceId: sourceId) }
    func searchImportGroups(query: String?) async throws -> BridgeResponse { try await bridgeClient.searchImportGroups(query: query) }
    func previewImportSource(locator: String) async throws -> BridgeResponse { try await bridgeClient.previewImportSource(locator: locator) }
}

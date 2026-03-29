import Foundation

protocol DesktopCommanding: Sendable {
    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse
    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse
    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
    func uninstall(sourceIds: [String]) async throws -> BridgeResponse
    func apply(sourceId: String, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
    func doctor() async throws -> BridgeResponse
}

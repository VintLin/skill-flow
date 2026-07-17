import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopRuntimeFacadeTests: XCTestCase {
    func testBridgeQueryFacadeForwardsBootstrapAndInspectCalls() async throws {
        let bridge = StubBridgeTransport()
        let facade = DesktopBridgeQueryFacade(bridgeClient: bridge)

        _ = try await facade.bootstrap()
        _ = try await facade.inspect(sourceId: "alpha", scope: .project("repo-a"))
        _ = try await facade.inspectEnrichment(sourceId: "alpha")
        _ = try await facade.scanLocalImportGroups(path: "/tmp/local-skill")

        XCTAssertEqual(bridge.recordedCommands, [
            "bootstrap",
            "inspect:alpha:project(repo-a)",
            "inspect-enrichment:alpha",
            "scan-local-import-groups:/tmp/local-skill",
        ])
    }

    func testBridgeCommandFacadeForwardsMutationCalls() async throws {
        let bridge = StubBridgeTransport()
        let facade = DesktopBridgeCommandFacade(bridgeClient: bridge)

        _ = try await facade.saveSettings(customTargets: [], agentDisplayOrder: ["codex"])
        _ = try await facade.togglePinnedSource(sourceId: "alpha")
        _ = try await facade.updateSources(["alpha"])
        _ = try await facade.apply(sourceId: "alpha", scope: .project("repo-a"), selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"])

        XCTAssertEqual(bridge.recordedCommands, [
            "save-settings:[\"codex\"]",
            "toggle-pin:alpha",
            "update:[\"alpha\"]",
            "apply:alpha:project(repo-a)",
        ])
    }

    func testBridgeClientScanLocalImportGroupsNilPathSendsEmptyPayload() async throws {
        let fixture = try FacadeRecordingBridgeFixture.install()
        defer { try? fixture.tearDown() }

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.scanLocalImportGroups(path: nil)

        XCTAssertEqual(try fixture.lastCommand(), "scan-local-import-groups")
        XCTAssertTrue(try fixture.lastPayload().isEmpty)
    }
}

private final class StubBridgeTransport: DesktopBridgeTransporting, @unchecked Sendable {
    private(set) var recordedCommands: [String] = []

    func bootstrap() async throws -> BridgeResponse {
        recordedCommands.append("bootstrap")
        return .success(command: .bootstrap)
    }

    func list() async throws -> BridgeResponse {
        recordedCommands.append("list")
        return .success(command: .list)
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        recordedCommands.append("inspect:\(sourceId):\(describe(scope))")
        return .success(command: .inspect)
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        recordedCommands.append("inspect-enrichment:\(sourceId)")
        return .success(command: .inspectEnrichment)
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        recordedCommands.append("search-import-groups:\(query ?? "nil")")
        return .success(command: .searchImportGroups)
    }

    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse {
        recordedCommands.append("scan-local-import-groups:\(path ?? "nil")")
        return .success(command: .scanLocalImportGroups)
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        recordedCommands.append("preview-import-source:\(locator)")
        return .success(command: .previewImportSource)
    }

    func saveSettings(customTargets: [[String : String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        recordedCommands.append("save-settings:\(agentDisplayOrder)")
        return .success(command: .saveSettings, payload: [:])
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        recordedCommands.append("toggle-pin:\(sourceId)")
        return .success(command: .togglePin)
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        recordedCommands.append("update:\(sourceIds ?? [])")
        return .success(command: .update)
    }

    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse {
        recordedCommands.append("import-source:\(locator)")
        return .success(command: .importSource)
    }

    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse {
        recordedCommands.append("rename-source:\(sourceId):\(displayName)")
        return .success(command: .renameSource)
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        recordedCommands.append("uninstall:\(sourceIds)")
        return .success(command: .uninstall)
    }

    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        recordedCommands.append("apply:\(sourceId):\(describe(scope))")
        return .success(command: .apply)
    }

    func doctor() async throws -> BridgeResponse {
        recordedCommands.append("doctor")
        return .success(command: .doctor)
    }
}

private func describe(_ scope: ProjectScopeSelection) -> String {
    switch scope {
    case .global:
        return "global"
    case .project(let projectId):
        return "project(\(projectId))"
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

private final class FacadeRecordingBridgeFixture {
    private let rootURL: URL
    private let payloadURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, payloadURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.payloadURL = payloadURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> FacadeRecordingBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-facade-payload-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let payloadURL = rootURL.appendingPathComponent("payload.json")
        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        try recordingHelperScript(payloadPath: payloadURL.path).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return FacadeRecordingBridgeFixture(rootURL: rootURL, payloadURL: payloadURL, savedHelperOverride: savedHelperOverride)
    }

    func lastCommand() throws -> String {
        let data = try Data(contentsOf: payloadURL)
        let object = try JSONSerialization.jsonObject(with: data)
        let root = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(root["command"] as? String)
    }

    func lastPayload() throws -> [String: Any] {
        let data = try Data(contentsOf: payloadURL)
        let object = try JSONSerialization.jsonObject(with: data)
        let root = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(root["payload"] as? [String: Any])
    }

    func tearDown() throws {
        if let savedHelperOverride {
            setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE")
        }

        if FileManager.default.fileExists(atPath: rootURL.path) {
            try FileManager.default.removeItem(at: rootURL)
        }
    }

    private static func recordingHelperScript(payloadPath: String) -> String {
        """
        const fs = require("node:fs");
        const input = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => input.push(chunk));
        process.stdin.on("end", () => {
          const request = JSON.parse(input.join("") || "{}");
          fs.writeFileSync(\(String(reflecting: payloadPath)), JSON.stringify(request), "utf8");
          const response = {
            protocolVersion: "1.0",
            requestId: request.requestId ?? null,
            command: request.command ?? "list",
            ok: true,
            data: { command: request.command ?? "list" },
            warnings: [],
            errors: []
          };
          process.stdout.write(JSON.stringify(response));
        });
        """
    }
}

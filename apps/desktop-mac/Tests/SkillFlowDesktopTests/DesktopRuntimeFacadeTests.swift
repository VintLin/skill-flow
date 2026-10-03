import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopBridgeClientTests: XCTestCase {
    func testBridgeClientSatisfiesNarrowQueryAndCommandInterfaces() {
        let query: any DesktopQueryTransporting = BridgeClient()
        let command: any DesktopCommandTransporting = BridgeClient()

        XCTAssertTrue(query is BridgeClient)
        XCTAssertTrue(command is BridgeClient)
    }

    func testBridgeClientScanLocalImportGroupsNilPathSendsEmptyPayload() async throws {
        let fixture = try BridgeRecordingFixture.install()
        defer { try? fixture.tearDown() }

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.scanLocalImportGroups(path: nil)

        XCTAssertEqual(try fixture.lastCommand(), "scan-local-import-groups")
        XCTAssertTrue(try fixture.lastPayload().isEmpty)
    }
}

private final class BridgeRecordingFixture {
    private let rootURL: URL
    private let payloadURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, payloadURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.payloadURL = payloadURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> BridgeRecordingFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-facade-payload-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let payloadURL = rootURL.appendingPathComponent("payload.json")
        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        try recordingHelperScript(payloadPath: payloadURL.path).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return BridgeRecordingFixture(rootURL: rootURL, payloadURL: payloadURL, savedHelperOverride: savedHelperOverride)
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

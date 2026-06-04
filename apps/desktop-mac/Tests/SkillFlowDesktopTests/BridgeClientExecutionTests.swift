import Darwin
import Foundation
import XCTest

@testable import SkillFlowDesktop

final class BridgeClientExecutionTests: XCTestCase {
    private var fixture: SlowBridgeFixture?
    private var stubbornFixture: StubbornBridgeFixture?
    private var recordingFixture: RecordingBridgeFixture?
    private var savedNodeOverride: String?

    override func tearDownWithError() throws {
        try fixture?.tearDown()
        fixture = nil
        try stubbornFixture?.tearDown()
        stubbornFixture = nil
        try recordingFixture?.tearDown()
        recordingFixture = nil
        if let savedNodeOverride {
            setenv("SKILL_FLOW_DESKTOP_NODE_OVERRIDE", savedNodeOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_NODE_OVERRIDE")
        }
        savedNodeOverride = nil
    }

    func testListAllowsMainActorWorkWhileHelperIsStillRunning() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 250)
        self.fixture = fixture

        let bridge = await MainActor.run { BridgeClient() }
        let mainActorFlag = ThreadSafeFlag()

        let listTask = Task {
            try await bridge.list()
        }

        let mainActorPingTask = Task.detached {
            try await Task.sleep(nanoseconds: 50_000_000)
            await MainActor.run {
                mainActorFlag.setTrue()
            }
        }

        try await Task.sleep(nanoseconds: 120_000_000)
        XCTAssertTrue(
            mainActorFlag.value,
            "MainActor work should continue while the bridge helper is still running."
        )

        let response = try await listTask.value
        try await mainActorPingTask.value

        XCTAssertEqual(response.command, .list)
        XCTAssertTrue(response.ok)
    }

    func testListTimesOutWhenHelperNeverExits() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 5_000)
        self.fixture = fixture

        let bridge = await MainActor.run { BridgeClient(commandTimeoutMilliseconds: 50) }

        do {
            _ = try await bridge.list()
            XCTFail("Expected list to time out before the helper exits.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 50ms.")
        }
    }

    func testTimedOutHelperIsForceKilledWhenItIgnoresTerminate() async throws {
        let fixture = try StubbornBridgeFixture.install()
        stubbornFixture = fixture

        let bridge = await MainActor.run {
            BridgeClient(commandTimeoutMilliseconds: 50, commandTimeoutGraceMilliseconds: 50)
        }
        let listTask = Task {
            try await bridge.list()
        }
        let pid = try await fixture.waitForPid()

        do {
            _ = try await listTask.value
            XCTFail("Expected list to time out before the helper exits.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 50ms.")
        }

        try await waitForProcessToExit(pid: pid, timeoutNanoseconds: 1_000_000_000)
    }

    func testListFailsWithActionableNodeRequirementWhenNodeIsMissing() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 0)
        self.fixture = fixture
        savedNodeOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_NODE_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_NODE_OVERRIDE", "/tmp/skill-flow-tests/missing-node", 1)

        let bridge = await MainActor.run { BridgeClient() }

        do {
            _ = try await bridge.list()
            XCTFail("Expected missing node requirement to fail before launching the helper.")
        } catch {
            XCTAssertEqual(
                error.localizedDescription,
                "Node.js 20+ is required to run Skill Flow Desktop. Install it, then retry. README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
            )
        }
    }

    func testNodeResolutionPrefersDebugOverride() {
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: ["SKILL_FLOW_DESKTOP_NODE_OVERRIDE": "/tmp/custom-node"],
            isExecutable: { _ in false }
        )

        XCTAssertEqual(resolved, "/tmp/custom-node")
    }

    func testNodeResolutionPrefersBundledRuntimeBeforeSystemNode() {
        let bundleURL = URL(fileURLWithPath: "/Applications/Skill Flow.app")
        let bundledNode = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin/node"
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: bundleURL,
            architecture: "arm64",
            environment: [:],
            isExecutable: { path in
                path == bundledNode || path == "/opt/homebrew/bin/node"
            }
        )

        XCTAssertEqual(resolved, bundledNode)
    }

    func testNodeResolutionFallsBackToSystemNodeWhenBundledRuntimeIsUnavailable() {
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: [:],
            isExecutable: { path in
                path == "/usr/local/bin/node"
            }
        )

        XCTAssertEqual(resolved, "/usr/local/bin/node")
    }

    func testNodeResolutionFallsBackToEnvWhenNoKnownNodePathExists() {
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: [:],
            isExecutable: { _ in false }
        )

        XCTAssertEqual(resolved, "node")
    }

    func testBundledNodeBinResolutionRequiresBundledNode() {
        let bundleURL = URL(fileURLWithPath: "/Applications/Skill Flow.app")
        let bundledNode = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin/node"

        let resolved = BridgeClient.resolveBundledNodeBinDirectory(
            bundleURL: bundleURL,
            architecture: "arm64",
            isExecutable: { path in
                path == bundledNode
            }
        )

        XCTAssertEqual(resolved, "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin")
    }

    func testBundledNodeBinResolutionSkipsWhenDebugNodeOverrideIsSet() {
        let resolved = BridgeClient.resolveBundledNodeBinDirectory(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: ["SKILL_FLOW_DESKTOP_NODE_OVERRIDE": "/tmp/custom-node"],
            isExecutable: { _ in true }
        )

        XCTAssertNil(resolved)
    }

    func testBridgeEnvironmentPrependsBundledNodeBinAndExportsBundledNpx() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"
        let bundledNpx = "\(bundledBin)/npx"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: [
                "PATH": "/usr/bin",
                "HOME": "/Users/example",
            ],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { path in
                path == bundledNpx
            }
        )

        XCTAssertEqual(environment["SKILL_FLOW_CALLER"], "desktop-bridge")
        XCTAssertEqual(environment["SKILL_FLOW_BUNDLED_NPX"], bundledNpx)
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
        XCTAssertEqual(environment["HOME"], "/Users/example")
    }

    func testBridgeEnvironmentSkipsBundledNpxWhenItIsMissing() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: [
                "PATH": "/usr/bin",
                "HOME": "/Users/example",
            ],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { _ in false }
        )

        XCTAssertEqual(environment["SKILL_FLOW_CALLER"], "desktop-bridge")
        XCTAssertNil(environment["SKILL_FLOW_BUNDLED_NPX"])
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
        XCTAssertEqual(environment["HOME"], "/Users/example")
    }

    func testBridgeEnvironmentRemovesInheritedBundledNpxWhenBundledNpxIsMissing() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: [
                "PATH": "/usr/bin",
                "SKILL_FLOW_BUNDLED_NPX": "/old/path/npx",
            ],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { _ in false }
        )

        XCTAssertNil(environment["SKILL_FLOW_BUNDLED_NPX"])
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
    }

    func testRuntimeMissingCommandErrorsAreMappedToDependencyGuidance() {
        XCTAssertEqual(
            BridgeClient.dependencyError(for: "spawn git ENOENT")?.localizedDescription,
            "Git is required for this operation. Install Git or Xcode Command Line Tools, then retry. README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
        )
        XCTAssertEqual(
            BridgeClient.dependencyError(for: "/bin/sh: npx: command not found")?.localizedDescription,
            "`npx` is required for ClawHub imports. Install Node.js/npm, then retry. README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
        )
    }

    func testClawHubPreflightAcceptsBundledNpxBeforeSystemNpx() throws {
        let source = try sourceText()

        XCTAssertTrue(source.contains("bundledNpxPath(in: bundledNodeBinDirectory)"))
        XCTAssertTrue(source.contains("if locator.hasPrefix(\"clawhub:\"), bundledNpxPath(in: bundledNodeBinDirectory) == nil, !isCommandAvailable(\"npx\")"))
        XCTAssertTrue(source.contains("bundledNodeBinDirectory: String?"))
    }

    func testHelperResolutionPrefersDesktopBridgeBeforeLegacyCLI() throws {
        let source = try sourceText()
        let desktopBridgePath = "Contents/Resources/helper/dist/desktop-bridge.js"
        let desktopBridgeResource = "path(forResource: \"desktop-bridge\", ofType: \"js\", inDirectory: \"helper/dist\")"
        let legacyCLIPath = "Contents/Resources/helper/dist/cli.js"

        let desktopBridgePathRange = try XCTUnwrap(source.range(of: desktopBridgePath))
        let legacyCLIPathRange = try XCTUnwrap(source.range(of: legacyCLIPath))

        XCTAssertTrue(source.contains(desktopBridgeResource))
        XCTAssertLessThan(desktopBridgePathRange.lowerBound, legacyCLIPathRange.lowerBound)
    }

    func testApplyEncodesProjectScopePayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.apply(
            sourceId: "alpha",
            scope: .project("repo-a"),
            selectedLeafIds: ["alpha:a"],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        let scope = try XCTUnwrap(payload["scope"] as? [String: Any])
        XCTAssertEqual(scope["kind"] as? String, "project")
        XCTAssertEqual(scope["projectId"] as? String, "repo-a")
    }

    func testInspectEncodesProjectScopePayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.inspect(sourceId: "alpha", scope: .project("repo-a"))

        let payload = try fixture.lastPayload()
        let scope = try XCTUnwrap(payload["scope"] as? [String: Any])
        XCTAssertEqual(scope["kind"] as? String, "project")
        XCTAssertEqual(scope["projectId"] as? String, "repo-a")
    }

    func testRenameSourceEncodesPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.renameSource(sourceId: "alpha", displayName: "Writing Tools")

        let payload = try fixture.lastPayload()
        XCTAssertEqual(payload["sourceId"] as? String, "alpha")
        XCTAssertEqual(payload["displayName"] as? String, "Writing Tools")
        XCTAssertEqual(try fixture.lastCommand(), "rename-source")
    }

    func testCreateVirtualGroupSendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.createVirtualGroup(
            displayName: "Writing Stack",
            skills: [
                VirtualGroupSkillRef(sourceId: "source-a", leafId: "skill-a"),
                VirtualGroupSkillRef(sourceId: "source-b", leafId: "skill-b"),
            ],
            enabledTargets: ["codex", "claude"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "create-virtual-group")
        XCTAssertEqual(payload["displayName"] as? String, "Writing Stack")
        XCTAssertEqual(payload["enabledTargets"] as? [String], ["codex", "claude"])

        let skills = try XCTUnwrap(payload["skills"] as? [[String: Any]])
        XCTAssertEqual(skills.count, 2)
        XCTAssertEqual(skills[0]["sourceId"] as? String, "source-a")
        XCTAssertEqual(skills[0]["leafId"] as? String, "skill-a")
        XCTAssertEqual(skills[1]["sourceId"] as? String, "source-b")
        XCTAssertEqual(skills[1]["leafId"] as? String, "skill-b")
    }

    func testMergeGroupsSendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.mergeGroups(
            displayName: "Merged Tools",
            sourceIds: ["source-a", "source-b"],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "merge-groups")
        XCTAssertEqual(payload["displayName"] as? String, "Merged Tools")
        XCTAssertEqual(payload["sourceIds"] as? [String], ["source-a", "source-b"])
        XCTAssertEqual(payload["enabledTargets"] as? [String], ["codex"])
    }

    func testRestoreMergedGroupsSendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.restoreMergedGroups(virtualGroupId: "virtual-group-1")

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "restore-merged-groups")
        XCTAssertEqual(payload["virtualGroupId"] as? String, "virtual-group-1")
    }

    private func sourceText() throws -> String {
        let desktopRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let sourceURL = desktopRoot
            .appendingPathComponent("Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift")
        return try String(contentsOf: sourceURL, encoding: .utf8)
    }

    private func waitForProcessToExit(pid: Int32, timeoutNanoseconds: UInt64) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        while Date() < deadline {
            if !isProcessRunning(pid: pid) {
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Expected helper process \(pid) to exit.")
    }

    private func isProcessRunning(pid: Int32) -> Bool {
        if kill(pid, 0) == 0 {
            return true
        }
        return errno == EPERM
    }
}

private final class SlowBridgeFixture {
    private let rootURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install(delayMilliseconds: Int) throws -> SlowBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        try helperScript(delayMilliseconds: delayMilliseconds).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return SlowBridgeFixture(rootURL: rootURL, savedHelperOverride: savedHelperOverride)
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

    private static func helperScript(delayMilliseconds: Int) -> String {
        """
        let input = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => {
          input.push(chunk);
        });
        process.stdin.on("end", () => {
          const request = JSON.parse(input.join("") || "{}");
          setTimeout(() => {
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
          }, \(delayMilliseconds));
        });
        """
    }
}

private final class StubbornBridgeFixture {
    private let rootURL: URL
    private let pidURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, pidURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.pidURL = pidURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> StubbornBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-stubborn-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        let pidURL = rootURL.appendingPathComponent("helper.pid")
        try helperScript(pidPath: pidURL.path).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return StubbornBridgeFixture(rootURL: rootURL, pidURL: pidURL, savedHelperOverride: savedHelperOverride)
    }

    func waitForPid() async throws -> Int32 {
        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline {
            if let contents = try? String(contentsOf: pidURL, encoding: .utf8),
               let pid = Int32(contents.trimmingCharacters(in: .whitespacesAndNewlines)) {
                return pid
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw XCTSkip("Timed out waiting for stubborn helper PID.")
    }

    func tearDown() throws {
        if let savedHelperOverride {
            setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE")
        }

        if let contents = try? String(contentsOf: pidURL, encoding: .utf8),
           let pid = Int32(contents.trimmingCharacters(in: .whitespacesAndNewlines)),
           kill(pid, 0) == 0 {
            kill(pid, SIGKILL)
        }

        if FileManager.default.fileExists(atPath: rootURL.path) {
            try FileManager.default.removeItem(at: rootURL)
        }
    }

    private static func helperScript(pidPath: String) -> String {
        """
        const fs = require("node:fs");
        fs.writeFileSync(\(String(reflecting: pidPath)), String(process.pid));
        process.on("SIGTERM", () => {});
        process.stdin.resume();
        setInterval(() => {}, 1000);
        """
    }
}

private final class RecordingBridgeFixture {
    private let rootURL: URL
    private let payloadURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, payloadURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.payloadURL = payloadURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> RecordingBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-payload-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let payloadURL = rootURL.appendingPathComponent("payload.json")
        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        try recordingHelperScript(payloadPath: payloadURL.path).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return RecordingBridgeFixture(rootURL: rootURL, payloadURL: payloadURL, savedHelperOverride: savedHelperOverride)
    }

    func lastPayload() throws -> [String: Any] {
        let data = try Data(contentsOf: payloadURL)
        let object = try JSONSerialization.jsonObject(with: data)
        let root = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(root["payload"] as? [String: Any])
    }

    func lastCommand() throws -> String {
        let data = try Data(contentsOf: payloadURL)
        let object = try JSONSerialization.jsonObject(with: data)
        let root = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(root["command"] as? String)
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

private final class ThreadSafeFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var storedValue = false

    var value: Bool {
        lock.lock()
        defer { lock.unlock() }
        return storedValue
    }

    func setTrue() {
        lock.lock()
        storedValue = true
        lock.unlock()
    }
}

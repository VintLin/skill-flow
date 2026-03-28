import Foundation
import XCTest

@testable import SkillFlowDesktop

final class BridgeClientExecutionTests: XCTestCase {
    private var fixture: SlowBridgeFixture?

    override func tearDownWithError() throws {
        try fixture?.tearDown()
        fixture = nil
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

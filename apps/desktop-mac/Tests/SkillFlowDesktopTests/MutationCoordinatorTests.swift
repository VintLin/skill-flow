import XCTest

@testable import SkillFlowDesktop

final class MutationCoordinatorTests: XCTestCase {
    func testConcurrentMutationsRunSeriallyInsteadOfRejecting() async throws {
        let coordinator = MutationCoordinator()
        let probe = SerialProbe()

        async let first: BridgeResponse = coordinator.runMutation {
            await probe.record("first-start")
            await probe.enterCritical()
            try await Task.sleep(for: .milliseconds(40))
            await probe.leaveCritical()
            await probe.record("first-end")
            return BridgeResponse.okEmpty
        }

        try await Task.sleep(for: .milliseconds(5))

        async let second: BridgeResponse = coordinator.runMutation {
            await probe.record("second-start")
            await probe.enterCritical()
            await probe.leaveCritical()
            await probe.record("second-end")
            return BridgeResponse.okEmpty
        }

        _ = try await first
        _ = try await second

        let snapshot = await probe.snapshot()
        XCTAssertEqual(snapshot.events, ["first-start", "first-end", "second-start", "second-end"])
        XCTAssertEqual(snapshot.maxOverlap, 1)
    }
}

private actor SerialProbe {
    private var events: [String] = []
    private var overlapping = 0
    private var maxOverlap = 0

    func record(_ event: String) {
        events.append(event)
    }

    func enterCritical() {
        overlapping += 1
        maxOverlap = max(maxOverlap, overlapping)
    }

    func leaveCritical() {
        overlapping -= 1
    }

    func snapshot() -> (events: [String], maxOverlap: Int) {
        (events, maxOverlap)
    }
}

private extension BridgeResponse {
    static var okEmpty: BridgeResponse {
        BridgeResponse(
            protocolVersion: "1.0",
            requestId: "test",
            command: .bootstrap,
            ok: true,
            data: nil,
            warnings: [],
            errors: []
        )
    }
}

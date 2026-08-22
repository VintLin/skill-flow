import XCTest

@testable import SkillFlowDesktop

@MainActor
final class ApplicationTerminationCoordinatorTests: XCTestCase {
    func testTerminationIsImmediateWithoutProtectedWork() {
        let coordinator = ApplicationTerminationCoordinator(
            hasProtectedOperation: { false },
            shutdownProtectedOperations: {},
            cancelActiveHelper: { true },
            recoverInterruptedOperation: { true }
        )

        XCTAssertEqual(coordinator.requestTermination(reply: { _ in }), .terminateNow)
        XCTAssertEqual(coordinator.phase, .idle)
    }

    func testProtectedTerminationStopsQueueAndRepliesAfterCancellationSucceeds() async {
        var didShutdown = false
        var reply: Bool?
        let coordinator = ApplicationTerminationCoordinator(
            hasProtectedOperation: { true },
            shutdownProtectedOperations: { didShutdown = true },
            cancelActiveHelper: { true },
            recoverInterruptedOperation: { true }
        )

        XCTAssertEqual(coordinator.requestTermination { reply = $0 }, .terminateLater)
        XCTAssertTrue(didShutdown)
        XCTAssertEqual(coordinator.phase, .stoppingAndRestoring)

        await waitUntil { reply != nil }
        XCTAssertEqual(reply, true)
        XCTAssertEqual(coordinator.phase, .idle)
    }

    func testFailedCancellationBlocksQuitAndSupportsRetryOrCancelExit() async {
        var attempts = 0
        var reply: Bool?
        let coordinator = ApplicationTerminationCoordinator(
            hasProtectedOperation: { true },
            shutdownProtectedOperations: {},
            cancelActiveHelper: {
                attempts += 1
                return attempts > 1
            },
            recoverInterruptedOperation: { true }
        )

        XCTAssertEqual(coordinator.requestTermination { reply = $0 }, .terminateLater)
        await waitUntil { coordinator.phase == .recoveryFailed }
        XCTAssertNil(reply)

        coordinator.retryRecovery()
        await waitUntil { reply != nil }
        XCTAssertEqual(reply, true)

        reply = nil
        attempts = 0
        var hasProtectedOperation = true
        let cancelled = ApplicationTerminationCoordinator(
            hasProtectedOperation: { hasProtectedOperation },
            shutdownProtectedOperations: {},
            cancelActiveHelper: { false },
            recoverInterruptedOperation: { true }
        )
        XCTAssertEqual(cancelled.requestTermination { reply = $0 }, .terminateLater)
        await waitUntil { cancelled.phase == .recoveryFailed }
        cancelled.cancelExit()
        XCTAssertEqual(reply, false)
        XCTAssertEqual(cancelled.phase, .recoveryRequired)

        hasProtectedOperation = false
        reply = nil
        XCTAssertEqual(cancelled.requestTermination { reply = $0 }, .terminateLater)
        await waitUntil { cancelled.phase == .recoveryFailed }
        XCTAssertNil(reply)
    }

    func testCancellationSuccessStillBlocksQuitWhenRecoveryFails() async {
        var reply: Bool?
        let coordinator = ApplicationTerminationCoordinator(
            hasProtectedOperation: { true },
            shutdownProtectedOperations: {},
            cancelActiveHelper: { true },
            recoverInterruptedOperation: { false }
        )

        XCTAssertEqual(coordinator.requestTermination { reply = $0 }, .terminateLater)
        await waitUntil { coordinator.phase == .recoveryFailed }

        XCTAssertNil(reply)
    }

    func testSuccessfulRetryAfterCancellingExitResumesProtectedOperations() async {
        var recoverySucceeds = false
        var didResume = false
        var reply: Bool?
        let coordinator = ApplicationTerminationCoordinator(
            hasProtectedOperation: { true },
            shutdownProtectedOperations: {},
            cancelActiveHelper: { true },
            recoverInterruptedOperation: { recoverySucceeds },
            resumeProtectedOperations: { didResume = true }
        )

        XCTAssertEqual(coordinator.requestTermination { reply = $0 }, .terminateLater)
        await waitUntil { coordinator.phase == .recoveryFailed }
        coordinator.cancelExit()
        XCTAssertEqual(reply, false)
        XCTAssertEqual(coordinator.phase, .recoveryRequired)

        recoverySucceeds = true
        coordinator.retryRecovery()
        await waitUntil { coordinator.phase == .idle }

        XCTAssertTrue(didResume)
    }

    private func waitUntil(
        timeout: TimeInterval = 1,
        condition: @escaping @MainActor () -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline { await Task.yield() }
        XCTAssertTrue(condition())
    }
}

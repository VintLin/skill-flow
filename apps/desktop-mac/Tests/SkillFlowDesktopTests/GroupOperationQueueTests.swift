import XCTest

@testable import SkillFlowDesktop

@MainActor
final class GroupOperationQueueTests: XCTestCase {
    func testEnqueueUpdateIsFIFOAndTracksQueuedThenRunning() {
        let queue = GroupOperationQueue()

        XCTAssertEqual(queue.enqueueUpdate(sourceId: "alpha"), .enqueued)
        XCTAssertEqual(queue.enqueueUpdate(sourceId: "beta"), .enqueued)
        XCTAssertEqual(queue.updatePhase(for: "alpha"), .queued)
        XCTAssertEqual(queue.updatePhase(for: "beta"), .queued)

        XCTAssertEqual(queue.startNext(), .update(sourceId: "alpha"))
        XCTAssertEqual(queue.updatePhase(for: "alpha"), .running)
        XCTAssertEqual(queue.updatePhase(for: "beta"), .queued)

        queue.completeRunning()
        XCTAssertNil(queue.updatePhase(for: "alpha"))
        XCTAssertEqual(queue.updatePhase(for: "beta"), .queued)

        XCTAssertEqual(queue.startNext(), .update(sourceId: "beta"))
        XCTAssertEqual(queue.updatePhase(for: "beta"), .running)
        queue.completeRunning()
        XCTAssertNil(queue.updatePhase(for: "beta"))
        XCTAssertNil(queue.startNext())
    }

    func testDuplicateUpdateIdentityIsRejectedWhileQueuedOrRunning() {
        let queue = GroupOperationQueue()

        XCTAssertEqual(queue.enqueueUpdate(sourceId: "alpha"), .enqueued)
        XCTAssertEqual(queue.enqueueUpdate(sourceId: "alpha"), .alreadyPresent)

        XCTAssertEqual(queue.startNext(), .update(sourceId: "alpha"))
        XCTAssertEqual(queue.enqueueUpdate(sourceId: "alpha"), .alreadyPresent)
    }

    func testBulkUpdateAbsorbsQueuedSingleUpdatesAndCoversPhases() {
        let queue = GroupOperationQueue()

        XCTAssertEqual(queue.enqueueUpdate(sourceId: "alpha"), .enqueued)
        XCTAssertEqual(queue.enqueueUpdate(sourceId: "beta"), .enqueued)
        XCTAssertEqual(queue.enqueueBulkUpdate(sourceIds: ["alpha", "beta", "gamma"]), .enqueued)

        XCTAssertEqual(queue.updatePhase(for: "alpha"), .queued)
        XCTAssertEqual(queue.updatePhase(for: "beta"), .queued)
        XCTAssertEqual(queue.updatePhase(for: "gamma"), .queued)

        // Absorbed singles: next work is bulk only
        XCTAssertEqual(queue.startNext(), .bulkUpdate(sourceIds: ["alpha", "beta", "gamma"]))
        XCTAssertEqual(queue.updatePhase(for: "alpha"), .running)
        XCTAssertEqual(queue.enqueueUpdate(sourceId: "beta"), .alreadyPresent)
    }

    func testImportIdentityDedupesAndTracksPhasesIndependentlyFromUpdates() {
        let queue = GroupOperationQueue()

        XCTAssertEqual(queue.enqueueImport(groupId: "g1"), .enqueued)
        XCTAssertEqual(queue.enqueueImport(groupId: "g1"), .alreadyPresent)
        XCTAssertEqual(queue.enqueueUpdate(sourceId: "g1"), .enqueued)

        XCTAssertEqual(queue.importPhase(for: "g1"), .queued)
        XCTAssertEqual(queue.updatePhase(for: "g1"), .queued)

        XCTAssertEqual(queue.startNext(), .importGroup(groupId: "g1"))
        XCTAssertEqual(queue.importPhase(for: "g1"), .running)
        XCTAssertEqual(queue.updatePhase(for: "g1"), .queued)

        queue.completeRunning()
        XCTAssertEqual(queue.startNext(), .update(sourceId: "g1"))
    }

    func testSecondBulkUpdateWhileOneIsPresentIsDuplicate() {
        let queue = GroupOperationQueue()

        XCTAssertEqual(queue.enqueueBulkUpdate(sourceIds: ["a", "b"]), .enqueued)
        XCTAssertEqual(queue.enqueueBulkUpdate(sourceIds: ["c"]), .alreadyPresent)
    }
}

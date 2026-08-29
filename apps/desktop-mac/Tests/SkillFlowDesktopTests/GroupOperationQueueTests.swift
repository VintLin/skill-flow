import XCTest

@testable import SkillFlowDesktop

@MainActor
final class GroupOperationQueueTests: XCTestCase {
    func testQueuedImportPreparesBeforeEarlierCommitFinishes() async {
        let coordinator = GroupOperationCoordinator()
        let firstCommitStarted = expectation(description: "first commit started")
        let secondPrepared = expectation(description: "second import prepared")
        let releaseFirstCommit = GroupOperationTestGate()
        var preparedGroupIds: [String] = []
        var committedGroupIds: [String] = []
        coordinator.bind(.init(
            isSourcePresent: { _ in true },
            isImportInstalledLocally: { _ in false },
            prepareImport: { groupId, _ in
                preparedGroupIds.append(groupId)
                if groupId == "second" { secondPrepared.fulfill() }
            },
            performUpdate: { _ in },
            performBulkUpdate: { _ in },
            performImport: { groupId, _ in
                committedGroupIds.append(groupId)
                if groupId == "first" {
                    firstCommitStarted.fulfill()
                    await releaseFirstCommit.wait()
                }
            },
            onAlreadyQueued: {},
            onSkippedMissing: {},
            onImportAlreadyExists: {},
            onPhasesChange: { _, _ in }
        ))
        let requestSkills = [ImportSkillSelection.repoPath("skills/one")]

        let first = Task {
            await coordinator.enqueueImport(
                groupId: "first",
                locator: "first/repo",
                selectedSkills: requestSkills,
                skillSelectionMode: .selected,
                enabledTargets: ["codex"]
            )
        }
        await fulfillment(of: [firstCommitStarted], timeout: 1)
        let second = Task {
            await coordinator.enqueueImport(
                groupId: "second",
                locator: "second/repo",
                selectedSkills: requestSkills,
                skillSelectionMode: .selected,
                enabledTargets: ["codex"]
            )
        }

        await fulfillment(of: [secondPrepared], timeout: 1)
        XCTAssertEqual(preparedGroupIds, ["second"])
        XCTAssertEqual(committedGroupIds, ["first"])
        await releaseFirstCommit.open()
        await first.value
        await second.value
        XCTAssertEqual(committedGroupIds, ["first", "second"])
    }

    func testImportPreparationConcurrencyIsBoundedAtThree() async throws {
        let coordinator = GroupOperationCoordinator()
        let updateStarted = expectation(description: "update started")
        let releaseUpdate = GroupOperationTestGate()
        let releasePreparations = GroupOperationTestGate()
        var preparedGroupIds: [String] = []
        coordinator.bind(.init(
            isSourcePresent: { _ in true },
            isImportInstalledLocally: { _ in false },
            prepareImport: { groupId, _ in
                preparedGroupIds.append(groupId)
                await releasePreparations.wait()
            },
            performUpdate: { _ in
                updateStarted.fulfill()
                await releaseUpdate.wait()
            },
            performBulkUpdate: { _ in },
            performImport: { _, _ in },
            onAlreadyQueued: {},
            onSkippedMissing: {},
            onImportAlreadyExists: {},
            onPhasesChange: { _, _ in }
        ))
        let skills = [ImportSkillSelection.repoPath("skills/one")]
        let blockingUpdate = Task { await coordinator.enqueueUpdate(sourceId: "updating") }
        await fulfillment(of: [updateStarted], timeout: 1)
        let tasks = ["one", "two", "three", "four"].map { groupId in
            Task {
                await coordinator.enqueueImport(
                    groupId: groupId,
                    locator: "\(groupId)/repo",
                    selectedSkills: skills,
                    skillSelectionMode: .selected,
                    enabledTargets: ["codex"]
                )
            }
        }

        let deadline = ContinuousClock.now + .seconds(1)
        while preparedGroupIds.count < 3, ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(10))
        }
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(preparedGroupIds, ["one", "two", "three"])

        await releasePreparations.open()
        await releaseUpdate.open()
        await blockingUpdate.value
        for task in tasks { await task.value }
        XCTAssertEqual(preparedGroupIds, ["one", "two", "three", "four"])
    }

    func testShutdownCancelsImportPreparationWithoutStartingCommit() async {
        let coordinator = GroupOperationCoordinator()
        let updateStarted = expectation(description: "update started")
        let releaseUpdate = GroupOperationTestGate()
        let preparationStarted = expectation(description: "preparation started")
        let preparationCancelled = expectation(description: "preparation cancelled")
        var committedGroupIds: [String] = []
        coordinator.bind(.init(
            isSourcePresent: { _ in true },
            isImportInstalledLocally: { _ in false },
            prepareImport: { _, _ in
                preparationStarted.fulfill()
                do {
                    try await Task.sleep(for: .seconds(10))
                } catch {
                    preparationCancelled.fulfill()
                }
            },
            performUpdate: { _ in
                updateStarted.fulfill()
                await releaseUpdate.wait()
            },
            performBulkUpdate: { _ in },
            performImport: { groupId, _ in committedGroupIds.append(groupId) },
            onAlreadyQueued: {},
            onSkippedMissing: {},
            onImportAlreadyExists: {},
            onPhasesChange: { _, _ in }
        ))

        let blockingUpdate = Task { await coordinator.enqueueUpdate(sourceId: "updating") }
        await fulfillment(of: [updateStarted], timeout: 1)
        await coordinator.enqueueImport(
            groupId: "queued",
            locator: "queued/repo",
            selectedSkills: [.repoPath("skills/one")],
            skillSelectionMode: .selected,
            enabledTargets: ["codex"]
        )
        await fulfillment(of: [preparationStarted], timeout: 1)

        coordinator.shutdownForTermination()

        await fulfillment(of: [preparationCancelled], timeout: 1)
        await releaseUpdate.open()
        await blockingUpdate.value
        XCTAssertTrue(committedGroupIds.isEmpty)
    }

    func testFirstImportUsesExistingDirectCommitPath() async {
        let coordinator = GroupOperationCoordinator()
        var preparedGroupIds: [String] = []
        var committedGroupIds: [String] = []
        coordinator.bind(.init(
            isSourcePresent: { _ in true },
            isImportInstalledLocally: { _ in false },
            prepareImport: { groupId, _ in preparedGroupIds.append(groupId) },
            performUpdate: { _ in },
            performBulkUpdate: { _ in },
            performImport: { groupId, _ in committedGroupIds.append(groupId) },
            onAlreadyQueued: {},
            onSkippedMissing: {},
            onImportAlreadyExists: {},
            onPhasesChange: { _, _ in }
        ))

        await coordinator.enqueueImport(
            groupId: "first",
            locator: "first/repo",
            selectedSkills: [.repoPath("skills/one")],
            skillSelectionMode: .selected,
            enabledTargets: ["codex"]
        )

        XCTAssertTrue(preparedGroupIds.isEmpty)
        XCTAssertEqual(committedGroupIds, ["first"])
    }

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

    func testShutdownDiscardsQueuedWorkAndFreezesTheQueueUntilRecoveryResumesIt() {
        let queue = GroupOperationQueue()

        XCTAssertEqual(queue.enqueueUpdate(sourceId: "running"), .enqueued)
        XCTAssertEqual(queue.enqueueImport(groupId: "queued"), .enqueued)
        XCTAssertEqual(queue.startNext(), .update(sourceId: "running"))

        XCTAssertEqual(queue.shutdown(), .update(sourceId: "running"))
        XCTAssertFalse(queue.hasQueuedWork)
        XCTAssertEqual(queue.updatePhase(for: "running"), .running)
        XCTAssertNil(queue.importPhase(for: "queued"))

        XCTAssertEqual(queue.enqueueUpdate(sourceId: "later"), .shutDown)
        XCTAssertEqual(queue.enqueueImport(groupId: "later"), .shutDown)
        XCTAssertEqual(queue.enqueueBulkUpdate(sourceIds: ["later"]), .shutDown)

        queue.resumeAfterRecovery()
        XCTAssertNil(queue.updatePhase(for: "running"))
        XCTAssertEqual(queue.enqueueUpdate(sourceId: "later"), .enqueued)
    }
}

private actor GroupOperationTestGate {
    private var isOpen = false
    private var continuations: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { continuations.append($0) }
    }

    func open() {
        isOpen = true
        let pending = continuations
        continuations.removeAll()
        pending.forEach { $0.resume() }
    }
}

import Foundation
import Observation

/// Owns the session Group Operation Queue and is the single source of truth for
/// Queued/Running card phases. MainViewModel only supplies work performers.
@MainActor
@Observable
final class GroupOperationCoordinator {
    struct PendingImportRequest: Equatable {
        let locator: String
        let selectedSkills: [ImportSkillSelection]
        let skillSelectionMode: ImportSkillSelectionMode
        let enabledTargets: [String]
    }

    struct Hosts {
        var isSourcePresent: (String) -> Bool
        var isImportInstalledLocally: (String) -> Bool
        var performUpdate: (String) async -> Void
        var performBulkUpdate: ([String]) async -> Void
        var performImport: (String, PendingImportRequest) async -> Void
        var onAlreadyQueued: () -> Void
        var onSkippedMissing: () -> Void
        var onImportAlreadyExists: () -> Void
        var onPhasesChange: (_ update: [String: GroupOperationQueue.Phase], _ importPhases: [String: GroupOperationQueue.Phase]) -> Void
    }

    private let queue = GroupOperationQueue()
    private var pendingImportRequestsByGroupId: [String: PendingImportRequest] = [:]
    private var isDraining = false
    private var hosts: Hosts?
    /// Test-only busy markers that do not occupy the FIFO running slot.
    private var testingImportPhaseOverrides: [String: GroupOperationQueue.Phase] = [:]

    private(set) var updatePhases: [String: GroupOperationQueue.Phase] = [:]
    private(set) var importPhases: [String: GroupOperationQueue.Phase] = [:]

    var activeProtectedOperation: GroupOperationQueue.Operation? {
        queue.runningOperation
    }

    var importingImportGroupId: String? {
        queue.runningImportGroupId
            ?? testingImportPhaseOverrides.first(where: { $0.value == .running })?.key
    }

    var updatingSourceIds: Set<String> {
        Set(updatePhases.keys)
    }

    func bind(_ hosts: Hosts) {
        self.hosts = hosts
    }

    func isUpdatingSource(_ sourceId: String) -> Bool {
        updatePhases[sourceId] != nil
    }

    func isQueuedUpdateSource(_ sourceId: String) -> Bool {
        updatePhases[sourceId] == .queued
    }

    func isImportingImportGroup(_ groupId: String) -> Bool {
        importPhases[groupId] != nil
    }

    func isQueuedImportGroup(_ groupId: String) -> Bool {
        importPhases[groupId] == .queued
    }

    func importOperationPhase(for groupId: String) -> GroupOperationQueue.Phase? {
        importPhases[groupId]
    }

    /// Test-only: mark an import as running for UI checks without blocking the FIFO drain.
    func testing_seedImportRunning(_ groupId: String?) {
        testingImportPhaseOverrides = [:]
        if let groupId {
            let normalized = groupId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !normalized.isEmpty {
                testingImportPhaseOverrides[normalized] = .running
            }
        }
        publishPhases()
    }

    func enqueueUpdate(sourceId: String) async {
        let normalized = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            return
        }
        switch queue.enqueueUpdate(sourceId: normalized) {
        case .alreadyPresent:
            hosts?.onAlreadyQueued()
        case .shutDown:
            return
        case .enqueued:
            publishPhases()
            await drain()
        }
    }

    func enqueueBulkUpdate(sourceIds: [String]) async {
        switch queue.enqueueBulkUpdate(sourceIds: sourceIds) {
        case .alreadyPresent:
            hosts?.onAlreadyQueued()
        case .shutDown:
            return
        case .enqueued:
            publishPhases()
            await drain()
        }
    }

    func enqueueImport(
        groupId: String,
        locator: String,
        selectedSkills: [ImportSkillSelection],
        skillSelectionMode: ImportSkillSelectionMode,
        enabledTargets: [String]
    ) async {
        let normalized = groupId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            return
        }
        switch queue.enqueueImport(groupId: normalized) {
        case .alreadyPresent:
            hosts?.onAlreadyQueued()
        case .shutDown:
            return
        case .enqueued:
            pendingImportRequestsByGroupId[normalized] = PendingImportRequest(
                locator: locator,
                selectedSkills: selectedSkills,
                skillSelectionMode: skillSelectionMode,
                enabledTargets: enabledTargets
            )
            publishPhases()
            await drain()
        }
    }

    /// Freezes the session queue and returns the operation whose bridge helper
    /// must be cancelled before AppKit may finish terminating.
    @discardableResult
    func shutdownForTermination() -> GroupOperationQueue.Operation? {
        let active = queue.shutdown()
        pendingImportRequestsByGroupId.removeAll()
        publishPhases()
        return active
    }

    func resumeAfterRecovery() {
        queue.resumeAfterRecovery()
        publishPhases()
    }

    private func drain() async {
        guard !isDraining else {
            return
        }
        isDraining = true
        defer {
            isDraining = false
            publishPhases()
            if queue.hasQueuedWork {
                Task { await self.drain() }
            }
        }

        while let operation = queue.startNext() {
            publishPhases()
            switch operation {
            case .update(let sourceId):
                await runUpdate(sourceId: sourceId)
            case .bulkUpdate(let sourceIds):
                await runBulkUpdate(sourceIds: sourceIds)
            case .importGroup(let groupId):
                await runImport(groupId: groupId)
            }
            queue.completeRunning()
            publishPhases()
        }
    }

    private func runUpdate(sourceId: String) async {
        guard hosts?.isSourcePresent(sourceId) == true else {
            hosts?.onSkippedMissing()
            return
        }
        await hosts?.performUpdate(sourceId)
    }

    private func runBulkUpdate(sourceIds: [String]) async {
        let existing = sourceIds.filter { hosts?.isSourcePresent($0) == true }
        guard !existing.isEmpty else {
            hosts?.onSkippedMissing()
            return
        }
        await hosts?.performBulkUpdate(existing)
    }

    private func runImport(groupId: String) async {
        if hosts?.isImportInstalledLocally(groupId) == true {
            pendingImportRequestsByGroupId.removeValue(forKey: groupId)
            hosts?.onImportAlreadyExists()
            return
        }
        guard let request = pendingImportRequestsByGroupId.removeValue(forKey: groupId) else {
            hosts?.onSkippedMissing()
            return
        }
        await hosts?.performImport(groupId, request)
    }

    private func publishPhases() {
        updatePhases = queue.snapshotUpdatePhases()
        var nextImportPhases = queue.snapshotImportPhases()
        for (groupId, phase) in testingImportPhaseOverrides {
            if nextImportPhases[groupId] != .running {
                nextImportPhases[groupId] = phase
            }
        }
        importPhases = nextImportPhases
        hosts?.onPhasesChange(updatePhases, importPhases)
    }
}

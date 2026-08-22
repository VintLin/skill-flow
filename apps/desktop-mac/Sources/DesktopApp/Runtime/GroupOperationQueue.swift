import Foundation

/// Session-scoped FIFO for desktop Group Operations (Update / Bulk Update / Import).
@MainActor
final class GroupOperationQueue {
    enum Phase: Equatable, Sendable {
        case queued
        case running
    }

    enum Operation: Equatable, Sendable {
        case update(sourceId: String)
        case bulkUpdate(sourceIds: [String])
        case importGroup(groupId: String)
    }

    enum EnqueueOutcome: Equatable, Sendable {
        case enqueued
        case alreadyPresent
        case shutDown
    }

    private struct Entry: Equatable {
        let operation: Operation
        var phase: Phase
    }

    private var entries: [Entry] = []
    private var isShutDown = false

    func enqueueUpdate(sourceId: String) -> EnqueueOutcome {
        guard !isShutDown else { return .shutDown }
        let normalized = Self.normalize(sourceId)
        guard !normalized.isEmpty else {
            return .alreadyPresent
        }

        if updatePhase(for: normalized) != nil {
            return .alreadyPresent
        }

        entries.append(Entry(operation: .update(sourceId: normalized), phase: .queued))
        return .enqueued
    }

    func enqueueBulkUpdate(sourceIds: [String]) -> EnqueueOutcome {
        guard !isShutDown else { return .shutDown }
        let normalized = Self.normalizeList(sourceIds)
        guard !normalized.isEmpty else {
            return .alreadyPresent
        }

        if entries.contains(where: {
            if case .bulkUpdate = $0.operation {
                return true
            }
            return false
        }) {
            return .alreadyPresent
        }

        let covered = Set(normalized)
        entries.removeAll { entry in
            guard entry.phase == .queued else {
                return false
            }
            if case .update(let sourceId) = entry.operation {
                return covered.contains(sourceId)
            }
            return false
        }

        entries.append(Entry(operation: .bulkUpdate(sourceIds: normalized), phase: .queued))
        return .enqueued
    }

    func enqueueImport(groupId: String) -> EnqueueOutcome {
        guard !isShutDown else { return .shutDown }
        let normalized = Self.normalize(groupId)
        guard !normalized.isEmpty else {
            return .alreadyPresent
        }

        if importPhase(for: normalized) != nil {
            return .alreadyPresent
        }

        entries.append(Entry(operation: .importGroup(groupId: normalized), phase: .queued))
        return .enqueued
    }

    func startNext() -> Operation? {
        guard !isShutDown else { return nil }
        guard !entries.contains(where: { $0.phase == .running }) else {
            return nil
        }
        guard let index = entries.firstIndex(where: { $0.phase == .queued }) else {
            return nil
        }
        entries[index].phase = .running
        return entries[index].operation
    }

    func completeRunning() {
        entries.removeAll { $0.phase == .running }
    }

    /// Permanently freezes this session queue, discards work that has not
    /// started, and returns the protected operation currently in flight.
    @discardableResult
    func shutdown() -> Operation? {
        isShutDown = true
        let running = entries.first(where: { $0.phase == .running })?.operation
        entries.removeAll { $0.phase == .queued }
        return running
    }

    /// Starts a fresh empty session queue after an interrupted operation has
    /// been recovered and the user chose to keep the application open.
    func resumeAfterRecovery() {
        // Recovery is the commit point for abandoning the interrupted session.
        // Its original async drain may not have delivered completeRunning yet,
        // so remove that stale identity here rather than leaving the queue shut.
        entries.removeAll()
        isShutDown = false
    }

    var hasQueuedWork: Bool {
        entries.contains { $0.phase == .queued }
    }

    var hasWork: Bool {
        !entries.isEmpty
    }

    var runningOperation: Operation? {
        entries.first(where: { $0.phase == .running })?.operation
    }

    func updatePhase(for sourceId: String) -> Phase? {
        let normalized = Self.normalize(sourceId)
        guard !normalized.isEmpty else {
            return nil
        }

        var best: Phase?
        for entry in entries {
            switch entry.operation {
            case .update(let id) where id == normalized:
                best = Self.preferRunning(best, entry.phase)
            case .bulkUpdate(let ids) where ids.contains(normalized):
                best = Self.preferRunning(best, entry.phase)
            default:
                continue
            }
        }
        return best
    }

    func importPhase(for groupId: String) -> Phase? {
        let normalized = Self.normalize(groupId)
        guard !normalized.isEmpty else {
            return nil
        }

        for entry in entries {
            if case .importGroup(let id) = entry.operation, id == normalized {
                return entry.phase
            }
        }
        return nil
    }

    var runningImportGroupId: String? {
        for entry in entries where entry.phase == .running {
            if case .importGroup(let id) = entry.operation {
                return id
            }
        }
        return nil
    }

    var activeImportGroupIds: Set<String> {
        var ids = Set<String>()
        for entry in entries {
            if case .importGroup(let id) = entry.operation {
                ids.insert(id)
            }
        }
        return ids
    }

    func snapshotUpdatePhases() -> [String: Phase] {
        var result: [String: Phase] = [:]
        for entry in entries {
            switch entry.operation {
            case .update(let sourceId):
                result[sourceId] = Self.preferRunning(result[sourceId], entry.phase)
            case .bulkUpdate(let sourceIds):
                for sourceId in sourceIds {
                    result[sourceId] = Self.preferRunning(result[sourceId], entry.phase)
                }
            case .importGroup:
                continue
            }
        }
        return result
    }

    func snapshotImportPhases() -> [String: Phase] {
        var result: [String: Phase] = [:]
        for entry in entries {
            if case .importGroup(let groupId) = entry.operation {
                result[groupId] = Self.preferRunning(result[groupId], entry.phase)
            }
        }
        return result
    }

    private static func preferRunning(_ current: Phase?, _ candidate: Phase) -> Phase {
        if current == .running || candidate == .running {
            return .running
        }
        return .queued
    }

    private static func normalize(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizeList(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values {
            let normalized = normalize(value)
            guard !normalized.isEmpty, !seen.contains(normalized) else {
                continue
            }
            seen.insert(normalized)
            result.append(normalized)
        }
        return result
    }

}

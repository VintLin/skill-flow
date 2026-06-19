import Foundation

@MainActor
public final class TaskCoordinator: Sendable {
    public struct TaskKey: Hashable, Sendable, CustomStringConvertible {
        let rawValue: String

        public init(_ rawValue: String) {
            self.rawValue = rawValue
        }

        public var description: String { rawValue }
    }

    public struct ManagedTask<T: Sendable>: Sendable {
        public let task: Task<T, Error>
        public let token: UInt64
        public let createdAt: Date
        public let key: TaskKey

        init(task: Task<T, Error>, token: UInt64, createdAt: Date, key: TaskKey) {
            self.task = task
            self.token = token
            self.createdAt = createdAt
            self.key = key
        }
    }

    private var tasks: [TaskKey: Any] = [:]
    private var tokens: [TaskKey: UInt64] = [:]
    private var tokenSeed: UInt64 = 0
    private let logger: TaskCoordinatorLogger

    public init(logger: TaskCoordinatorLogger = DefaultTaskCoordinatorLogger()) {
        self.logger = logger
    }

    public func run<T: Sendable>(
        key: TaskKey,
        operation: @Sendable @escaping () async throws -> T
    ) async throws -> T {
        if let existingTask = tasks[key] as? ManagedTask<T> {
            logger.logTaskReused(key: key)
            return try await existingTask.task.value
        }

        tokenSeed &+= 1
        let token = tokenSeed
        let createdAt = Date()
        let task = Task { try await operation() }

        let managedTask = ManagedTask(
            task: task,
            token: token,
            createdAt: createdAt,
            key: key
        )

        tasks[key] = managedTask
        tokens[key] = token
        logger.logTaskCreated(key: key, token: token)

        do {
            let result = try await task.value

            if tokens[key] == token {
                tasks.removeValue(forKey: key)
                tokens.removeValue(forKey: key)
                logger.logTaskCompleted(key: key, token: token)
            } else {
                logger.logTaskStaleResultIgnored(key: key, currentToken: tokens[key], resultToken: token)
            }

            return result
        } catch {
            if tokens[key] == token {
                tasks.removeValue(forKey: key)
                tokens.removeValue(forKey: key)
                logger.logTaskFailed(key: key, token: token, error: error)
            } else {
                logger.logTaskStaleErrorIgnored(key: key, currentToken: tokens[key], errorToken: token)
            }

            throw error
        }
    }

    public func cancel(key: TaskKey) {
        guard let token = tokens[key] else {
            logger.logCancelSkippedNoTask(key: key)
            return
        }

        if let managedTask = tasks[key] as? ManagedTask<AnySendable> {
            managedTask.task.cancel()
            logger.logTaskCancelled(key: key, token: token)
        }

        tasks.removeValue(forKey: key)
        tokens.removeValue(forKey: key)
    }

    public func cancelAll() {
        let allKeys = Array(tasks.keys)

        for key in allKeys {
            cancel(key: key)
        }

        logger.logAllTasksCancelled(count: allKeys.count)
    }

    public func cleanupCompleted() {
        var removedCount = 0

        for (key, value) in tasks {
            if let managedTask = value as? ManagedTask<AnySendable> {
                if managedTask.task.isCancelled {
                    tasks.removeValue(forKey: key)
                    tokens.removeValue(forKey: key)
                    removedCount += 1
                }
            }
        }

        if removedCount > 0 {
            logger.logCleanupCompleted(removedCount: removedCount)
        }
    }

    public var activeTaskCount: Int {
        tasks.count
    }

    public var hasActiveTasks: Bool {
        !tasks.isEmpty
    }

    public func isActiveTask(for key: TaskKey) -> Bool {
        tasks[key] != nil
    }

    public func taskInfo(for key: TaskKey) -> (token: UInt64, createdAt: Date)? {
        guard let token = tokens[key],
              let managedTask = tasks[key] as? ManagedTask<AnySendable> else {
            return nil
        }

        return (token: token, createdAt: managedTask.createdAt)
    }
}

extension TaskCoordinator {
    public struct AnySendable: @unchecked Sendable {
        let value: Any?

        init(_ value: Any?) {
            self.value = value
        }
    }
}

public protocol TaskCoordinatorLogger: Sendable {
    func logTaskCreated(key: TaskCoordinator.TaskKey, token: UInt64)
    func logTaskReused(key: TaskCoordinator.TaskKey)
    func logTaskCompleted(key: TaskCoordinator.TaskKey, token: UInt64)
    func logTaskFailed(key: TaskCoordinator.TaskKey, token: UInt64, error: Error)
    func logTaskCancelled(key: TaskCoordinator.TaskKey, token: UInt64)
    func logCancelSkippedNoTask(key: TaskCoordinator.TaskKey)
    func logAllTasksCancelled(count: Int)
    func logCleanupCompleted(removedCount: Int)
    func logTaskStaleResultIgnored(key: TaskCoordinator.TaskKey, currentToken: UInt64?, resultToken: UInt64)
    func logTaskStaleErrorIgnored(key: TaskCoordinator.TaskKey, currentToken: UInt64?, errorToken: UInt64)
}

public final class DefaultTaskCoordinatorLogger: TaskCoordinatorLogger {
    public init() {}

    public func logTaskCreated(key: TaskCoordinator.TaskKey, token: UInt64) {
        #if DEBUG
        print("[TaskCoordinator] ✅ Task created: \(key), token: \(token)")
        #endif
    }

    public func logTaskReused(key: TaskCoordinator.TaskKey) {
        #if DEBUG
        print("[TaskCoordinator] 🔄 Task reused: \(key)")
        #endif
    }

    public func logTaskCompleted(key: TaskCoordinator.TaskKey, token: UInt64) {
        #if DEBUG
        print("[TaskCoordinator] ✅ Task completed: \(key), token: \(token)")
        #endif
    }

    public func logTaskFailed(key: TaskCoordinator.TaskKey, token: UInt64, error: Error) {
        #if DEBUG
        print("[TaskCoordinator] ❌ Task failed: \(key), token: \(token), error: \(error.localizedDescription)")
        #endif
    }

    public func logTaskCancelled(key: TaskCoordinator.TaskKey, token: UInt64) {
        #if DEBUG
        print("[TaskCoordinator] ⏹️ Task cancelled: \(key), token: \(token)")
        #endif
    }

    public func logCancelSkippedNoTask(key: TaskCoordinator.TaskKey) {
        #if DEBUG
        print("[TaskCoordinator] ⚠️ Cancel skipped (no task): \(key)")
        #endif
    }

    public func logAllTasksCancelled(count: Int) {
        #if DEBUG
        print("[TaskCoordinator] 🛑 All tasks cancelled (\(count))")
        #endif
    }

    public func logCleanupCompleted(removedCount: Int) {
        #if DEBUG
        print("[TaskCoordinator] 🧹 Cleanup completed: \(removedCount) tasks removed")
        #endif
    }

    public func logTaskStaleResultIgnored(key: TaskCoordinator.TaskKey, currentToken: UInt64?, resultToken: UInt64) {
        #if DEBUG
        print("[TaskCoordinator] ⏭️ Stale result ignored for \(key): current=\(currentToken ?? 0), result=\(resultToken)")
        #endif
    }

    public func logTaskStaleErrorIgnored(key: TaskCoordinator.TaskKey, currentToken: UInt64?, errorToken: UInt64) {
        #if DEBUG
        print("[TaskCoordinator] ⏭️ Stale error ignored for \(key): current=\(currentToken ?? 0), error=\(errorToken)")
        #endif
    }
}

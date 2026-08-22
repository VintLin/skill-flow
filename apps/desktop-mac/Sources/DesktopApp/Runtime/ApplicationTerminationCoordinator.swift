import Foundation
import Observation

@MainActor
@Observable
final class ApplicationTerminationCoordinator {
    enum Phase: Equatable {
        case idle
        case stoppingAndRestoring
        case recoveryFailed
        case recoveryRequired
    }

    enum Disposition: Equatable {
        case terminateNow
        case terminateLater
    }

    private(set) var phase: Phase = .idle

    private let hasProtectedOperation: () -> Bool
    private let shutdownProtectedOperations: () -> Void
    private let cancelActiveHelper: () async -> Bool
    private let recoverInterruptedOperation: () async -> Bool
    private let resumeProtectedOperations: () -> Void
    private var pendingReply: ((Bool) -> Void)?
    private var recoveryTask: Task<Void, Never>?

    init(
        hasProtectedOperation: @escaping () -> Bool,
        shutdownProtectedOperations: @escaping () -> Void,
        cancelActiveHelper: @escaping () async -> Bool,
        recoverInterruptedOperation: @escaping () async -> Bool,
        resumeProtectedOperations: @escaping () -> Void = {}
    ) {
        self.hasProtectedOperation = hasProtectedOperation
        self.shutdownProtectedOperations = shutdownProtectedOperations
        self.cancelActiveHelper = cancelActiveHelper
        self.recoverInterruptedOperation = recoverInterruptedOperation
        self.resumeProtectedOperations = resumeProtectedOperations
    }

    func requestTermination(reply: @escaping (Bool) -> Void) -> Disposition {
        guard hasProtectedOperation() || phase != .idle else { return .terminateNow }
        guard pendingReply == nil else { return .terminateLater }

        pendingReply = reply
        shutdownProtectedOperations()
        beginRecoveryAttempt()
        return .terminateLater
    }

    func retryRecovery() {
        guard phase == .recoveryFailed || phase == .recoveryRequired else { return }
        beginRecoveryAttempt()
    }

    func cancelExit() {
        recoveryTask?.cancel()
        recoveryTask = nil
        phase = .recoveryRequired
        let reply = pendingReply
        pendingReply = nil
        reply?(false)
    }

    private func beginRecoveryAttempt() {
        recoveryTask?.cancel()
        phase = .stoppingAndRestoring
        recoveryTask = Task { [weak self] in
            guard let self else { return }
            let cancelled = await cancelActiveHelper()
            let succeeded: Bool
            if cancelled {
                succeeded = await recoverInterruptedOperation()
            } else {
                succeeded = false
            }
            guard !Task.isCancelled else { return }
            if succeeded {
                let shouldTerminate = pendingReply != nil
                if !shouldTerminate {
                    resumeProtectedOperations()
                }
                phase = .idle
                let reply = pendingReply
                pendingReply = nil
                recoveryTask = nil
                reply?(true)
            } else {
                phase = pendingReply == nil ? .recoveryRequired : .recoveryFailed
                recoveryTask = nil
            }
        }
    }
}

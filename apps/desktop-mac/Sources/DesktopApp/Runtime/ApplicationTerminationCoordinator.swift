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
    private let hasCancellableHelper: () -> Bool
    private let shutdownProtectedOperations: () -> Void
    private let cancelActiveHelper: () async -> Bool
    private let recoverInterruptedOperation: () async -> Bool
    private let cleanupInterruptedDisposableWork: () async -> Bool
    private let resumeProtectedOperations: () -> Void
    private let enterRecoveryRequiredState: () -> Void
    private var pendingReply: ((Bool) -> Void)?
    private var recoveryTask: Task<Void, Never>?
    private var requiresDurableRecovery = false

    init(
        hasProtectedOperation: @escaping () -> Bool,
        hasCancellableHelper: @escaping () -> Bool = { false },
        shutdownProtectedOperations: @escaping () -> Void,
        cancelActiveHelper: @escaping () async -> Bool,
        recoverInterruptedOperation: @escaping () async -> Bool,
        cleanupInterruptedDisposableWork: @escaping () async -> Bool = { true },
        resumeProtectedOperations: @escaping () -> Void = {},
        enterRecoveryRequiredState: @escaping () -> Void = {}
    ) {
        self.hasProtectedOperation = hasProtectedOperation
        self.hasCancellableHelper = hasCancellableHelper
        self.shutdownProtectedOperations = shutdownProtectedOperations
        self.cancelActiveHelper = cancelActiveHelper
        self.recoverInterruptedOperation = recoverInterruptedOperation
        self.cleanupInterruptedDisposableWork = cleanupInterruptedDisposableWork
        self.resumeProtectedOperations = resumeProtectedOperations
        self.enterRecoveryRequiredState = enterRecoveryRequiredState
    }

    func requestTermination(reply: @escaping (Bool) -> Void) -> Disposition {
        let hasDurableWork = hasProtectedOperation()
        guard hasDurableWork || hasCancellableHelper() || phase != .idle else { return .terminateNow }
        guard pendingReply == nil else { return .terminateLater }

        requiresDurableRecovery = hasDurableWork || phase == .recoveryRequired || phase == .recoveryFailed
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
        enterRecoveryRequiredState()
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
                if requiresDurableRecovery {
                    succeeded = await recoverInterruptedOperation()
                } else {
                    _ = await cleanupInterruptedDisposableWork()
                    succeeded = true
                }
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

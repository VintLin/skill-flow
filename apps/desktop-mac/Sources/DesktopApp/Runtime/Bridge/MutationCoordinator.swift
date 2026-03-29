import Foundation

@MainActor
final class MutationCoordinator {
    private var runningMutation = false

    func runMutation(operation: @Sendable @escaping () async throws -> BridgeResponse) async throws -> BridgeResponse {
        guard !runningMutation else {
            throw BridgeClientError.concurrentMutationRejected
        }
        runningMutation = true
        defer { runningMutation = false }
        return try await operation()
    }
}

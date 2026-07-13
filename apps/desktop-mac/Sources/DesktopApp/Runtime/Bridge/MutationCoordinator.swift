import Foundation

actor MutationCoordinator {
    private var chain: Task<Void, Never>?

    func runMutation(operation: @Sendable @escaping () async throws -> BridgeResponse) async throws -> BridgeResponse {
        let previous = chain
        let task = Task {
            _ = await previous?.value
            return try await operation()
        }
        chain = Task {
            _ = try? await task.value
        }
        return try await task.value
    }
}

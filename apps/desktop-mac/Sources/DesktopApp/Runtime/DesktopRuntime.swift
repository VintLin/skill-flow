import Foundation

@MainActor
final class DesktopRuntime {
    let state: DesktopAppState
    private let dependencies: DesktopRuntimeDependencies

    init(
        state: DesktopAppState = DesktopAppState(),
        dependencies: DesktopRuntimeDependencies = .live()
    ) {
        self.state = state
        self.dependencies = dependencies
    }

    func bootstrapIfNeeded() async {
        guard state.asyncResources.homeBootstrapPhase != .ready else {
            return
        }

        state.asyncResources.homeBootstrapPhase = .loading

        do {
            let response = try await dependencies.bootstrap()
            let sourceIds = sourceIds(from: response)

            state.workspace.sourceIds = sourceIds
            if state.view.selectedSourceId == nil || !sourceIds.contains(state.view.selectedSourceId ?? "") {
                state.view.selectedSourceId = sourceIds.first
            }
            state.asyncResources.homeBootstrapPhase = .ready
        } catch {
            state.asyncResources.homeBootstrapPhase = .failed(error.localizedDescription)
        }
    }

    func showDetail(sourceId: String) async {
        let normalizedSourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedSourceId.isEmpty else {
            return
        }

        state.view.selectedSourceId = normalizedSourceId
        state.view.currentRoute = .detail(sourceId: normalizedSourceId)

        do {
            _ = try await dependencies.inspect(normalizedSourceId)
        } catch {
            return
        }
    }

    private func sourceIds(from response: BridgeResponse) -> [String] {
        guard let payload = response.data?.value as? [String: Any] else {
            return []
        }

        if let summaries = payload["summaries"] as? [[String: Any]] {
            return summaries.compactMap { $0["sourceId"] as? String }
        }

        if let sourceIds = payload["sourceIds"] as? [String] {
            return sourceIds
        }

        return []
    }
}

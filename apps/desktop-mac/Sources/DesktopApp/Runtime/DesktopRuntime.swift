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
        switch state.asyncResources.homeBootstrapPhase {
        case .loading, .ready:
            return
        case .idle, .failed:
            break
        }

        state.asyncResources.homeBootstrapPhase = .loading

        do {
            let sourceIds = try await dependencies.bootstrap()

            state.workspace.sourceIds = sourceIds
            if state.view.selectedSourceId == nil || !sourceIds.contains(state.view.selectedSourceId ?? "") {
                state.view.selectedSourceId = sourceIds.first
            }
            state.asyncResources.homeBootstrapPhase = .ready
        } catch {
            state.asyncResources.homeBootstrapPhase = .failed(error.localizedDescription)
        }
    }

    func showDetail(sourceId: String) {
        let normalizedSourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedSourceId.isEmpty else {
            return
        }

        state.view.selectedSourceId = normalizedSourceId
        state.view.currentRoute = .detail(sourceId: normalizedSourceId)
    }
}

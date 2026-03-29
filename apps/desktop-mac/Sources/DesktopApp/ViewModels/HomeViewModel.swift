import Foundation
import Observation

@MainActor
@Observable
final class HomeViewModel {
    private let state: DesktopAppState

    init(state: DesktopAppState) {
        self.state = state
    }

    var sourceIds: [String] {
        state.workspace.sourceIds
    }

    var currentRoute: DesktopRoute {
        state.view.currentRoute
    }
}

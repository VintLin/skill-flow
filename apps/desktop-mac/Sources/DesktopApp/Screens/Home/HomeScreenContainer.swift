import SwiftUI

@MainActor
final class HomeScreenContainer {
    private let state: DesktopAppState
    let viewModel: HomeViewModel
    let mainViewModel: MainViewModel

    init(state: DesktopAppState, mainViewModel: MainViewModel) {
        self.state = state
        self.viewModel = HomeViewModel(state: state)
        self.mainViewModel = mainViewModel
    }

    func makeView() -> HomeScreen {
        HomeScreen(container: self, homeViewModel: viewModel, mainViewModel: mainViewModel)
    }

    func bootstrapIfNeeded() async {
        if case .idle = mainViewModel.loadState {
            await mainViewModel.bootstrap()
        }

        syncFoundationState()
    }

    private func syncFoundationState() {
        state.workspace.sourceIds = mainViewModel.sourceIds

        if let selectedSourceId = mainViewModel.selectedSourceId,
           mainViewModel.sourceIds.contains(selectedSourceId) {
            state.view.selectedSourceId = selectedSourceId
        }
    }
}

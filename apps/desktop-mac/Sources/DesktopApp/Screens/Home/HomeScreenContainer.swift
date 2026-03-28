import SwiftUI

@MainActor
final class HomeScreenContainer {
    let viewModel: HomeViewModel
    let mainViewModel: MainViewModel

    init(state: DesktopAppState, mainViewModel: MainViewModel) {
        self.viewModel = HomeViewModel(state: state)
        self.mainViewModel = mainViewModel
    }

    func makeView() -> HomeScreen {
        HomeScreen(homeViewModel: viewModel, mainViewModel: mainViewModel)
    }
}

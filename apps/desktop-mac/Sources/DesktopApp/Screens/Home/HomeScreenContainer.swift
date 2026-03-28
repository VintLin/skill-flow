import SwiftUI

@MainActor
final class HomeScreenContainer {
    let navigator: DesktopNavigator
    let viewModel: HomeViewModel

    init(state: DesktopAppState, navigator: DesktopNavigator) {
        self.navigator = navigator
        self.viewModel = HomeViewModel(state: state)
    }

    func makeView() -> HomeScreen {
        HomeScreen(viewModel: viewModel)
    }
}

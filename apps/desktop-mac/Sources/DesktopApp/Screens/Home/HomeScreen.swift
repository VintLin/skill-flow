import SwiftUI

struct HomeScreen: View {
    let container: HomeScreenContainer
    @Bindable var homeViewModel: HomeViewModel
    @Bindable var mainViewModel: MainViewModel

    var body: some View {
        let _ = homeViewModel.sourceIds

        return MainView(viewModel: mainViewModel)
            .frame(minWidth: 980, minHeight: 640)
            .task {
                await container.bootstrapIfNeeded()
            }
    }
}

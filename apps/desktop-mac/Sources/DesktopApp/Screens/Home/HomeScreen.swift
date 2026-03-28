import SwiftUI

struct HomeScreen: View {
    @Bindable var homeViewModel: HomeViewModel
    @Bindable var mainViewModel: MainViewModel

    var body: some View {
        let _ = homeViewModel.sourceIds

        return MainView(viewModel: mainViewModel)
            .frame(minWidth: 980, minHeight: 640)
    }
}

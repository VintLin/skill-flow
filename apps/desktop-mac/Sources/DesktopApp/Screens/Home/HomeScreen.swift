import SwiftUI

struct HomeScreen: View {
    let container: HomeScreenContainer
    let importContainer: ImportScreenContainer
    let detailContainer: DetailScreenContainer
    @Bindable var homeViewModel: HomeViewModel
    @Bindable var mainViewModel: MainViewModel

    func bootstrapOnAppear() async {
        await container.bootstrapIfNeeded()
    }

    var body: some View {
        let _ = homeViewModel.sourceIds

        return MainView(
            viewModel: mainViewModel,
            navigation: container.navigation,
            importScreenState: importContainer.screenState,
            importContainer: importContainer,
            detailContainer: detailContainer
        )
            .frame(minWidth: 980, minHeight: 640)
            .task {
                await bootstrapOnAppear()
            }
    }
}

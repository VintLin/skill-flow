import Foundation

@MainActor
final class DesktopAppContainer {
    struct RouteNavigation {
        let showHome: () -> Void
        let showDetail: (String) -> Void
        let showImportPage: () -> Void
        let showSettings: () -> Void
    }

    let runtime: DesktopRuntime
    let mainViewModel: MainViewModel
    let settingsViewModel: SettingsViewModel
    let importContainer: ImportScreenContainer
    let detailContainer: DetailScreenContainer
    let homeContainer: HomeScreenContainer
    let navigation: RouteNavigation

    init(
        runtime: DesktopRuntime = DesktopRuntime(),
        bridgeClient: BridgeClient = BridgeClient()
    ) {
        self.runtime = runtime
        self.mainViewModel = MainViewModel(bridgeClient: bridgeClient)
        self.settingsViewModel = SettingsViewModel()
        self.importContainer = ImportScreenContainer(state: runtime.state, mainViewModel: mainViewModel)
        self.detailContainer = DetailScreenContainer(state: runtime.state) { [weak mainViewModel] sourceId in
            mainViewModel?.detailSnapshot(for: sourceId)
        }
        self.homeContainer = HomeScreenContainer(
            state: runtime.state,
            mainViewModel: mainViewModel,
            settingsViewModel: settingsViewModel,
            importContainer: importContainer,
            detailContainer: detailContainer
        )
        self.navigation = RouteNavigation(
            showHome: { [weak state = runtime.state] in
                state?.view.currentRoute = .home
            },
            showDetail: { [weak state = runtime.state] sourceId in
                state?.view.currentRoute = .detail(sourceId: sourceId)
            },
            showImportPage: { [weak state = runtime.state] in
                state?.view.currentRoute = .importPage
            },
            showSettings: { [weak state = runtime.state] in
                state?.view.currentRoute = .settings
            }
        )
    }
}

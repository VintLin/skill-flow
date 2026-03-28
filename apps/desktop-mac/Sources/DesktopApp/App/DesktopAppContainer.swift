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
    let homeContainer: HomeScreenContainer
    let navigation: RouteNavigation

    init(
        runtime: DesktopRuntime = DesktopRuntime(),
        bridgeClient: BridgeClient = BridgeClient()
    ) {
        self.runtime = runtime
        self.mainViewModel = MainViewModel(bridgeClient: bridgeClient)
        self.homeContainer = HomeScreenContainer(state: runtime.state, mainViewModel: mainViewModel)
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

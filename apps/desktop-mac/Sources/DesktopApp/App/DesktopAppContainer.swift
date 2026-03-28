import Foundation

@MainActor
final class DesktopAppContainer {
    let runtime: DesktopRuntime
    let navigator: DesktopNavigator
    let mainViewModel: MainViewModel
    let homeContainer: HomeScreenContainer

    init(
        runtime: DesktopRuntime = DesktopRuntime(),
        bridgeClient: BridgeClient = BridgeClient()
    ) {
        self.runtime = runtime
        self.navigator = DesktopNavigator(appState: runtime.state)
        self.mainViewModel = MainViewModel(bridgeClient: bridgeClient)
        self.homeContainer = HomeScreenContainer(state: runtime.state, navigator: navigator)
    }
}

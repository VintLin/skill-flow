import Foundation

@MainActor
final class DesktopAppContainer {
    let runtime: DesktopRuntime
    let mainViewModel: MainViewModel
    let homeContainer: HomeScreenContainer

    init(
        runtime: DesktopRuntime = DesktopRuntime(),
        bridgeClient: BridgeClient = BridgeClient()
    ) {
        self.runtime = runtime
        self.mainViewModel = MainViewModel(bridgeClient: bridgeClient)
        self.homeContainer = HomeScreenContainer(state: runtime.state, mainViewModel: mainViewModel)
    }
}

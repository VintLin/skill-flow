import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopAppContainerTests: XCTestCase {
    func testHomeContainerReflectsRuntimeStateChangesThroughLiveSeam() {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, [])

        runtime.state.workspace.sourceIds = ["alpha", "beta"]

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, ["alpha", "beta"])
    }

    func testHomeContainerKeepsFoundationRouteHomeWhenReturningFromDetailState() async {
        let runtime = DesktopRuntime()
        runtime.state.view.currentRoute = .detail(sourceId: "alpha")

        let container = DesktopAppContainer(runtime: runtime)

        container.mainViewModel.currentPage = .settings
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .settings)

        container.mainViewModel.currentPage = .home
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .home)
    }
}

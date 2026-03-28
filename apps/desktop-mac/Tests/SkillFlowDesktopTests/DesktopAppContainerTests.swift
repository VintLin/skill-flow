import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopAppContainerTests: XCTestCase {
    func testDetailRouteProjectsIntoLiveDetailContainerProductionSeam() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.navigation.showDetail("alpha")
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertEqual(container.mainViewModel.currentPage, .detail(sourceId: "alpha"))
        XCTAssertNil(container.detailContainer.viewModel)
    }

    func testHomeContainerReflectsRuntimeStateChangesThroughLiveSeam() {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, [])

        runtime.state.workspace.sourceIds = ["alpha", "beta"]

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, ["alpha", "beta"])
    }

    func testHomeSeamProjectsFoundationRouteIntoMainViewModelCurrentPage() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.homeContainer.navigation.showDetail("alpha")
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertEqual(container.mainViewModel.currentPage, .detail(sourceId: "alpha"))

        container.homeContainer.navigation.showHome()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .home)
        XCTAssertEqual(container.mainViewModel.currentPage, .home)
    }

    func testAppNavigationSeamProjectsOuterRoutesIntoFoundationState() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.navigation.showSettings()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .settings)
        XCTAssertEqual(container.mainViewModel.currentPage, .settings)

        container.navigation.showImportPage()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.mainViewModel.currentPage, .importPage)
    }
}

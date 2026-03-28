import Foundation
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
        XCTAssertEqual(container.mainViewModel.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertNil(container.detailContainer.viewModel)
    }

    func testHomeContainerReflectsRuntimeStateChangesThroughLiveSeam() {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, [])

        runtime.state.workspace.sourceIds = ["alpha", "beta"]

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, ["alpha", "beta"])
    }

    func testHomeSeamBindsFoundationRouteIntoMainViewModelCurrentRoute() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.homeContainer.navigation.showDetail("alpha")
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertEqual(container.mainViewModel.currentRoute, .detail(sourceId: "alpha"))

        container.homeContainer.navigation.showHome()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .home)
        XCTAssertEqual(container.mainViewModel.currentRoute, .home)
    }

    func testAppNavigationSeamProjectsOuterRoutesIntoFoundationState() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.navigation.showSettings()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .settings)
        XCTAssertEqual(container.mainViewModel.currentRoute, .settings)

        container.navigation.showImportPage()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.mainViewModel.currentRoute, .importPage)
    }

    func testSettingsRouteProjectsIntoSettingsScreenPath() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.navigation.showSettings()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .settings)
        XCTAssertEqual(container.mainViewModel.currentRoute, .settings)
    }

    func testSettingsStateIsSharedAcrossDesktopShells() {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        XCTAssertTrue(container.homeContainer.settingsViewModel === container.settingsViewModel)
    }

    func testImportRouteProjectsIntoLiveImportContainerProductionSeam() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.navigation.showImportPage()
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.mainViewModel.currentRoute, .importPage)
        XCTAssertTrue(container.importContainer.isActive)
        XCTAssertNotNil(container.importContainer.snapshot(locale: Locale(identifier: "en")))
    }
}

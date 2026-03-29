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

    func testMenuBarSearchStateIsIndependentFromPrimarySearchState() {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        container.mainViewModel.searchQuery = "home"
        container.menuBarScreenState.searchQuery = "menu"

        XCTAssertEqual(container.mainViewModel.searchQuery, "home")
        XCTAssertEqual(container.menuBarScreenState.searchQuery, "menu")
    }

    func testDefaultRuntimeBootstrapUsesInjectedQueryFacade() async {
        let query = StubQueryFacade(
            bootstrapResponse: BridgeResponse(
                protocolVersion: "1.0",
                requestId: UUID().uuidString,
                command: .bootstrap,
                ok: true,
                data: AnyCodable([
                    "sourceIds": ["alpha", "beta"],
                ]),
                warnings: [],
                errors: []
            )
        )
        let container = DesktopAppContainer(
            queryFacade: query,
            commandFacade: StubCommandFacade()
        )

        await container.runtime.bootstrapIfNeeded()

        XCTAssertEqual(container.runtime.state.workspace.sourceIds, ["alpha", "beta"])
        XCTAssertEqual(query.bootstrapCallCount, 1)
    }
}

private struct StubCommandFacade: DesktopCommanding {
    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse { fatalError("unused") }
    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse { fatalError("unused") }
    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse { fatalError("unused") }
    func uninstall(sourceIds: [String]) async throws -> BridgeResponse { fatalError("unused") }
    func apply(sourceId: String, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse { fatalError("unused") }
    func doctor() async throws -> BridgeResponse { fatalError("unused") }
}

@MainActor
private final class StubQueryFacade: DesktopQuerying {
    private(set) var bootstrapCallCount = 0
    private let bootstrapResponse: BridgeResponse

    init(bootstrapResponse: BridgeResponse) {
        self.bootstrapResponse = bootstrapResponse
    }

    func bootstrap() async throws -> BridgeResponse {
        bootstrapCallCount += 1
        return bootstrapResponse
    }

    func list() async throws -> BridgeResponse { fatalError("unused") }
    func inspect(sourceId: String) async throws -> BridgeResponse { fatalError("unused") }
    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse { fatalError("unused") }
    func searchImportGroups(query: String?) async throws -> BridgeResponse { fatalError("unused") }
    func previewImportSource(locator: String) async throws -> BridgeResponse { fatalError("unused") }
}

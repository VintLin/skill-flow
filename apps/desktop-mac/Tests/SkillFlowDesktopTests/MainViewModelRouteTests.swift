import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelRouteTests: XCTestCase {
    func testRequestPageUpdatesCurrentRouteImmediatelyWithoutRouteProjection() {
        let model = MainViewModel(bridgeClient: BridgeClient())

        model.requestPage(.settings)

        XCTAssertEqual(model.currentRoute, .settings)
    }

    func testRequestPageAlsoForwardsToRouteProjectionHook() {
        let model = MainViewModel(bridgeClient: BridgeClient())
        var projectedPage: MainViewModel.Page?

        model.routeRequest = { page in
            projectedPage = page
        }

        model.requestPage(.detail(sourceId: "alpha"))

        XCTAssertEqual(model.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertEqual(projectedPage, .detail(sourceId: "alpha"))
    }

    func testSyncCurrentPageProjectsFoundationRouteIntoCurrentRoute() {
        let model = MainViewModel(bridgeClient: BridgeClient())

        model.syncCurrentPage(from: .importPage)
        XCTAssertEqual(model.currentRoute, .importPage)

        model.syncCurrentPage(from: .detail(sourceId: "alpha"))
        XCTAssertEqual(model.currentRoute, .detail(sourceId: "alpha"))
    }
}

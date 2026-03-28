import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelRouteTests: XCTestCase {
    func testRequestPageUpdatesCurrentPageImmediatelyWithoutRouteProjection() {
        let model = MainViewModel(bridgeClient: BridgeClient())

        model.requestPage(.settings)

        XCTAssertEqual(model.currentPage, .settings)
    }

    func testRequestPageAlsoForwardsToRouteProjectionHook() {
        let model = MainViewModel(bridgeClient: BridgeClient())
        var projectedPage: MainViewModel.Page?

        model.routeRequest = { page in
            projectedPage = page
        }

        model.requestPage(.detail(sourceId: "alpha"))

        XCTAssertEqual(model.currentPage, .detail(sourceId: "alpha"))
        XCTAssertEqual(projectedPage, .detail(sourceId: "alpha"))
    }
}

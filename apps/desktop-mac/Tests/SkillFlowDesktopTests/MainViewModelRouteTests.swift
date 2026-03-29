import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelRouteTests: XCTestCase {
    func testRequestPageWritesIntoBoundRouteState() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(state)

        model.requestPage(.settings)

        XCTAssertEqual(model.currentRoute, .settings)
        XCTAssertEqual(state.view.currentRoute, .settings)
    }

    func testCurrentRouteTracksBoundStateChangesWithoutProjectionHooks() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(state)

        state.view.currentRoute = .detail(sourceId: "alpha")

        XCTAssertEqual(model.currentRoute, .detail(sourceId: "alpha"))
    }

    func testRequestPageReusesPageRouteMappingAgainstBoundState() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.bindRouteState(state)

        model.requestPage(.importPage)
        XCTAssertEqual(model.currentRoute, .importPage)

        model.requestPage(.detail(sourceId: "alpha"))
        XCTAssertEqual(model.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertEqual(state.view.currentRoute, .detail(sourceId: "alpha"))
    }
}

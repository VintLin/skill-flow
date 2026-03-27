import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopNavigationTests: XCTestCase {
    func testNavigatorStartsOnHomeRoute() {
        let navigator = DesktopNavigator()

        XCTAssertEqual(navigator.currentRoute, .home)
    }

    func testNavigatorOpensDetailRouteForSourceId() {
        let navigator = DesktopNavigator()

        navigator.showDetail(sourceId: "alpha")

        XCTAssertEqual(navigator.currentRoute, .detail(sourceId: "alpha"))
    }

    func testBoundNavigatorWritesDetailRouteIntoAppStateViewState() {
        let state = DesktopAppState()
        let navigator = DesktopNavigator(appState: state)

        navigator.showDetail(sourceId: "alpha")

        XCTAssertEqual(state.view.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertEqual(navigator.currentRoute, .detail(sourceId: "alpha"))
    }

    func testDesktopAppStateStartsWithHomeViewStateAndIdleBootstrapPhase() {
        let state = DesktopAppState()

        XCTAssertEqual(state.view.currentRoute, .home)
        XCTAssertEqual(state.asyncResources.homeBootstrapPhase, .idle)
    }
}

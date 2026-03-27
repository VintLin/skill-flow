import XCTest
import Observation

@testable import SkillFlowDesktop

@MainActor
final class DesktopNavigationTests: XCTestCase {
    private final class InvalidationBox: @unchecked Sendable {
        var didInvalidate = false
    }

    func testNavigatorStartsOnHomeRoute() {
        let navigator = DesktopNavigator()

        XCTAssertEqual(navigator.currentRoute, .home)
    }

    func testNavigatorOpensDetailRouteForSourceId() {
        let navigator = DesktopNavigator()

        navigator.showDetail(sourceId: "alpha")

        XCTAssertEqual(navigator.currentRoute, .detail(sourceId: "alpha"))
    }

    func testStandaloneNavigatorPublishesRouteChangesThroughObservation() {
        let navigator = DesktopNavigator()
        let box = InvalidationBox()

        withObservationTracking {
            _ = navigator.currentRoute
        } onChange: {
            box.didInvalidate = true
        }

        navigator.showSettings()

        XCTAssertTrue(box.didInvalidate)
        XCTAssertEqual(navigator.currentRoute, .settings)
    }

    func testBoundNavigatorWritesDetailRouteIntoAppStateViewState() {
        let state = DesktopAppState()
        let navigator = DesktopNavigator(appState: state)

        navigator.showDetail(sourceId: "alpha")

        XCTAssertEqual(state.view.currentRoute, .detail(sourceId: "alpha"))
        XCTAssertEqual(navigator.currentRoute, .detail(sourceId: "alpha"))
    }

    func testBoundNavigatorWritesRemainingRoutesIntoAppStateViewState() {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "seed")
        let navigator = DesktopNavigator(appState: state)

        navigator.showHome()
        XCTAssertEqual(state.view.currentRoute, .home)
        XCTAssertEqual(navigator.currentRoute, .home)

        navigator.showImportPage()
        XCTAssertEqual(state.view.currentRoute, .importPage)
        XCTAssertEqual(navigator.currentRoute, .importPage)

        navigator.showSettings()
        XCTAssertEqual(state.view.currentRoute, .settings)
        XCTAssertEqual(navigator.currentRoute, .settings)
    }

    func testBoundNavigatorTracksAppStateRouteChanges() async {
        let state = DesktopAppState()
        let navigator = DesktopNavigator(appState: state)

        state.view.currentRoute = .settings
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(navigator.currentRoute, .settings)
    }

    func testDesktopAppStateStartsWithHomeViewStateAndIdleBootstrapPhase() {
        let state = DesktopAppState()

        XCTAssertEqual(state.view.currentRoute, .home)
        XCTAssertEqual(state.asyncResources.homeBootstrapPhase, .idle)
    }
}

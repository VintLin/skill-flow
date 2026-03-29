import XCTest

@testable import SkillFlowDesktop

@MainActor
final class HomeViewModelTests: XCTestCase {
    func testCurrentRouteProjectsFoundationViewState() {
        let state = DesktopAppState()
        let viewModel = HomeViewModel(state: state)

        XCTAssertEqual(viewModel.currentRoute, .home)

        state.view.currentRoute = .detail(sourceId: "alpha")

        XCTAssertEqual(viewModel.currentRoute, .detail(sourceId: "alpha"))
    }
}

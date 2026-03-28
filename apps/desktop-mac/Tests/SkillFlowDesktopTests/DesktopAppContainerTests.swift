import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopAppContainerTests: XCTestCase {
    func testHomeViewModelReadsSourceIdsFromDesktopAppState() {
        let state = DesktopAppState()
        state.workspace.sourceIds = ["alpha", "beta"]

        let viewModel = HomeViewModel(state: state)

        XCTAssertEqual(viewModel.sourceIds, ["alpha", "beta"])
    }
}

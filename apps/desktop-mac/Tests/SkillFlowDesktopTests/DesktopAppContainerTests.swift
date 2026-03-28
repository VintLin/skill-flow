import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopAppContainerTests: XCTestCase {
    func testHomeContainerExposesViewModelSourceIdsFromDesktopAppState() {
        let runtime = DesktopRuntime()
        runtime.state.workspace.sourceIds = ["alpha", "beta"]

        let container = DesktopAppContainer(runtime: runtime)

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, ["alpha", "beta"])
    }
}

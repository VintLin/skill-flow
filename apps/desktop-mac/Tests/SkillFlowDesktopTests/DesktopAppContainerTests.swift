import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopAppContainerTests: XCTestCase {
    func testHomeContainerReflectsRuntimeStateChangesThroughLiveSeam() {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, [])

        runtime.state.workspace.sourceIds = ["alpha", "beta"]

        XCTAssertEqual(container.homeContainer.viewModel.sourceIds, ["alpha", "beta"])
    }
}

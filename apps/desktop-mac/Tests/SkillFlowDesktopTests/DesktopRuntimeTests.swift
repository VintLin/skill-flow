import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopRuntimeTests: XCTestCase {
    func testBootstrapIfNeededMarksHomeBootstrapPhaseReadyAfterLoad() async throws {
        let runtime = DesktopRuntime(
            dependencies: .testing(
                bootstrap: { ["alpha", "beta"] }
            )
        )

        await runtime.bootstrapIfNeeded()

        XCTAssertEqual(runtime.state.asyncResources.homeBootstrapPhase, .ready)
        XCTAssertEqual(runtime.state.workspace.sourceIds, ["alpha", "beta"])
    }

    func testBootstrapIfNeededReturnsImmediatelyWhileLoading() async throws {
        let firstBootstrapStarted = expectation(description: "first bootstrap started")

        var bootstrapCallCount = 0
        var continuation: CheckedContinuation<[String], Never>?

        let runtime = DesktopRuntime(
            dependencies: .testing(
                bootstrap: {
                    bootstrapCallCount += 1
                    firstBootstrapStarted.fulfill()
                    return await withCheckedContinuation { cont in
                        continuation = cont
                    }
                }
            )
        )

        let bootstrapTask = Task {
            await runtime.bootstrapIfNeeded()
        }

        await fulfillment(of: [firstBootstrapStarted], timeout: 1)
        XCTAssertEqual(runtime.state.asyncResources.homeBootstrapPhase, .loading)

        await runtime.bootstrapIfNeeded()

        XCTAssertEqual(bootstrapCallCount, 1)
        XCTAssertEqual(runtime.state.asyncResources.homeBootstrapPhase, .loading)

        continuation?.resume(returning: ["alpha"])
        await bootstrapTask.value

        XCTAssertEqual(runtime.state.asyncResources.homeBootstrapPhase, .ready)
        XCTAssertEqual(runtime.state.workspace.sourceIds, ["alpha"])
    }

    func testShowDetailNormalizesSelectedSourceAndRouteWithoutInspectingBridge() async {
        let runtime = DesktopRuntime(
            dependencies: .testing(
                bootstrap: { [] }
            )
        )

        runtime.showDetail(sourceId: "  alpha  ")

        XCTAssertEqual(runtime.state.view.selectedSourceId, "alpha")
        XCTAssertEqual(runtime.state.view.currentRoute, .detail(sourceId: "alpha"))
    }
}

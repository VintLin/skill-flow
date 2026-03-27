import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DesktopRuntimeTests: XCTestCase {
    func testBootstrapIfNeededMarksHomeBootstrapPhaseReadyAfterLoad() async throws {
        let runtime = DesktopRuntime(
            dependencies: .testing(
                bootstrap: {
                    BridgeResponse(
                        protocolVersion: "1.0",
                        requestId: "bootstrap-request",
                        command: .bootstrap,
                        ok: true,
                        data: AnyCodable([
                            "summaries": [
                                ["sourceId": "alpha"],
                                ["sourceId": "beta"]
                            ]
                        ]),
                        warnings: [],
                        errors: []
                    )
                },
                inspect: { _ in
                    XCTFail("bootstrapIfNeeded() should not inspect")
                    return BridgeResponse(
                        protocolVersion: "1.0",
                        requestId: "inspect-request",
                        command: .inspect,
                        ok: true,
                        data: nil,
                        warnings: [],
                        errors: []
                    )
                }
            )
        )

        await runtime.bootstrapIfNeeded()

        XCTAssertEqual(runtime.state.asyncResources.homeBootstrapPhase, .ready)
        XCTAssertEqual(runtime.state.workspace.sourceIds, ["alpha", "beta"])
    }

    func testShowDetailUpdatesSelectedSourceAndRoute() async {
        let runtime = DesktopRuntime(
            dependencies: .testing(
                bootstrap: {
                    XCTFail("showDetail(sourceId:) should not bootstrap")
                    return BridgeResponse(
                        protocolVersion: "1.0",
                        requestId: "bootstrap-request",
                        command: .bootstrap,
                        ok: true,
                        data: nil,
                        warnings: [],
                        errors: []
                    )
                },
                inspect: { sourceId in
                    BridgeResponse(
                        protocolVersion: "1.0",
                        requestId: "inspect-request-\(sourceId)",
                        command: .inspect,
                        ok: true,
                        data: AnyCodable([
                            "sourceId": sourceId
                        ]),
                        warnings: [],
                        errors: []
                    )
                }
            )
        )

        await runtime.showDetail(sourceId: "alpha")

        XCTAssertEqual(runtime.state.view.selectedSourceId, "alpha")
        XCTAssertEqual(runtime.state.view.currentRoute, .detail(sourceId: "alpha"))
    }
}

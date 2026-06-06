import XCTest

@testable import SkillFlowDesktop

final class ImportToastDiagnosticsFormatterTests: XCTestCase {
    func testImportToastFormatterIncludesReasonDiagnosticSelectorTargetAndBridgeCode() {
        let message = ImportToastDiagnosticsFormatter.message(
            reasonCode: "IMPORT_SELECTOR_NOT_FOUND",
            diagnostics: [
                BridgeDiagnostic(
                    code: "IMPORT_SELECTOR_NOT_FOUND",
                    message: "Selector not found",
                    details: [
                        "kind": "repoPath",
                        "value": "skills/missing",
                        "target": "codex",
                        "bridgeCode": "BRIDGE_REQUEST_INVALID",
                    ]
                ),
            ]
        )

        XCTAssertTrue(message.contains("IMPORT_SELECTOR_NOT_FOUND"))
        XCTAssertTrue(message.contains("repoPath"))
        XCTAssertTrue(message.contains("skills/missing"))
        XCTAssertTrue(message.contains("codex"))
        XCTAssertTrue(message.contains("BRIDGE_REQUEST_INVALID"))
    }

    func testImportToastFormatterIncludesUnsupportedV2BridgeCode() {
        let message = ImportToastDiagnosticsFormatter.message(
            reasonCode: "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2",
            diagnostics: [
                BridgeDiagnostic(
                    code: "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2",
                    message: "Import draft v2 is unsupported",
                    details: ["bridgeCode": "BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2"]
                ),
            ]
        )

        XCTAssertTrue(message.contains("BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2"))
    }

    func testImportToastFormatterIncludesUnavailableTarget() {
        let message = ImportToastDiagnosticsFormatter.message(
            reasonCode: "ADD_AGENT_NOT_AVAILABLE",
            diagnostics: [
                BridgeDiagnostic(
                    code: "ADD_AGENT_NOT_AVAILABLE",
                    message: "Target unavailable",
                    details: ["target": "codex"]
                ),
            ]
        )

        XCTAssertTrue(message.contains("ADD_AGENT_NOT_AVAILABLE"))
        XCTAssertTrue(message.contains("codex"))
    }
}

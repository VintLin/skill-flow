import XCTest

@testable import SkillFlowDesktop

final class ImportToastDiagnosticsFormatterTests: XCTestCase {
    func testImportToastFormatterUsesNumericIssueCodeWithoutInternalCodes() {
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

        XCTAssertTrue(message.contains("101"))
        XCTAssertTrue(message.contains("skills/missing"))
        XCTAssertFalse(message.contains("IMPORT_SELECTOR_NOT_FOUND"))
        XCTAssertFalse(message.contains("BRIDGE_REQUEST_INVALID"))
    }

    func testImportToastFormatterUsesGenericIssueCodeForBridgeErrors() {
        let message = ImportToastDiagnosticsFormatter.message(
            reasonCode: "BRIDGE_IMPORT_DRAFT_REJECTED",
            diagnostics: [
                BridgeDiagnostic(
                    code: "BRIDGE_IMPORT_DRAFT_REJECTED",
                    message: "Import draft v2 is unsupported",
                    details: ["bridgeCode": "BRIDGE_IMPORT_DRAFT_REJECTED"]
                ),
            ]
        )

        XCTAssertTrue(message.contains("502"))
        XCTAssertFalse(message.contains("BRIDGE_IMPORT_DRAFT_REJECTED"))
    }

    func testImportToastFormatterKeepsSafeDetailWithoutInternalCode() {
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

        XCTAssertTrue(message.contains("403"))
        XCTAssertTrue(message.contains("codex"))
        XCTAssertFalse(message.contains("ADD_AGENT_NOT_AVAILABLE"))
    }
}

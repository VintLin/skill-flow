import XCTest

@testable import SkillFlowDesktop

final class DesktopIssuePresentationCatalogTests: XCTestCase {
    func testCatalogMapsKnownImportCodesToNumericIssueCodes() {
        let selectionNotFound = DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_SELECTOR_NOT_FOUND")
        XCTAssertEqual(selectionNotFound.issueCode, "101")
        XCTAssertEqual(selectionNotFound.severity, .error)
        XCTAssertEqual(selectionNotFound.toastKey, "toast.import.failed.selection_not_found")

        let selectionAmbiguous = DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_SELECTOR_AMBIGUOUS")
        XCTAssertEqual(selectionAmbiguous.issueCode, "102")
        XCTAssertEqual(selectionAmbiguous.severity, .error)
        XCTAssertEqual(selectionAmbiguous.toastKey, "toast.import.failed.selection_ambiguous")

        let selectionDrift = DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_SELECTORS_UNRESOLVED_USED_ALL")
        XCTAssertEqual(selectionDrift.issueCode, "103")
        XCTAssertEqual(selectionDrift.severity, .warning)
        XCTAssertEqual(selectionDrift.toastKey, "toast.import.warning.selection_drift")

        XCTAssertEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_PREPARE_FAILED").issueCode, "301")

        let bridgeInvalid = DesktopIssuePresentationCatalog.presentation(forInternalCode: "BRIDGE_REQUEST_INVALID")
        XCTAssertEqual(bridgeInvalid.issueCode, "502")
        XCTAssertEqual(bridgeInvalid.toastKey, "toast.issue.generic")
    }

    func testUnknownCodeMapsToFallbackIssue() {
        let presentation = DesktopIssuePresentationCatalog.presentation(forInternalCode: "SOMETHING_NEW")

        XCTAssertEqual(presentation.issueCode, "599")
        XCTAssertEqual(presentation.toastKey, "toast.issue.generic")
        XCTAssertEqual(presentation.internalCode, "SOMETHING_NEW")
    }

    func testToastTextDoesNotContainInternalCode() {
        let text = DesktopIssuePresentationCatalog
            .toastText(forInternalCode: "IMPORT_SELECTOR_NOT_FOUND", locale: Locale(identifier: "en"))
            .resolve(locale: Locale(identifier: "en"))

        XCTAssertTrue(text.contains("101"))
        XCTAssertFalse(text.contains("IMPORT_SELECTOR_NOT_FOUND"))
        XCTAssertFalse(text.contains("BRIDGE_"))
    }
}

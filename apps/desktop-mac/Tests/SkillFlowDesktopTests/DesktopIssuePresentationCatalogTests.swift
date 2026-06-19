import XCTest

@testable import SkillFlowDesktop

final class DesktopIssuePresentationCatalogTests: XCTestCase {
    func testCatalogMapsKnownImportCodesToNumericIssueCodes() {
        XCTAssertEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_SELECTOR_NOT_FOUND").issueCode, "101")
        XCTAssertEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_SELECTOR_AMBIGUOUS").issueCode, "102")
        XCTAssertEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_SELECTORS_UNRESOLVED_USED_ALL").issueCode, "103")
        XCTAssertEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: "IMPORT_PREPARE_FAILED").issueCode, "301")
        XCTAssertEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: "BRIDGE_REQUEST_INVALID").issueCode, "502")
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

import XCTest

@testable import SkillFlowDesktop

final class DesktopIssuePresentationCatalogTests: XCTestCase {
    func testKnownDesktopVisibleCodesHaveNonFallbackIssueCodes() {
        let codes = [
            "IMPORT_SELECTOR_NOT_FOUND",
            "IMPORT_SELECTOR_AMBIGUOUS",
            "IMPORT_SELECTORS_UNRESOLVED_USED_ALL",
            "ADD_SKILL_NOT_FOUND",
            "IMPORT_PREPARE_FAILED",
            "LOCAL_IMPORT_SCAN_FAILED",
            "BRIDGE_REQUEST_INVALID",
            "SOURCE_NOT_FOUND",
            "COLLECTION_NOT_FOUND",
            "STATE_MIGRATION_BLOCKED",
        ]

        for code in codes {
            XCTAssertNotEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: code).issueCode, "599", code)
        }
    }

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

        let sourceNotFound = DesktopIssuePresentationCatalog.presentation(forInternalCode: "SOURCE_NOT_FOUND")
        XCTAssertEqual(sourceNotFound.issueCode, "601")
        XCTAssertEqual(sourceNotFound.toastKey, "toast.operation.source_not_found")

        let collectionNotFound = DesktopIssuePresentationCatalog.presentation(forInternalCode: "COLLECTION_NOT_FOUND")
        XCTAssertEqual(collectionNotFound.issueCode, "602")
        XCTAssertEqual(collectionNotFound.toastKey, "toast.operation.collection_not_found")

        let uninstallIncomplete = DesktopIssuePresentationCatalog.presentation(forInternalCode: "GROUP_DELETE_INCOMPLETE")
        XCTAssertEqual(uninstallIncomplete.issueCode, "604")
        XCTAssertEqual(uninstallIncomplete.toastKey, "toast.uninstall.failed")

        let migrationBlocked = DesktopIssuePresentationCatalog.presentation(forInternalCode: "STATE_MIGRATION_BLOCKED")
        XCTAssertEqual(migrationBlocked.issueCode, "701")
        XCTAssertEqual(migrationBlocked.toastKey, "toast.state.migration_blocked")
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

    func testSuccessWarningToastTextUsesNonFailureCopy() throws {
        let warningText = DesktopIssuePresentationCatalog.successWarningToastText(
            forInternalCode: "IMPORT_SELECTOR_NOT_FOUND",
            locale: Locale(identifier: "en")
        )
        let text = try XCTUnwrap(warningText?.resolve(locale: Locale(identifier: "en")))

        XCTAssertTrue(text.contains("Imported the group"))
        XCTAssertFalse(text.contains("Import failed"))
        XCTAssertTrue(text.contains("101"))
        XCTAssertFalse(text.contains("IMPORT_SELECTOR_NOT_FOUND"))
    }

    @MainActor
    func testMainViewModelExposesPresentationReadyWarningsWithoutRawCodes() throws {
        let viewModel = MainViewModel(bridgeClient: BridgeClient())
        viewModel.latestWarnings = [
            BridgeIssue(code: "BRIDGE_REQUEST_INVALID", message: "BRIDGE_REQUEST_INVALID"),
            BridgeIssue(code: "IMPORT_SELECTOR_NOT_FOUND", message: "IMPORT_SELECTOR_NOT_FOUND"),
        ]

        let rows = viewModel.latestWarningPresentations
        XCTAssertEqual(rows.map(\.issueCode), ["502", "101"])

        let firstMessage = try XCTUnwrap(rows.first?.message.resolve(locale: Locale(identifier: "en")))
        XCTAssertFalse(firstMessage.contains("BRIDGE_REQUEST_INVALID"))

        let secondMessage = try XCTUnwrap(rows.last?.message.resolve(locale: Locale(identifier: "en")))
        XCTAssertFalse(secondMessage.contains("IMPORT_SELECTOR_NOT_FOUND"))
        XCTAssertFalse(secondMessage.contains("Import failed"))
        XCTAssertTrue(secondMessage.contains("101"))
    }
}

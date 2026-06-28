# Desktop Issue Presentation Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize desktop error and warning presentation so user-visible UI shows localized copy plus numeric issue codes, never raw `IMPORT_*` or `BRIDGE_*` internal codes.

**Architecture:** Add a desktop-side issue presentation catalog that maps internal bridge/domain codes to `DesktopIssuePresentation`. Import, bridge, and generic desktop operation flows consume the catalog instead of local string switches. Internal codes remain in `BridgeIssue` and logs; UI uses numeric issue codes and safe context.

**Tech Stack:** Swift, SwiftUI presentation models, `.strings` localization, XCTest, Swift Package Manager.

## Global Constraints

- Toast copy must not display internal enum-style codes such as `IMPORT_SELECTOR_NOT_FOUND` or `BRIDGE_REQUEST_INVALID`.
- User-facing issue codes are short numeric strings such as `101`, `301`, or `502`.
- Keep the bridge protocol unchanged.
- Keep TypeScript internal `code` / `reasonCode` values unchanged.
- Do not force-add ignored `docs/superpowers` files to Git.
- Before implementation, inspect current uncommitted desktop import/localization draft files and either continue from them intentionally or replace them cleanly.

---

## File Structure

- Create `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/DesktopIssuePresentation.swift`
  - Owns `DesktopIssuePresentationCatalog`, `DesktopIssuePresentation`, `DesktopIssueContext`, `DesktopIssueSeverity`, and issue-code mappings.
- Create `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopIssuePresentationCatalogTests.swift`
  - Verifies mappings, fallback, and internal-code hiding rules.
- Modify `apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportLogic.swift`
  - Replace local import failure and warning mapping with catalog usage.
  - Remove toast use of `ImportToastDiagnosticsFormatter`.
- Modify `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeDiagnostic.swift`
  - Replace `ImportToastDiagnosticsFormatter` with detail-oriented formatting or remove direct toast formatting.
- Modify localization files:
  - `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
  - `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
  - `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
  - Require all catalog keys across locales.
  - Reject internal codes in toast strings.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
  - Verify selector drift import succeeds and toast uses numeric issue code only.
- Modify `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportToastDiagnosticsFormatterTests.swift`
  - Replace with detail formatter tests or delete if formatter is removed.
- Modify `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
  - Route `showBridgeCommandFailure(_:)` and structured operation failures through catalog.

## Task 1: Add The Issue Presentation Catalog

**Files:**
- Create: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/DesktopIssuePresentation.swift`
- Create: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopIssuePresentationCatalogTests.swift`

**Interfaces:**
- Produces:
  - `DesktopIssuePresentationCatalog.presentation(forInternalCode:diagnostics:context:) -> DesktopIssuePresentation`
  - `DesktopIssuePresentationCatalog.toastText(forInternalCode:diagnostics:context:locale:) -> PresentationText`
  - `DesktopIssueContext.from(diagnostics:groupLocator:skillName:target:) -> DesktopIssueContext`

- [ ] **Step 1: Write failing catalog tests**

Create `DesktopIssuePresentationCatalogTests.swift`:

```swift
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopIssuePresentationCatalogTests
```

Expected: compile failure because catalog types do not exist.

- [ ] **Step 3: Implement catalog types and mappings**

Create `DesktopIssuePresentation.swift`:

```swift
import Foundation

enum DesktopIssueSeverity: String, Equatable, Sendable {
    case info
    case warning
    case error
}

enum DesktopIssueContextField: String, Equatable, Hashable, Sendable {
    case skillName
    case selectorKind
    case selectorValue
    case groupLocator
    case target
    case timeoutMilliseconds
}

struct DesktopIssueContext: Equatable, Sendable {
    static let empty = DesktopIssueContext()

    var skillName: String?
    var selectorKind: String?
    var selectorValue: String?
    var groupLocator: String?
    var target: String?
    var timeoutMilliseconds: String?

    static func from(
        diagnostics: [BridgeDiagnostic],
        groupLocator: String? = nil,
        skillName: String? = nil,
        target: String? = nil
    ) -> DesktopIssueContext {
        let diagnostic = diagnostics.first
        return DesktopIssueContext(
            skillName: skillName,
            selectorKind: diagnostic?.details["kind"],
            selectorValue: diagnostic?.details["value"],
            groupLocator: groupLocator,
            target: target ?? diagnostic?.details["target"],
            timeoutMilliseconds: nil
        )
    }
}

struct DesktopIssuePresentation: Equatable, Sendable {
    let issueCode: String
    let severity: DesktopIssueSeverity
    let toastKey: String
    let detailKey: String
    let safeContextFields: Set<DesktopIssueContextField>
    let internalCode: String?
}

enum DesktopIssuePresentationCatalog {
    static func presentation(
        forInternalCode code: String?,
        diagnostics: [BridgeDiagnostic] = [],
        context: DesktopIssueContext = .empty
    ) -> DesktopIssuePresentation {
        let normalized = code?.trimmingCharacters(in: .whitespacesAndNewlines)
        let internalCode = normalized?.isEmpty == false ? normalized : nil
        switch internalCode {
        case "IMPORT_SELECTOR_NOT_FOUND":
            return warning("101", "toast.import.warning.selection_drift", "issue.detail.import.selection_not_found", internalCode, [.skillName, .selectorKind, .selectorValue, .groupLocator])
        case "IMPORT_SELECTOR_AMBIGUOUS":
            return warning("102", "toast.import.warning.selection_drift", "issue.detail.import.selection_ambiguous", internalCode, [.skillName, .selectorKind, .selectorValue, .groupLocator])
        case "IMPORT_SELECTORS_UNRESOLVED_USED_ALL":
            return warning("103", "toast.import.warning.selection_drift", "issue.detail.import.selection_drift_used_all", internalCode, [.groupLocator])
        case "ADD_SKILL_NOT_FOUND":
            return error("104", "toast.import.failed.add_skill_not_found", "issue.detail.import.skill_not_found", internalCode, [.skillName, .groupLocator])
        case "ADD_SKILL_SELECTOR_AMBIGUOUS":
            return error("105", "toast.import.failed.selection_ambiguous", "issue.detail.import.selection_ambiguous", internalCode, [.skillName, .selectorValue])
        case "IMPORT_SELECTOR_INVALID":
            return error("106", "toast.import.failed.selection_invalid", "issue.detail.import.selection_invalid", internalCode, [.selectorKind, .selectorValue])
        case "provider_not_supported":
            return error("201", "toast.import.failed.provider_not_supported", "issue.detail.provider.not_supported", internalCode, [.groupLocator])
        case "provider_data_unavailable":
            return error("202", "toast.import.failed.provider_data_unavailable", "issue.detail.provider.data_unavailable", internalCode, [.groupLocator])
        case "provider_rate_limited":
            return error("203", "toast.import.failed.provider_rate_limited", "issue.detail.provider.rate_limited", internalCode, [.groupLocator])
        case "provider_response_invalid":
            return error("204", "toast.import.failed.provider_response_invalid", "issue.detail.provider.response_invalid", internalCode, [.groupLocator])
        case "provider_request_failed":
            return error("205", "toast.import.failed.provider_request_failed", "issue.detail.provider.request_failed", internalCode, [.groupLocator])
        case "IMPORT_PREPARE_FAILED":
            return error("301", "toast.import.failed.import_prepare_failed", "issue.detail.import.prepare_failed", internalCode, [.groupLocator])
        case "IMPORT_PREVIEW_INVALID":
            return error("302", "toast.import.failed.invalid_response", "issue.detail.import.preview_invalid", internalCode, [.groupLocator])
        case "IMPORT_APPLY_FAILED":
            return error("303", "toast.import.failed.invalid_response", "issue.detail.import.apply_failed", internalCode, [.groupLocator])
        case "IMPORT_PREPARATION_STALE", "IMPORT_PREPARATION_MISSING":
            return error("304", "toast.import.failed.preparation_stale", "issue.detail.import.preparation_stale", internalCode, [.groupLocator])
        case "NO_VALID_LEAFS":
            return error("401", "toast.import.failed.no_valid_leafs", "issue.detail.import.no_valid_leafs", internalCode, [.groupLocator])
        case "SOURCE_PATH_NOT_FOUND":
            return error("402", "toast.import.failed.source_path_not_found", "issue.detail.import.source_path_not_found", internalCode, [.groupLocator])
        case "ADD_AGENT_NOT_AVAILABLE":
            return error("403", "toast.import.failed.add_agent_not_available", "issue.detail.import.agent_unavailable", internalCode, [.target])
        case "LOCAL_IMPORT_SCAN_FAILED":
            return error("404", "toast.import.local_scan_failed", "issue.detail.import.local_scan_failed", internalCode, [.groupLocator])
        case "BRIDGE_EMPTY_REQUEST":
            return error("501", "bridge.error.invalid_response", "issue.detail.bridge.empty_request", internalCode, [])
        case "BRIDGE_REQUEST_INVALID", "BRIDGE_IMPORT_DRAFT_REJECTED":
            return error("502", "bridge.error.invalid_response", "issue.detail.bridge.invalid_response", internalCode, [])
        case "UNSUPPORTED_COMMAND":
            return error("509", "bridge.error.command_failed_default", "issue.detail.bridge.unsupported_command", internalCode, [])
        default:
            return error("599", "toast.issue.generic", "issue.detail.generic", internalCode, [])
        }
    }

    static func toastText(
        forInternalCode code: String?,
        diagnostics: [BridgeDiagnostic] = [],
        context: DesktopIssueContext = .empty,
        locale: Locale
    ) -> PresentationText {
        let presentation = presentation(forInternalCode: code, diagnostics: diagnostics, context: context)
        return PresentationText.localized(presentation.toastKey, presentation.issueCode)
    }

    private static func warning(_ issueCode: String, _ toastKey: String, _ detailKey: String, _ internalCode: String?, _ fields: Set<DesktopIssueContextField>) -> DesktopIssuePresentation {
        DesktopIssuePresentation(issueCode: issueCode, severity: .warning, toastKey: toastKey, detailKey: detailKey, safeContextFields: fields, internalCode: internalCode)
    }

    private static func error(_ issueCode: String, _ toastKey: String, _ detailKey: String, _ internalCode: String?, _ fields: Set<DesktopIssueContextField>) -> DesktopIssuePresentation {
        DesktopIssuePresentation(issueCode: issueCode, severity: .error, toastKey: toastKey, detailKey: detailKey, safeContextFields: fields, internalCode: internalCode)
    }
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopIssuePresentationCatalogTests
```

Expected: tests compile; localization-backed test can still fail until Task 2 adds keys.

- [ ] **Step 5: Commit**

Do not commit docs. Commit only source and tests:

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Models/DesktopIssuePresentation.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopIssuePresentationCatalogTests.swift
git commit -m "feat(desktop): add issue presentation catalog"
```

## Task 2: Migrate Import Toasts And Warnings

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportLogic.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeDiagnostic.swift`
- Modify: locale `.strings` files
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
- Modify/Delete: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportToastDiagnosticsFormatterTests.swift`

**Interfaces:**
- Consumes `DesktopIssuePresentationCatalog.toastText(...)`.
- Produces no raw internal code in import toast output.

- [ ] **Step 1: Add failing import no-internal-code tests**

In `ImportScreenContainerTests`, update the selector-drift warning test to assert:

```swift
XCTAssertEqual(model.toast?.style, .neutral)
let toastMessage = try XCTUnwrap(model.toast?.message)
XCTAssertTrue(toastMessage.contains("103"))
XCTAssertFalse(toastMessage.contains("IMPORT_SELECTORS_UNRESOLVED_USED_ALL"))
XCTAssertFalse(toastMessage.contains("IMPORT_SELECTOR"))
```

Add a failure-path test using `reasonCode: "IMPORT_SELECTOR_NOT_FOUND"` with diagnostics and assert:

```swift
XCTAssertTrue(toastMessage.contains("101"))
XCTAssertFalse(toastMessage.contains("IMPORT_SELECTOR_NOT_FOUND"))
XCTAssertFalse(toastMessage.contains("BRIDGE_"))
```

- [ ] **Step 2: Run focused import tests and verify failure**

Run:

```bash
swift test --package-path apps/desktop-mac --filter ImportScreenContainerTests
```

Expected: existing code still emits success toast or raw internal diagnostic details.

- [ ] **Step 3: Replace import failure mapping**

In `ImportLogic`, replace `importFailureToastText(reasonCode:)` with:

```swift
private func importFailureToastText(reasonCode: String?, diagnostics: [BridgeDiagnostic] = []) -> PresentationText {
    DesktopIssuePresentationCatalog.toastText(
        forInternalCode: reasonCode,
        diagnostics: diagnostics,
        context: DesktopIssueContext.from(diagnostics: diagnostics),
        locale: Self.presentationLocale
    )
}
```

Change diagnostic failure branch from building `"\(baseMessage) (\(diagnosticMessage))"` to:

```swift
delegate?.showToast(style: .error, text: importFailureToastText(reasonCode: reasonCode, diagnostics: diagnostics))
```

Change `importWarningToastText(warnings:)` to choose the first warning code through the catalog:

```swift
private func importWarningToastText(warnings: [BridgeIssue]) -> PresentationText? {
    guard let warning = warnings.first(where: {
        ["IMPORT_SELECTOR_NOT_FOUND", "IMPORT_SELECTOR_AMBIGUOUS", "IMPORT_SELECTORS_UNRESOLVED_USED_ALL"].contains($0.code)
    }) else {
        return nil
    }
    return DesktopIssuePresentationCatalog.toastText(forInternalCode: warning.code, locale: Self.presentationLocale)
}
```

- [ ] **Step 4: Replace or rename formatter tests**

Replace `ImportToastDiagnosticsFormatterTests` with tests for a detail formatter that never includes raw internal codes, or delete the file if detail formatting is postponed. If kept, the expected assertions are:

```swift
XCTAssertTrue(message.contains("101"))
XCTAssertTrue(message.contains("skills/missing"))
XCTAssertFalse(message.contains("IMPORT_SELECTOR_NOT_FOUND"))
XCTAssertFalse(message.contains("BRIDGE_REQUEST_INVALID"))
```

- [ ] **Step 5: Add localization keys**

Add all new keys to `en`, `zh-Hans`, and `ja`:

```text
"toast.issue.generic" = "Something went wrong. Issue code: %@.";
"toast.import.warning.selection_drift" = "Imported the group from the downloaded contents. Some selected skills changed. Issue code: %@.";
"toast.import.failed.selection_not_found" = "Import failed: a selected Skill no longer exists in this group. Issue code: %@.";
"toast.import.failed.selection_ambiguous" = "Import failed: a selected Skill matched more than one item. Issue code: %@.";
"toast.import.failed.selection_invalid" = "Import failed: a selected Skill reference is invalid. Issue code: %@.";
"toast.import.failed.preparation_stale" = "Import failed: this import is no longer current. Refresh the group and try again. Issue code: %@.";
```

Use equivalent localized text for `zh-Hans` and `ja`. Existing keys used by the catalog must accept the issue-code argument or be replaced by issue-code-specific keys.

- [ ] **Step 6: Run focused tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopIssuePresentationCatalogTests
swift test --package-path apps/desktop-mac --filter ImportScreenContainerTests
swift test --package-path apps/desktop-mac --filter DesktopLocalizationTests
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportLogic.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeDiagnostic.swift apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportToastDiagnosticsFormatterTests.swift
git commit -m "fix(desktop): map import issues to localized issue codes"
```

## Task 3: Migrate Bridge And Generic Desktop Operation Failures

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: locale `.strings` files
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelProjectScopeTests.swift` or nearest existing MainViewModel tests

- [ ] **Step 1: Add failing bridge command failure test**

Add a test that calls the bridge failure path with:

```swift
BridgeResponse(
    protocolVersion: "1.0",
    requestId: "test",
    command: .apply,
    ok: false,
    data: nil,
    warnings: [],
    errors: [BridgeIssue(code: "BRIDGE_REQUEST_INVALID", message: "BRIDGE_REQUEST_INVALID")]
)
```

Assert:

```swift
XCTAssertTrue(model.toast?.message.contains("502") == true)
XCTAssertFalse(model.toast?.message.contains("BRIDGE_REQUEST_INVALID") == true)
```

- [ ] **Step 2: Route bridge command failures through catalog**

Replace `showBridgeCommandFailure(_:)` body with:

```swift
private func showBridgeCommandFailure(_ response: BridgeResponse) {
    let first = response.errors.first
    let text = DesktopIssuePresentationCatalog.toastText(
        forInternalCode: first?.code,
        locale: Self.presentationLocale
    )
    showToast(style: .error, text: text)
}
```

- [ ] **Step 3: Add operation fallback mappings**

Extend `DesktopIssuePresentationCatalog` mappings for:

```swift
case "SOURCE_NOT_FOUND": return error("601", "toast.operation.source_not_found", "issue.detail.operation.source_not_found", internalCode, [.groupLocator])
case "COLLECTION_NOT_FOUND": return error("602", "toast.operation.collection_not_found", "issue.detail.operation.collection_not_found", internalCode, [.groupLocator])
case "GROUP_DELETE_INCOMPLETE": return error("604", "toast.uninstall.failed", "issue.detail.operation.uninstall_incomplete", internalCode, [.groupLocator])
case "STATE_MIGRATION_BLOCKED": return error("701", "toast.state.migration_blocked", "issue.detail.state.migration_blocked", internalCode, [])
```

- [ ] **Step 4: Add localization and tests**

Add locale keys:

```text
"toast.operation.source_not_found" = "The selected group no longer exists. Issue code: %@.";
"toast.operation.collection_not_found" = "The selected collection no longer exists. Issue code: %@.";
"toast.state.migration_blocked" = "State migration is blocked. Issue code: %@.";
```

Update localization tests to require the new keys and assert no localized toast value contains `BRIDGE_REQUEST_INVALID`.

- [ ] **Step 5: Run tests**

Run:

```bash
swift test --package-path apps/desktop-mac --filter DesktopIssuePresentationCatalogTests
swift test --package-path apps/desktop-mac --filter DesktopLocalizationTests
swift test --package-path apps/desktop-mac --filter MainViewModel
```

Expected: all focused desktop tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Models/DesktopIssuePresentation.swift apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelProjectScopeTests.swift
git commit -m "fix(desktop): map bridge failures to issue codes"
```

## Task 4: Add Warning Detail Coverage And Full Regression Guard

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/AppStateManager.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopIssuePresentationCatalogTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`

- [ ] **Step 1: Add a catalog completeness test**

In `DesktopIssuePresentationCatalogTests`, add:

```swift
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
        "STATE_MIGRATION_BLOCKED"
    ]

    for code in codes {
        XCTAssertNotEqual(DesktopIssuePresentationCatalog.presentation(forInternalCode: code).issueCode, "599", code)
    }
}
```

- [ ] **Step 2: Add a no-raw-code localization test**

In `DesktopLocalizationTests`, collect all `toast.*`, `bridge.error.*`, and `issue.detail.*` values and assert:

```swift
XCTAssertFalse(value.contains("IMPORT_"), key)
XCTAssertFalse(value.contains("BRIDGE_"), key)
XCTAssertFalse(value.contains("STATE_MIGRATION_"), key)
```

- [ ] **Step 3: Add presentation-ready warning rows**

If warnings are displayed beyond the health icon, add:

```swift
struct DesktopWarningPresentation: Identifiable, Equatable, Sendable {
    let id: String
    let issueCode: String
    let message: PresentationText
}
```

Store or derive this from `latestWarnings` through `DesktopIssuePresentationCatalog`, without replacing raw `latestWarnings`.

- [ ] **Step 4: Run full desktop Swift tests**

Run:

```bash
swift test --package-path apps/desktop-mac
```

Expected: all desktop tests pass.

- [ ] **Step 5: Run repo verification**

Run:

```bash
npm test
npm run build
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Sources/DesktopApp/ViewModels/AppStateManager.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopIssuePresentationCatalogTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift
git commit -m "test(desktop): guard issue presentation copy"
```

## Execution Notes

- Current working tree has uncommitted draft import/localization edits. Before executing Task 1, inspect them with `git diff` and keep only changes that match this plan.
- Do not revert user edits blindly.
- Do not use raw internal code strings in UI assertions except to assert absence.
- Do not add compatibility aliases for old toast behavior.
- If a localized string currently takes no `%@` issue-code argument, either add the argument in all locales or use a new issue-specific key.

## Self-Review

- Spec coverage: catalog, import, bridge, warnings, localization, and regression tests are covered by Tasks 1-4.
- Placeholder scan: no task uses TBD/TODO/fill-in-later language.
- Type consistency: all planned catalog APIs use `DesktopIssuePresentationCatalog`, `DesktopIssuePresentation`, and `DesktopIssueContext` consistently.
- Risk: exact MainViewModel test file may need the nearest existing fixture if direct access to `showBridgeCommandFailure(_:)` is private. Keep the behavior test at the public action boundary if private access is not possible.

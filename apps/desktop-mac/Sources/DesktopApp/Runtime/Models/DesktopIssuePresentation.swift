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
        _ = diagnostics
        _ = context

        switch internalCode {
        case "IMPORT_SELECTOR_NOT_FOUND":
            return error("101", "toast.import.failed.selection_not_found", "issue.detail.import.selection_not_found", internalCode, [.skillName, .selectorKind, .selectorValue, .groupLocator])
        case "IMPORT_SELECTOR_AMBIGUOUS":
            return error("102", "toast.import.failed.selection_ambiguous", "issue.detail.import.selection_ambiguous", internalCode, [.skillName, .selectorKind, .selectorValue, .groupLocator])
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
            return error("501", "toast.issue.generic", "issue.detail.bridge.empty_request", internalCode, [])
        case "BRIDGE_REQUEST_INVALID", "BRIDGE_IMPORT_DRAFT_REJECTED":
            return error("502", "toast.issue.generic", "issue.detail.bridge.invalid_response", internalCode, [])
        case "UNSUPPORTED_COMMAND":
            return error("509", "toast.issue.generic", "issue.detail.bridge.unsupported_command", internalCode, [])
        case "SOURCE_NOT_FOUND":
            return error("601", "toast.operation.source_not_found", "issue.detail.operation.source_not_found", internalCode, [.groupLocator])
        case "COLLECTION_NOT_FOUND":
            return error("602", "toast.operation.collection_not_found", "issue.detail.operation.collection_not_found", internalCode, [.groupLocator])
        case "GROUP_DELETE_INCOMPLETE":
            return error("604", "toast.operation.uninstall_incomplete", "issue.detail.operation.uninstall_incomplete", internalCode, [.groupLocator])
        case "STATE_MIGRATION_BLOCKED":
            return error("701", "toast.state.migration_blocked", "issue.detail.state.migration_blocked", internalCode, [])
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
        _ = locale
        return PresentationText.localized(presentation.toastKey, [presentation.issueCode])
    }

    static func successWarningToastText(
        forInternalCode code: String?,
        locale: Locale
    ) -> PresentationText? {
        guard let toastKey = successWarningToastKey(forInternalCode: code) else {
            return nil
        }
        let presentation = presentation(forInternalCode: code)
        _ = locale
        return PresentationText.localized(toastKey, [presentation.issueCode])
    }

    private static func successWarningToastKey(forInternalCode code: String?) -> String? {
        let normalized = code?.trimmingCharacters(in: .whitespacesAndNewlines)
        switch normalized?.isEmpty == false ? normalized : nil {
        case "IMPORT_SELECTOR_NOT_FOUND":
            return "toast.import.warning.selection_not_found"
        case "IMPORT_SELECTOR_AMBIGUOUS":
            return "toast.import.warning.selection_ambiguous"
        case "IMPORT_SELECTORS_UNRESOLVED_USED_ALL":
            return "toast.import.warning.selection_drift"
        default:
            return nil
        }
    }

    private static func warning(
        _ issueCode: String,
        _ toastKey: String,
        _ detailKey: String,
        _ internalCode: String?,
        _ fields: Set<DesktopIssueContextField>
    ) -> DesktopIssuePresentation {
        DesktopIssuePresentation(
            issueCode: issueCode,
            severity: .warning,
            toastKey: toastKey,
            detailKey: detailKey,
            safeContextFields: fields,
            internalCode: internalCode
        )
    }

    private static func error(
        _ issueCode: String,
        _ toastKey: String,
        _ detailKey: String,
        _ internalCode: String?,
        _ fields: Set<DesktopIssueContextField>
    ) -> DesktopIssuePresentation {
        DesktopIssuePresentation(
            issueCode: issueCode,
            severity: .error,
            toastKey: toastKey,
            detailKey: detailKey,
            safeContextFields: fields,
            internalCode: internalCode
        )
    }
}

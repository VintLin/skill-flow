import Foundation

private func nonEmptyDiagnosticValue(_ value: String?) -> String? {
    guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
          !normalized.isEmpty else {
        return nil
    }
    return normalized
}

struct BridgeDiagnostic: Equatable, Sendable {
    let code: String
    let message: String
    let details: [String: String]

    init(code: String, message: String, details: [String: String] = [:]) {
        self.code = code
        self.message = message
        self.details = details
    }

    init?(payload: [String: Any]) {
        guard let code = nonEmptyDiagnosticValue(payload["code"] as? String) else {
            return nil
        }
        self.code = code
        self.message = (payload["message"] as? String) ?? ""
        self.details = Self.parseDetails(payload["details"] as? [String: Any])
    }

    private static func parseDetails(_ details: [String: Any]?) -> [String: String] {
        guard let details else {
            return [:]
        }

        return details.reduce(into: [String: String]()) { result, entry in
            switch entry.value {
            case let value as String:
                result[entry.key] = value
            case let value as CustomStringConvertible:
                result[entry.key] = value.description
            default:
                break
            }
        }
    }
}

enum ImportToastDiagnosticsFormatter {
    static func message(reasonCode: String?, diagnostics: [BridgeDiagnostic]) -> String {
        let presentation = DesktopIssuePresentationCatalog.presentation(
            forInternalCode: reasonCode,
            diagnostics: diagnostics,
            context: DesktopIssueContext.from(diagnostics: diagnostics)
        )
        let context = DesktopIssueContext.from(diagnostics: diagnostics)
        var parts: [String] = [presentation.issueCode]

        appendIfSafe(context.skillName, field: .skillName, presentation: presentation, to: &parts)
        appendIfSafe(context.selectorKind, field: .selectorKind, presentation: presentation, to: &parts)
        appendIfSafe(context.selectorValue, field: .selectorValue, presentation: presentation, to: &parts)
        appendIfSafe(context.groupLocator, field: .groupLocator, presentation: presentation, to: &parts)
        appendIfSafe(context.target, field: .target, presentation: presentation, to: &parts)
        appendIfSafe(context.timeoutMilliseconds, field: .timeoutMilliseconds, presentation: presentation, to: &parts)
        return parts.joined(separator: " · ")
    }

    private static func appendIfSafe(
        _ value: String?,
        field: DesktopIssueContextField,
        presentation: DesktopIssuePresentation,
        to parts: inout [String]
    ) {
        guard presentation.safeContextFields.contains(field) else {
            return
        }
        appendUnique(value, to: &parts)
    }

    private static func appendUnique(_ value: String?, to parts: inout [String]) {
        guard let value = nonEmptyDiagnosticValue(value),
              !parts.contains(value) else {
            return
        }
        parts.append(value)
    }
}

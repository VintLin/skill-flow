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
        var parts: [String] = []
        if let reasonCode = nonEmptyDiagnosticValue(reasonCode) {
            parts.append(reasonCode)
        }

        if let diagnostic = diagnostics.first {
            appendUnique(diagnostic.code, to: &parts)
            appendUnique(diagnostic.details["kind"], to: &parts)
            appendUnique(diagnostic.details["value"], to: &parts)
            appendUnique(diagnostic.details["target"], to: &parts)
            appendUnique(diagnostic.details["bridgeCode"], to: &parts)
        }

        return parts.joined(separator: " · ")
    }

    private static func appendUnique(_ value: String?, to parts: inout [String]) {
        guard let value = nonEmptyDiagnosticValue(value),
              !parts.contains(value) else {
            return
        }
        parts.append(value)
    }
}

import Foundation

enum ImportLocatorParser {
    static func isSupported(_ value: String) -> Bool {
        let candidate = normalize(value)
        guard !candidate.isEmpty else { return false }
        let lowercasedCandidate = candidate.lowercased()
        if lowercasedCandidate.hasPrefix("file://"), candidate.count > "file://".count { return true }
        if lowercasedCandidate.hasPrefix("clawhub:"), candidate.count > "clawhub:".count { return true }
        if candidate.hasPrefix("/") || candidate.hasPrefix("~/") { return true }
        if isSupportedGitHTTPSLocator(candidate) { return true }
        if matches(candidate, pattern: #"^git@(github|gitlab)\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$"#) { return true }
        if matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$"#) { return true }
        return matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?@[A-Za-z0-9_.-]+$"#) ||
            matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?(?:/[A-Za-z0-9_.-]+)+$"#)
    }

    static func normalize(_ value: String) -> String {
        var candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard candidate.count >= 2 else { return candidate }
        let first = candidate.first
        let last = candidate.last
        if (first == "\"" && last == "\"") || (first == "'" && last == "'") {
            candidate.removeFirst()
            candidate.removeLast()
            candidate = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return candidate
    }

    private static func isSupportedGitHTTPSLocator(_ candidate: String) -> Bool {
        guard candidate.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else { return false }
        guard let components = URLComponents(string: candidate),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(),
              host == "github.com" || host == "gitlab.com" else {
            return false
        }
        let pathSegments = components.path.split(separator: "/").filter { !$0.isEmpty }.map(String.init)
        guard pathSegments.count >= 2 else { return false }
        switch host {
        case "github.com":
            return pathSegments.count == 2 || (pathSegments.count >= 4 && pathSegments[2].lowercased() == "tree")
        case "gitlab.com":
            let treeMarkerIndex = pathSegments.indices.first { index in
                pathSegments[index] == "-"
                    && pathSegments.indices.contains(index + 1)
                    && pathSegments[index + 1] == "tree"
            }
            if let treeMarkerIndex {
                return treeMarkerIndex >= 2 && pathSegments.count >= treeMarkerIndex + 3
            }
            let hasUnsupportedPagePath = pathSegments.contains("-")
                || pathSegments.contains { ["tree", "blob", "issues", "merge_requests"].contains($0) }
            return pathSegments.count >= 2 && !hasUnsupportedPagePath
        default:
            return false
        }
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }
}

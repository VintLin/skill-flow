import Foundation

enum ImportRepositoryIdentity {
    static func normalizedGitHubRepo(_ value: String?) -> String? {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let lowered = trimmed.lowercased()

        if let components = URLComponents(string: lowered),
           components.scheme == "https",
           components.host == "github.com",
           components.query == nil,
           components.fragment == nil {
            let pathParts = components.path.split(separator: "/").map(String.init)
            if pathParts.count == 2,
               let urlRepo = normalizedRepo(owner: pathParts[0], repo: pathParts[1], rejectsReservedOwner: false) {
                return urlRepo
            }
        }

        if let sshRepo = normalizedRegexGitHubRepo(
            lowered,
            pattern: #"^git@github\.com:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/([a-z0-9._-]+)/?$"#,
            rejectsReservedOwner: false
        ) {
            return sshRepo
        }

        if let shorthandRepo = normalizedRegexGitHubRepo(
            lowered,
            pattern: #"^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/([a-z0-9._-]+)/?$"#,
            rejectsReservedOwner: true
        ) {
            return shorthandRepo
        }

        return nil
    }

    static func importRecommendationAlias(_ repo: String) -> String {
        switch repo {
        case "anthropic/skills":
            return "anthropics/skills"
        default:
            return repo
        }
    }

    private static func normalizedRegexGitHubRepo(
        _ lowered: String,
        pattern: String,
        rejectsReservedOwner: Bool
    ) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return nil
        }

        let range = NSRange(lowered.startIndex..<lowered.endIndex, in: lowered)
        guard let match = regex.firstMatch(in: lowered, options: [], range: range),
              let ownerRange = Range(match.range(at: 1), in: lowered),
              let repoRange = Range(match.range(at: 2), in: lowered) else {
            return nil
        }

        return normalizedRepo(
            owner: String(lowered[ownerRange]),
            repo: String(lowered[repoRange]),
            rejectsReservedOwner: rejectsReservedOwner
        )
    }

    private static func normalizedRepo(owner: String, repo rawRepo: String, rejectsReservedOwner: Bool) -> String? {
        let repo = rawRepo.hasSuffix(".git") ? String(rawRepo.dropLast(4)) : rawRepo
        let reservedOwners = Set([".", "..", "app", "apps", "build", "dist", "doc", "docs", "package", "packages", "script", "scripts", "source", "sources", "src", "test", "tests"])
        guard !owner.isEmpty,
              owner.count <= 39,
              owner.range(of: #"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"#, options: .regularExpression) != nil,
              (!rejectsReservedOwner || !reservedOwners.contains(owner)),
              !repo.isEmpty,
              repo != ".",
              repo != "..",
              repo.range(of: #"^[a-z0-9][a-z0-9._-]*$"#, options: .regularExpression) != nil else {
            return nil
        }

        return importRecommendationAlias("\(owner)/\(repo)")
    }
}

import Foundation

struct DesktopReleaseInfo: Equatable {
    let version: String
    let releaseURL: URL
}

protocol DesktopUpdateChecking: Sendable {
    func fetchLatestRelease() async throws -> DesktopReleaseInfo
}

struct DesktopGitHubUpdateChecker: DesktopUpdateChecking {
    private let latestReleaseURL = URL(string: "https://api.github.com/repos/VintLin/skill-flow/releases/latest")!
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchLatestRelease() async throws -> DesktopReleaseInfo {
        let (data, response) = try await session.data(from: latestReleaseURL)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw DesktopUpdateCheckError.invalidResponse
        }

        let payload = try JSONDecoder().decode(GitHubLatestReleasePayload.self, from: data)
        guard let releaseURL = URL(string: payload.htmlURL) else {
            throw DesktopUpdateCheckError.invalidReleaseURL
        }

        return DesktopReleaseInfo(
            version: Self.normalizedVersion(payload.tagName),
            releaseURL: releaseURL
        )
    }

    static func normalizedVersion(_ rawValue: String) -> String {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("v") || trimmed.hasPrefix("V") {
            return String(trimmed.dropFirst())
        }
        return trimmed
    }
}

enum DesktopUpdateCheckError: LocalizedError {
    case invalidResponse
    case invalidReleaseURL

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid latest release response."
        case .invalidReleaseURL:
            return "Latest release URL is invalid."
        }
    }
}

private struct GitHubLatestReleasePayload: Decodable {
    let tagName: String
    let htmlURL: String

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case htmlURL = "html_url"
    }
}

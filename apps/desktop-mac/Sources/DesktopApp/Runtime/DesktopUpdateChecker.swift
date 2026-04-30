import Foundation

struct DesktopReleaseInfo: Equatable {
    let version: String
    let releaseURL: URL
}

protocol DesktopUpdateChecking: Sendable {
    func fetchLatestRelease() async throws -> DesktopReleaseInfo
}

struct DesktopGitHubUpdateChecker: DesktopUpdateChecking {
    private let latestReleaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/latest")!
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchLatestRelease() async throws -> DesktopReleaseInfo {
        var request = URLRequest(url: latestReleaseURL)
        request.httpMethod = "HEAD"
        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw DesktopUpdateCheckError.invalidResponse
        }

        guard let releaseURL = httpResponse.url else {
            throw DesktopUpdateCheckError.invalidReleaseURL
        }

        let pathComponents = releaseURL.pathComponents
        guard pathComponents.count >= 4,
              pathComponents.suffix(2).first == "tag",
              let tagName = pathComponents.last else {
            throw DesktopUpdateCheckError.invalidReleaseURL
        }

        return DesktopReleaseInfo(
            version: Self.normalizedVersion(tagName),
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

enum DesktopUpdateCheckError: LocalizedError, Equatable {
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

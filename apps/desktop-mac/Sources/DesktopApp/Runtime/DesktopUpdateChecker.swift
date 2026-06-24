import Foundation

struct DesktopReleaseInfo: Equatable {
    let version: String
    let releaseURL: URL
    let installerURL: URL?

    init(version: String, releaseURL: URL, installerURL: URL? = nil) {
        self.version = version
        self.releaseURL = releaseURL
        self.installerURL = installerURL
    }
}

protocol DesktopUpdateChecking: Sendable {
    func fetchLatestRelease() async throws -> DesktopReleaseInfo
}

struct DesktopGitHubUpdateChecker: DesktopUpdateChecking {
    private let latestReleaseAPIURL = URL(string: "https://api.github.com/repos/VintLin/skill-flow/releases/latest")!
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchLatestRelease() async throws -> DesktopReleaseInfo {
        var request = URLRequest(url: latestReleaseAPIURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw DesktopUpdateCheckError.invalidResponse
        }

        let payload = try JSONDecoder().decode(GitHubReleasePayload.self, from: data)
        guard let releaseURL = URL(string: payload.htmlURL),
              ["http", "https"].contains(releaseURL.scheme?.lowercased()),
              releaseURL.host != nil else {
            throw DesktopUpdateCheckError.invalidReleaseURL
        }

        return DesktopReleaseInfo(
            version: Self.normalizedVersion(payload.tagName),
            releaseURL: releaseURL,
            installerURL: Self.preferredInstallerURL(from: payload.assets)
        )
    }

    static func normalizedVersion(_ rawValue: String) -> String {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("v") || trimmed.hasPrefix("V") {
            return String(trimmed.dropFirst())
        }
        return trimmed
    }

    static func preferredInstallerURL(from assets: [GitHubReleaseAsset]) -> URL? {
        let dmgAssets = assets.filter { $0.name.lowercased().hasSuffix(".dmg") }
        let preferredArch = currentArchitectureAssetToken()
        let preferredAsset = dmgAssets.first { $0.name.localizedCaseInsensitiveContains(preferredArch) }
            ?? dmgAssets.first { $0.name.localizedCaseInsensitiveContains("universal") }
            ?? dmgAssets.first
        guard let installerURL = preferredAsset.flatMap({ URL(string: $0.browserDownloadURL) }),
              ["http", "https"].contains(installerURL.scheme?.lowercased()),
              installerURL.host != nil else {
            return nil
        }
        return installerURL
    }

    private static func currentArchitectureAssetToken() -> String {
        #if arch(arm64)
        return "arm64"
        #elseif arch(x86_64)
        return "x86_64"
        #else
        return "universal"
        #endif
    }
}

struct GitHubReleasePayload: Decodable {
    let tagName: String
    let htmlURL: String
    let assets: [GitHubReleaseAsset]

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case htmlURL = "html_url"
        case assets
    }
}

struct GitHubReleaseAsset: Decodable, Equatable {
    let name: String
    let browserDownloadURL: String

    enum CodingKeys: String, CodingKey {
        case name
        case browserDownloadURL = "browser_download_url"
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

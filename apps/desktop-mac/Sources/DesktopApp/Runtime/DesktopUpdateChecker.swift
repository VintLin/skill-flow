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
    private let gitHubCLIReleaseFetcher: (@Sendable () async throws -> Data)?

    init(
        session: URLSession = .shared,
        gitHubCLIReleaseFetcher: (@Sendable () async throws -> Data)? = Self.fetchLatestReleaseWithGitHubCLI
    ) {
        self.session = session
        self.gitHubCLIReleaseFetcher = gitHubCLIReleaseFetcher
    }

    func fetchLatestRelease() async throws -> DesktopReleaseInfo {
        if let gitHubCLIReleaseFetcher,
           let data = try? await gitHubCLIReleaseFetcher(),
           let release = try? Self.releaseInfo(from: data) {
            return release
        }

        var request = URLRequest(url: latestReleaseAPIURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw DesktopUpdateCheckError.invalidResponse
        }

        return try Self.releaseInfo(from: data)
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
        guard let preferredAsset,
              let installerURL = URL(string: preferredAsset.browserDownloadURL),
              Self.isAllowedInstallerURL(installerURL, assetName: preferredAsset.name) else {
            return nil
        }
        return installerURL
    }

    private static func releaseInfo(from data: Data) throws -> DesktopReleaseInfo {
        let payload = try JSONDecoder().decode(GitHubReleasePayload.self, from: data)
        guard let releaseURL = URL(string: payload.htmlURL),
              Self.isAllowedReleaseURL(releaseURL) else {
            throw DesktopUpdateCheckError.invalidReleaseURL
        }

        return DesktopReleaseInfo(
            version: Self.normalizedVersion(payload.tagName),
            releaseURL: releaseURL,
            installerURL: Self.preferredInstallerURL(from: payload.assets)
        )
    }

    private static func fetchLatestReleaseWithGitHubCLI() async throws -> Data {
        guard let executable = resolveGitHubCLIExecutable() else {
            throw DesktopUpdateCheckError.invalidResponse
        }
        return try await Task.detached(priority: .utility) {
            let process = Process()
            let outputPipe = Pipe()
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = ["api", "repos/VintLin/skill-flow/releases/latest"]
            process.standardOutput = outputPipe
            process.standardError = Pipe()

            try process.run()
            process.waitUntilExit()

            let data = outputPipe.fileHandleForReading.readDataToEndOfFile()
            guard process.terminationStatus == 0, !data.isEmpty else {
                throw DesktopUpdateCheckError.invalidResponse
            }
            return data
        }.value
    }

    private static func resolveGitHubCLIExecutable(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        isExecutable: (String) -> Bool = FileManager.default.isExecutableFile(atPath:)
    ) -> String? {
        var candidates = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"]
        if let path = environment["PATH"] {
            candidates.append(contentsOf: path.split(separator: ":").map { "\($0)/gh" })
        }
        return candidates.first { isExecutable($0) }
    }

    private static func isAllowedReleaseURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.host?.lowercased() == "github.com" else {
            return false
        }
        return url.path.hasPrefix("/VintLin/skill-flow/releases")
    }

    private static func isAllowedInstallerURL(_ url: URL, assetName: String) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.host?.lowercased() == "github.com",
              url.path.hasPrefix("/VintLin/skill-flow/releases/download/"),
              assetName.lowercased().hasSuffix(".dmg"),
              url.lastPathComponent.lowercased().hasSuffix(".dmg") else {
            return false
        }
        return true
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

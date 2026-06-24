import AppKit
import Foundation

struct DesktopUpdateInstaller {
    static func install(
        from installerURL: URL,
        session: URLSession = .shared,
        downloadsDirectory: URL? = nil,
        opener: @escaping @MainActor (URL) -> Bool = { NSWorkspace.shared.open($0) }
    ) async throws {
        let (temporaryURL, response) = try await session.download(from: installerURL)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw DesktopUpdateInstallError.invalidResponse
        }

        let downloadsDirectory = downloadsDirectory
            ?? FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        let filename = installerURL.lastPathComponent.isEmpty ? "Skill-Flow.dmg" : installerURL.lastPathComponent
        let destinationURL = downloadsDirectory.appendingPathComponent(filename)

        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.moveItem(at: temporaryURL, to: destinationURL)

        let opened = await MainActor.run {
            opener(destinationURL)
        }
        guard opened else {
            throw DesktopUpdateInstallError.openFailed
        }
    }
}

enum DesktopUpdateInstallError: LocalizedError, Equatable {
    case invalidResponse
    case openFailed

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Update installer download failed."
        case .openFailed:
            return "Unable to open the downloaded update installer."
        }
    }
}

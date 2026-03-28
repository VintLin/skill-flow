import Foundation

enum DesktopResourceLocator {
    static func resourceDirectories(
        subdirectory: String? = nil,
        bundle: Bundle,
        sourceRoot: URL?
    ) -> [URL] {
        var directories: [URL] = []

        if let bundled = bundle.resourceURL {
            let candidate = subdirectory.map { bundled.appendingPathComponent($0) } ?? bundled
            if FileManager.default.fileExists(atPath: candidate.path) {
                directories.append(candidate)
            }
        }

        if let sourceRoot {
            let candidate = subdirectory.map { sourceRoot.appendingPathComponent($0) } ?? sourceRoot
            if FileManager.default.fileExists(atPath: candidate.path) {
                directories.append(candidate)
            }
        }

        return directories
    }
}

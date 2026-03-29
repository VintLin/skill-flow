import Foundation

enum DesktopResourceLocator {
    private static let swiftPMResourceBundleName = "SkillFlowDesktop_SkillFlowDesktop.bundle"

    private final class BundleMarker {}

    static func resourceDirectories(
        subdirectory: String? = nil,
        bundle: Bundle? = nil,
        sourceRoot: URL?
    ) -> [URL] {
        var directories: [URL] = []
        var seenPaths = Set<String>()

        let bundleCandidates = [
            Bundle.main,
            bundle,
            runtimeResourceBundle(),
        ].compactMap { $0 }

        for candidateBundle in bundleCandidates {
            guard let bundled = candidateBundle.resourceURL else {
                continue
            }
            let candidate = subdirectory.map { bundled.appendingPathComponent($0) } ?? bundled
            if FileManager.default.fileExists(atPath: candidate.path), seenPaths.insert(candidate.path).inserted {
                directories.append(candidate)
            }
        }

        if let sourceRoot {
            let candidate = subdirectory.map { sourceRoot.appendingPathComponent($0) } ?? sourceRoot
            if FileManager.default.fileExists(atPath: candidate.path), seenPaths.insert(candidate.path).inserted {
                directories.append(candidate)
            }
        }

        return directories
    }

    static func runtimeResourceBundle() -> Bundle? {
        let fileManager = FileManager.default
        let markerBundle = Bundle(for: BundleMarker.self)
        let candidates = [
            Bundle.main.resourceURL?.appendingPathComponent(swiftPMResourceBundleName),
            Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/\(swiftPMResourceBundleName)"),
            markerBundle.resourceURL?.appendingPathComponent(swiftPMResourceBundleName),
            markerBundle.bundleURL.deletingLastPathComponent().appendingPathComponent(swiftPMResourceBundleName),
            markerBundle.bundleURL
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Resources/\(swiftPMResourceBundleName)"),
        ]

        for candidate in candidates.compactMap({ $0 }) {
            guard fileManager.fileExists(atPath: candidate.path),
                  let bundle = Bundle(url: candidate) else {
                continue
            }
            return bundle
        }

        return nil
    }
}

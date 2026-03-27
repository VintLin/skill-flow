import AppKit
import Foundation

@MainActor
enum AppIconLibrary {
    private static let fileName = "AppIcon.icns"

    static func image() -> NSImage? {
        for directory in resourceDirectories() {
            let url = directory.appendingPathComponent(fileName)
            if let image = NSImage(contentsOf: url) {
                return image
            }
        }

        return nil
    }

    private static func resourceDirectories() -> [URL] {
        var directories: [URL] = []

        if let bundled = Bundle.main.resourceURL,
           FileManager.default.fileExists(atPath: bundled.path) {
            directories.append(bundled)
        }

        let sourceRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources")
        if FileManager.default.fileExists(atPath: sourceRoot.path) {
            directories.append(sourceRoot)
        }

        return directories
    }
}

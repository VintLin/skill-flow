import AppKit
import Foundation

enum DetailInfoIconLibrary {
    enum Icon: String {
        case version = "detail-info-version.svg"
        case wordCount = "detail-info-word-count.svg"
    }

    static func image(for icon: Icon) -> NSImage? {
        let fileName = icon.rawValue
        for directory in resourceDirectories() {
            let url = directory.appendingPathComponent(fileName)
            if let image = NSImage(contentsOf: url) {
                return image
            }
        }

        return nil
    }

    private static func resourceDirectories() -> [URL] {
        let sourceDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources/DetailIcons")
        var directories: [URL] = []

        if let bundled = Bundle.module.resourceURL {
            directories.append(bundled)
            let grouped = bundled.appendingPathComponent("DetailIcons")
            if FileManager.default.fileExists(atPath: grouped.path) {
                directories.append(grouped)
            }
        }

        if FileManager.default.fileExists(atPath: sourceDirectory.path) {
            directories.append(sourceDirectory)
        }

        return directories
    }
}

import AppKit
import Foundation

enum GroupMetadataIconLibrary {
    enum Icon: String {
        case skills = "group-metadata-skills.svg"
        case download = "group-metadata-download.svg"
        case star = "group-metadata-star.svg"
        case github = "group-metadata-github.svg"
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
            .appendingPathComponent("Resources/GroupCardIcons")
        var directories: [URL] = []

        if let bundled = Bundle.module.resourceURL {
            directories.append(bundled)
            let grouped = bundled.appendingPathComponent("GroupCardIcons")
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

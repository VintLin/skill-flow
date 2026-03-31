import AppKit
import Foundation

enum GroupMetadataIconLibrary {
    enum Icon: String {
        case skills = "group-metadata-skills.svg"
        case download = "group-metadata-download.svg"
        case star = "group-metadata-star.svg"
        case github = "group-metadata-github.svg"
        case localFile = "group-metadata-local-file.svg"
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
            .appendingPathComponent("Resources")
        return DesktopResourceLocator.resourceDirectories(
            subdirectory: "GroupCardIcons",
            bundle: DesktopResourceLocator.runtimeResourceBundle(),
            sourceRoot: sourceDirectory
        )
    }
}

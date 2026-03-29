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
            .appendingPathComponent("Resources")
        return DesktopResourceLocator.resourceDirectories(
            subdirectory: "DetailIcons",
            bundle: DesktopResourceLocator.runtimeResourceBundle(),
            sourceRoot: sourceDirectory
        )
    }
}

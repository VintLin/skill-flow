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
        let sourceRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources")
        return DesktopResourceLocator.resourceDirectories(
            bundle: .module,
            sourceRoot: sourceRoot
        )
    }
}

import AppKit
import Foundation

@MainActor
enum MenuBarIcon {
    private static let fileName = "menu_icon.svg"

    static func image() -> NSImage? {
        for directory in resourceDirectories() {
            let url = directory.appendingPathComponent(fileName)
            if let image = NSImage(contentsOf: url) {
                image.isTemplate = true
                image.size = NSSize(width: 18, height: 18)
                return image
            }
        }

        return nil
    }

    private static func resourceDirectories() -> [URL] {
        let sourceRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources/MenuBar")
        return DesktopResourceLocator.resourceDirectories(
            subdirectory: "MenuBar",
            bundle: .module,
            sourceRoot: sourceRoot
        )
    }
}

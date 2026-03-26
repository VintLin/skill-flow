import AppKit
import Foundation

@MainActor
enum ActionIcon: String {
    case back
    case close
    case delete
    case `import`
    case more
    case pin
    case search
    case settings
    case update

    func image(size: CGFloat? = nil, isTemplate: Bool = true) -> NSImage? {
        for directory in Self.resourceDirectories() {
            let url = directory.appendingPathComponent("\(rawValue).svg")
            if let image = NSImage(contentsOf: url) {
                image.isTemplate = isTemplate
                if let size {
                    image.size = NSSize(width: size, height: size)
                }
                return image
            }
        }

        return nil
    }

    private static func resourceDirectories() -> [URL] {
        var directories: [URL] = []

        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("ActionIcons"),
           FileManager.default.fileExists(atPath: bundled.path) {
            directories.append(bundled)
        }

        let sourceRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources/ActionIcons")
        if FileManager.default.fileExists(atPath: sourceRoot.path) {
            directories.append(sourceRoot)
        }

        return directories
    }
}

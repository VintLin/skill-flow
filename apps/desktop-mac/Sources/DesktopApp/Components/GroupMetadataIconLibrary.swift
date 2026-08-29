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

    nonisolated(unsafe) private static let cache = NSCache<NSString, NSImage>()
    private static let directories = makeResourceDirectories()

    static func image(for icon: Icon) -> NSImage? {
        let fileName = icon.rawValue
        let cacheKey = fileName as NSString
        if let cached = cache.object(forKey: cacheKey) {
            return cached
        }
        for directory in directories {
            let url = directory.appendingPathComponent(fileName)
            if let image = NSImage(contentsOf: url) {
                cache.setObject(image, forKey: cacheKey)
                return image
            }
        }

        return nil
    }

    private static func makeResourceDirectories() -> [URL] {
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

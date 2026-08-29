import AppKit
import Foundation

@MainActor
enum ActionIcon: String {
    private static let imageVariantCache = NSCache<NSString, NSImage>()
    private static let symbolCache = NSCache<NSString, NSImage>()
    private static let cachedResourceDirectories = resourceDirectories()

    case back
    case close
    case delete
    case dragHandle = "drag-handle"
    case externalLink
    case groupEditor = "skill-group-editor"
    case `import`
    case importLocal = "import-local"
    case importLocalScan = "import-local-scan"
    case importRecommended = "import-recommended"
    case more
    case pin
    case plus
    case project
    case projectWarning = "project-warning"
    case rename
    case search
    case searchSubmitEnter = "search-submit-enter"
    case settings
    case star
    case tagAdd = "tag-add"
    case tagDelete = "tag-delete"
    case update
    case usage

    func image(size: CGFloat? = nil, isTemplate: Bool = true) -> NSImage? {
        let cacheKey = imageVariantCacheKey(size: size, isTemplate: isTemplate)
        if let cached = Self.imageVariantCache.object(forKey: cacheKey as NSString) {
            return cached
        }

        let resolvedImage: NSImage?
        if self == .searchSubmitEnter,
           let fallback = Self.systemSymbolImage("arrow.turn.down.left", size: size, isTemplate: isTemplate) {
            resolvedImage = fallback
        } else if self == .rename,
           let fallback = Self.systemSymbolImage("pencil", size: size, isTemplate: isTemplate) {
            resolvedImage = fallback
        } else {
            resolvedImage = Self.cachedResourceDirectories.lazy.compactMap { directory in
                NSImage(contentsOf: directory.appendingPathComponent("\(rawValue).svg"))
            }.first
        }

        guard let resolvedImage else {
            return nil
        }
        resolvedImage.isTemplate = isTemplate
        if let size {
            resolvedImage.size = NSSize(width: size, height: size)
        }
        Self.imageVariantCache.setObject(resolvedImage, forKey: cacheKey as NSString)
        return resolvedImage
    }

    func symbolImage(size: CGFloat? = nil, foreground: NSColor) -> NSImage? {
        let foreground = foreground.usingColorSpace(.deviceRGB) ?? foreground
        let sizeKey = size.map { String(format: "%.4f", Double($0)) } ?? "intrinsic"
        let cacheKey = "\(rawValue)#\(Self.colorKey(foreground))#\(sizeKey)"
        if let cached = Self.symbolCache.object(forKey: cacheKey as NSString) {
            return cached
        }

        guard let baseImage = image(size: nil, isTemplate: false),
              let cgImage = baseImage.cgImage(forProposedRect: nil, context: nil, hints: nil),
              let context = Self.bitmapContext(width: cgImage.width, height: cgImage.height)
        else {
            return nil
        }

        let rect = CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height)
        context.draw(cgImage, in: rect)

        guard let data = context.data else {
            return nil
        }

        let bytes = data.bindMemory(to: UInt8.self, capacity: cgImage.width * cgImage.height * 4)
        let red = UInt8(clamping: Int(round(foreground.redComponent * 255)))
        let green = UInt8(clamping: Int(round(foreground.greenComponent * 255)))
        let blue = UInt8(clamping: Int(round(foreground.blueComponent * 255)))

        for index in stride(from: 0, to: cgImage.width * cgImage.height * 4, by: 4) {
            let alpha = bytes[index + 3]
            if alpha == 0 {
                continue
            }
            bytes[index] = red
            bytes[index + 1] = green
            bytes[index + 2] = blue
        }

        guard let outputCGImage = context.makeImage() else {
            return nil
        }

        let resolvedSize = size.map { NSSize(width: $0, height: $0) }
            ?? NSSize(width: outputCGImage.width, height: outputCGImage.height)
        let image = NSImage(cgImage: outputCGImage, size: resolvedSize)
        image.isTemplate = false
        Self.symbolCache.setObject(image, forKey: cacheKey as NSString)
        return image
    }

    private func imageVariantCacheKey(size: CGFloat?, isTemplate: Bool) -> String {
        let sizeKey = size.map { String(format: "%.4f", Double($0)) } ?? "intrinsic"
        return "\(rawValue)#\(sizeKey)#\(isTemplate ? "template" : "original")"
    }

    private static func bitmapContext(width: Int, height: Int) -> CGContext? {
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
            return nil
        }

        return CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
    }

    private static func colorKey(_ color: NSColor) -> String {
        let color = color.usingColorSpace(.deviceRGB) ?? color
        return [
            color.redComponent,
            color.greenComponent,
            color.blueComponent,
            color.alphaComponent,
        ]
        .map { String(format: "%.4f", $0) }
        .joined(separator: ",")
    }

    private static func resourceDirectories() -> [URL] {
        let sourceRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources")
        return DesktopResourceLocator.resourceDirectories(
            subdirectory: "ActionIcons",
            bundle: DesktopResourceLocator.runtimeResourceBundle(),
            sourceRoot: sourceRoot
        )
    }

    private static func systemSymbolImage(_ symbolName: String, size: CGFloat?, isTemplate: Bool) -> NSImage? {
        let configuration = NSImage.SymbolConfiguration(
            pointSize: size ?? 14,
            weight: .regular
        )
        guard let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)?
            .withSymbolConfiguration(configuration) else {
            return nil
        }
        image.isTemplate = isTemplate
        if let size {
            image.size = NSSize(width: size, height: size)
        }
        return image
    }
}

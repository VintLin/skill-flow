import AppKit
import Foundation

@MainActor
enum ActionIcon: String {
    private static let symbolCache = NSCache<NSString, NSImage>()

    case back
    case close
    case delete
    case dragHandle = "drag-handle"
    case externalLink
    case `import`
    case more
    case pin
    case plus
    case search
    case searchSubmitEnter = "search-submit-enter"
    case settings
    case star
    case tagAdd = "tag-add"
    case tagDelete = "tag-delete"
    case update

    func image(size: CGFloat? = nil, isTemplate: Bool = true) -> NSImage? {
        if self == .searchSubmitEnter,
           let fallback = Self.searchSubmitFallbackImage(size: size, isTemplate: isTemplate) {
            return fallback
        }

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

    func symbolImage(size: CGFloat? = nil, foreground: NSColor) -> NSImage? {
        guard let baseImage = image(size: nil, isTemplate: false),
              let cgImage = baseImage.cgImage(forProposedRect: nil, context: nil, hints: nil),
              let context = Self.bitmapContext(width: cgImage.width, height: cgImage.height)
        else {
            return nil
        }

        let foreground = foreground.usingColorSpace(.deviceRGB) ?? foreground
        let cacheKey = "\(rawValue)#\(Self.colorKey(foreground))#\(Int((size ?? CGFloat(cgImage.width)).rounded()))"
        if let cached = Self.symbolCache.object(forKey: cacheKey as NSString) {
            return cached
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

    private static func searchSubmitFallbackImage(size: CGFloat?, isTemplate: Bool) -> NSImage? {
        let symbolName = "arrow.turn.down.left"
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

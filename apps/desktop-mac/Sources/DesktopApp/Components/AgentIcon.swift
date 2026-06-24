import AppKit
import Foundation

@MainActor
enum AgentIconLibrary {
    private enum SymbolAlphaMode: String {
        case brightForeground
        case darkForeground
    }

    private static let iconFileNames: [String: String] = [
        "claude-code": "claude-code.svg",
        "codex": "codex.svg",
        "cursor": "cursor.svg",
        "github-copilot": "copilot.svg",
        "gemini-cli": "gemini.svg",
        "opencode": "opencode.svg",
        "openclaw": "clawdbot.svg",
        "hermes-agent": "hermesagent.svg",
        "minimax-code": "minimax.svg",
        "kimi-code": "kimi.svg",
        "workbuddy": "codebuddy.svg",
        "codebuddy": "codebuddy.svg",
        "windsurf": "windsurf.svg",
        "trae": "trae.svg",
        "trae-cn": "trae.svg",
        "roo-code": "roo.svg",
        "cline": "cline.svg",
        "amp": "amp.svg",
        "kiro": "kiro-cli.svg",
        "zcode": "zcode.svg",
    ]

    private static let cache = NSCache<NSString, NSImage>()
    private static let symbolCache = NSCache<NSString, NSImage>()

    static func fileName(for targetId: String) -> String? {
        iconFileNames[targetId]
    }

    static func image(for targetId: String) -> NSImage? {
        guard let fileName = fileName(for: targetId) else {
            return nil
        }
        if let cached = cache.object(forKey: fileName as NSString) {
            return cached
        }

        for directory in resourceDirectories() {
            let url = directory.appendingPathComponent(fileName)
            if let image = loadImage(from: url, targetId: targetId) {
                cache.setObject(image, forKey: fileName as NSString)
                return image
            }
        }

        return nil
    }

    static func symbolImage(
        for targetId: String,
        foreground: NSColor,
        cropToVisibleBounds: Bool = false
    ) -> NSImage? {
        guard let baseImage = image(for: targetId), let fileName = fileName(for: targetId) else {
            return nil
        }

        let foreground = foreground.usingColorSpace(.deviceRGB) ?? foreground
        let alphaMode = symbolAlphaMode(for: targetId)
        let cacheKey = "\(fileName)#\(alphaMode.rawValue)#\(colorKey(foreground))#crop:\(cropToVisibleBounds)"
        if let cached = symbolCache.object(forKey: cacheKey as NSString) {
            return cached
        }

        guard
            let cgImage = baseImage.cgImage(forProposedRect: nil, context: nil, hints: nil),
            let context = bitmapContext(width: cgImage.width, height: cgImage.height)
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
            let sourceRed = CGFloat(bytes[index]) / 255.0
            let sourceGreen = CGFloat(bytes[index + 1]) / 255.0
            let sourceBlue = CGFloat(bytes[index + 2]) / 255.0
            let sourceAlpha = CGFloat(bytes[index + 3]) / 255.0

            let luminance = (0.2126 * sourceRed) + (0.7152 * sourceGreen) + (0.0722 * sourceBlue)
            let symbolAlpha = alpha(for: luminance, sourceAlpha: sourceAlpha, mode: alphaMode)

            bytes[index] = red
            bytes[index + 1] = green
            bytes[index + 2] = blue
            bytes[index + 3] = UInt8(clamping: Int(round(symbolAlpha * 255)))
        }

        guard let outputCGImage = context.makeImage() else {
            return nil
        }

        let finalImage = cropToVisibleBounds
            ? (croppedToVisibleBounds(outputCGImage) ?? outputCGImage)
            : outputCGImage
        let image = NSImage(
            cgImage: finalImage,
            size: NSSize(width: finalImage.width, height: finalImage.height)
        )
        symbolCache.setObject(image, forKey: cacheKey as NSString)
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

    private static func loadImage(from url: URL, targetId: String) -> NSImage? {
        if url.pathExtension.lowercased() == "svg",
           let image = loadCurrentColorSVG(from: url) {
            return image
        }

        return NSImage(contentsOf: url)
    }

    private static func loadCurrentColorSVG(from url: URL) -> NSImage? {
        guard
            let data = try? Data(contentsOf: url),
            let svg = String(data: data, encoding: .utf8)
        else {
            return nil
        }

        guard svg.contains("currentColor") else {
            return nil
        }

        let normalized = svg
            .replacingOccurrences(of: "fill=\"currentColor\"", with: "fill=\"#000\"")
            .replacingOccurrences(of: "width=\"1em\"", with: "width=\"100\"")
            .replacingOccurrences(of: "height=\"1em\"", with: "height=\"100\"")

        guard let normalizedData = normalized.data(using: .utf8) else {
            return nil
        }

        return NSImage(data: normalizedData)
    }

    private static func croppedToVisibleBounds(_ image: CGImage) -> CGImage? {
        guard let context = bitmapContext(width: image.width, height: image.height) else {
            return nil
        }

        let rect = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        context.draw(image, in: rect)

        guard let data = context.data else {
            return nil
        }

        let bytes = data.bindMemory(to: UInt8.self, capacity: image.width * image.height * 4)
        var minX = image.width
        var minY = image.height
        var maxX = -1
        var maxY = -1

        for y in 0..<image.height {
            for x in 0..<image.width {
                let index = ((y * image.width) + x) * 4
                let alpha = bytes[index + 3]
                if alpha > 12 {
                    minX = min(minX, x)
                    minY = min(minY, y)
                    maxX = max(maxX, x)
                    maxY = max(maxY, y)
                }
            }
        }

        guard maxX >= minX, maxY >= minY else {
            return nil
        }

        let cropRect = CGRect(
            x: minX,
            y: minY,
            width: (maxX - minX) + 1,
            height: (maxY - minY) + 1
        )

        return image.cropping(to: cropRect)
    }

    private static func symbolAlphaMode(for targetId: String) -> SymbolAlphaMode {
        switch targetId {
        case "hermes-agent", "minimax-code", "workbuddy", "codebuddy":
            return .darkForeground
        default:
            return .brightForeground
        }
    }

    private static func alpha(
        for luminance: CGFloat,
        sourceAlpha: CGFloat,
        mode: SymbolAlphaMode
    ) -> CGFloat {
        let normalized: CGFloat
        switch mode {
        case .brightForeground:
            normalized = (luminance - 0.35) / 0.65
        case .darkForeground:
            normalized = (0.65 - luminance) / 0.65
        }

        return max(0, min(1, normalized * sourceAlpha))
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
            subdirectory: "AgentIcons",
            bundle: DesktopResourceLocator.runtimeResourceBundle(),
            sourceRoot: sourceRoot
        )
    }
}

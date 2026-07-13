import XCTest
import SwiftUI

@testable import SkillFlowDesktop

@MainActor
final class AgentIconTests: XCTestCase {
    func testAccentPaletteExcludesGray() {
        XCTAssertEqual(
            DesktopAccentColor.allCases.map(\.rawValue),
            ["blue", "green", "yellow", "pink", "orange", "purple"]
        )
    }

    func testDarkModeAccentPaletteUsesBrighterBrandValues() {
        XCTAssertNotEqual(
            AppTheme.brand(for: .blue, in: .light).description,
            AppTheme.brand(for: .blue, in: .dark).description
        )
        XCTAssertNotEqual(
            AppTheme.brand(for: .orange, in: .light).description,
            AppTheme.brand(for: .orange, in: .dark).description
        )
    }

    func testStatusColorsReuseThemeYellowAndGreenTokens() {
        XCTAssertEqual(
            AppTheme.statusSuccess(for: .light).description,
            AppTheme.brand(for: .green, in: .light).description
        )
        XCTAssertEqual(
            AppTheme.statusSuccess(for: .dark).description,
            AppTheme.brand(for: .green, in: .dark).description
        )
        XCTAssertEqual(
            AppTheme.statusWarning(for: .light).description,
            AppTheme.brand(for: .yellow, in: .light).description
        )
        XCTAssertEqual(
            AppTheme.statusWarning(for: .dark).description,
            AppTheme.brand(for: .yellow, in: .dark).description
        )
    }

    func testIconFileNameMappingMatchesBundledAssets() {
        XCTAssertEqual(AgentIconLibrary.fileName(for: "claude-code"), "claude-code.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "github-copilot"), "copilot.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "roo-code"), "roo.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "hermes-agent"), "hermesagent.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "minimax-code"), "minimax.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "kimi-code"), "kimi.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "workbuddy"), "codebuddy.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "codebuddy"), "codebuddy.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "kiro"), "kiro-cli.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "trae"), "trae.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "grok-build"), "grok-build.svg")
        XCTAssertNil(AgentIconLibrary.fileName(for: "pi"))
    }

    func testIconLoaderFindsSourceControlledSvgAssets() {
        XCTAssertNotNil(AgentIconLibrary.image(for: "codex"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "claude-code"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "github-copilot"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "hermes-agent"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "minimax-code"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "kimi-code"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "workbuddy"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "codebuddy"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "trae"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "grok-build"))
    }

    func testCurrentColorAgentIconsLoadAtUsableResolution() {
        for targetId in ["kimi-code", "workbuddy", "codebuddy", "grok-build"] {
            guard
                let image = AgentIconLibrary.image(for: targetId),
                let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
            else {
                return XCTFail("Expected \(targetId) icon image to load")
            }

            XCTAssertGreaterThanOrEqual(cgImage.width, 24)
            XCTAssertGreaterThanOrEqual(cgImage.height, 24)
            XCTAssertTrue(hasVisiblePixels(cgImage), "\(targetId) icon should not be blank")
        }
    }

    func testSymbolIconLoaderCanRecolorBundledSvgAssets() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        XCTAssertNotNil(AgentIconLibrary.symbolImage(for: "codex", foreground: foreground))
        XCTAssertNotNil(AgentIconLibrary.symbolImage(for: "cursor", foreground: foreground))
    }

    func testHermesSymbolIconRetainsVisiblePixelsAfterRecoloring() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        guard
            let image = AgentIconLibrary.symbolImage(for: "hermes-agent", foreground: foreground),
            let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else {
            return XCTFail("Expected Hermes Agent symbol image to load")
        }

        XCTAssertTrue(hasVisiblePixels(cgImage), "Hermes Agent symbol image should not be fully transparent after recoloring")
    }

    func testMiniMaxSymbolIconRetainsVisiblePixelsAfterRecoloring() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        guard
            let image = AgentIconLibrary.symbolImage(for: "minimax-code", foreground: foreground),
            let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else {
            return XCTFail("Expected MiniMax Code symbol image to load")
        }

        XCTAssertTrue(hasVisiblePixels(cgImage), "MiniMax Code symbol image should not be fully transparent after recoloring")
    }

    func testKimiSymbolIconRetainsVisiblePixelsAfterRecoloring() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        guard
            let image = AgentIconLibrary.symbolImage(for: "kimi-code", foreground: foreground),
            let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else {
            return XCTFail("Expected Kimi Code symbol image to load")
        }

        XCTAssertTrue(hasVisiblePixels(cgImage), "Kimi Code symbol image should not be fully transparent after recoloring")
    }

    func testCodeBuddySharedSymbolIconRetainsVisiblePixelsAfterRecoloring() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        for targetId in ["workbuddy", "codebuddy"] {
            guard
                let image = AgentIconLibrary.symbolImage(for: targetId, foreground: foreground),
                let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
            else {
                return XCTFail("Expected \(targetId) symbol image to load")
            }

            XCTAssertTrue(hasVisiblePixels(cgImage), "\(targetId) symbol image should not be fully transparent after recoloring")
        }
    }

    func testGrokBuildSymbolIconRetainsVisiblePixelsAfterRecoloring() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        guard
            let image = AgentIconLibrary.symbolImage(for: "grok-build", foreground: foreground),
            let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else {
            return XCTFail("Expected Grok Build symbol image to load")
        }

        XCTAssertTrue(hasVisiblePixels(cgImage), "Grok Build symbol image should not be fully transparent after recoloring")
    }

    func testGroupMetadataIconLoaderFindsBundledSvgAssets() {
        XCTAssertNotNil(GroupMetadataIconLibrary.image(for: .skills))
        XCTAssertNotNil(GroupMetadataIconLibrary.image(for: .download))
        XCTAssertNotNil(GroupMetadataIconLibrary.image(for: .star))
        XCTAssertNotNil(GroupMetadataIconLibrary.image(for: .github))
    }

    func testDetailInfoIconLoaderFindsBundledSvgAssets() {
        XCTAssertNotNil(DetailInfoIconLibrary.image(for: .version))
        XCTAssertNotNil(DetailInfoIconLibrary.image(for: .wordCount))
    }

    private func hasVisiblePixels(_ image: CGImage) -> Bool {
        guard
            let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
            let context = CGContext(
                data: nil,
                width: image.width,
                height: image.height,
                bitsPerComponent: 8,
                bytesPerRow: image.width * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        else {
            return false
        }

        let rect = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        context.draw(image, in: rect)

        guard let data = context.data else {
            return false
        }

        let bytes = data.bindMemory(to: UInt8.self, capacity: image.width * image.height * 4)
        for index in stride(from: 0, to: image.width * image.height * 4, by: 4) {
            if bytes[index + 3] > 12 {
                return true
            }
        }

        return false
    }
}

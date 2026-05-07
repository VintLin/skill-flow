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
        XCTAssertEqual(AgentIconLibrary.fileName(for: "kiro"), "kiro-cli.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "trae"), "trae.svg")
        XCTAssertNil(AgentIconLibrary.fileName(for: "pi"))
    }

    func testIconLoaderFindsSourceControlledSvgAssets() {
        XCTAssertNotNil(AgentIconLibrary.image(for: "codex"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "claude-code"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "github-copilot"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "hermes-agent"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "trae"))
    }

    func testSymbolIconLoaderCanRecolorBundledSvgAssets() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        XCTAssertNotNil(AgentIconLibrary.symbolImage(for: "codex", foreground: foreground))
        XCTAssertNotNil(AgentIconLibrary.symbolImage(for: "cursor", foreground: foreground))
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
}

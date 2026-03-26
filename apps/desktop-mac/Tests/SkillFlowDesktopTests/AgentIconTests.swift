import XCTest

@testable import SkillFlowDesktop

@MainActor
final class AgentIconTests: XCTestCase {
    func testAccentPaletteExcludesGray() {
        XCTAssertEqual(
            DesktopAccentColor.allCases.map(\.rawValue),
            ["blue", "green", "yellow", "pink", "orange", "purple"]
        )
    }

    func testIconFileNameMappingMatchesBundledAssets() {
        XCTAssertEqual(AgentIconLibrary.fileName(for: "claude-code"), "claude-code.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "github-copilot"), "copilot.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "roo-code"), "roo.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "kiro"), "kiro-cli.svg")
        XCTAssertNil(AgentIconLibrary.fileName(for: "pi"))
    }

    func testIconLoaderFindsSourceControlledSvgAssets() {
        XCTAssertNotNil(AgentIconLibrary.image(for: "codex"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "claude-code"))
        XCTAssertNotNil(AgentIconLibrary.image(for: "github-copilot"))
    }

    func testSymbolIconLoaderCanRecolorBundledSvgAssets() {
        let foreground = NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)

        XCTAssertNotNil(AgentIconLibrary.symbolImage(for: "codex", foreground: foreground))
        XCTAssertNotNil(AgentIconLibrary.symbolImage(for: "cursor", foreground: foreground))
    }
}

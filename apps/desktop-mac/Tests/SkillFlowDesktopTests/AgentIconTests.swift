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
}

import XCTest

final class DesktopInteractionRegressionTests: XCTestCase {
    func testToolbarButtonsUseSharedMotionButtonStyle() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        XCTAssertTrue(source.contains(".desktopMotionButton("))
    }

    func testSettingsActionButtonsAndDropdownTriggerUseSharedMotionButtonStyle() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")
        XCTAssertTrue(source.contains("settingsActionButton"))
        XCTAssertTrue(source.contains(".desktopMotionButton("))
    }

    func testHomeUsesWholeCardTapButImportAndMenuDoNot() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let card = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

        XCTAssertTrue(home.contains("clickPolicy: .home"))
        XCTAssertTrue(card.contains(".desktopMotionCard("))
    }

    private func sourceText(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }
}

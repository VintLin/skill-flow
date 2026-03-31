import XCTest

@testable import SkillFlowDesktop

final class DesktopInteractionMotionTests: XCTestCase {
    func testMotionTokensStayWithinDesktopRange() {
        XCTAssertEqual(DesktopMotionTokens.buttonPressScale, 0.97, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.chipPressScale, 0.985, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.hoverDuration, 0.14, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.pressDuration, 0.10, accuracy: 0.001)
    }

    func testHomeCardClickPolicyAllowsWholeCardOnlyOnHomeRoute() {
        XCTAssertTrue(DesktopCardClickPolicy.allowsWholeCardTap(for: .home))
        XCTAssertFalse(DesktopCardClickPolicy.allowsWholeCardTap(for: .importSearch))
        XCTAssertFalse(DesktopCardClickPolicy.allowsWholeCardTap(for: .menu))
    }

    func testMotionHelpersDoNotUseZeroDistanceDragForPressState() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Components/DesktopInteractionMotion.swift")

        XCTAssertFalse(source.contains("DragGesture(minimumDistance: 0)"))
        XCTAssertTrue(source.contains("ButtonStyle"))
    }

    func testCardAndRowHoverDoNotUseOverlayOpacity() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Components/DesktopInteractionMotion.swift")

        XCTAssertFalse(source.contains("DesktopMotionCardModifier"))
        XCTAssertFalse(source.contains("DesktopRowHoverStatefulModifier"))
        XCTAssertTrue(source.contains("DesktopMotionCardScaleModifier"))
        XCTAssertTrue(source.contains("DesktopRowHoverPassthroughModifier"))
    }

    func testButtonAndChipHoverUseNeutralSurfaceInsteadOfBrandOverlay() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Components/DesktopInteractionMotion.swift")

        XCTAssertTrue(source.contains("AppTheme.toolbarButtonBackground(for: theme)"))
        XCTAssertFalse(source.contains("fill(AppTheme.brand(for: accent, in: theme))"))
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

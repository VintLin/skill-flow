import XCTest

@testable import SkillFlowDesktop

final class DesktopInteractionMotionTests: XCTestCase {
    func testMotionTokensStayWithinDesktopRange() {
        XCTAssertEqual(DesktopMotionTokens.buttonPressScale, 0.97, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.chipPressScale, 0.985, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.hoverDuration, 0.14, accuracy: 0.001)
        XCTAssertEqual(DesktopMotionTokens.pressDuration, 0.10, accuracy: 0.001)
    }

    func testCardClickPolicyNeverAllowsWholeCardTap() {
        // Detail open is header-scoped (title/byline/stats); whole-card tap caused mis-taps.
        XCTAssertFalse(DesktopCardClickPolicy.allowsWholeCardTap(for: .home))
        XCTAssertFalse(DesktopCardClickPolicy.allowsWholeCardTap(for: .importSearch))
        XCTAssertFalse(DesktopCardClickPolicy.allowsWholeCardTap(for: .menu))
    }

}

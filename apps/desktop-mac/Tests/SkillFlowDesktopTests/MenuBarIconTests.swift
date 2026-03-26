import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MenuBarIconTests: XCTestCase {
    func testGroupCardTitleSizeDoesNotShrinkInMenuScale() {
        XCTAssertEqual(GroupCardScale.home.titleSize, 17)
        XCTAssertEqual(GroupCardScale.menu.titleSize, 17)
    }

    func testGroupCardTextSizesDoNotShrinkInMenuScale() {
        XCTAssertEqual(GroupCardScale.home.metaSize, 11)
        XCTAssertEqual(GroupCardScale.menu.metaSize, 11)
        XCTAssertEqual(GroupCardScale.home.sectionLabelSize, 12)
        XCTAssertEqual(GroupCardScale.menu.sectionLabelSize, 12)
        XCTAssertEqual(GroupCardScale.home.chipFontSize, 11)
        XCTAssertEqual(GroupCardScale.menu.chipFontSize, 11)
        XCTAssertEqual(GroupCardScale.home.targetFontSize, 11)
        XCTAssertEqual(GroupCardScale.menu.targetFontSize, 11)
        XCTAssertEqual(GroupCardScale.home.triStateFontSize, 10)
        XCTAssertEqual(GroupCardScale.menu.triStateFontSize, 10)
    }

    func testMenuBarIconLoadsTemplateSvg() {
        let image = MenuBarIcon.image()

        XCTAssertNotNil(image)
        XCTAssertEqual(image?.isTemplate, true)
    }
}

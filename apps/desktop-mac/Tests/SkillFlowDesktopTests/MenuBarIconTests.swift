import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MenuBarIconTests: XCTestCase {
    func testGroupCardDisplayModeCompactMenuHidesSecondaryChrome() {
        XCTAssertTrue(GroupCardDisplayMode.compactMenu.showsSubtitle)
        XCTAssertFalse(GroupCardDisplayMode.compactMenu.showsMetaLine)
        XCTAssertFalse(GroupCardDisplayMode.compactMenu.showsSectionTitles)
        XCTAssertTrue(GroupCardDisplayMode.compactMenu.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.compactMenu.scale, .menu)
    }

    func testGroupCardDisplayModeStandardKeepsFullLayout() {
        XCTAssertTrue(GroupCardDisplayMode.standard.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.standard.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.standard.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.standard.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.standard.scale, .home)
    }

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

    func testGroupCardShadowStaysCenteredAndSoft() {
        XCTAssertEqual(GroupCardScale.home.shadowYOffset, 0)
        XCTAssertEqual(GroupCardScale.menu.shadowYOffset, 0)
        XCTAssertEqual(GroupCardScale.home.shadowRadius, 16)
        XCTAssertEqual(GroupCardScale.menu.shadowRadius, 12.8, accuracy: 0.001)
    }

    func testMenuBarIconLoadsTemplateSvg() {
        let image = MenuBarIcon.image()

        XCTAssertNotNil(image)
        XCTAssertEqual(image?.isTemplate, true)
    }
}

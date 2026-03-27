import AppKit
import SwiftUI
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MenuBarIconTests: XCTestCase {
    func testGroupCardDisplayModeMenuHidesSecondaryChrome() {
        XCTAssertTrue(GroupCardDisplayMode.menu.showsSubtitle)
        XCTAssertFalse(GroupCardDisplayMode.menu.showsMetaLine)
        XCTAssertFalse(GroupCardDisplayMode.menu.showsSectionTitles)
        XCTAssertTrue(GroupCardDisplayMode.menu.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.menu.scale, .menu)
    }

    func testGroupCardDisplayModeHomeKeepsFullLayout() {
        XCTAssertTrue(GroupCardDisplayMode.home.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.home.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.home.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.home.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.home.scale, .home)
    }

    func testGroupCardDisplayModeImportUsesDedicatedChrome() {
        XCTAssertTrue(GroupCardDisplayMode.importPage.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.importPage.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.importPage.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.importPage.supportsCollapsedSkills)
        XCTAssertTrue(GroupCardDisplayMode.importPage.usesPlainPrimaryActionIcon)
        XCTAssertTrue(GroupCardDisplayMode.importPage.showsSourceFacts)
        XCTAssertEqual(GroupCardDisplayMode.importPage.scale, .home)
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

    func testSurfaceLayerColorsFollowNeutralCardScale() {
        assertColor(AppTheme.pageBackground(for: .light), equalsGrayscale: 249)
        assertColor(AppTheme.surface(for: .light), equalsGrayscale: 253)
        assertColor(AppTheme.groupCardFill(for: .light), equalsGrayscale: 253)
        assertColor(AppTheme.documentBlock(for: .light), equalsGrayscale: 242)

        assertColor(AppTheme.pageBackground(for: .dark), equalsGrayscale: 21)
        assertColor(AppTheme.surface(for: .dark), equalsGrayscale: 14)
        assertColor(AppTheme.groupCardFill(for: .dark), equalsGrayscale: 14)
        assertColor(AppTheme.documentBlock(for: .dark), equalsGrayscale: 34)
    }

    private func assertColor(_ color: Color, equalsGrayscale expected: CGFloat, file: StaticString = #filePath, line: UInt = #line) {
        let resolved = NSColor(color).usingColorSpace(.deviceRGB)
        XCTAssertNotNil(resolved, file: file, line: line)
        XCTAssertEqual(resolved?.redComponent ?? -1, expected / 255.0, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(resolved?.greenComponent ?? -1, expected / 255.0, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(resolved?.blueComponent ?? -1, expected / 255.0, accuracy: 0.001, file: file, line: line)
    }
}

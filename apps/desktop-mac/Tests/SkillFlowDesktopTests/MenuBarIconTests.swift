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
        XCTAssertTrue(GroupCardDisplayMode.importSearch.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.importSearch.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.importSearch.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.importSearch.supportsCollapsedSkills)
        XCTAssertTrue(GroupCardDisplayMode.importSearch.usesPlainPrimaryActionIcon)
        XCTAssertFalse(GroupCardDisplayMode.importSearch.showsSourceFacts)
        XCTAssertEqual(GroupCardDisplayMode.importSearch.scale, .home)

        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.importRecommendation.supportsCollapsedSkills)
        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.usesPlainPrimaryActionIcon)
        XCTAssertFalse(GroupCardDisplayMode.importRecommendation.showsSourceFacts)
        XCTAssertEqual(GroupCardDisplayMode.importRecommendation.scale, .home)
    }

    func testCardDensityProjectsToExpectedGroupCardDisplayMode() {
        XCTAssertEqual(MainView.groupCardDisplayMode(for: .comfortable), .home)
        XCTAssertEqual(MainView.groupCardDisplayMode(for: .compact), .menu)
    }

    func testImportPrimaryActionIconUsesAccentColor() {
        let foreground = SharedGroupCard.primaryActionIconForeground(
            displayMode: .importSearch,
            theme: .light,
            accent: .green,
            isEnabled: true
        )

        assertColorsEqual(foreground, AppTheme.brand(for: .green, in: .light))
    }

    func testDisabledImportPrimaryActionUsesMutedForegroundAndNeutralBackground() {
        let foreground = SharedGroupCard.primaryActionIconForeground(
            displayMode: .importRecommendation,
            theme: .light,
            accent: .green,
            isEnabled: false
        )
        let background = SharedGroupCard.primaryActionIconBackground(
            displayMode: .importRecommendation,
            theme: .light,
            accent: .green,
            isEnabled: false
        )

        assertColorsEqual(foreground, AppTheme.textMuted(for: .light))
        assertColorsEqual(background, AppTheme.documentBlock(for: .light))
    }

    func testRecommendationBadgeAccentUsesStablePerTagPalette() {
        XCTAssertEqual(SharedGroupCard.recommendationBadgeAccent(tagId: "general"), .blue)
        XCTAssertEqual(SharedGroupCard.recommendationBadgeAccent(tagId: "development"), .green)
        XCTAssertEqual(SharedGroupCard.recommendationBadgeAccent(tagId: "design"), .pink)
        XCTAssertEqual(SharedGroupCard.recommendationBadgeAccent(tagId: "research"), .yellow)
        XCTAssertEqual(SharedGroupCard.recommendationBadgeAccent(tagId: "automation"), .orange)
        XCTAssertEqual(SharedGroupCard.recommendationBadgeAccent(tagId: "unknown"), .blue)
    }

    func testBusyOverlayScrimUsesStrongContrastInBothThemes() {
        assertColorsEqual(
            SharedGroupCard.busyOverlayScrimColor(for: .light),
            Color.white.opacity(0.64)
        )
        assertColorsEqual(
            SharedGroupCard.busyOverlayScrimColor(for: .dark),
            Color.black.opacity(0.24)
        )
    }

    func testBusyOverlayBadgeUsesOpaqueSurfaceBackground() {
        assertColorsEqual(
            SharedGroupCard.busyOverlayBadgeBackground(for: .light),
            AppTheme.documentBlock(for: .light)
        )
        assertColorsEqual(
            SharedGroupCard.busyOverlayBadgeBackground(for: .dark),
            AppTheme.documentBlock(for: .dark)
        )
    }

    func testImportSearchPromptTextUsesTranslucentBrandColor() {
        let lightPromptColor = AppTheme.importSearchPromptText(for: .green, in: .light)
        let darkPromptColor = AppTheme.importSearchPromptText(for: .green, in: .dark)
        let lightFixedColor = AppTheme.importSearchPromptFixedText(for: .light)
        let darkFixedColor = AppTheme.importSearchPromptFixedText(for: .dark)

        XCTAssertEqual(nsColor(lightPromptColor)?.alphaComponent ?? -1, nsColor(lightFixedColor)?.alphaComponent ?? -2, accuracy: 0.001)
        XCTAssertEqual(nsColor(darkPromptColor)?.alphaComponent ?? -1, nsColor(darkFixedColor)?.alphaComponent ?? -2, accuracy: 0.001)
    }

    func testImportSearchPromptFixedTextUsesMutedGrayWithExtraTransparency() {
        let lightPromptColor = AppTheme.importSearchPromptFixedText(for: .light)
        let darkPromptColor = AppTheme.importSearchPromptFixedText(for: .dark)

        assertColorsEqual(
            lightPromptColor,
            AppTheme.textMuted(for: .light).opacity(0.78)
        )
        assertColorsEqual(
            darkPromptColor,
            AppTheme.textMuted(for: .dark).opacity(0.82)
        )
    }

    func testActionIconSearchSubmitEnterResolvesToVisibleImage() {
        let image = ActionIcon.searchSubmitEnter.image(size: 14, isTemplate: true)

        XCTAssertNotNil(image)
        XCTAssertEqual(image?.isTemplate, true)
    }

    func testImportCardsReserveMetadataRowAndDividerWhileLoading() {
        let loadingCard = MainViewModel.GroupCardModel(
            id: "import-loading",
            title: "Loading",
            subtitle: "by @owner",
            metaLine: "",
            byline: "by @owner",
            isPinned: false,
            health: "DISCOVER",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: true,
            targetsLoading: false,
            sourceFacts: [],
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: loadingCard, displayMode: .importSearch))
        XCTAssertTrue(SharedGroupCard.showsHeaderDivider(card: loadingCard, displayMode: .importSearch))
    }

    func testHomeCardsReserveMetadataRowAndDividerEvenWhenStatsAreMissing() {
        let localCard = MainViewModel.GroupCardModel(
            id: "local",
            title: "Local Group",
            subtitle: "by @owner",
            metaLine: "",
            byline: "by @owner",
            isPinned: false,
            health: "LOCAL",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            sourceFacts: [],
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: localCard, displayMode: .home))
        XCTAssertTrue(SharedGroupCard.showsHeaderDivider(card: localCard, displayMode: .home))
    }

    func testGroupCardHeaderStatsExcludeSkillCount() {
        let stats = MainViewModel.GroupCardStats(
            skillCount: 9,
            downloadCount: 12,
            starCount: 34,
            githubURL: "https://github.com/example/repo"
        )

        XCTAssertEqual(
            SharedGroupCard.visibleHeaderStatKinds(stats: stats),
            [.downloads, .star, .github]
        )
        XCTAssertFalse(SharedGroupCard.showsInlineHeaderStats(displayMode: .home))
    }

    func testHealthStatusUsesStableMenuBarIcons() {
        XCTAssertEqual(MainViewModel.HealthStatus.healthy.menuIconSystemName, "checkmark.circle")
        XCTAssertEqual(MainViewModel.HealthStatus.warnings.menuIconSystemName, "exclamationmark.triangle")
        XCTAssertEqual(MainViewModel.HealthStatus.error.menuIconSystemName, "xmark.circle")
        XCTAssertEqual(MainViewModel.HealthStatus.unknown.menuIconSystemName, "circle")
    }

    func testGroupCardTitleSizeDoesNotShrinkInMenuScale() {
        XCTAssertEqual(GroupCardScale.home.titleSize, 21)
        XCTAssertEqual(GroupCardScale.menu.titleSize, 21)
    }

    func testGroupCardTextSizesDoNotShrinkInMenuScale() {
        XCTAssertEqual(GroupCardScale.home.metaSize, 12)
        XCTAssertEqual(GroupCardScale.menu.metaSize, 12)
        XCTAssertEqual(GroupCardScale.home.sectionLabelSize, 12)
        XCTAssertEqual(GroupCardScale.menu.sectionLabelSize, 12)
        XCTAssertEqual(GroupCardScale.home.chipFontSize, 12)
        XCTAssertEqual(GroupCardScale.menu.chipFontSize, 12)
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

    func testHeaderToolbarButtonUsesFullHitTargetSize() {
        XCTAssertEqual(MainView.toolbarButtonSize, 34)
    }

    func testHeaderLayoutUsesStableLeadingAndSearchWidths() {
        XCTAssertEqual(MainView.headerLeadingWidth, 220)
        XCTAssertEqual(MainView.headerSearchFieldWidth, 384)
    }

    func testMenuBarIconLoadsTemplateSvg() {
        let image = MenuBarIcon.image()

        XCTAssertNotNil(image)
        XCTAssertEqual(image?.isTemplate, true)
    }

    func testSurfaceLayerColorsFollowNeutralCardScale() {
        assertColor(AppTheme.pageBackground(for: .light), equalsGrayscale: 242)
        assertColor(AppTheme.headerBackground(for: .light), equalsGrayscale: 242)
        assertColor(AppTheme.detailHeaderBackground(for: .light), equalsGrayscale: 253)
        assertColor(AppTheme.detailBodyBackground(for: .light), equalsGrayscale: 249)
        assertColor(AppTheme.detailHeaderBottomBorder(for: .light), equalsGrayscale: 242, alpha: 0.5)
        assertColor(AppTheme.surface(for: .light), equalsGrayscale: 253)
        assertColor(AppTheme.groupCardFill(for: .light), equalsGrayscale: 253)
        assertColor(AppTheme.documentBlock(for: .light), equalsGrayscale: 242)

        assertColor(AppTheme.pageBackground(for: .dark), equalsGrayscale: 34)
        assertColor(AppTheme.headerBackground(for: .dark), equalsGrayscale: 34)
        assertColor(AppTheme.detailHeaderBackground(for: .dark), equalsGrayscale: 14)
        assertColor(AppTheme.detailBodyBackground(for: .dark), equalsGrayscale: 21)
        assertColor(AppTheme.detailHeaderBottomBorder(for: .dark), equalsGrayscale: 34, alpha: 0.5)
        assertColor(AppTheme.surface(for: .dark), equalsGrayscale: 14)
        assertColor(AppTheme.groupCardFill(for: .dark), equalsGrayscale: 14)
        assertColor(AppTheme.documentBlock(for: .dark), equalsGrayscale: 34)
    }

    private func assertColor(_ color: Color, equalsGrayscale expected: CGFloat, alpha expectedAlpha: CGFloat = 1, file: StaticString = #filePath, line: UInt = #line) {
        let resolved = NSColor(color).usingColorSpace(.deviceRGB)
        XCTAssertNotNil(resolved, file: file, line: line)
        XCTAssertEqual(resolved?.redComponent ?? -1, expected / 255.0, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(resolved?.greenComponent ?? -1, expected / 255.0, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(resolved?.blueComponent ?? -1, expected / 255.0, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(resolved?.alphaComponent ?? -1, expectedAlpha, accuracy: 0.001, file: file, line: line)
    }

    private func assertColorsEqual(_ lhs: Color, _ rhs: Color, file: StaticString = #filePath, line: UInt = #line) {
        let left = nsColor(lhs)
        let right = nsColor(rhs)
        XCTAssertNotNil(left, file: file, line: line)
        XCTAssertNotNil(right, file: file, line: line)
        XCTAssertEqual(left?.redComponent ?? -1, right?.redComponent ?? -2, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(left?.greenComponent ?? -1, right?.greenComponent ?? -2, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(left?.blueComponent ?? -1, right?.blueComponent ?? -2, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(left?.alphaComponent ?? -1, right?.alphaComponent ?? -2, accuracy: 0.001, file: file, line: line)
    }

    private func nsColor(_ color: Color) -> NSColor? {
        NSColor(color).usingColorSpace(.deviceRGB)
    }
}

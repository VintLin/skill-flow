import AppKit
import SwiftUI
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MenuBarIconTests: XCTestCase {
    func testGroupCardDisplayModeMenuModesStaySeparateFromHomeAndHideSecondaryChrome() {
        XCTAssertTrue(GroupCardDisplayMode.menuComfortable.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.menuComfortable.showsMetaLine)
        XCTAssertFalse(GroupCardDisplayMode.menuComfortable.showsSectionTitles)
        XCTAssertTrue(GroupCardDisplayMode.menuComfortable.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.menuComfortable.scale, .menu)

        XCTAssertTrue(GroupCardDisplayMode.menuCompact.showsSubtitle)
        XCTAssertFalse(GroupCardDisplayMode.menuCompact.showsMetaLine)
        XCTAssertFalse(GroupCardDisplayMode.menuCompact.showsSectionTitles)
        XCTAssertTrue(GroupCardDisplayMode.menuCompact.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.menuCompact.scale, .menu)
    }

    func testGroupCardDisplayModeHomeModesStaySeparateFromMenu() {
        XCTAssertTrue(GroupCardDisplayMode.homeComfortable.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.homeComfortable.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.homeComfortable.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.homeComfortable.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.homeComfortable.scale, .home)

        XCTAssertTrue(GroupCardDisplayMode.homeCompact.showsSubtitle)
        XCTAssertFalse(GroupCardDisplayMode.homeCompact.showsMetaLine)
        XCTAssertFalse(GroupCardDisplayMode.homeCompact.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.homeCompact.supportsCollapsedSkills)
        XCTAssertEqual(GroupCardDisplayMode.homeCompact.scale, .home)
    }

    func testGroupCardDisplayModeImportUsesDedicatedChrome() {
        XCTAssertTrue(GroupCardDisplayMode.importSearch.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.importSearch.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.importSearch.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.importSearch.supportsCollapsedSkills)
        XCTAssertTrue(GroupCardDisplayMode.importSearch.usesPlainPrimaryActionIcon)
        XCTAssertEqual(GroupCardDisplayMode.importSearch.scale, .home)

        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.showsSubtitle)
        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.showsMetaLine)
        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.showsSectionTitles)
        XCTAssertFalse(GroupCardDisplayMode.importRecommendation.supportsCollapsedSkills)
        XCTAssertTrue(GroupCardDisplayMode.importRecommendation.usesPlainPrimaryActionIcon)
        XCTAssertEqual(GroupCardDisplayMode.importRecommendation.scale, .home)
    }

    func testCardDensityProjectsToExpectedGroupCardDisplayModes() {
        XCTAssertEqual(MainView.homeGroupCardDisplayMode(for: .comfortable), .homeComfortable)
        XCTAssertEqual(MainView.homeGroupCardDisplayMode(for: .compact), .homeCompact)
        XCTAssertEqual(MainView.menuGroupCardDisplayMode(for: .comfortable), .menuComfortable)
        XCTAssertEqual(MainView.menuGroupCardDisplayMode(for: .compact), .menuCompact)
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
            byline: "by @owner",
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "acme-example",
            isPinned: false,
            health: "DISCOVER",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: true,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: loadingCard, displayMode: .importSearch))
        XCTAssertTrue(SharedGroupCard.showsHeaderDivider(card: loadingCard, displayMode: .importSearch))
    }

    func testCompactHomeCardsHideMetadataRowAndHeaderDivider() {
        let card = MainViewModel.GroupCardModel(
            id: "compact-home",
            title: "Compact Home",
            byline: "by @owner",
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "acme-example",
            isPinned: false,
            health: "READY",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(downloadCount: 10, starCount: 12, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertFalse(SharedGroupCard.reservesHeaderStatsRow(card: card, displayMode: .homeCompact))
        XCTAssertFalse(SharedGroupCard.showsHeaderDivider(card: card, displayMode: .homeCompact))
        XCTAssertFalse(GroupCardDisplayMode.homeCompact.showsSummaryDivider)
    }

    func testHomeCardsReserveMetadataRowAndDividerEvenWhenStatsAreMissing() {
        let localCard = MainViewModel.GroupCardModel(
            id: "local",
            title: "Local Group",
            byline: "by @owner",
            groupPath: "/tmp/local",
            sourceKind: "local",
            sourceLocator: "~/skills/example",
            isPinned: false,
            health: "LOCAL",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(downloadCount: nil, starCount: nil, githubURL: nil, localPath: "/tmp/local"),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: localCard, displayMode: .homeComfortable))
        XCTAssertTrue(SharedGroupCard.showsHeaderDivider(card: localCard, displayMode: .homeComfortable))
    }

    func testHomeCardsDoNotReserveMetadataRowWhenMetadataIsMissing() {
        let card = makeGroupCard(byline: nil)

        XCTAssertFalse(SharedGroupCard.reservesHeaderStatsRow(card: card, displayMode: .homeComfortable))
        XCTAssertFalse(SharedGroupCard.showsHeaderDivider(card: card, displayMode: .homeComfortable))
    }

    func testImportLocalScanCardUsesReservedMetadataRowForSourceSummary() {
        let localScanCard = MainViewModel.GroupCardModel(
            id: "local-scan",
            title: "Local Scan",
            byline: "本地扫描",
            headerMetaLine: "来源 2 个代理路径",
            groupPath: nil,
            sourceKind: "import-preview",
            sourceLocator: "file:///tmp/local-scan",
            isPinned: false,
            health: "DISCOVER",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: localScanCard, displayMode: .importSearch))
        XCTAssertTrue(SharedGroupCard.showsHeaderDivider(card: localScanCard, displayMode: .importSearch))
    }

    func testMenuComfortableCardsOnlyReserveMetadataRowWhenSourceMetadataExists() {
        let menuCard = MainViewModel.GroupCardModel(
            id: "menu",
            title: "Menu Group",
            byline: "by @owner",
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "acme-example",
            isPinned: false,
            health: "READY",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(GroupCardDisplayMode.menuComfortable.showsMetaLine)
        XCTAssertFalse(SharedGroupCard.reservesHeaderStatsRow(card: menuCard, displayMode: .menuComfortable))
        XCTAssertFalse(SharedGroupCard.showsHeaderDivider(card: menuCard, displayMode: .menuComfortable))
        XCTAssertFalse(GroupCardDisplayMode.menuComfortable.showsSummaryDivider)
    }

    func testMenuCompactCardsHideMetadataRowAndHeaderDivider() {
        let menuCard = MainViewModel.GroupCardModel(
            id: "menu-compact",
            title: "Menu Group",
            byline: "by @owner",
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "acme-example",
            isPinned: false,
            health: "READY",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: MainViewModel.GroupCardStats(downloadCount: 1, starCount: 2, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertFalse(GroupCardDisplayMode.menuCompact.showsMetaLine)
        XCTAssertFalse(SharedGroupCard.reservesHeaderStatsRow(card: menuCard, displayMode: .menuCompact))
        XCTAssertFalse(SharedGroupCard.showsHeaderDivider(card: menuCard, displayMode: .menuCompact))
        XCTAssertFalse(GroupCardDisplayMode.menuCompact.showsSummaryDivider)
    }

    func testGroupCardHeaderStatsExcludeSkillCount() {
        let stats = MainViewModel.GroupCardStats(
            downloadCount: 12,
            starCount: 34,
            githubURL: "https://github.com/example/repo",
            localPath: "/tmp/example-repo"
        )

        XCTAssertEqual(
            SharedGroupCard.visibleHeaderStatKinds(stats: stats),
            [.downloads, .star, .github, .localFile]
        )
        XCTAssertFalse(SharedGroupCard.showsInlineHeaderStats(displayMode: .homeComfortable))
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

    func testSelectedProjectPillUsesAccentBackgroundOpacityInLightTheme() {
        assertColorsEqual(
            MainView.projectScopePillBackground(isSelected: true, accent: .green, theme: .light),
            AppTheme.brand(for: .green, in: .light).opacity(0.18)
        )
    }

    func testSelectedProjectPillUsesAccentBackgroundOpacityInDarkTheme() {
        assertColorsEqual(
            MainView.projectScopePillBackground(isSelected: true, accent: .green, theme: .dark),
            AppTheme.brand(for: .green, in: .dark).opacity(0.28)
        )
    }

    func testSelectedProjectPillTransparencyLabelMatchesThemeOpacity() {
        XCTAssertEqual(MainView.projectScopePillOpacityLabel(isSelected: true, theme: .light), "alpha 18%")
        XCTAssertEqual(MainView.projectScopePillOpacityLabel(isSelected: true, theme: .dark), "alpha 28%")
        XCTAssertNil(MainView.projectScopePillOpacityLabel(isSelected: false, theme: .light))
    }

    func testMenuBarIconLoadsTemplateSvg() {
        let image = MenuBarIcon.image()

        XCTAssertNotNil(image)
        XCTAssertEqual(image?.isTemplate, true)
    }

    func testProjectActionIconsLoadTemplateSvgs() {
        let project = ActionIcon.project.image(size: 14)
        let warning = ActionIcon.projectWarning.image(size: 10)

        XCTAssertNotNil(project)
        XCTAssertEqual(project?.isTemplate, true)
        XCTAssertNotNil(warning)
        XCTAssertEqual(warning?.isTemplate, true)
    }

    func testSkillGroupEditorActionIconLoadsRenamedSvg() {
        XCTAssertEqual(ActionIcon.groupEditor.rawValue, "skill-group-editor")

        let image = ActionIcon.groupEditor.image(size: 14)

        XCTAssertNotNil(image)
        XCTAssertEqual(image?.size, NSSize(width: 14, height: 14))
    }

    func testAppInitializationKeepsDockIconAtSystemSize() {
        _ = SkillFlowDesktopApp()

        let iconSize = NSApplication.shared.applicationIconImage?.size ?? .zero
        XCTAssertLessThanOrEqual(iconSize.width, 128)
        XCTAssertLessThanOrEqual(iconSize.height, 128)
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


    func testOriginalNameHelpTextReturnsNilWhenNamesMatch() {
        let card = MainViewModel.GroupCardModel(
            id: "test",
            title: "anthropic-skills",
            originalDisplayName: "anthropic-skills",
            byline: nil,
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "https://github.com/anthropics/skills.git",
            isPinned: false,
            health: "valid",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: .init(downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: .init(phase: .idle, detail: nil)
        )
        let zhLocale = Locale(identifier: "zh-Hans")
        XCTAssertNil(SharedGroupCard.originalNameHelpText(card: card, locale: zhLocale))
    }

    func testOriginalNameHelpTextReturnsPlainOriginalNameWhenNamesDiffer() {
        let card = MainViewModel.GroupCardModel(
            id: "test",
            title: "Research Tools",
            originalDisplayName: "anthropic-skills",
            byline: nil,
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "https://github.com/anthropics/skills.git",
            isPinned: false,
            health: "valid",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: .init(downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: .init(phase: .idle, detail: nil)
        )
        let zhLocale = Locale(identifier: "zh-Hans")
        let result = SharedGroupCard.originalNameHelpText(card: card, locale: zhLocale)
        XCTAssertEqual(result, "anthropic-skills")
    }

    func testOriginalNameTooltipWidthAdaptsToTextWithinBounds() {
        let shortWidth = OriginalNameInfoIcon.tooltipWidth(for: "AlphaHub")
        let longWidth = OriginalNameInfoIcon.tooltipWidth(
            for: "Original repository display name with enough text to require a wider tooltip"
        )

        XCTAssertGreaterThanOrEqual(shortWidth, OriginalNameInfoIcon.tooltipMinWidth)
        XCTAssertGreaterThan(longWidth, shortWidth)
        XCTAssertLessThanOrEqual(longWidth, OriginalNameInfoIcon.tooltipMaxWidth)
    }

    func testOriginalNameIndicatorShowsOnlyForCustomDisplayName() {
        XCTAssertTrue(SharedGroupCard.showsOriginalNameIndicator(title: "Research Tools", originalDisplayName: "anthropic-skills"))
        XCTAssertFalse(SharedGroupCard.showsOriginalNameIndicator(title: "anthropic-skills", originalDisplayName: "anthropic-skills"))
        XCTAssertFalse(SharedGroupCard.showsOriginalNameIndicator(title: "Research Tools", originalDisplayName: nil))
        XCTAssertFalse(SharedGroupCard.showsOriginalNameIndicator(title: "Research Tools", originalDisplayName: "   "))
    }

    func testGroupCardCanExposeRecentlyUpdatedIndicatorState() {
        let card = makeGroupCard(showsRecentlyUpdatedIndicator: true)

        XCTAssertTrue(card.showsRecentlyUpdatedIndicator)
    }

    @MainActor
    func testRecentlyUpdatedIndicatorAddsGreenDotPixelsWhenEnabled() {
        let baselineSnapshot = renderSnapshot(
            for: makeGroupCard(
                title: "Alpha",
                originalDisplayName: "anthropic-skills",
                showsRecentlyUpdatedIndicator: false
            ),
            width: 280,
            accent: .blue
        )
        let updatedSnapshot = renderSnapshot(
            for: makeGroupCard(
                title: "Alpha",
                originalDisplayName: "anthropic-skills",
                showsRecentlyUpdatedIndicator: true
            ),
            width: 280,
            accent: .blue
        )

        let successColor = NSColor(AppTheme.statusSuccess(for: .light))
        let baselineRegion = headerTitlePixelRegion(for: baselineSnapshot.size)
        let updatedRegion = headerTitlePixelRegion(for: updatedSnapshot.size)
        let baselineGreenPixels = matchingPixelCount(
            in: baselineSnapshot.bitmap,
            color: successColor,
            region: baselineRegion
        )
        let updatedGreenPixels = matchingPixelCount(
            in: updatedSnapshot.bitmap,
            color: successColor,
            region: updatedRegion
        )

        XCTAssertLessThan(baselineGreenPixels, 8)
        XCTAssertGreaterThan(updatedGreenPixels, 18)
    }

    @MainActor
    func testRecentlyUpdatedIndicatorKeepsWarningAndErrorAffordancesVisible() {
        let baselineSnapshot = renderSnapshot(
            for: makeGroupCard(
                title: "Alpha",
                warningCount: 2,
                errorCount: 1,
                showsRecentlyUpdatedIndicator: false
            ),
            width: 320,
            accent: .blue
        )
        let updatedSnapshot = renderSnapshot(
            for: makeGroupCard(
                title: "Alpha",
                warningCount: 2,
                errorCount: 1,
                showsRecentlyUpdatedIndicator: true
            ),
            width: 320,
            accent: .blue
        )

        let warningColor = NSColor(AppTheme.statusWarning(for: .light))
        let errorColor = NSColor(AppTheme.statusError(for: .light))
        let successColor = NSColor(AppTheme.statusSuccess(for: .light))
        let baselineRegion = headerTitlePixelRegion(for: baselineSnapshot.size)
        let updatedRegion = headerTitlePixelRegion(for: updatedSnapshot.size)

        let baselineWarningPixels = matchingPixelCount(in: baselineSnapshot.bitmap, color: warningColor, region: baselineRegion)
        let updatedWarningPixels = matchingPixelCount(in: updatedSnapshot.bitmap, color: warningColor, region: updatedRegion)
        let baselineErrorPixels = matchingPixelCount(in: baselineSnapshot.bitmap, color: errorColor, region: baselineRegion)
        let updatedErrorPixels = matchingPixelCount(in: updatedSnapshot.bitmap, color: errorColor, region: updatedRegion)
        let baselineGreenPixels = matchingPixelCount(in: baselineSnapshot.bitmap, color: successColor, region: baselineRegion)
        let updatedGreenPixels = matchingPixelCount(in: updatedSnapshot.bitmap, color: successColor, region: updatedRegion)

        XCTAssertGreaterThan(baselineWarningPixels, 12)
        XCTAssertGreaterThan(updatedWarningPixels, 12)
        XCTAssertGreaterThan(baselineErrorPixels, 12)
        XCTAssertGreaterThan(updatedErrorPixels, 12)
        XCTAssertGreaterThan(updatedGreenPixels, baselineGreenPixels + 12)
    }

    @MainActor
    func testRecentlyUpdatedIndicatorKeepsHeaderHeightStableAtFixedWidth() {
        let baselineCard = makeGroupCard(
            title: "A Very Long Group Card Title That Should Still Fit In One Header Row",
            originalDisplayName: "anthropic-skills",
            warningCount: 2,
            errorCount: 1,
            showsRecentlyUpdatedIndicator: false
        )
        let updatedCard = makeGroupCard(
            title: "A Very Long Group Card Title That Should Still Fit In One Header Row",
            originalDisplayName: "anthropic-skills",
            warningCount: 2,
            errorCount: 1,
            showsRecentlyUpdatedIndicator: true
        )

        let baselineSize = renderSnapshot(for: baselineCard, width: 280, accent: .blue).size
        let updatedSize = renderSnapshot(for: updatedCard, width: 280, accent: .blue).size

        XCTAssertEqual(updatedSize.height, baselineSize.height, accuracy: 0.5)
        XCTAssertLessThanOrEqual(updatedSize.width, 280)
    }

    func testRecentlyUpdatedIndicatorDoesNotChangeHeaderDividerLogic() {
        let baselineCard = makeGroupCard(
            headerMetaLine: "Source: 2 agent paths",
            warningCount: 1,
            errorCount: 2,
            showsRecentlyUpdatedIndicator: false
        )
        let updatedCard = makeGroupCard(
            headerMetaLine: "Source: 2 agent paths",
            warningCount: 1,
            errorCount: 2,
            showsRecentlyUpdatedIndicator: true
        )

        XCTAssertEqual(
            SharedGroupCard.reservesHeaderStatsRow(card: updatedCard, displayMode: .homeComfortable),
            SharedGroupCard.reservesHeaderStatsRow(card: baselineCard, displayMode: .homeComfortable)
        )
        XCTAssertEqual(
            SharedGroupCard.showsHeaderDivider(card: updatedCard, displayMode: .homeComfortable),
            SharedGroupCard.showsHeaderDivider(card: baselineCard, displayMode: .homeComfortable)
        )
    }

    func testOriginalNameHelpTextReturnsNilWhenNilOriginalDisplayName() {
        let card = MainViewModel.GroupCardModel(
            id: "test",
            title: "Research Tools",
            originalDisplayName: nil,
            byline: nil,
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "https://github.com/anthropics/skills.git",
            isPinned: false,
            health: "valid",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: .init(downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: .init(phase: .idle, detail: nil)
        )
        let zhLocale = Locale(identifier: "zh-Hans")
        XCTAssertNil(SharedGroupCard.originalNameHelpText(card: card, locale: zhLocale))
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

    @MainActor
    private func renderSnapshot(
        for card: MainViewModel.GroupCardModel,
        width: CGFloat,
        accent: DesktopAccentColor
    ) -> (size: CGSize, bitmap: NSBitmapImageRep) {
        let view = SharedGroupCard(
            card: card,
            theme: .light,
            accent: accent,
            displayMode: .homeComfortable,
            clickPolicy: .home,
            skillsCollapsed: false,
            isUpdating: false,
            onOpen: {},
            onUpdate: {},
            onTogglePinned: {},
            onDelete: {},
            onToggleSkill: { _, _ in },
            onToggleAllSkills: {},
            onToggleTarget: { _, _, _ in },
            onToggleAllTargets: {}
        )
        .environment(\.locale, Locale(identifier: "en"))
        .frame(width: width, alignment: .topLeading)

        let hostingView = NSHostingView(rootView: view)
        hostingView.frame = NSRect(x: 0, y: 0, width: width, height: 1)
        hostingView.layoutSubtreeIfNeeded()
        let size = hostingView.fittingSize
        hostingView.frame = NSRect(origin: .zero, size: size)
        hostingView.layoutSubtreeIfNeeded()

        guard let bitmap = hostingView.bitmapImageRepForCachingDisplay(in: hostingView.bounds) else {
            XCTFail("Expected bitmap snapshot for SharedGroupCard")
            let fallback = NSBitmapImageRep(
                bitmapDataPlanes: nil,
                pixelsWide: max(1, Int(size.width)),
                pixelsHigh: max(1, Int(size.height)),
                bitsPerSample: 8,
                samplesPerPixel: 4,
                hasAlpha: true,
                isPlanar: false,
                colorSpaceName: .deviceRGB,
                bytesPerRow: 0,
                bitsPerPixel: 0
            )!
            return (size, fallback)
        }

        hostingView.cacheDisplay(in: hostingView.bounds, to: bitmap)
        return (size, bitmap)
    }

    private func makeGroupCard(
        title: String = "Alpha",
        originalDisplayName: String? = nil,
        byline: String? = "by @owner",
        headerMetaLine: String? = nil,
        warningCount: Int = 0,
        errorCount: Int = 0,
        showsRecentlyUpdatedIndicator: Bool = false
    ) -> MainViewModel.GroupCardModel {
        MainViewModel.GroupCardModel(
            id: "test",
            title: title,
            showsRecentlyUpdatedIndicator: showsRecentlyUpdatedIndicator,
            originalDisplayName: originalDisplayName,
            byline: byline,
            headerMetaLine: headerMetaLine,
            groupPath: nil,
            sourceKind: "git",
            sourceLocator: "https://github.com/anthropics/skills.git",
            isPinned: false,
            health: "valid",
            warningCount: warningCount,
            errorCount: errorCount,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: .init(downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: .init(phase: .idle, detail: nil)
        )
    }

    private func matchingPixelCount(
        in bitmap: NSBitmapImageRep,
        color: NSColor,
        region: CGRect,
        tolerance: CGFloat = 0.18,
        minimumAlpha: CGFloat = 0.18
    ) -> Int {
        let expected = color.usingColorSpace(.deviceRGB) ?? color
        let minX = max(0, Int(region.minX.rounded(.down)))
        let maxX = min(bitmap.pixelsWide, Int(region.maxX.rounded(.up)))
        let minY = max(0, Int(region.minY.rounded(.down)))
        let maxY = min(bitmap.pixelsHigh, Int(region.maxY.rounded(.up)))
        var matches = 0

        for x in minX..<maxX {
            for y in minY..<maxY {
                guard let pixel = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else {
                    continue
                }
                guard pixel.alphaComponent >= minimumAlpha else {
                    continue
                }
                let delta = abs(pixel.redComponent - expected.redComponent)
                    + abs(pixel.greenComponent - expected.greenComponent)
                    + abs(pixel.blueComponent - expected.blueComponent)
                if delta <= tolerance {
                    matches += 1
                }
            }
        }

        return matches
    }

    private func headerTitlePixelRegion(for size: CGSize) -> CGRect {
        let horizontalInset: CGFloat = 10
        let topInset: CGFloat = 8
        let regionHeight: CGFloat = 64
        let regionWidth = max(1, min(size.width - (horizontalInset * 2), 264))
        return CGRect(
            x: horizontalInset,
            y: topInset,
            width: regionWidth,
            height: min(regionHeight, size.height)
        )
    }
}

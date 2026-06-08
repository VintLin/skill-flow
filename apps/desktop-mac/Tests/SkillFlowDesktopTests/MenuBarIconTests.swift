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
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
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
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: 10, starCount: 12, githubURL: nil, localPath: nil),
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
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: "/tmp/local"),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: localCard, displayMode: .homeComfortable))
        XCTAssertTrue(SharedGroupCard.showsHeaderDivider(card: localCard, displayMode: .homeComfortable))
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
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: localScanCard, displayMode: .importSearch))
        XCTAssertTrue(SharedGroupCard.showsHeaderDivider(card: localScanCard, displayMode: .importSearch))
    }

    func testMenuComfortableCardsKeepMetadataRowButHideHeaderDivider() {
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
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )

        XCTAssertTrue(GroupCardDisplayMode.menuComfortable.showsMetaLine)
        XCTAssertTrue(SharedGroupCard.reservesHeaderStatsRow(card: menuCard, displayMode: .menuComfortable))
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
            stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: 1, starCount: 2, githubURL: nil, localPath: nil),
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
            skillCount: 9,
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
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
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
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
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

    func testGroupCardModelDerivesRecentlyUpdatedIndicatorFromCurrentScopeSet() throws {
        let source = try sourceText(at: "Sources/DesktopApp/ViewModels/MainViewModel.swift")
        let groupCardsSource = try sourceSlice(
            in: source,
            from: "func groupCards(matching rawQuery: String) -> [GroupCardModel] {",
            to: "    func sourceCanonicalRepo(for sourceId: String) -> String? {"
        )

        XCTAssertTrue(groupCardsSource.contains("showsRecentlyUpdatedIndicator: recentlyUpdatedSourceIds.contains(row.id)"))
    }

    func testRecentlyUpdatedIndicatorRendersInsideTitleRowWithoutReplacingExistingHeaderAffordances() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")
        let headerSource = try sourceSlice(
            in: source,
            from: "private var headerPrimaryContent: some View {",
            to: "    private var headerPrimaryButtonLabel: some View {"
        )

        XCTAssertTrue(headerSource.contains("Text(card.title)"))
        XCTAssertTrue(headerSource.contains("if card.showsRecentlyUpdatedIndicator"))
        XCTAssertTrue(headerSource.contains("Circle()"))
        XCTAssertTrue(headerSource.contains("AppTheme.statusSuccess(for: theme)"))
        XCTAssertTrue(headerSource.contains("if Self.showsOriginalNameIndicator(title: card.title, originalDisplayName: card.originalDisplayName)"))
    }

    @MainActor
    func testRecentlyUpdatedIndicatorKeepsHeaderHeightStableAtFixedWidth() {
        let baselineCard = makeGroupCard(
            title: "A Very Long Group Card Title That Should Still Fit In One Header Row",
            originalDisplayName: "anthropic-skills",
            showsRecentlyUpdatedIndicator: false
        )
        let updatedCard = makeGroupCard(
            title: "A Very Long Group Card Title That Should Still Fit In One Header Row",
            originalDisplayName: "anthropic-skills",
            showsRecentlyUpdatedIndicator: true
        )

        let baselineSize = renderSize(for: baselineCard, width: 280)
        let updatedSize = renderSize(for: updatedCard, width: 280)

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
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
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
    private func renderSize(
        for card: MainViewModel.GroupCardModel,
        width: CGFloat
    ) -> CGSize {
        let view = SharedGroupCard(
            card: card,
            theme: .light,
            accent: .green,
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
        return hostingView.fittingSize
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
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: .init(phase: .idle, detail: nil)
        )
    }

    private func sourceText(at relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func sourceSlice(in source: String, from startMarker: String, to endMarker: String) throws -> String {
        guard let startRange = source.range(of: startMarker) else {
            XCTFail("Missing start marker: \(startMarker)")
            return ""
        }
        guard let endRange = source[startRange.upperBound...].range(of: endMarker) else {
            XCTFail("Missing end marker: \(endMarker)")
            return ""
        }
        return String(source[startRange.lowerBound..<endRange.lowerBound])
    }
}

import XCTest

@testable import SkillFlowDesktop

@MainActor
final class GroupCardScaleTests: XCTestCase {
    func testActionButtonFrameTrackingOnlyRunsAroundMenuInteraction() {
        XCTAssertFalse(GroupCardActionFrameTracking.shouldMeasure(isHovered: false, isMenuOpen: false))
        XCTAssertTrue(GroupCardActionFrameTracking.shouldMeasure(isHovered: true, isMenuOpen: false))
        XCTAssertTrue(GroupCardActionFrameTracking.shouldMeasure(isHovered: false, isMenuOpen: true))
    }

    func testDisplayModePresentationProfilesMatchAgreedVisibilityMatrix() {
        XCTAssertEqual(
            GroupCardDisplayMode.homeComfortable.presentationProfile,
            GroupCardDisplayMode.PresentationProfile(
                scale: .home,
                showsSubtitle: true,
                showsMetaLine: true,
                showsSectionTitles: true,
                supportsCollapsedSkills: false,
                usesPlainPrimaryActionIcon: false,
                busyMessageStyle: .updating,
                showsHeaderDivider: true,
                showsSummaryDivider: true,
                reservesMinimumHeight: true,
                showsLoadingStatPlaceholders: false
            )
        )
        XCTAssertEqual(
            GroupCardDisplayMode.homeCompact.presentationProfile,
            GroupCardDisplayMode.PresentationProfile(
                scale: .home,
                showsSubtitle: true,
                showsMetaLine: false,
                showsSectionTitles: false,
                supportsCollapsedSkills: false,
                usesPlainPrimaryActionIcon: false,
                busyMessageStyle: .updating,
                showsHeaderDivider: false,
                showsSummaryDivider: false,
                reservesMinimumHeight: false,
                showsLoadingStatPlaceholders: false
            )
        )
        XCTAssertEqual(
            GroupCardDisplayMode.menuComfortable.presentationProfile,
            GroupCardDisplayMode.PresentationProfile(
                scale: .menu,
                showsSubtitle: true,
                showsMetaLine: true,
                showsSectionTitles: false,
                supportsCollapsedSkills: true,
                usesPlainPrimaryActionIcon: false,
                busyMessageStyle: .updating,
                showsHeaderDivider: false,
                showsSummaryDivider: false,
                reservesMinimumHeight: false,
                showsLoadingStatPlaceholders: false
            )
        )
        XCTAssertEqual(
            GroupCardDisplayMode.menuCompact.presentationProfile,
            GroupCardDisplayMode.PresentationProfile(
                scale: .menu,
                showsSubtitle: true,
                showsMetaLine: false,
                showsSectionTitles: false,
                supportsCollapsedSkills: true,
                usesPlainPrimaryActionIcon: false,
                busyMessageStyle: .updating,
                showsHeaderDivider: false,
                showsSummaryDivider: false,
                reservesMinimumHeight: false,
                showsLoadingStatPlaceholders: false
            )
        )
        XCTAssertEqual(
            GroupCardDisplayMode.importSearch.presentationProfile,
            GroupCardDisplayMode.PresentationProfile(
                scale: .home,
                showsSubtitle: true,
                showsMetaLine: true,
                showsSectionTitles: true,
                supportsCollapsedSkills: false,
                usesPlainPrimaryActionIcon: true,
                busyMessageStyle: .downloading,
                showsHeaderDivider: true,
                showsSummaryDivider: false,
                reservesMinimumHeight: true,
                showsLoadingStatPlaceholders: true
            )
        )
        XCTAssertEqual(
            GroupCardDisplayMode.importRecommendation.presentationProfile,
            GroupCardDisplayMode.PresentationProfile(
                scale: .home,
                showsSubtitle: true,
                showsMetaLine: true,
                showsSectionTitles: true,
                supportsCollapsedSkills: false,
                usesPlainPrimaryActionIcon: true,
                busyMessageStyle: .downloading,
                showsHeaderDivider: true,
                showsSummaryDivider: true,
                reservesMinimumHeight: true,
                showsLoadingStatPlaceholders: true
            )
        )
    }

    func testGroupCardTagMetricsStayAtCompactTwoThirdsSize() {
        XCTAssertEqual(GroupCardTagMetrics.pillHeight, 16)
        XCTAssertEqual(GroupCardTagMetrics.fontSize, 12)
        XCTAssertEqual(GroupCardTagMetrics.iconSize, 7)
        XCTAssertEqual(GroupCardTagMetrics.rowSpacing, 6)
        XCTAssertEqual(GroupCardTagMetrics.inputWidth, 48)
        XCTAssertEqual(GroupCardTagMetrics.horizontalPadding, 0)
    }

    func testCompactScaleKeepsAgentTargetsAtFullSize() {
        XCTAssertEqual(GroupCardScale.home.targetSize, 34)
        XCTAssertEqual(GroupCardScale.menu.targetSize, 34)
    }

    func testCompactScaleKeepsSkillsAndSelectionSwitchesAtFullSize() {
        XCTAssertEqual(GroupCardScale.home.chipHeight, 34)
        XCTAssertEqual(GroupCardScale.menu.chipHeight, 34)
        XCTAssertEqual(GroupCardScale.home.triStateWidth, 34)
        XCTAssertEqual(GroupCardScale.menu.triStateWidth, 34)
        XCTAssertEqual(GroupCardScale.home.triStateHeight, 34)
        XCTAssertEqual(GroupCardScale.menu.triStateHeight, 34)
    }

    func testCompactScaleExpandsTargetScrollerToAvoidIconClipping() {
        XCTAssertEqual(GroupCardScale.home.targetScrollerHeight, GroupCardScale.home.targetSize)
        XCTAssertEqual(GroupCardScale.menu.targetScrollerHeight, GroupCardScale.menu.targetSize)
        XCTAssertEqual(GroupCardScale.menu.targetScrollerHeight, GroupCardScale.menu.chipHeight)
    }

    func testHomeAndImportDoNotEnterMenuScalePath() {
        XCTAssertEqual(GroupCardScale.home.cardInset, 12)
        XCTAssertEqual(GroupCardScale.menu.cardInset, 9.6, accuracy: 0.001)
        XCTAssertGreaterThan(GroupCardScale.home.cardInset, GroupCardScale.menu.cardInset)
    }

    func testSummarySectionMovesBelowAgentsAndSkills() {
        XCTAssertEqual(
            SharedGroupCard.contentSectionOrder(
                showsSummary: true,
                displayMode: .homeComfortable,
                skillsCollapsed: false
            ),
            [.agents, .skills, .summary]
        )
        XCTAssertEqual(
            SharedGroupCard.contentSectionOrder(
                showsSummary: true,
                displayMode: .importRecommendation,
                skillsCollapsed: false
            ),
            [.agents, .skills, .summary]
        )
        XCTAssertEqual(
            SharedGroupCard.contentSectionOrder(
                showsSummary: true,
                displayMode: .menuCompact,
                skillsCollapsed: true
            ),
            [.agents, .summary]
        )
    }

    func testRecommendationSummaryTakesPriorityOverTagSummaryKinds() {
        XCTAssertEqual(
            SharedGroupCard.resolvedSummaryKind(
                hasEditableTags: true,
                hasReadOnlyTags: true,
                hasRecommendationSummary: true
            ),
            .recommendation
        )
        XCTAssertEqual(
            SharedGroupCard.resolvedSummaryKind(
                hasEditableTags: true,
                hasReadOnlyTags: true,
                hasRecommendationSummary: false
            ),
            .editableTags
        )
        XCTAssertEqual(
            SharedGroupCard.resolvedSummaryKind(
                hasEditableTags: false,
                hasReadOnlyTags: true,
                hasRecommendationSummary: false
            ),
            .readOnlyTags
        )
    }
}

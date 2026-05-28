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

    func testDetailNavigationSurfacesUseSharedMotionHelpers() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Detail/DetailScreen.swift")
        XCTAssertTrue(source.contains(".desktopMotionChip("))
        XCTAssertTrue(source.contains(".desktopRowHover("))
    }

    func testTagPillsAndCardChipsUseSharedChipMotion() throws {
        let tags = try sourceText(at: "Sources/DesktopApp/Components/GroupTagComponents.swift")
        let cards = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

        XCTAssertTrue(tags.contains(".desktopMotionChip("))
        XCTAssertTrue(cards.contains(".desktopMotionChip("))
    }

    func testProjectScopePillsUseSharedChipMotion() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(home.contains("homeSidebarProjectSection"))
        XCTAssertTrue(home.contains("homeProjectScopeList"))
        XCTAssertTrue(home.contains("homeProjectScopeRow"))
        XCTAssertTrue(home.contains("Image(systemName: \"arrow.up.forward.square\")"))
        XCTAssertTrue(home.contains("openPath(projectPath)"))
        XCTAssertTrue(home.contains("homeProjectScopeRefreshButton"))
        XCTAssertTrue(home.contains("homeProjectScopeRefreshButtonSize"))
        XCTAssertTrue(home.contains("projectScopeRefreshButtonRotation"))
        XCTAssertTrue(home.contains(".desktopMotionChip("))
    }

    func testHeaderOmitsObsoleteProjectToggleButtonAndKeepsSidebarProjectScopeEntry() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertFalse(home.contains("projectScopeToggleButton"))
        XCTAssertFalse(home.contains("showsProjectScopeBar"))
        XCTAssertTrue(home.contains("homeSidebarProjectSection"))
        XCTAssertTrue(home.contains("homeProjectScopeList"))
        XCTAssertTrue(home.contains("homeContainer.recentProjectScopes()"))
        XCTAssertTrue(home.contains("homeContainer.selectProjectScope(.global)"))
        XCTAssertTrue(home.contains("homeContainer.selectProjectScope(.project(item.projectId))"))
    }

    func testHomeAgentSidebarSectionUsesAllFallbackSelection() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(home.contains("homeSidebarChipSection(sectionId: HomeSidebarSectionID.agents"))
        XCTAssertTrue(home.contains("let homeAgentOptions = homeAgentChipItems()"))
        XCTAssertTrue(home.contains("let rawHomeAgentFilterId = homeContainer.selectedHomeAgentFilterId()"))
        XCTAssertTrue(home.contains("homeAgentOptions.contains { $0.id == raw } ? raw : nil"))
        XCTAssertTrue(home.contains("options: homeAgentOptions, selectedId: selectedHomeAgentFilterId ?? \"all\""))
        XCTAssertFalse(home.contains("selectedId: homeContainer.selectedHomeAgentFilterId() ?? \"all\""))
        XCTAssertTrue(home.contains("homeContainer.setSelectedHomeAgentFilter(optionId == \"all\" ? nil : optionId)"))
    }

    func testHomeSidebarChipItemUsesStrongTypedAccent() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(home.contains("let accent: DesktopAccentColor?"))
        XCTAssertTrue(home.contains("accent: option.accent ?? accent"))
        XCTAssertFalse(home.contains("let accentValue: String?"))
        XCTAssertFalse(home.contains("DesktopAccentColor.init(rawValue:)"))
    }

    func testHomeLeadingFixedButtonWidthMeasuresAllAgentsLabel() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(home.contains("let agentTitle = L10n.string(\"home.sidebar.all_agents\", locale: locale)"))
        XCTAssertTrue(home.contains("let agentWidth ="))
        XCTAssertTrue(home.contains("max(projectWidth + homeLeadingProjectIndicatorAllowance, max(filterWidth, agentWidth))"))
    }

    func testProjectScopeHiddenWarningAndToolbarBadgeDeadCodeIsRemoved() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertFalse(home.contains("showsProjectScopeHiddenWarning"))
        XCTAssertFalse(home.contains("projectScopeShowsHiddenWarning"))
        XCTAssertFalse(home.contains("showsAlertBadge"))
        XCTAssertFalse(home.contains("toolbarAlertBadgeOffset"))
    }

    func testRenameDialogTextFieldHasAccessibleName() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(home.contains("TextField(\"\", text: $draft)"))
        XCTAssertTrue(home.contains(".accessibilityLabel(title)"))
    }

    func testHomeScrollingSurfacesUseLazyStacksInsideHorizontalScrollViews() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let tags = try sourceText(at: "Sources/DesktopApp/Components/GroupTagComponents.swift")
        let cards = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

        XCTAssertTrue(home.contains("LazyHStack"))
        XCTAssertTrue(tags.contains("LazyHStack"))
        XCTAssertTrue(cards.contains("LazyHStack"))
    }

    func testGroupTagsRemoveFilledBackgroundsAndUseHoverEditAffordanceOnlyForEditableTags() throws {
        let tags = try sourceText(at: "Sources/DesktopApp/Components/GroupTagComponents.swift")
        let cards = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

        XCTAssertFalse(tags.contains(".background(AppTheme.brand(for: item.accent, in: theme).opacity"))
        XCTAssertFalse(cards.contains(".background(AppTheme.brand(for: item.accent, in: theme).opacity"))
        XCTAssertFalse(cards.contains(".background(AppTheme.brand(for: badgeAccent, in: theme).opacity"))
        XCTAssertTrue(tags.contains("hoveredEditableTagID"))
        XCTAssertTrue(tags.contains("showsHoverAddButton"))
        XCTAssertTrue(tags.contains("addButton(isVisible:"))
        XCTAssertTrue(tags.contains("onSelect?(item)"))
        XCTAssertFalse(tags.contains("hoverEditButton(for:"))
    }

    func testEditableTagHoverKeepsAddButtonAliveLongEnoughToReachIt() throws {
        let tags = try sourceText(at: "Sources/DesktopApp/Components/GroupTagComponents.swift")

        XCTAssertTrue(tags.contains("hoverCollapseTask"))
        XCTAssertTrue(tags.contains("hoverCollapseDelay"))
        XCTAssertTrue(tags.contains("Task.sleep(for: hoverCollapseDelay)"))
        XCTAssertTrue(tags.contains("scheduleHoverCollapse"))
        XCTAssertTrue(tags.contains("cancelHoverCollapse()"))
    }

    func testEditableGroupCardShowsAddButtonWhenNoTagsExist() throws {
        let tags = try sourceText(at: "Sources/DesktopApp/Components/GroupTagComponents.swift")

        XCTAssertTrue(tags.contains("tagItems.isEmpty || hoveredEditableTagID != nil"))
    }

    func testEditableTagInputAndAddButtonUseCompactPillHeight() throws {
        let tags = try sourceText(at: "Sources/DesktopApp/Components/GroupTagComponents.swift")

        XCTAssertTrue(tags.contains(".frame(width: inputWidth, height: pillHeight, alignment: .leading)"))
        XCTAssertTrue(tags.contains(".frame(width: pillHeight, height: pillHeight)"))
        XCTAssertTrue(tags.contains(".frame(width: isVisible ? pillHeight : 0, height: pillHeight, alignment: .leading)"))
    }

    func testWrappingHStackComponentExistsForExpandedSidebarChips() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Components/WrappingHStack.swift")

        XCTAssertTrue(source.contains("struct WrappingHStack: Layout"))
        XCTAssertTrue(source.contains("func sizeThatFits("))
        XCTAssertTrue(source.contains("func placeSubviews("))
        XCTAssertTrue(source.contains("proposal.width.flatMap"))
        XCTAssertTrue(source.contains("$0.isFinite"))
        XCTAssertTrue(source.contains("max($0, contentWidth)"))
    }

    func testHomeSidebarOrdersAgentBeforeProjectsAndAddsStatusAndSourceType() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let statusRange = source.range(of: #"homeSidebarChipSection(sectionId: HomeSidebarSectionID.status"#),
            let sourceTypeRange = source.range(of: #"homeSidebarChipSection(sectionId: HomeSidebarSectionID.sourceType"#),
            let tagsRange = source.range(of: #"homeSidebarChipSection(sectionId: HomeSidebarSectionID.tags"#),
            let agentsRange = source.range(of: #"homeSidebarChipSection(sectionId: HomeSidebarSectionID.agents"#),
            let projectsRange = source.range(of: "homeProjectScopeList")
        else {
            XCTFail("Expected sidebar sections were not found")
            return
        }

        XCTAssertLessThan(statusRange.lowerBound, sourceTypeRange.lowerBound)
        XCTAssertLessThan(sourceTypeRange.lowerBound, tagsRange.lowerBound)
        XCTAssertLessThan(tagsRange.lowerBound, agentsRange.lowerBound)
        XCTAssertLessThan(agentsRange.lowerBound, projectsRange.lowerBound)
    }

    func testHomeSidebarUsesCollapsedHorizontalRowsWithoutScrollIndicators() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let sectionStart = source.range(of: "private func homeSidebarChipSection("),
            let sectionEnd = source.range(of: "\n    private func homeSidebarChip(", range: sectionStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected homeSidebarChipSection function was not found")
            return
        }

        let sectionSource = String(source[sectionStart.lowerBound..<sectionEnd.lowerBound])
        guard let collapsedStart = sectionSource.range(of: "} else {") else {
            XCTFail("Expected collapsed sidebar chip branch was not found")
            return
        }
        let collapsedBranch = String(sectionSource[collapsedStart.upperBound...])

        XCTAssertTrue(source.contains("showsIndicators: false"))
        XCTAssertTrue(collapsedBranch.contains("ScrollView(.horizontal, showsIndicators: false)"))
        XCTAssertTrue(collapsedBranch.contains("LazyHStack(spacing: 6)"))
        XCTAssertTrue(source.contains("WrappingHStack(horizontalSpacing: 6, verticalSpacing: 6)"))
        XCTAssertFalse(source.contains("homeFilterDivider(theme: theme)"))
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

import XCTest
@testable import SkillFlowDesktop

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

        XCTAssertTrue(home.contains("TextField(placeholder, text: $draft)"))
        XCTAssertTrue(home.contains(".accessibilityLabel(title)"))
        XCTAssertFalse(home.contains("Text(hint)"))
        XCTAssertFalse(home.contains("rename.dialog.reset_hint"))
    }

    func testDetailGroupHeaderKeepsRenameAndUpdateInSingleActionRow() throws {
        let detail = try sourceText(at: "Sources/DesktopApp/Screens/Detail/DetailScreen.swift")

        XCTAssertTrue(detail.contains("detailHeaderActionButtons("))
        XCTAssertTrue(detail.contains("detailHeaderIconButton(systemName: \"pencil\""))
        XCTAssertTrue(detail.contains("detailHeaderIconButton(actionIcon: .update"))
        XCTAssertFalse(detail.contains(".overlay(alignment: .trailing)"))
    }

    func testOriginalNameInfoUsesImmediateHoverTooltipInsteadOfSystemHelpDelay() throws {
        let cards = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")
        let detail = try sourceText(at: "Sources/DesktopApp/Screens/Detail/DetailScreen.swift")

        XCTAssertTrue(cards.contains("struct OriginalNameInfoIcon"))
        XCTAssertTrue(cards.contains(".onHover { hovering in"))
        XCTAssertTrue(cards.contains("OriginalNameInfoIcon(text: originalNameHelpText ?? \"\", theme: theme)"))
        XCTAssertTrue(detail.contains("OriginalNameInfoIcon(text: originalNameHelpText, theme: theme)"))
        XCTAssertFalse(cards.contains(".help(originalNameHelpText ?? \"\")"))
        XCTAssertFalse(detail.contains(".help(L10n.string(\"group_card.original_name\""))
    }

    func testOriginalNameInfoTooltipEscapesGroupCardClipping() throws {
        let cards = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

        XCTAssertTrue(cards.contains(".popover("))
        XCTAssertTrue(cards.contains("isPresented: $isHovered"))
        XCTAssertFalse(cards.contains(".overlay(alignment: .top) {"))
    }

    func testOriginalNameInfoTooltipDebouncesHoverExitWithoutReplayAnimation() throws {
        let cards = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

        XCTAssertTrue(cards.contains("hoverDismissTask"))
        XCTAssertTrue(cards.contains("Task.sleep(for: .milliseconds(180))"))
        XCTAssertFalse(cards.contains("withAnimation(.easeOut(duration: 0.08))"))
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
            let statusRange = source.range(of: #"sectionId: HomeSidebarSectionID.status"#),
            let sourceTypeRange = source.range(of: #"sectionId: HomeSidebarSectionID.sourceType"#),
            let tagsRange = source.range(of: #"sectionId: HomeSidebarSectionID.tags"#),
            let agentsRange = source.range(of: #"sectionId: HomeSidebarSectionID.agents"#),
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

    func testHomeSidebarSectionToggleAccessibilityLabelDescribesTargetSection() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let sectionStart = source.range(of: "private func homeSidebarChipSection("),
            let sectionEnd = source.range(of: "\n    private func homeSidebarChip(", range: sectionStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected homeSidebarChipSection function was not found")
            return
        }

        let sectionSource = String(source[sectionStart.lowerBound..<sectionEnd.lowerBound])

        XCTAssertFalse(sectionSource.contains(#".accessibilityLabel(expanded ? t("home.sidebar.collapse") : t("home.sidebar.expand"))"#))
        XCTAssertTrue(sectionSource.contains(#""\(expanded ? t("home.sidebar.collapse") : t("home.sidebar.expand")): \(title)""#))
    }

    func testHomeSidebarUsesSurfaceBackgroundAndKeepsTrailingDivider() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let sidebarStart = source.range(of: "private func homeSidebarColumn("),
            let contentStart = source.range(of: "\n    private var homeSidebarHeader", range: sidebarStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected home sidebar column block was not found")
            return
        }

        let sidebarBlock = String(source[sidebarStart.lowerBound..<contentStart.lowerBound])

        XCTAssertTrue(sidebarBlock.contains(".background(AppTheme.surface(for: theme))"))
        XCTAssertTrue(sidebarBlock.contains(".overlay(alignment: .trailing)"))
        XCTAssertTrue(sidebarBlock.contains(".fill(AppTheme.cardBorder(for: theme))"))
        XCTAssertFalse(sidebarBlock.contains(".background(AppTheme.headerBackground(for: theme))"))
    }

    func testHomeSidebarOnlyTagChipOptionsUseHashPrefix() throws {
        XCTAssertEqual(HomeSidebarChipTitleFormatter.displayTitle("全部", showsHashPrefix: false), "全部")
        XCTAssertEqual(HomeSidebarChipTitleFormatter.displayTitle("Dev", showsHashPrefix: true), "#Dev")

        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let statusStart = source.range(of: "private func homeStatusChipItems()"),
            let sourceTypeStart = source.range(of: "private func homeSourceTypeChipItems()"),
            let tagStart = source.range(of: "private func homeTagChipItems("),
            let agentStart = source.range(of: "private func homeAgentChipItems()"),
            let chipSectionStart = source.range(of: "private func homeSidebarChipSection("),
            let pillStart = source.range(of: "private func homeFilterPill("),
            let pillEnd = source.range(of: "\n    private func t(", range: pillStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected home sidebar chip builders were not found")
            return
        }

        let statusSource = String(source[statusStart.lowerBound..<sourceTypeStart.lowerBound])
        let sourceTypeSource = String(source[sourceTypeStart.lowerBound..<tagStart.lowerBound])
        let tagSource = String(source[tagStart.lowerBound..<agentStart.lowerBound])
        let agentSource = String(source[agentStart.lowerBound..<chipSectionStart.lowerBound])
        let pillSource = String(source[pillStart.lowerBound..<pillEnd.lowerBound])

        XCTAssertTrue(statusSource.contains("showsHashPrefix: false"))
        XCTAssertFalse(statusSource.contains("showsHashPrefix: true"))
        XCTAssertTrue(sourceTypeSource.contains("showsHashPrefix: false"))
        XCTAssertFalse(sourceTypeSource.contains("showsHashPrefix: true"))
        XCTAssertTrue(agentSource.contains("showsHashPrefix: false"))
        XCTAssertFalse(agentSource.contains("showsHashPrefix: true"))
        XCTAssertTrue(tagSource.contains("showsHashPrefix: true"))
        XCTAssertFalse(pillSource.contains("Text(\"#\\(title)\")"))
        XCTAssertTrue(pillSource.contains("HomeSidebarChipTitleFormatter.displayTitle(title, showsHashPrefix: showsHashPrefix)"))
    }

    func testHomeSidebarOnlyTagSectionEnablesTagReordering() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(source.contains("onMoveTag: { sourceTagID, targetTagID, placement in"))
        XCTAssertTrue(source.contains("homeContainer.moveHomeTag(sourceTagID: sourceTagID, targetTagID: targetTagID, placement: placement)"))
        XCTAssertTrue(source.contains("HomeSidebarTagDropDelegate"))

        guard
            let statusSection = source.range(of: "sectionId: HomeSidebarSectionID.status"),
            let sourceTypeSection = source.range(of: "sectionId: HomeSidebarSectionID.sourceType"),
            let tagSection = source.range(of: "sectionId: HomeSidebarSectionID.tags"),
            let agentSection = source.range(of: "sectionId: HomeSidebarSectionID.agents"),
            let projectSection = source.range(of: "homeSidebarProjectSection", range: agentSection.upperBound..<source.endIndex)
        else {
            XCTFail("Expected Home sidebar sections were not found")
            return
        }

        let statusBlock = String(source[statusSection.lowerBound..<sourceTypeSection.lowerBound])
        let sourceTypeBlock = String(source[sourceTypeSection.lowerBound..<tagSection.lowerBound])
        let tagBlock = String(source[tagSection.lowerBound..<agentSection.lowerBound])
        let agentBlock = String(source[agentSection.lowerBound..<projectSection.lowerBound])

        XCTAssertTrue(tagBlock.contains("onMoveTag:"))
        XCTAssertFalse(statusBlock.contains("onMoveTag:"))
        XCTAssertFalse(sourceTypeBlock.contains("onMoveTag:"))
        XCTAssertFalse(agentBlock.contains("onMoveTag:"))
    }

    func testHomeLayoutUsesIntegratedSidebarHeaderShell() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(source.contains("private func homeShell(layout: LayoutMetrics) -> some View"))
        XCTAssertTrue(source.contains("homeSidebarColumn(homeTagSnapshot: homeTagSnapshot)"))
        XCTAssertTrue(source.contains("if isHomeSidebarVisible {"))
        XCTAssertTrue(source.contains("homeMainColumn(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards, isSidebarVisible: isHomeSidebarVisible)"))
        XCTAssertFalse(source.contains("homeSidebarRail"))
        XCTAssertTrue(source.contains("if isHomePage {"))
        XCTAssertTrue(source.contains("homeShell(layout: layout)"))
        XCTAssertTrue(source.contains("nonHomeShell(layout: layout)"))

        guard
            let bodyStart = source.range(of: "Group {\n                    if isHomePage {"),
            let bodyEnd = source.range(of: "\n                if isEditCustomAgentPresented", range: bodyStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected root route shell block was not found")
            return
        }

        let bodySource = String(source[bodyStart.lowerBound..<bodyEnd.lowerBound])

        XCTAssertFalse(bodySource.contains("topBar(layout: layout)\n                    pageContent(layout: layout)"))
    }

    func testHomeShellExtendsIntoHiddenTitlebarSafeArea() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let shellStart = source.range(of: "private func homeShell(layout: LayoutMetrics) -> some View"),
            let shellEnd = source.range(of: "\n    private func homeMainColumn", range: shellStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected homeShell block was not found")
            return
        }

        let shellSource = String(source[shellStart.lowerBound..<shellEnd.lowerBound])

        XCTAssertTrue(shellSource.contains(".ignoresSafeArea(.container, edges: .top)"))
    }

    func testNonHomeShellExtendsIntoHiddenTitlebarSafeArea() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let shellStart = source.range(of: "private func nonHomeShell(layout: LayoutMetrics) -> some View"),
            let shellEnd = source.range(of: "\n    private var topBarTitleRow", range: shellStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected nonHomeShell block was not found")
            return
        }

        let shellSource = String(source[shellStart.lowerBound..<shellEnd.lowerBound])

        XCTAssertTrue(shellSource.contains("topBar(layout: layout)"))
        XCTAssertTrue(shellSource.contains("pageContent(layout: layout)"))
        XCTAssertTrue(shellSource.contains(".ignoresSafeArea(.container, edges: .top)"))
    }

    func testNonHomeHeaderReservesTrafficLightLeadingInset() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let topBarStart = source.range(of: "private func topBar(layout: LayoutMetrics) -> some View"),
            let nonHomeBranchStart = source.range(of: "} else if isImportPage {", range: topBarStart.upperBound..<source.endIndex),
            let topBarEnd = source.range(of: "\n        }\n    }\n\n    private func nonHomeShell", range: nonHomeBranchStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected non-home topBar branches were not found")
            return
        }

        let nonHomeTopBarSource = String(source[nonHomeBranchStart.lowerBound..<topBarEnd.lowerBound])

        XCTAssertTrue(source.contains("static let nonHomeHeaderLeadingPadding: CGFloat = homeSidebarTrafficLightLeadingInset + homeCollapsedHeaderButtonGap"))
        XCTAssertTrue(source.contains("static let nonHomeHeaderTrailingPadding: CGFloat = homeMainHeaderSidePadding"))
        XCTAssertTrue(nonHomeTopBarSource.contains(".padding(.leading, Self.nonHomeHeaderLeadingPadding)"))
        XCTAssertTrue(nonHomeTopBarSource.contains(".padding(.trailing, Self.nonHomeHeaderTrailingPadding)"))
        XCTAssertFalse(nonHomeTopBarSource.contains(".padding(.horizontal, 16)"))
    }

    func testHomeShellDoesNotPlaceGlobalTapGestureOverHeaderControls() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let shellStart = source.range(of: "private func homeShell(layout: LayoutMetrics) -> some View"),
            let shellEnd = source.range(of: "\n    private func homeMainColumn", range: shellStart.upperBound..<source.endIndex),
            let contentStart = source.range(of: "private func homeContent("),
            let contentEnd = source.range(of: "\n    private func gridSection", range: contentStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected home shell/content blocks were not found")
            return
        }

        let shellSource = String(source[shellStart.lowerBound..<shellEnd.lowerBound])
        let contentSource = String(source[contentStart.lowerBound..<contentEnd.lowerBound])

        XCTAssertFalse(shellSource.contains(".contentShape(Rectangle())"))
        XCTAssertFalse(shellSource.contains(".onTapGesture"))
        XCTAssertTrue(contentSource.contains(".background(groupTagEditorDismissTapArea)"))
        XCTAssertTrue(source.contains("private var groupTagEditorDismissTapArea: some View"))
    }

    func testMainWindowUsesFullSizeContentViewForClickableTitlebarControls() throws {
        let source = try sourceText(at: "Sources/DesktopApp/App/SkillFlowDesktopApp.swift")

        XCTAssertTrue(source.contains(".background(WindowTitlebarConfigurator())"))
        XCTAssertTrue(source.contains("window.styleMask.insert(.fullSizeContentView)"))
        XCTAssertTrue(source.contains("window.titlebarAppearsTransparent = true"))
        XCTAssertTrue(source.contains("window.titleVisibility = .hidden"))
        XCTAssertTrue(source.contains("window.titlebarSeparatorStyle = .none"))
        XCTAssertTrue(source.contains("window.isMovableByWindowBackground = false"))
    }

    func testMainWindowAlignsTrafficLightsWithHomeHeaderControls() throws {
        let source = try sourceText(at: "Sources/DesktopApp/App/SkillFlowDesktopApp.swift")

        XCTAssertTrue(source.contains("private static let titlebarTrafficLightVerticalOffset: CGFloat = -8"))
        XCTAssertTrue(source.contains("private static var originalTrafficLightOrigins: [NSWindow.ButtonType: NSPoint] = [:]"))
        XCTAssertTrue(source.contains("alignTrafficLightButtons(in: window)"))
        XCTAssertTrue(source.contains("let buttonTypes: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]"))
        XCTAssertTrue(source.contains("guard let button = window.standardWindowButton(buttonType) else"))
        XCTAssertTrue(source.contains("Self.originalTrafficLightOrigins[buttonType] = button.frame.origin"))
        XCTAssertTrue(source.contains("let alignedOrigin = NSPoint("))
        XCTAssertTrue(source.contains("x: originalOrigin.x,"))
        XCTAssertTrue(source.contains("y: originalOrigin.y + Self.titlebarTrafficLightVerticalOffset"))
        XCTAssertTrue(source.contains("button.setFrameOrigin(alignedOrigin)"))
    }

    func testMainWindowRealignsTrafficLightsAfterWindowLayoutChanges() throws {
        let source = try sourceText(at: "Sources/DesktopApp/App/SkillFlowDesktopApp.swift")

        XCTAssertTrue(source.contains("func makeCoordinator() -> Coordinator"))
        XCTAssertTrue(source.contains("context.coordinator.configure(window: window)"))
        XCTAssertTrue(source.contains("final class Coordinator"))
        XCTAssertTrue(source.contains("NSWindow.didResizeNotification"))
        XCTAssertTrue(source.contains("NSWindow.didEndLiveResizeNotification"))
        XCTAssertTrue(source.contains("NSWindow.didExitFullScreenNotification"))
        XCTAssertTrue(source.contains("NSWindow.didBecomeKeyNotification"))
        XCTAssertTrue(source.contains("scheduleTitlebarRealignment(for: window)"))
        XCTAssertTrue(source.contains("DispatchQueue.main.asyncAfter(deadline: .now() + 0.05)"))
    }

    func testHomeHeadersAlignControlsWithNativeTrafficLights() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let mainHeaderStart = source.range(of: "private func homeMainHeader(layout: LayoutMetrics, isSidebarVisible: Bool) -> some View"),
            let mainHeaderEnd = source.range(of: "\n    private func configPage", range: mainHeaderStart.upperBound..<source.endIndex),
            let sidebarHeaderStart = source.range(of: "private var homeSidebarHeader: some View"),
            let sidebarHeaderEnd = source.range(of: "\n    private var homeSidebarToggleButton", range: sidebarHeaderStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected home header blocks were not found")
            return
        }

        let mainHeaderSource = String(source[mainHeaderStart.lowerBound..<mainHeaderEnd.lowerBound])
        let sidebarHeaderSource = String(source[sidebarHeaderStart.lowerBound..<sidebarHeaderEnd.lowerBound])

        XCTAssertTrue(source.contains("static let homeTitlebarControlTopPadding: CGFloat = 8"))
        XCTAssertTrue(mainHeaderSource.contains(".padding(.top, Self.homeTitlebarControlTopPadding)"))
        XCTAssertTrue(mainHeaderSource.contains(".frame(height: Self.homeSidebarHeaderHeight, alignment: .top)"))
        XCTAssertTrue(sidebarHeaderSource.contains(".padding(.top, Self.homeTitlebarControlTopPadding)"))
        XCTAssertTrue(sidebarHeaderSource.contains(".frame(height: Self.homeSidebarHeaderHeight, alignment: .top)"))
    }

    func testHomeSidebarHeaderAndFullCollapseToggleAreAvailable() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(source.contains("@State private var isHomeSidebarVisible = true"))
        XCTAssertTrue(source.contains("private var homeSidebarHeader: some View"))
        XCTAssertTrue(source.contains("private var homeSidebarToggleButton: some View"))
        XCTAssertTrue(source.contains("headerLogoRow"))
        XCTAssertTrue(source.contains("isHomeSidebarVisible.toggle()"))
        XCTAssertTrue(source.contains(".accessibilityLabel(isHomeSidebarVisible ? \"Hide sidebar\" : \"Show sidebar\")"))
        XCTAssertFalse(source.contains("private var homeSidebarRail: some View"))
        XCTAssertFalse(source.contains("homeSidebarRailWidth"))
    }

    func testHomeMainHeaderOmitsTitleKeepsActionsAndShowsCollapsedToggle() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let headerStart = source.range(of: "private func homeMainHeader(layout: LayoutMetrics, isSidebarVisible: Bool) -> some View"),
            let headerEnd = source.range(of: "\n    private func configPage", range: headerStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected homeMainHeader was not found")
            return
        }

        let headerSource = String(source[headerStart.lowerBound..<headerEnd.lowerBound])

        XCTAssertTrue(headerSource.contains("if !isSidebarVisible {"))
        XCTAssertTrue(headerSource.contains("homeSidebarToggleButton"))
        XCTAssertTrue(headerSource.contains("headerLogoRow"))
        XCTAssertTrue(headerSource.contains(".frame(width: Self.homeMainHeaderBrandWidth, alignment: .leading)"))
        XCTAssertTrue(headerSource.contains("homeSearchField(width: searchWidth)"))
        XCTAssertTrue(headerSource.contains("importButton"))
        XCTAssertTrue(headerSource.contains("homeUpdateButton"))
        XCTAssertTrue(headerSource.contains("settingsButton"))
        XCTAssertTrue(headerSource.contains("includesSidebarToggle: !isSidebarVisible"))
        XCTAssertFalse(headerSource.contains("topBarTitleRow"))
    }

    func testHomeSidebarHeaderOmitsBrandAndKeepsToggleInTrafficLightRow() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let headerStart = source.range(of: "private var homeSidebarHeader: some View"),
            let headerEnd = source.range(of: "\n    private var homeSidebarToggleButton", range: headerStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected homeSidebarHeader block was not found")
            return
        }

        let headerSource = String(source[headerStart.lowerBound..<headerEnd.lowerBound])

        XCTAssertFalse(headerSource.contains("headerLogoRow"))
        XCTAssertFalse(headerSource.contains("VStack(alignment: .leading, spacing: Self.homeSidebarHeaderRowSpacing)"))
        XCTAssertTrue(headerSource.contains("homeSidebarToggleButton"))
        XCTAssertTrue(headerSource.contains(".frame(height: Self.homeSidebarToggleButtonSize, alignment: .top)"))
        XCTAssertTrue(headerSource.contains("Spacer(minLength: 0)"))
        XCTAssertTrue(headerSource.contains(".padding(.horizontal, Self.homeSidebarHorizontalPadding)"))
        XCTAssertFalse(headerSource.contains("homeSidebarBrandLeadingInset"))
    }

    func testHomeMainHeaderSearchWidthFitsNarrowIntegratedSidebar() throws {
        let visibleSidebarMainWidth = MainView.homeMainColumnWidth(forWindowWidth: 620, isSidebarVisible: true)
        let collapsedSidebarMainWidth = MainView.homeMainColumnWidth(forWindowWidth: 620, isSidebarVisible: false)
        let visibleReservedPadding = MainView.homeMainHeaderHorizontalPadding
        let collapsedReservedPadding = MainView.homeCollapsedHeaderLeadingPadding + MainView.homeMainHeaderSidePadding

        XCTAssertEqual(visibleSidebarMainWidth, 620 - MainView.homeSidebarNarrowWidth)
        XCTAssertEqual(collapsedSidebarMainWidth, 620)
        XCTAssertEqual(visibleReservedPadding, 32)
        XCTAssertEqual(collapsedReservedPadding, 96)

        let visibleSidebarSearchWidth = MainView.homeMainHeaderSearchWidth(
            forMainColumnWidth: visibleSidebarMainWidth,
            reservedHorizontalPadding: visibleReservedPadding,
            includesSidebarToggle: false
        )
        let collapsedSidebarSearchWidth = MainView.homeMainHeaderSearchWidth(
            forMainColumnWidth: collapsedSidebarMainWidth,
            reservedHorizontalPadding: collapsedReservedPadding,
            includesSidebarToggle: true
        )
        let visibleFixedHeaderControlsWidth = MainView.fixedHomeMainHeaderControlsWidth(
            reservedHorizontalPadding: visibleReservedPadding,
            includesSidebarToggle: false
        )
        let collapsedFixedHeaderControlsWidth = MainView.fixedHomeMainHeaderControlsWidth(
            reservedHorizontalPadding: collapsedReservedPadding,
            includesSidebarToggle: true
        )

        XCTAssertGreaterThan(visibleSidebarSearchWidth, 0)
        XCTAssertGreaterThanOrEqual(collapsedSidebarSearchWidth, MainView.homeMainHeaderMinimumSearchFieldWidth)
        XCTAssertLessThanOrEqual(visibleSidebarSearchWidth + visibleFixedHeaderControlsWidth, visibleSidebarMainWidth)
        XCTAssertLessThanOrEqual(collapsedSidebarSearchWidth + collapsedFixedHeaderControlsWidth, collapsedSidebarMainWidth)
        XCTAssertLessThanOrEqual(visibleSidebarSearchWidth, MainView.headerSearchFieldWidth)
        XCTAssertLessThanOrEqual(collapsedSidebarSearchWidth, MainView.headerSearchFieldWidth)
        XCTAssertLessThanOrEqual(
            MainView.homeMainHeaderSearchWidth(
                forMainColumnWidth: 860 - MainView.homeSidebarRegularWidth,
                reservedHorizontalPadding: visibleReservedPadding,
                includesSidebarToggle: false
            ),
            MainView.headerSearchFieldWidth
        )
    }

    func testHomeMainHeaderSearchWidthGuaranteeBoundaryIsAtFixedControlsWidth() throws {
        let reservedPadding = MainView.homeCollapsedHeaderLeadingPadding + MainView.homeMainHeaderSidePadding
        let fixedControlsWidth = MainView.fixedHomeMainHeaderControlsWidth(
            reservedHorizontalPadding: reservedPadding,
            includesSidebarToggle: true
        )

        let belowFixedControlsWidth = MainView.homeMainHeaderSearchWidth(
            forMainColumnWidth: fixedControlsWidth - 1,
            reservedHorizontalPadding: reservedPadding,
            includesSidebarToggle: true
        )
        let atFixedControlsWidth = MainView.homeMainHeaderSearchWidth(
            forMainColumnWidth: fixedControlsWidth,
            reservedHorizontalPadding: reservedPadding,
            includesSidebarToggle: true
        )
        let belowMinimumSearchBudget = MainView.homeMainHeaderSearchWidth(
            forMainColumnWidth: fixedControlsWidth + MainView.homeMainHeaderMinimumSearchFieldWidth - 1,
            reservedHorizontalPadding: reservedPadding,
            includesSidebarToggle: true
        )

        XCTAssertEqual(belowFixedControlsWidth, 0)
        XCTAssertEqual(atFixedControlsWidth, 0)
        XCTAssertEqual(belowMinimumSearchBudget, MainView.homeMainHeaderMinimumSearchFieldWidth - 1)
        XCTAssertLessThanOrEqual(atFixedControlsWidth + fixedControlsWidth, fixedControlsWidth)
        XCTAssertLessThanOrEqual(
            belowMinimumSearchBudget + fixedControlsWidth,
            fixedControlsWidth + MainView.homeMainHeaderMinimumSearchFieldWidth - 1
        )
    }

    func testHomeGridWidthFollowsSidebarVisibility() throws {
        let expandedRegularWidth = MainView.homeGridAvailableWidth(forWindowWidth: 1200, isSidebarVisible: true)
        let collapsedRegularWidth = MainView.homeGridAvailableWidth(forWindowWidth: 1200, isSidebarVisible: false)

        XCTAssertEqual(expandedRegularWidth, 1200 - MainView.homeSidebarRegularWidth - MainView.homeGridHorizontalPadding)
        XCTAssertEqual(collapsedRegularWidth, 1200 - MainView.homeGridHorizontalPadding)
        XCTAssertGreaterThan(collapsedRegularWidth, expandedRegularWidth)

        XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 900, isSidebarVisible: true), 2)
        XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 900, isSidebarVisible: false), 2)
        XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 1180, isSidebarVisible: true), 2)
        XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 1180, isSidebarVisible: false), 3)
        XCTAssertEqual(MainView.homeGridColumnCount(forWindowWidth: 1800, isSidebarVisible: false), 4)
    }

    func testHomeSidebarTopRowsReserveTrafficLightInsetWithoutHiddenRail() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertEqual(MainView.homeSidebarTrafficLightLeadingInset, 68)
        XCTAssertEqual(MainView.homeCollapsedHeaderButtonGap, 12)
        XCTAssertEqual(
            MainView.homeCollapsedHeaderLeadingPadding,
            MainView.homeSidebarTrafficLightLeadingInset + MainView.homeCollapsedHeaderButtonGap
        )
        XCTAssertFalse(source.contains("homeSidebarRailWidth"))
        XCTAssertFalse(source.contains("homeSidebarBrandLeadingInset"))

        guard
            let sidebarHeaderStart = source.range(of: "private var homeSidebarHeader: some View"),
            let sidebarHeaderEnd = source.range(of: "\n    private var homeSidebarToggleButton", range: sidebarHeaderStart.upperBound..<source.endIndex),
            let mainHeaderStart = source.range(of: "private func homeMainHeader(layout: LayoutMetrics, isSidebarVisible: Bool) -> some View"),
            let mainHeaderEnd = source.range(of: "\n    private func configPage", range: mainHeaderStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected home sidebar and main header blocks were not found")
            return
        }

        let sidebarHeaderSource = String(source[sidebarHeaderStart.lowerBound..<sidebarHeaderEnd.lowerBound])
        let mainHeaderSource = String(source[mainHeaderStart.lowerBound..<mainHeaderEnd.lowerBound])

        XCTAssertTrue(sidebarHeaderSource.contains(".padding(.horizontal, Self.homeSidebarHorizontalPadding)"))
        XCTAssertTrue(sidebarHeaderSource.contains(".frame(height: Self.homeSidebarToggleButtonSize, alignment: .top)"))
        XCTAssertFalse(sidebarHeaderSource.contains("headerLogoRow"))
        XCTAssertFalse(sidebarHeaderSource.contains("VStack(alignment: .leading, spacing: Self.homeSidebarHeaderRowSpacing)"))
        XCTAssertTrue(mainHeaderSource.contains("Self.homeCollapsedHeaderLeadingPadding"))
        XCTAssertTrue(mainHeaderSource.contains("headerLogoRow"))
        XCTAssertTrue(mainHeaderSource.contains("Self.homeMainHeaderBrandWidth"))
        XCTAssertTrue(mainHeaderSource.contains("if !isSidebarVisible {"))
    }

    func testHomeSidebarWidthAndChipBleedAreExplicit() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(source.contains("static let homeSidebarRegularWidth: CGFloat = 244"))
        XCTAssertTrue(source.contains("static let homeSidebarNarrowWidth: CGFloat = 208"))
        XCTAssertTrue(source.contains("static let homeSidebarHeaderHeight: CGFloat = 52"))
        XCTAssertTrue(source.contains("static let homeMainHeaderBrandWidth: CGFloat = 132"))
        let appNameWidth = ceil(("Skill Flow" as NSString).size(withAttributes: [
            .font: NSFont.systemFont(ofSize: 17, weight: .semibold)
        ]).width)
        XCTAssertGreaterThanOrEqual(MainView.homeMainHeaderBrandWidth, 30 + 8 + appNameWidth + 12)
        XCTAssertFalse(source.contains("homeSidebarHeaderRowSpacing"))
        XCTAssertTrue(source.contains("static let homeCollapsedHeaderButtonGap: CGFloat = 12"))
        XCTAssertTrue(source.contains("static let homeCollapsedHeaderLeadingPadding: CGFloat = homeSidebarTrafficLightLeadingInset + homeCollapsedHeaderButtonGap"))
        XCTAssertFalse(source.contains("homeSidebarRailWidth"))
        XCTAssertTrue(source.contains("static let homeSidebarHorizontalPadding: CGFloat = 12"))
        XCTAssertTrue(source.contains("static let homeSidebarChipBleed: CGFloat = 12"))
        XCTAssertTrue(source.contains("static let homeGridHorizontalPadding: CGFloat = 32"))
        XCTAssertTrue(source.contains("homeGridAvailableWidth("))
        XCTAssertTrue(source.contains("homeGridColumnCount("))
        XCTAssertTrue(source.contains("homeGridFrameWidth("))
        XCTAssertTrue(source.contains(".padding(.horizontal, Self.homeSidebarHorizontalPadding)"))
        XCTAssertTrue(source.contains(".padding(.horizontal, Self.homeSidebarChipBleed)"))
        XCTAssertTrue(source.contains(".padding(.horizontal, -Self.homeSidebarChipBleed)"))
    }

    func testHomeSidebarSectionChevronAlignsWithSidebarToggleButtonColumn() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        guard
            let sectionStart = source.range(of: "private func homeSidebarChipSection("),
            let sectionEnd = source.range(of: "\n    private func homeSidebarChip(", range: sectionStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected homeSidebarChipSection block was not found")
            return
        }

        let sectionSource = String(source[sectionStart.lowerBound..<sectionEnd.lowerBound])

        XCTAssertTrue(sectionSource.contains("Image(systemName: expanded ? \"chevron.down\" : \"chevron.right\")"))
        XCTAssertTrue(sectionSource.contains(".frame(width: Self.homeSidebarToggleButtonSize, alignment: .center)"))
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

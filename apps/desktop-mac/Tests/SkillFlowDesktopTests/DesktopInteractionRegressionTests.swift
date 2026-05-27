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

        XCTAssertTrue(home.contains("homeProjectScopeBar"))
        XCTAssertTrue(home.contains("homeProjectScopeRefreshButton"))
        XCTAssertTrue(home.contains("homeProjectScopeRefreshButtonSize"))
        XCTAssertTrue(home.contains("projectScopeRefreshButtonRotation"))
        XCTAssertTrue(home.contains(".desktopMotionChip("))
    }

    func testHeaderOmitsObsoleteProjectToggleButtonButKeepsHiddenWarningHook() throws {
        let home = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertFalse(home.contains("projectScopeToggleButton"))
        XCTAssertFalse(home.contains("showsProjectScopeBar"))
        XCTAssertTrue(home.contains("showsProjectScopeHiddenWarning"))
        XCTAssertTrue(home.contains("showsAlertBadge"))
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

    private func sourceText(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }
}

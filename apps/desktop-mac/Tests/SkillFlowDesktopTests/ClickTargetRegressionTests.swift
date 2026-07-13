import XCTest

final class ClickTargetRegressionTests: XCTestCase {
    func testSettingsActionButtonsDoNotApplyChromeOutsidePlainButtonLabel() throws {
        let source = try sourceText(
            at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift"
        )

        XCTAssertFalse(
            matches(
                source,
                pattern: #"Button\(t\("settings\.action\.(check_updates|open_releases|clear_cache|reset_configuration)"\)\)\s*\{[\s\S]*?\}\s*\.buttonStyle\(\.plain\)\s*\.font\(\.system\(size:\s*12,\s*weight:\s*\.semibold\)\)\s*\.foregroundStyle\(AppTheme\.brand\(for:\s*currentAccent,\s*in:\s*theme\)\)\s*\.frame\(width:\s*controlColumnWidth,\s*height:\s*32\)"#
            )
        )
    }

    func testDetailSkillRowToggleDoesNotApplyChromeOutsidePlainButtonLabel() throws {
        let source = try sourceText(
            at: "Sources/DesktopApp/Screens/Detail/DetailScreen.swift"
        )

        XCTAssertFalse(
            matches(
                source,
                pattern: #"Button\(skill\.isEnabled\s*\?\s*t\("common\.selection\.on"\)\s*:\s*t\("common\.selection\.off"\)\)\s*\{[\s\S]*?\}\s*\.buttonStyle\(\.plain\)\s*\.font\(\.system\(size:\s*10,\s*weight:\s*\.bold\)\)\s*\.frame\(width:\s*detailToggleWidth,\s*height:\s*detailToggleHeight\)\s*\.background\(AppTheme\.selectionControlFill\(skill\.isEnabled\s*\?\s*\.full\s*:\s*\.empty,\s*for:\s*theme\)\)\s*\.clipShape\(RoundedRectangle\(cornerRadius:\s*8\)\)\s*\.foregroundStyle\(AppTheme\.selectionControlText\(skill\.isEnabled\s*\?\s*\.full\s*:\s*\.empty,\s*for:\s*theme\)\)"#
            )
        )
    }

    func testGroupCardHeaderButtonUsesDedicatedFullWidthLabel() throws {
        let source = try sourceText(
            at: "Sources/DesktopApp/Components/GroupCardComponents.swift"
        )

        XCTAssertTrue(source.contains("headerPrimaryButtonLabel"))
        XCTAssertFalse(source.contains("Button(action: onOpen) {\n                        headerPrimaryContent\n                    }"))
    }

    func testGroupCardDetailOpenIsHeaderScopedNotWholeCard() throws {
        let card = try sourceText(
            at: "Sources/DesktopApp/Components/GroupCardComponents.swift"
        )
        let policy = try sourceText(
            at: "Sources/DesktopApp/Components/DesktopInteractionMotion.swift"
        )

        XCTAssertTrue(card.contains("headerPrimaryButtonLabel"))
        XCTAssertTrue(card.contains("headerStatsRow"))
        XCTAssertTrue(card.contains("including: clickPolicy.allowsWholeCardTap ? .gesture : .none"))
        XCTAssertTrue(policy.contains("static func allowsWholeCardTap(for policy: DesktopCardClickPolicy) -> Bool {\n        false\n    }"))
    }

    func testGroupCardActionMenuOnlyRendersRenameWhenHandlerExists() throws {
        let source = try sourceText(
            at: "Sources/DesktopApp/Components/GroupCardComponents.swift"
        )

        XCTAssertTrue(source.contains("if let onRename {"))
        XCTAssertFalse(source.contains("isEnabled: onRename != nil"))
        XCTAssertFalse(source.contains("isEnabled: Bool = true"))
        XCTAssertFalse(source.contains("guard isEnabled else { return }"))
        XCTAssertFalse(source.contains(".disabled(!isEnabled)"))
        XCTAssertFalse(source.contains(".opacity(isEnabled ? 1.0 : 0.45)"))
    }

    func testHomeAndImportSearchFieldsRenderClearButton() throws {
        let source = try sourceText(
            at: "Sources/DesktopApp/Screens/Home/MainView.swift"
        )

        XCTAssertTrue(source.contains("searchClearButton(isVisible: Self.shouldShowSearchClearButton(query: viewModel.searchQuery))"))
        XCTAssertTrue(source.contains("searchClearButton(isVisible: Self.shouldShowSearchClearButton(query: importScreenState.searchText))"))
        XCTAssertTrue(source.contains("await importContainer.clearSearch()"))
        XCTAssertTrue(source.contains("actionIcon(.close, size: 14)"))
        XCTAssertTrue(source.contains(".foregroundStyle(AppTheme.statusError(for: theme))"))
        XCTAssertTrue(source.contains(".frame(width: 22, height: 22)"))
    }

    func testGroupCardTargetIconsUseCroppedPaddedRendering() throws {
        let source = try sourceText(
            at: "Sources/DesktopApp/Components/GroupCardComponents.swift"
        )

        XCTAssertTrue(source.contains("cropToVisibleBounds: true"))
        XCTAssertTrue(source.contains(".padding(6)"))
        XCTAssertFalse(source.contains("targetId == \"hermes-agent\" || targetId == \"minimax-code\""))
    }

    private func sourceText(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func matches(_ source: String, pattern: String) -> Bool {
        source.range(of: pattern, options: .regularExpression) != nil
    }
}

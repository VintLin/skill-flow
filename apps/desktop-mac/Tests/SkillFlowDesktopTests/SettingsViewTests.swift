import AppKit
import SwiftUI
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class SettingsViewTests: XCTestCase {
    func testElevatedSettingsRowUsesRaisedZIndex() {
        XCTAssertEqual(SettingsView.rowZIndex(isElevated: true), 30)
        XCTAssertEqual(SettingsView.rowZIndex(isElevated: false), 0)
    }

    func testMaintenanceButtonsReuseDropdownControlBackground() {
        assertColorsEqual(
            SettingsView.controlBackground(for: .pageBackground, theme: .light),
            AppTheme.pageBackground(for: .light)
        )
        assertColorsEqual(
            SettingsView.controlBackground(for: .pageBackground, theme: .dark),
            AppTheme.pageBackground(for: .dark)
        )
    }

    func testAgentDisplayLocalizationKeysResolve() {
        XCTAssertNotEqual(L10n.string("settings.section.agent_display", locale: Locale(identifier: "en")), "settings.section.agent_display")
        XCTAssertNotEqual(L10n.string("settings.agent_display.empty", locale: Locale(identifier: "zh-Hans")), "settings.agent_display.empty")
        XCTAssertEqual(L10n.string("settings.section.agent_display", locale: Locale(identifier: "zh-Hans")), "代理显示")
    }

    func testCheckUpdatesLoadingIndicatorUsesCenteredControlColumnLayout() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertTrue(
            matches(
                source,
                pattern: #"if viewModel\.updateStatus == \.checking \{\s*settingsActionLoadingIndicator\(\)\s*\}"#
            )
        )
    }

    func testSettingsActionLoadingIndicatorReusesActionButtonChrome() throws {
        XCTAssertEqual(SettingsView.actionControlHeight, 32)
    }

    func testSettingsUsesSingleAgentsSectionWithInlineCustomAgentAction() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertTrue(source.contains("settings.section.agent_display"))
        XCTAssertTrue(source.contains("settings.action.add_custom_agent"))
        XCTAssertTrue(source.contains("EditCustomAgentSheet"))
        XCTAssertFalse(source.contains("ManageAgentsSheet"))
        XCTAssertFalse(source.contains("settings.section.custom_agents"))
    }

    func testAgentDisplayOnlyShowsInlineCustomEditActions() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertTrue(source.contains("settings.action.edit"))
        XCTAssertTrue(source.contains("settings.action.delete"))
        XCTAssertTrue(source.contains("settings.custom_agents.project_path_hint"))
        XCTAssertFalse(source.contains("settings.action.view"))
    }

    func testSettingsCustomAgentFormOmitsManualIdField() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertFalse(source.contains("TextField(\"ID\""))
        XCTAssertTrue(source.contains("t(\"settings.custom_agents.name_example\")"))
        XCTAssertTrue(source.contains("globalPathExample"))
        XCTAssertTrue(source.contains("projectPathExample"))
        XCTAssertTrue(source.contains(".frame(height: SettingsView.actionControlHeight)"))
        XCTAssertTrue(source.contains("RoundedRectangle(cornerRadius: 8)"))
    }

    func testCustomAgentEditorOverlayDismissesOnScrimTap() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(source.contains("EditCustomAgentSheet"))
        XCTAssertTrue(source.contains(".onTapGesture"))
        XCTAssertTrue(source.contains("closeCustomAgentEditor()"))
    }

    func testSettingsScreenNoLongerOwnsCustomAgentOverlay() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsScreen.swift")

        XCTAssertFalse(source.contains("Color.black.opacity"))
        XCTAssertFalse(source.contains("EditCustomAgentSheet"))
    }

    func testAgentDisplayRowShowsCustomActionsInline() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertTrue(source.contains("if !row.isBuiltIn"))
        XCTAssertTrue(source.contains("settings.action.edit"))
        XCTAssertTrue(source.contains("settings.action.delete"))
        XCTAssertFalse(source.contains("settings.action.view"))
    }

    func testSettingsViewDoesNotUseManageAgentsSheetOrNestedSheets() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertFalse(source.contains("ManageAgentsSheet("))
        XCTAssertFalse(source.contains("isManageAgentsPresented"))
        XCTAssertFalse(source.contains(".sheet(item: $activeSheet)"))
    }

    func testAgentDisplaySectionKeepsDirectAddButtonWithIcon() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertTrue(source.contains("actionIcon(.plus, size: 12)"))
        XCTAssertTrue(source.contains("settings.action.add_custom_agent"))
        XCTAssertFalse(source.contains("settings.manage_agents.title"))
    }

    func testCustomAgentFieldsUseSurfaceFillInsteadOfPageBackground() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Settings/SettingsView.swift")

        XCTAssertTrue(source.contains(".background(AppTheme.surface(for: theme))"))
    }

    private func assertColorsEqual(
        _ lhs: Color,
        _ rhs: Color,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let left = NSColor(lhs).usingColorSpace(.deviceRGB)
        let right = NSColor(rhs).usingColorSpace(.deviceRGB)

        XCTAssertNotNil(left, file: file, line: line)
        XCTAssertNotNil(right, file: file, line: line)
        XCTAssertEqual(left?.redComponent ?? -1, right?.redComponent ?? -2, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(left?.greenComponent ?? -1, right?.greenComponent ?? -2, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(left?.blueComponent ?? -1, right?.blueComponent ?? -2, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(left?.alphaComponent ?? -1, right?.alphaComponent ?? -2, accuracy: 0.001, file: file, line: line)
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

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
}

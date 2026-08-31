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

    func testSettingsActionLoadingIndicatorReusesActionButtonChrome() throws {
        XCTAssertEqual(SettingsView.actionControlHeight, 32)
    }

    func testSettingsScrollViewFillsWindowWidth() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: #function))
        defaults.removePersistentDomain(forName: #function)
        let viewModel = SettingsViewModel(
            state: DesktopAppState(),
            store: DesktopSettingsStore(userDefaults: defaults)
        )
        let hostingView = NSHostingView(
            rootView: SettingsScreen(
                viewModel: viewModel,
                theme: .light,
                detectedTargetIds: [],
                onEditCustomAgent: { _ in }
            )
        )
        hostingView.frame = NSRect(x: 0, y: 0, width: 1_200, height: 700)
        hostingView.layoutSubtreeIfNeeded()

        let scrollView = try XCTUnwrap(firstScrollView(in: hostingView))
        let frameInHost = hostingView.convert(scrollView.bounds, from: scrollView)

        XCTAssertEqual(frameInHost.minX, hostingView.bounds.minX, accuracy: 1)
        XCTAssertEqual(frameInHost.maxX, hostingView.bounds.maxX, accuracy: 1)
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

    private func firstScrollView(in view: NSView) -> NSScrollView? {
        if let scrollView = view as? NSScrollView {
            return scrollView
        }
        return view.subviews.lazy.compactMap(firstScrollView).first
    }

}

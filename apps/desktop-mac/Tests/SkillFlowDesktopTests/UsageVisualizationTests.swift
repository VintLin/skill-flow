import AppKit
import CoreGraphics
import SwiftUI
import XCTest
@testable import SkillFlowDesktop

final class UsageVisualizationTests: XCTestCase {
    func testAgentIdentityColorsCoverEveryBuiltInDesktopAgent() {
        XCTAssertEqual(
            Set(AgentIdentityColorCatalog.targetIds),
            Set(AgentDisplayCatalog.defaultTargetOrder)
        )
    }

    func testCodexAndZCodeUseClearlyDifferentIdentityColors() {
        let codex = AgentIdentityColorCatalog.swatch(for: "codex")
        let zcode = AgentIdentityColorCatalog.swatch(for: "zcode")

        XCTAssertEqual(codex?.hex(for: .light), "#2563EB")
        XCTAssertEqual(codex?.hex(for: .dark), "#60A5FA")
        XCTAssertEqual(zcode?.hex(for: .light), "#0284C7")
        XCTAssertNotEqual(codex?.hex(for: .light), zcode?.hex(for: .light))
        XCTAssertNotEqual(codex?.hex(for: .dark), zcode?.hex(for: .dark))
    }

    func testVerifiedAgentIdentityColorsUseBrandAlignedSwatches() {
        let expected: [String: (light: String, dark: String)] = [
            "claude-code": ("#C96443", "#E89B7E"),
            "workbuddy": ("#07856F", "#0EC8A9"),
            "codebuddy": ("#6C4DFF", "#A694FF"),
            "kimi-code": ("#007CFF", "#66B5FF"),
            "minimax-code": ("#3977A8", "#7DC6FF"),
            "hermes-agent": ("#0000F2", "#7B7BFF"),
            "openclaw": ("#D14A22", "#FF7A3D"),
            "amp": ("#C65A18", "#F6833B"),
        ]

        for (targetId, colors) in expected {
            let swatch = AgentIdentityColorCatalog.swatch(for: targetId)
            XCTAssertEqual(swatch?.hex(for: .light), colors.light, targetId)
            XCTAssertEqual(swatch?.hex(for: .dark), colors.dark, targetId)
        }
    }

    @MainActor
    func testWorkBuddyAndCodeBuddyUseIndependentIcons() {
        XCTAssertEqual(AgentIconLibrary.fileName(for: "workbuddy"), "workbuddy.svg")
        XCTAssertEqual(AgentIconLibrary.fileName(for: "codebuddy"), "codebuddy.svg")
    }

    func testUnknownAgentFallsBackOutsideIdentityCatalog() {
        XCTAssertNil(AgentIdentityColorCatalog.swatch(for: "custom-agent"))
    }

    func testAgentIdentityColorsMaintainNonTextContrastAgainstUsageBackgrounds() throws {
        for targetId in AgentIdentityColorCatalog.targetIds {
            let swatch = try XCTUnwrap(AgentIdentityColorCatalog.swatch(for: targetId))
            XCTAssertGreaterThanOrEqual(
                contrastRatio(swatch.hex(for: .light), "#F2F2F2"),
                3,
                "\(targetId) light identity color"
            )
            XCTAssertGreaterThanOrEqual(
                contrastRatio(swatch.hex(for: .dark), "#222222"),
                3,
                "\(targetId) dark identity color"
            )
        }
    }

    func testSelectedRankingRowUsesCurrentAccentBackground() {
        assertColorsEqual(
            UsageRankingRowStyle.backgroundColor(selected: true, accent: .orange, theme: .light),
            AppTheme.brand(for: .orange, in: .light).opacity(0.18)
        )
        assertColorsEqual(
            UsageRankingRowStyle.backgroundColor(selected: true, accent: .purple, theme: .dark),
            AppTheme.brand(for: .purple, in: .dark).opacity(0.26)
        )
    }

    func testAgentIdentityColorIsUsedByUsageAgentSeriesAndRanking() throws {
        let dailyTrendColor = UsageDailyTrendSeriesStyle.color(
            agentTargetId: "codex",
            fallbackColorIndex: 3,
            theme: .light
        )
        let expectedIdentityColor = try XCTUnwrap(AgentIdentityColorCatalog.color(for: "codex", theme: .light))
        assertColorsEqual(dailyTrendColor, expectedIdentityColor)

        let skillSeriesColor = UsageDailyTrendSeriesStyle.color(
            agentTargetId: nil,
            fallbackColorIndex: 3,
            theme: .light
        )
        assertColorsEqual(skillSeriesColor, UsageDailyTrendSeriesStyle.fallbackPalette[3])

        let rankingIndicator = UsageRankingRowStyle.agentIndicatorColor(targetId: "codex", theme: .light)
        assertColorsEqual(rankingIndicator, expectedIdentityColor)

        let unknownAgentIndicator = UsageRankingRowStyle.agentIndicatorColor(
            targetId: "custom-agent",
            theme: .dark
        )
        assertColorsEqual(unknownAgentIndicator, AppTheme.textMuted(for: .dark))
    }

    func testCalendarPeriodCurrentCoversTrailingTwelveMonths() {
        let calendar = Calendar(identifier: .gregorian)
        let now = calendar.date(from: DateComponents(year: 2026, month: 8, day: 30))!

        let range = UsageCalendarPeriod.current.dateRange(calendar: calendar, now: now)

        XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: range.start), DateComponents(year: 2025, month: 8, day: 31))
        XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: range.end), DateComponents(year: 2026, month: 8, day: 30))
    }

    func testCalendarPeriodYearCoversWholeCalendarYear() {
        let calendar = Calendar(identifier: .gregorian)
        let now = calendar.date(from: DateComponents(year: 2026, month: 8, day: 30))!

        let range = UsageCalendarPeriod.year(2025).dateRange(calendar: calendar, now: now)

        XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: range.start), DateComponents(year: 2025, month: 1, day: 1))
        XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: range.end), DateComponents(year: 2025, month: 12, day: 31))
    }

    func testCalendarGridMapsDatesIntoWeekColumnsAndWeekdayRows() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 1
        let start = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        let end = calendar.date(from: DateComponents(year: 2026, month: 12, day: 31))!

        let grid = UsageCalendarGrid(start: start, end: end, dailyUses: ["2026-01-01": 4], calendar: calendar)

        let januaryFirst = grid.cells.first(where: { $0.dateKey == "2026-01-01" })
        XCTAssertEqual(januaryFirst?.weekday, 4)
        XCTAssertEqual(januaryFirst?.observedUses, 4)
        XCTAssertEqual(grid.cells.count, grid.weekCount * 7)
        XCTAssertGreaterThanOrEqual(grid.monthLabels.count, 12)
    }

    func testHourlyActivityGridIndexesShuffledValuesAndMaximum() {
        let values = (0..<(7 * 24)).reversed().map { index in
            UsageHourlyActivityViewData(
                weekday: index / 24,
                hour: index % 24,
                observedUses: index
            )
        }

        let grid = UsageHourlyActivityGrid(values)

        XCTAssertEqual(grid.observedUses(weekday: 3, hour: 7), 79)
        XCTAssertEqual(grid.maximum, 167)
    }

    func testHourlyActivityGridHandlesSparseInvalidAndDuplicateValues() {
        let grid = UsageHourlyActivityGrid([
            UsageHourlyActivityViewData(weekday: 2, hour: 5, observedUses: 4),
            UsageHourlyActivityViewData(weekday: -1, hour: 5, observedUses: 99),
            UsageHourlyActivityViewData(weekday: 2, hour: 24, observedUses: 99),
            UsageHourlyActivityViewData(weekday: 2, hour: 5, observedUses: 9),
        ])

        XCTAssertEqual(grid.observedUses(weekday: 2, hour: 5), 9)
        XCTAssertEqual(grid.observedUses(weekday: 0, hour: 0), 0)
        XCTAssertEqual(grid.observedUses(weekday: 7, hour: 0), 0)
        XCTAssertEqual(grid.maximum, 9)
    }

    func testHeatmapLayoutUsesFixedSquareCellsAndFillsRemainingColumns() {
        let layout = UsageHeatmapGeometry(
            width: 960,
            cellSize: 20,
            columnSpacing: 4,
            rowSpacing: 5
        )

        XCTAssertGreaterThan(layout.columnCount, 24)
        XCTAssertEqual(layout.frames.count, 7 * layout.columnCount)
        XCTAssertEqual(layout.frame(weekday: 0, hour: 0).minX, 0, accuracy: 0.001)
        XCTAssertEqual(layout.frame(weekday: 0, hour: 0).size, CGSize(width: 20, height: 20))
        XCTAssertEqual(layout.frame(weekday: 6, hour: layout.columnCount - 1).maxY, layout.height, accuracy: 0.001)
        XCTAssertLessThanOrEqual(layout.frame(weekday: 6, hour: layout.columnCount - 1).maxX, 960)
        XCTAssertLessThan(960 - layout.frame(weekday: 6, hour: layout.columnCount - 1).maxX, 24)
    }

    func testTooltipUsesFixedWidthAndStaysInsideChartBounds() {
        let left = UsageTooltipGeometry.leadingOffset(index: 0, itemCount: 30, containerWidth: 960)
        let right = UsageTooltipGeometry.leadingOffset(index: 29, itemCount: 30, containerWidth: 960)

        XCTAssertEqual(UsageTooltipGeometry.width, 190)
        XCTAssertEqual(left, UsageTooltipGeometry.edgeInset, accuracy: 0.001)
        XCTAssertEqual(right + UsageTooltipGeometry.width, 960 - UsageTooltipGeometry.edgeInset, accuracy: 0.001)
    }

    func testAreaBandsUseSeparateCumulativeBoundaries() {
        let bands = UsageAreaBandGeometry.make(values: [
            [1, 2, 0],
            [2, 3, 1],
            [1, 0, 4],
        ])

        XCTAssertEqual(bands.map(\.lower), [
            [0, 0, 0],
            [1, 2, 0],
            [3, 5, 1],
        ])
        XCTAssertEqual(bands.map(\.upper), [
            [1, 2, 0],
            [3, 5, 1],
            [4, 5, 5],
        ])
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

    private func contrastRatio(_ foreground: String, _ background: String) -> Double {
        let foregroundLuminance = relativeLuminance(foreground)
        let backgroundLuminance = relativeLuminance(background)
        return (max(foregroundLuminance, backgroundLuminance) + 0.05)
            / (min(foregroundLuminance, backgroundLuminance) + 0.05)
    }

    private func relativeLuminance(_ hex: String) -> Double {
        let value = UInt64(hex.dropFirst(), radix: 16) ?? 0
        let components = [
            Double((value >> 16) & 0xFF) / 255,
            Double((value >> 8) & 0xFF) / 255,
            Double(value & 0xFF) / 255,
        ]
        .map { component in
            component <= 0.04045
                ? component / 12.92
                : pow((component + 0.055) / 1.055, 2.4)
        }
        return (0.2126 * components[0]) + (0.7152 * components[1]) + (0.0722 * components[2])
    }

}

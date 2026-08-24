import CoreGraphics
import XCTest
@testable import SkillFlowDesktop

final class UsageVisualizationTests: XCTestCase {
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

    func testUsageDashboardDoesNotRenderDataSourceNoticeCard() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/UsageScreen.swift")

        XCTAssertFalse(source.contains("数据来源提示"))
        XCTAssertFalse(source.contains("coverageNotice("))
    }

    func testUsageChartCardHasDailyTrendHeading() throws {
        let source = try sourceText(at: "Sources/DesktopApp/Screens/Home/UsageScreen.swift")

        XCTAssertTrue(source.contains("Label(\"每日趋势\", systemImage: \"waveform.path.ecg\")"))
        XCTAssertTrue(source.contains(".overlay(alignment: .topLeading)"))
        XCTAssertTrue(source.contains(".frame(width: UsageTooltipGeometry.width"))
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

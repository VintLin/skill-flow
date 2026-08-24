import CoreGraphics
import XCTest
@testable import SkillFlowDesktop

final class UsageVisualizationTests: XCTestCase {
    func testHeatmapLayoutFillsAllSevenDaysAndTwentyFourHours() {
        let layout = UsageHeatmapGeometry(
            width: 960,
            columnSpacing: 4,
            rowSpacing: 5
        )

        XCTAssertEqual(layout.frames.count, 7 * 24)
        XCTAssertEqual(layout.frame(weekday: 0, hour: 0).minX, 0, accuracy: 0.001)
        XCTAssertEqual(layout.frame(weekday: 6, hour: 23).maxX, 960, accuracy: 0.001)
        XCTAssertEqual(layout.frame(weekday: 0, hour: 0).width, layout.frame(weekday: 0, hour: 0).height, accuracy: 0.001)
        XCTAssertEqual(layout.frame(weekday: 6, hour: 23).maxY, layout.height, accuracy: 0.001)
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

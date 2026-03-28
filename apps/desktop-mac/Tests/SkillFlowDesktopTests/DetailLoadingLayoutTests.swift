import XCTest

@testable import SkillFlowDesktop

final class DetailLoadingLayoutTests: XCTestCase {
    func testGroupOverviewLoadingUsesDedicatedPlaceholderLayout() {
        XCTAssertEqual(DetailLoadingLayout.groupAgentPlaceholderWidths, [120, 132, 118])
        XCTAssertEqual(DetailLoadingLayout.groupDocumentTabPlaceholderWidths, [86, 98, 82])
        XCTAssertEqual(DetailLoadingLayout.groupDocumentLineCount, 10)
    }

    func testSkillLoadingUsesSingleDocumentPlaceholderLayout() {
        XCTAssertEqual(DetailLoadingLayout.skillDocumentTabPlaceholderWidths, [92, 84, 106])
        XCTAssertEqual(DetailLoadingLayout.skillDocumentLineCount, 12)
    }
}

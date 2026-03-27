import Foundation
import XCTest

@testable import SkillFlowDesktop

final class MarkdownDocumentRendererTests: XCTestCase {
    func testDocumentTabRecognizesMarkdownFilesByPath() {
        let markdownTab = MainViewModel.DocumentTab(
            id: "readme",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            content: "# Hello",
            renderCacheKey: "readme",
            externalURL: nil
        )
        let fileTreeTab = MainViewModel.DocumentTab(
            id: "filetree",
            title: "FILETREE",
            path: "/tmp/group",
            metadata: [],
            content: "group",
            renderCacheKey: "filetree",
            externalURL: nil
        )

        XCTAssertTrue(markdownTab.isMarkdown)
        XCTAssertFalse(fileTreeTab.isMarkdown)
    }
}

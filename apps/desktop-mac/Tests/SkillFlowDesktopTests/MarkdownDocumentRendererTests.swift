import Foundation
import XCTest

@testable import SkillFlowDesktop

final class MarkdownDocumentRendererTests: XCTestCase {
    @MainActor
    func testRendererReusesCachedPreprocessedContent() {
        MarkdownDocumentRenderer.clearCache()

        let first = MarkdownDocumentRenderer.preprocessedContent(
            cacheKey: "doc:1",
            markdown: "# Title\n\nBody"
        )
        let second = MarkdownDocumentRenderer.preprocessedContent(
            cacheKey: "doc:1",
            markdown: "# Title\n\nBody"
        )

        XCTAssertTrue(first === second)
    }

    @MainActor
    func testRendererCachesMeasuredHeightByDocumentAndWidth() {
        MarkdownDocumentRenderer.clearCache()

        MarkdownDocumentRenderer.cacheHeight(240, documentKey: "doc:1", width: 640.4)

        XCTAssertEqual(MarkdownDocumentRenderer.cachedHeight(documentKey: "doc:1", width: 640.4), 240)
        XCTAssertEqual(MarkdownDocumentRenderer.cachedHeight(documentKey: "doc:1", width: 640.49), 240)
        XCTAssertNil(MarkdownDocumentRenderer.cachedHeight(documentKey: "doc:1", width: 720))
    }

    func testDocumentTabRecognizesMarkdownFilesByPath() {
        let markdownTab = MainViewModel.DocumentTab(
            id: "readme",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            content: "# Hello",
            renderCacheKey: "readme"
        )
        let fileTreeTab = MainViewModel.DocumentTab(
            id: "filetree",
            title: "FILETREE",
            path: "/tmp/group",
            metadata: [],
            content: "group",
            renderCacheKey: "filetree"
        )

        XCTAssertTrue(markdownTab.isMarkdown)
        XCTAssertFalse(fileTreeTab.isMarkdown)
    }
}

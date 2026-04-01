import Foundation
import XCTest

@testable import SkillFlowDesktop

final class MarkdownDocumentRendererTests: XCTestCase {
    actor RenderCounter {
        private var count = 0

        func increment() {
            count += 1
        }

        func value() -> Int {
            count
        }
    }

    func testMarkdownViewModelEqualityIgnoresBodyState() {
        let descriptor = MainViewModel.DocumentDescriptor(
            id: "group:/tmp/README.md",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )

        XCTAssertEqual(
            MarkdownDocumentView.Model(descriptor: descriptor, content: nil, metadata: []),
            MarkdownDocumentView.Model(descriptor: descriptor, content: "# Hello", metadata: [])
        )
    }

    @MainActor
    func testRendererCachesRenderedMarkdownByRenderCacheKey() async {
        let descriptor = MainViewModel.DocumentDescriptor(
            id: "readme",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )
        let document = MarkdownDocumentView.Model(descriptor: descriptor, content: "# Hello", metadata: [])
        let renderCounter = RenderCounter()
        let renderer = MarkdownDocumentRenderer { model in
            await renderCounter.increment()
            return AttributedString(model.content ?? "")
        }

        let first = await renderer.renderedContent(for: document)
        let second = await renderer.renderedContent(for: document)
        let renderCount = await renderCounter.value()

        XCTAssertEqual(String(first.characters), "# Hello")
        XCTAssertEqual(String(second.characters), "# Hello")
        XCTAssertEqual(renderCount, 1)
        XCTAssertEqual(String(renderer.cachedContent(for: document.renderCacheKey)?.characters ?? AttributedString().characters), "# Hello")
    }

    @MainActor
    func testRendererSharesInFlightRenderTaskForSameDocument() async {
        let descriptor = MainViewModel.DocumentDescriptor(
            id: "readme",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )
        let document = MarkdownDocumentView.Model(descriptor: descriptor, content: "# Hello", metadata: [])
        let renderCounter = RenderCounter()
        let renderer = MarkdownDocumentRenderer { model in
            await renderCounter.increment()
            try? await Task.sleep(for: .milliseconds(25))
            return AttributedString(model.content ?? "")
        }

        async let first = renderer.renderedContent(for: document)
        async let second = renderer.renderedContent(for: document)
        let rendered = await [first, second]
        let renderCount = await renderCounter.value()

        XCTAssertEqual(rendered.count, 2)
        XCTAssertEqual(String(rendered[0].characters), "# Hello")
        XCTAssertEqual(String(rendered[1].characters), "# Hello")
        XCTAssertEqual(renderCount, 1)
    }

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

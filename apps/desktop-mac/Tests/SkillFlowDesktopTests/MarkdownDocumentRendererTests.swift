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

    actor RenderState {
        private var didObserveCancellation = false
        private var invocationCount = 0

        func markCancelled() {
            didObserveCancellation = true
        }

        func observedCancellation() -> Bool {
            didObserveCancellation
        }

        func nextInvocation() -> Int {
            invocationCount += 1
            return invocationCount
        }

        func renderedCount() -> Int {
            invocationCount
        }
    }

    func testMarkdownViewModelEqualityDistinguishesLoadingFromLoadedState() {
        let descriptor = MainViewModel.DocumentDescriptor(
            id: "group:/tmp/README.md",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )

        XCTAssertNotEqual(
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

    @MainActor
    func testRendererResetsWithoutTouchingOtherCacheKeys() async {
        let firstDescriptor = MainViewModel.DocumentDescriptor(
            id: "a",
            title: "A.md",
            path: "/tmp/A.md",
            metadata: [],
            renderCacheKey: "doc-a",
            externalURL: nil
        )
        let secondDescriptor = MainViewModel.DocumentDescriptor(
            id: "b",
            title: "B.md",
            path: "/tmp/B.md",
            metadata: [],
            renderCacheKey: "doc-b",
            externalURL: nil
        )
        let renderer = MarkdownDocumentRenderer { model in
            AttributedString(model.content ?? "")
        }

        _ = await renderer.renderedContent(for: .init(descriptor: firstDescriptor, content: "# A", metadata: []))
        _ = await renderer.renderedContent(for: .init(descriptor: secondDescriptor, content: "# B", metadata: []))
        renderer.reset(renderCacheKey: "doc-a")

        XCTAssertNil(renderer.cachedContent(for: "doc-a"))
        XCTAssertEqual(String(renderer.cachedContent(for: "doc-b")?.characters ?? AttributedString().characters), "# B")
    }

    @MainActor
    func testRendererCancelsInFlightRenderWhenLastWaiterCancels() async {
        let descriptor = MainViewModel.DocumentDescriptor(
            id: "readme",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )
        let document = MarkdownDocumentView.Model(descriptor: descriptor, content: "# Hello", metadata: [])
        let renderStarted = expectation(description: "render started")
        let renderState = RenderState()
        let renderer = MarkdownDocumentRenderer { model in
            renderStarted.fulfill()
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(10))
            }
            await renderState.markCancelled()
            return AttributedString(model.content ?? "")
        }

        let requestTask = Task {
            await renderer.renderedContent(for: document)
        }

        await fulfillment(of: [renderStarted], timeout: 1.0)
        requestTask.cancel()
        _ = await requestTask.value

        let observedCancellation = await renderState.observedCancellation()
        XCTAssertTrue(observedCancellation)
        XCTAssertNil(renderer.cachedContent(for: document.renderCacheKey))
    }

    @MainActor
    func testRendererStartsFreshRenderWhenCancelledDocumentIsReopened() async {
        let descriptor = MainViewModel.DocumentDescriptor(
            id: "readme",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )
        let document = MarkdownDocumentView.Model(descriptor: descriptor, content: "# Hello", metadata: [])
        let renderStarted = expectation(description: "first render started")
        let renderCancelled = expectation(description: "first render cancelled")
        let renderState = RenderState()
        let renderer = MarkdownDocumentRenderer { model in
            let invocation = await renderState.nextInvocation()
            if invocation == 1 {
                renderStarted.fulfill()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(10))
                }
                renderCancelled.fulfill()
                try? await Task.sleep(for: .milliseconds(50))
                return AttributedString()
            }
            return AttributedString(model.content ?? "")
        }

        let firstRequest = Task {
            await renderer.renderedContent(for: document)
        }

        await fulfillment(of: [renderStarted], timeout: 1.0)
        firstRequest.cancel()
        await fulfillment(of: [renderCancelled], timeout: 1.0)

        let reopened = await renderer.renderedContent(for: document)

        _ = await firstRequest.value
        let renderedCount = await renderState.renderedCount()
        XCTAssertEqual(String(reopened.characters), "# Hello")
        XCTAssertEqual(renderedCount, 2)
        XCTAssertEqual(String(renderer.cachedContent(for: document.renderCacheKey)?.characters ?? AttributedString().characters), "# Hello")
    }

    @MainActor
    func testRendererBenchmarkWarmCacheIsFasterThanColdRender() async {
        let descriptor = MainViewModel.DocumentDescriptor(
            id: "benchmark",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            renderCacheKey: "benchmark-cache",
            externalURL: nil
        )
        let document = MarkdownDocumentView.Model(
            descriptor: descriptor,
            content: heavyMarkdownDocument(sectionCount: 1200),
            metadata: []
        )
        let renderer = MarkdownDocumentRenderer()
        let clock = ContinuousClock()

        let coldStart = clock.now
        _ = await renderer.renderedContent(for: document)
        let coldDuration = coldStart.duration(to: clock.now)

        let warmStart = clock.now
        _ = await renderer.renderedContent(for: document)
        let warmDuration = warmStart.duration(to: clock.now)

        print("Markdown renderer benchmark cold=\(coldDuration) warm=\(warmDuration)")
        XCTAssertLessThan(warmDuration, coldDuration)
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

    private func heavyMarkdownDocument(sectionCount: Int) -> String {
        let section = """
        ## Notes

        This is a heavy markdown benchmark section.

        - one
        - two
        - three

        ```swift
        let value = "benchmark"
        print(value)
        ```

        """

        return "# Benchmark\n\n" + String(repeating: section, count: sectionCount)
    }
}

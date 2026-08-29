import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailDocumentStoreTests: XCTestCase {
    func testDocumentParserHandlesPlainAndUnclosedFrontmatter() {
        let plain = DetailDocumentParser.parse("  # Plain  ")
        XCTAssertTrue(plain.metadata.isEmpty)
        XCTAssertEqual(plain.body, "# Plain")

        let unclosed = DetailDocumentParser.parse("""
        ---
        name: Broken
        # Body
        """)
        XCTAssertTrue(unclosed.metadata.isEmpty)
        XCTAssertEqual(unclosed.body, "---\nname: Broken\n# Body")
    }

    func testDocumentParserSortsAndRendersFrontmatterValues() {
        let parsed = DetailDocumentParser.parse("""
        ---
        zeta:
          nested: value
        alpha:
          - one
          - two
        count: 3
        ---
        # Body
        """)

        XCTAssertEqual(parsed.metadata.map(\.key), ["alpha", "count", "zeta"])
        XCTAssertEqual(parsed.metadata.map(\.value), ["one, two", "3", "nested: value"])
        XCTAssertEqual(parsed.body, "# Body")
    }

    final class LockedContentBox: @unchecked Sendable {
        private let lock = NSLock()
        private var value: String

        init(_ value: String) {
            self.value = value
        }

        func read() -> String {
            lock.lock()
            defer { lock.unlock() }
            return value
        }

        func write(_ newValue: String) {
            lock.lock()
            value = newValue
            lock.unlock()
        }
    }

    final class LockedFlagBox: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Bool

        init(_ value: Bool) {
            self.value = value
        }

        func read() -> Bool {
            lock.lock()
            defer { lock.unlock() }
            return value
        }

        func write(_ newValue: Bool) {
            lock.lock()
            value = newValue
            lock.unlock()
        }
    }

    final class LockedIntBox: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Int

        init(_ value: Int) {
            self.value = value
        }

        func incrementAndRead() -> Int {
            lock.lock()
            defer { lock.unlock() }
            value += 1
            return value
        }

        func read() -> Int {
            lock.lock()
            defer { lock.unlock() }
            return value
        }
    }

    func testDocumentStoreLoadsMarkdownOnlyWhenRequested() async throws {
        let url = try makeMarkdownFile(
            named: "README.md",
            contents: """
            ---
            name: AlphaHub
            ---
            # Hello
            """
        )

        let store = DetailDocumentStore(fileReader: { path in
            XCTAssertEqual(path, url.path)
            return try String(contentsOfFile: path, encoding: .utf8)
        })

        let descriptor = DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-1",
            externalURL: nil
        )

        let first = try await store.document(for: descriptor)
        let second = try await store.document(for: descriptor)

        XCTAssertEqual(first.content, "# Hello")
        XCTAssertEqual(first.metadata.first?.key, "name")
        XCTAssertEqual(second.content, "# Hello")
        XCTAssertEqual(store.debugLoadCount(for: url.path), 1)
    }

    func testDocumentStoreInvalidatesCachedDocumentWhenRenderCacheKeyChanges() async throws {
        let url = try makeMarkdownFile(
            named: "README.md",
            contents: """
            # Initial
            """
        )

        let currentContents = LockedContentBox("# Initial")
        let store = DetailDocumentStore(fileReader: { path in
            XCTAssertEqual(path, url.path)
            return currentContents.read()
        })

        let firstDescriptor = DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-1",
            externalURL: nil
        )
        let first = try await store.document(for: firstDescriptor)

        currentContents.write("# Updated")
        let secondDescriptor = DocumentDescriptor(
            id: firstDescriptor.id,
            title: firstDescriptor.title,
            path: firstDescriptor.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-2",
            externalURL: nil
        )
        let second = try await store.document(for: secondDescriptor)

        XCTAssertEqual(first.content, "# Initial")
        XCTAssertEqual(second.content, "# Updated")
        XCTAssertEqual(store.debugLoadCount(for: url.path), 2)
    }

    func testDocumentStoreReadsOutsideMainActor() async throws {
        let url = try makeMarkdownFile(
            named: "README.md",
            contents: """
            # Hello
            """
        )

        let store = DetailDocumentStore(fileReader: { path in
            XCTAssertEqual(path, url.path)
            XCTAssertFalse(Thread.isMainThread)
            return "# Hello"
        })

        let descriptor = DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-1",
            externalURL: nil
        )

        let document = try await store.document(for: descriptor)

        XCTAssertEqual(document.content, "# Hello")
    }

    func testDocumentStoreCancelsInFlightLoadWhenLastWaiterCancels() async throws {
        let url = try makeMarkdownFile(
            named: "README.md",
            contents: """
            # Hello
            """
        )
        let loadStarted = expectation(description: "load started")
        let releaseLoad = LockedFlagBox(false)
        let observedCancellation = LockedFlagBox(false)
        let store = DetailDocumentStore(fileReader: { path in
            XCTAssertEqual(path, url.path)
            loadStarted.fulfill()
            while !releaseLoad.read() {
                if withUnsafeCurrentTask(body: { task in task?.isCancelled ?? false }) {
                    observedCancellation.write(true)
                    throw CancellationError()
                }
                Thread.sleep(forTimeInterval: 0.01)
            }
            return "# Hello"
        })
        let descriptor = DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-1",
            externalURL: nil
        )

        let requestTask = Task {
            try await store.document(for: descriptor)
        }

        await fulfillment(of: [loadStarted], timeout: 1.0)
        requestTask.cancel()
        try? await Task.sleep(for: .milliseconds(50))
        releaseLoad.write(true)

        await XCTAssertThrowsErrorAsync(try await requestTask.value)
        XCTAssertTrue(observedCancellation.read())
        XCTAssertEqual(store.debugLoadCount(for: url.path), 1)
    }

    func testDocumentStoreStartsFreshLoadWhenCancelledDocumentIsReopened() async throws {
        let url = try makeMarkdownFile(
            named: "README.md",
            contents: """
            # Hello
            """
        )
        let loadStarted = expectation(description: "first load started")
        let firstLoadCancelled = expectation(description: "first load cancelled")
        let invocationCount = LockedIntBox(0)
        let store = DetailDocumentStore(fileReader: { path in
            XCTAssertEqual(path, url.path)
            let invocation = invocationCount.incrementAndRead()
            if invocation == 1 {
                loadStarted.fulfill()
                while true {
                    if withUnsafeCurrentTask(body: { task in task?.isCancelled ?? false }) {
                        firstLoadCancelled.fulfill()
                        Thread.sleep(forTimeInterval: 0.05)
                        throw CancellationError()
                    }
                    Thread.sleep(forTimeInterval: 0.01)
                }
            }
            return "# Reopened"
        })
        let descriptor = DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-1",
            externalURL: nil
        )

        let firstRequest = Task {
            try await store.document(for: descriptor)
        }

        await fulfillment(of: [loadStarted], timeout: 1.0)
        firstRequest.cancel()
        await fulfillment(of: [firstLoadCancelled], timeout: 1.0)

        let reopened = try await store.document(for: descriptor)

        await XCTAssertThrowsErrorAsync(try await firstRequest.value)
        XCTAssertEqual(reopened.content, "# Reopened")
        XCTAssertEqual(invocationCount.read(), 2)
        XCTAssertEqual(store.debugLoadCount(for: url.path), 2)
    }

    func testDefaultStoreReturnsUnavailableContentForMissingFile() async throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("detail-document-store-tests-\(UUID().uuidString)", isDirectory: false)
        let store = DetailDocumentStore()
        let descriptor = DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-1",
            externalURL: nil
        )

        let document = try await store.document(for: descriptor)

        XCTAssertEqual(document.content, "README.md unavailable.")
    }

    func testDefaultStorePropagatesNonMissingReadErrors() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("detail-document-store-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let store = DetailDocumentStore()
        let descriptor = DocumentDescriptor(
            id: "group:\(directory.path)",
            title: "README.md",
            path: directory.path,
            metadata: [],
            renderCacheKey: "\(directory.path):rev-1",
            externalURL: nil
        )

        await XCTAssertThrowsErrorAsync(try await store.document(for: descriptor))
        await XCTAssertThrowsErrorAsync(try await store.document(for: descriptor))
        XCTAssertEqual(store.debugLoadCount(for: directory.path), 2)
    }

    func testDocumentStoreBenchmarkWarmCacheIsFasterThanColdLoad() async throws {
        let url = try makeMarkdownFile(
            named: "README.md",
            contents: heavyMarkdownDocument(sectionCount: 1200)
        )
        let store = DetailDocumentStore()
        let descriptor = DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):benchmark",
            externalURL: nil
        )
        let clock = ContinuousClock()

        let coldStart = clock.now
        _ = try await store.document(for: descriptor)
        let coldDuration = coldStart.duration(to: clock.now)

        let warmStart = clock.now
        _ = try await store.document(for: descriptor)
        let warmDuration = warmStart.duration(to: clock.now)

        print("Detail document store benchmark cold=\(coldDuration) warm=\(warmDuration)")
        XCTAssertLessThan(warmDuration, coldDuration)
    }

    private func makeMarkdownFile(named name: String, contents: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("detail-document-store-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let url = directory.appendingPathComponent(name)
        try contents.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    private func XCTAssertThrowsErrorAsync<T>(
        _ expression: @autoclosure () async throws -> T,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            _ = try await expression()
            XCTFail("Expected error to be thrown", file: file, line: line)
        } catch {
        }
    }

    private func heavyMarkdownDocument(sectionCount: Int) -> String {
        let section = """
        ---
        name: Benchmark
        ---

        ## Section

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

import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailDocumentStoreTests: XCTestCase {
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

        let descriptor = MainViewModel.DocumentDescriptor(
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

        let firstDescriptor = MainViewModel.DocumentDescriptor(
            id: "group:\(url.path)",
            title: "README.md",
            path: url.path,
            metadata: [],
            renderCacheKey: "\(url.path):rev-1",
            externalURL: nil
        )
        let first = try await store.document(for: firstDescriptor)

        currentContents.write("# Updated")
        let secondDescriptor = MainViewModel.DocumentDescriptor(
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

        let descriptor = MainViewModel.DocumentDescriptor(
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

    func testDefaultStoreReturnsUnavailableContentForMissingFile() async throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("detail-document-store-tests-\(UUID().uuidString)", isDirectory: false)
        let store = DetailDocumentStore()
        let descriptor = MainViewModel.DocumentDescriptor(
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
        let descriptor = MainViewModel.DocumentDescriptor(
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
}

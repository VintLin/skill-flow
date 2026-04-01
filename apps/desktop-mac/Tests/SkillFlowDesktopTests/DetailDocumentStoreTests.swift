import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailDocumentStoreTests: XCTestCase {
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

    private func makeMarkdownFile(named name: String, contents: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("detail-document-store-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let url = directory.appendingPathComponent(name)
        try contents.write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}

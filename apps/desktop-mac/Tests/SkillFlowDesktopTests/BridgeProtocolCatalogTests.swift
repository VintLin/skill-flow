import Foundation
import XCTest

@testable import SkillFlowDesktop

final class BridgeProtocolCatalogTests: XCTestCase {
    func testBridgeCommandsMatchSharedCatalogFixture() throws {
        let fixtureURL = try bridgeCommandCatalogFixtureURL()
        let data = try Data(contentsOf: fixtureURL)
        let fixture = try JSONDecoder().decode(BridgeCommandCatalogFixture.self, from: data)

        XCTAssertEqual(fixture.protocolVersion, "1.0")
        XCTAssertEqual(BridgeCommand.allCases.map(\.rawValue), fixture.commands)
    }

    func testImportTimeoutCommandsAreDeclaredOnBridgeCommand() {
        let importTimeoutCommands = BridgeCommand.allCases
            .filter(\.usesImportTimeout)
            .map(\.rawValue)

        XCTAssertEqual(importTimeoutCommands, [
            "search-import-groups",
            "scan-local-import-groups",
            "prepare-import-source",
            "preview-import-source",
            "commit-import-source",
            "import-source",
        ])
    }

    private func bridgeCommandCatalogFixtureURL() throws -> URL {
        let fileManager = FileManager.default
        let searchRoots = [
            URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true),
            URL(fileURLWithPath: #filePath).deletingLastPathComponent(),
        ]

        for root in searchRoots {
            if let fixtureURL = findBridgeCommandCatalogFixture(from: root, fileManager: fileManager) {
                return fixtureURL
            }
        }

        throw XCTSkip("Could not locate bridge command catalog fixture from test working directory.")
    }

    private func findBridgeCommandCatalogFixture(from root: URL, fileManager: FileManager) -> URL? {
        var directory = root

        for _ in 0..<12 {
            let fixtureURL = directory
                .appendingPathComponent("packages/shared-types/src/fixtures/bridge-command-catalog.json")

            if fileManager.fileExists(atPath: fixtureURL.path) {
                return fixtureURL
            }

            let parent = directory.deletingLastPathComponent()
            if parent.path == directory.path {
                break
            }
            directory = parent
        }

        return nil
    }
}

private struct BridgeCommandCatalogFixture: Decodable {
    let protocolVersion: String
    let commands: [String]
}

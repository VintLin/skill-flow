import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class AgentSkillFileTabTests: XCTestCase {
    func testDocumentPlaceholderTabsIncludesAgentYAMLFilesAfterReferences() throws {
        let skillDirectory = try makeSkillDirectory(
            files: [
                "SKILL.md": "# Skill",
                "references/a.md": "# A",
                "agents/openai.yaml": "policy:\n  allow_implicit_invocation: false\n",
                "agents/extra.yml": "name: extra\n",
                "agents/notes.md": "# not an agent file",
            ]
        )

        let tabs = DetailLogic.documentPlaceholderTabs(
            for: skillDirectory.appendingPathComponent("SKILL.md").path,
            groupPath: nil,
            gitHubRepoContext: nil
        )

        XCTAssertEqual(
            tabs.map(\.title),
            ["SKILL.md", "references/a.md", "agents/extra.yml", "agents/openai.yaml"]
        )
    }

    func testDocumentPlaceholderTabsWithoutAgentsDirectoryMatchesExistingBehavior() throws {
        let skillDirectory = try makeSkillDirectory(
            files: [
                "SKILL.md": "# Skill",
                "references/a.md": "# A",
            ]
        )

        let tabs = DetailLogic.documentPlaceholderTabs(
            for: skillDirectory.appendingPathComponent("SKILL.md").path,
            groupPath: nil,
            gitHubRepoContext: nil
        )

        XCTAssertEqual(tabs.map(\.title), ["SKILL.md", "references/a.md"])
    }

    func testDocumentStoreLoadsYAMLAsFencedCodeBlockWithoutMetadata() async throws {
        let skillDirectory = try makeSkillDirectory(
            files: [
                "SKILL.md": "# Skill",
                "agents/openai.yaml": """
                ---
                policy:
                  allow_implicit_invocation: false
                interface:
                  display_name: OpenAI
                """,
            ]
        )
        let yamlPath = skillDirectory.appendingPathComponent("agents/openai.yaml").path

        let tabs = DetailLogic.documentPlaceholderTabs(
            for: skillDirectory.appendingPathComponent("SKILL.md").path,
            groupPath: nil,
            gitHubRepoContext: nil
        )
        let yamlTab = try XCTUnwrap(tabs.first(where: { $0.title == "agents/openai.yaml" }))

        let store = DetailDocumentStore()
        let document = try await store.document(for: yamlTab.descriptor)

        XCTAssertTrue(document.metadata.isEmpty)
        XCTAssertEqual(
            document.content,
            """
            ```yaml
            ---
            policy:
              allow_implicit_invocation: false
            interface:
              display_name: OpenAI
            ```
            """
        )
    }

    private func makeSkillDirectory(files: [String: String]) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("agent-skill-file-tab-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        for (relativePath, contents) in files {
            let url = directory.appendingPathComponent(relativePath)
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try contents.write(to: url, atomically: true, encoding: .utf8)
        }
        return directory
    }
}

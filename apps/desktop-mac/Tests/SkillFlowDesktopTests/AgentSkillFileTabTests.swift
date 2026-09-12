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

        let tabs = catalogTabs(
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

        let tabs = catalogTabs(
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
        let tabs = catalogTabs(
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

    func testDocumentStoreUsesFenceLongerThanEmbeddedBackticks() async throws {
        let store = DetailDocumentStore(fileReader: { _ in "snippet: ````\n" })
        let descriptor = DocumentDescriptor(
            id: "agents/test.yaml",
            title: "agents/test.yaml",
            path: "agents/test.yaml",
            metadata: [],
            renderCacheKey: "agents/test.yaml",
            externalURL: nil
        )

        let document = try await store.document(for: descriptor)

        XCTAssertTrue(document.content.hasPrefix("`````yaml\n"))
        XCTAssertTrue(document.content.hasSuffix("\n`````"))
    }

    func testFileTreeIncludesSupportedSkillDocuments() throws {
        let skillDirectory = try makeSkillDirectory(
            files: [
                "skills/demo/SKILL.md": "# Demo",
                "skills/demo/references/guide.md": "# Guide",
                "skills/demo/references/notes.txt": "ignored",
                "skills/demo/agents/openai.yaml": "policy: {}",
                "skills/demo/agents/notes.md": "ignored",
                "skills/demo/scripts/run.sh": "ignored",
            ]
        )
        let skillPath = skillDirectory.appendingPathComponent("skills/demo/SKILL.md").path
        let skill = DetailSkill(
            id: "demo", title: "demo", summary: "", version: nil, author: "", originLabel: "",
            starCount: nil, folderPath: skillDirectory.appendingPathComponent("skills/demo").path,
            relativeFolderPath: "skills/demo", documents: [], detailLines: [], documentContent: "",
            isEnabled: true, warningCount: 0
        )

        let tree = catalogTree(groupPath: skillDirectory.path, skill: skill)
        let skillRoot = try XCTUnwrap(tree.first?.children.first?.children.first)

        XCTAssertEqual(skillRoot.children.map(\.title), ["agents", "references", "SKILL.md"])
        let agentsFile = try XCTUnwrap(skillRoot.children.first(where: { $0.title == "agents" })?.children.first)
        let referencesFile = try XCTUnwrap(skillRoot.children.first(where: { $0.title == "references" })?.children.first)
        XCTAssertEqual(agentsFile.title, "openai.yaml")
        XCTAssertTrue(agentsFile.isSkillDocument)
        XCTAssertEqual(agentsFile.skillId, "demo")
        XCTAssertEqual(referencesFile.title, "guide.md")
        XCTAssertTrue(referencesFile.isSkillDocument)
        XCTAssertEqual(referencesFile.skillId, "demo")
        XCTAssertEqual(skillPath, skillRoot.children.first(where: { $0.title == "SKILL.md" })?.path)
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

    private func catalogTabs(for skillFilePath: String, groupPath: String?, gitHubRepoContext: DetailLogic.GitHubRepoContext?) -> [DocumentTab] {
        let skill = DetailContentCatalog.SkillContext(
            id: "test", linkName: "test", name: "test", title: nil, description: "",
            skillFilePath: skillFilePath, absolutePath: (skillFilePath as NSString).deletingLastPathComponent,
            relativePath: nil, projectedName: nil
        )
        return DetailContentCatalog().snapshot(for: .init(
            sourceId: "test", groupPath: groupPath, fileTreeTitle: "File Tree", skills: [skill],
            gitHubRepo: gitHubRepoContext.map { .init(owner: $0.owner, repo: $0.repo, revision: $0.revision) }
        )).skillsByLeafId["test"]?.documents ?? []
    }

    private func catalogTree(groupPath: String, skill: DetailSkill) -> [FileTreeItem] {
        let contextSkill = DetailContentCatalog.SkillContext(
            id: skill.id, linkName: skill.title, name: skill.title, title: skill.title,
            description: skill.summary, skillFilePath: skill.folderPath.map { ($0 as NSString).appendingPathComponent("SKILL.md") },
            absolutePath: skill.folderPath, relativePath: skill.relativeFolderPath, projectedName: nil
        )
        return DetailContentCatalog().snapshot(for: .init(
            sourceId: skill.id, groupPath: groupPath, fileTreeTitle: "File Tree", skills: [contextSkill], gitHubRepo: nil
        )).fileTree
    }
}

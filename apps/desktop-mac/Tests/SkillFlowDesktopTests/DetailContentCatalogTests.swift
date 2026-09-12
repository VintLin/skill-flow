import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DetailContentCatalogTests: XCTestCase {
    func testSnapshotBuildsGroupAndSkillDocumentsInStableOrder() throws {
        let root = try makeDirectory(
            files: [
                "README.zh.md": "# 中文",
                "notes.md": "# Notes",
                "CHANGELOG.md": "# Changes",
                "README.md": "# Readme",
                "skills/demo/SKILL.md": "# Demo",
                "skills/demo/references/z.md": "# Z",
                "skills/demo/references/a.md": "# A",
                "skills/demo/agents/openai.yaml": "policy: {}",
                "skills/demo/agents/notes.md": "ignored",
            ]
        )

        let skillPath = root.appendingPathComponent("skills/demo/SKILL.md").path
        let context = DetailContentCatalog.Context(
            sourceId: "source-1",
            groupPath: root.path,
            fileTreeTitle: "File Tree",
            skills: [
                .init(
                    id: "demo",
                    linkName: "demo",
                    name: "Demo",
                    title: nil,
                    description: "Demo skill",
                    skillFilePath: skillPath,
                    absolutePath: root.appendingPathComponent("skills/demo").path,
                    relativePath: "skills/demo",
                    projectedName: nil
                )
            ],
            gitHubRepo: nil
        )

        let snapshot = DetailContentCatalog().snapshot(for: context)

        XCTAssertEqual(snapshot.groupDocuments.map(\.title), ["File Tree", "README.md", "README.zh.md", "CHANGELOG.md", "notes.md"])
        XCTAssertEqual(snapshot.skillsByLeafId["demo"]?.documents.map(\.title), ["SKILL.md", "references/a.md", "references/z.md", "agents/openai.yaml"])
        XCTAssertEqual(snapshot.skillsByLeafId["demo"]?.documents.first?.path, skillPath)
        XCTAssertTrue(snapshot.skillsByLeafId["demo"]?.documents.allSatisfy { !$0.isLoaded && !$0.renderCacheKey.isEmpty } == true)
    }

    func testSnapshotPreservesTreeVisibilityRules() throws {
        let root = try makeDirectory(
            files: [
                "skills/demo/SKILL.md": "# Demo",
                "skills/demo/README.md": "# Readme",
                "skills/demo/scripts/run.sh": "ignored nested directory",
                "skills/demo/references/guide.md": "# Guide",
                "skills/demo/references/notes.txt": "ignored",
                "skills/demo/agents/openai.yaml": "policy: {}",
                "skills/demo/agents/notes.md": "ignored",
            ]
        )
        let context = makeContext(
            root: root,
            skills: [
                .init(
                    id: "demo",
                    linkName: "demo",
                    name: "Demo",
                    title: nil,
                    description: "",
                    skillFilePath: root.appendingPathComponent("skills/demo/SKILL.md").path,
                    absolutePath: root.appendingPathComponent("skills/demo").path,
                    relativePath: "skills/demo",
                    projectedName: nil
                )
            ]
        )

        let tree = try XCTUnwrap(DetailContentCatalog().snapshot(for: context).fileTree.first)
        let skillsDirectory = try XCTUnwrap(tree.children.first(where: { $0.title == "skills" }))
        let skillRoot = try XCTUnwrap(skillsDirectory.children.first(where: { $0.title == "demo" }))

        XCTAssertEqual(skillRoot.children.map(\.title), ["agents", "references", "README.md", "SKILL.md"])
        XCTAssertNil(skillRoot.children.first(where: { $0.title == "scripts" }))
        XCTAssertEqual(skillRoot.children.first(where: { $0.title == "agents" })?.children.map(\.title), ["openai.yaml"])
        XCTAssertEqual(skillRoot.children.first(where: { $0.title == "references" })?.children.map(\.title), ["guide.md"])
    }

    func testSnapshotUsesSyntheticTreeAndInlineSkillDocumentWhenPathsAreMissing() {
        let context = DetailContentCatalog.Context(
            sourceId: "source-1",
            groupPath: nil,
            fileTreeTitle: "File Tree",
            skills: [
                .init(
                    id: "demo",
                    linkName: "demo",
                    name: "Demo",
                    title: nil,
                    description: "Inline description",
                    skillFilePath: nil,
                    absolutePath: nil,
                    relativePath: nil,
                    projectedName: nil
                )
            ],
            gitHubRepo: nil
        )

        let snapshot = DetailContentCatalog().snapshot(for: context)
        let document = snapshot.skillsByLeafId["demo"]?.documents.first

        XCTAssertEqual(snapshot.groupDocuments.map(\.title), ["File Tree"])
        XCTAssertEqual(snapshot.fileTree.first?.title, ".")
        XCTAssertEqual(document?.id, "inline-skill-md:demo")
        XCTAssertEqual(document?.content, "Inline description")
        XCTAssertTrue(document?.isLoaded == true)
    }

    func testSnapshotAddsGitHubLinksOnlyForContainedDocuments() throws {
        let root = try makeDirectory(
            files: [
                "README.md": "# Readme",
                "skills/demo/SKILL.md": "# Demo",
            ]
        )
        let context = DetailContentCatalog.Context(
            sourceId: "source-1",
            groupPath: root.path,
            fileTreeTitle: "File Tree",
            skills: [
                .init(
                    id: "demo",
                    linkName: "demo",
                    name: "Demo",
                    title: nil,
                    description: "",
                    skillFilePath: root.appendingPathComponent("skills/demo/SKILL.md").path,
                    absolutePath: root.appendingPathComponent("skills/demo").path,
                    relativePath: "skills/demo",
                    projectedName: nil
                )
            ],
            gitHubRepo: .init(owner: "acme", repo: "demo", revision: "HEAD")
        )

        let snapshot = DetailContentCatalog().snapshot(for: context)

        XCTAssertEqual(
            snapshot.groupDocuments.first(where: { $0.title == "README.md" })?.externalURL,
            "https://github.com/acme/demo/blob/HEAD/README.md"
        )
        XCTAssertEqual(
            snapshot.skillsByLeafId["demo"]?.documents.first?.externalURL,
            "https://github.com/acme/demo/blob/HEAD/skills/demo/SKILL.md"
        )
        XCTAssertNil(snapshot.groupDocuments.first?.externalURL)
    }

    private func makeContext(
        root: URL,
        skills: [DetailContentCatalog.SkillContext]
    ) -> DetailContentCatalog.Context {
        DetailContentCatalog.Context(
            sourceId: "source-1",
            groupPath: root.path,
            fileTreeTitle: "File Tree",
            skills: skills,
            gitHubRepo: nil
        )
    }

    private func makeDirectory(files: [String: String]) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("detail-content-catalog-tests-\(UUID().uuidString)", isDirectory: true)
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

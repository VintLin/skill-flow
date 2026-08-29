import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailViewModelTests: XCTestCase {
    func testCopiesVisibleDetailShapeFromSnapshot() {
        let snapshot = DetailViewModel.Snapshot(
            sourceId: "alpha",
            title: "AlphaHub",
            originalDisplayName: "AlphaHub Original",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: GroupCardStats(
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub",
                localPath: "/groups/alpha"
            ),
            sourceDetailLines: [
                "Provider: clawhub",
                "Downloads: 211,898"
            ],
            sourceRepositoryURL: "https://example.com/alpha",
            locator: "clawhub/alpha",
            groupPath: "/groups/alpha",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 1,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: 1,
            saveState: SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: ["2026-03-25T12:00:00Z"],
            deploymentFacts: ["Claude Code -> /Users/vint/.claude"],
            fileTree: [
                FileTreeItem(
                    id: "root",
                    title: "alpha",
                    path: "/groups/alpha",
                    isDirectory: true,
                    isSkillRoot: false,
                    isSkillDocument: false,
                    skillId: nil,
                    children: [
                        FileTreeItem(
                            id: "root/alpha-a",
                            title: "alpha-a",
                            path: "/groups/alpha/alpha-a",
                            isDirectory: true,
                            isSkillRoot: true,
                            isSkillDocument: false,
                            skillId: "alpha-a",
                            children: []
                        )
                    ]
                )
            ],
            groupDocuments: [
                DocumentDescriptor(
                    id: "readme",
                    title: "README.md",
                    path: "README.md",
                    metadata: [
                        MetadataEntry(id: "name", key: "name", value: "AlphaHub")
                    ],
                    renderCacheKey: "readme-cache",
                    externalURL: "https://github.com/acme/alpha-hub/blob/HEAD/README.md"
                )
            ],
            targets: [
                DetailTarget(
                    id: "claude-code",
                    label: "Claude Code",
                    shortLabel: "Claude",
                    isEnabled: true
                )
            ],
            skills: [
                DetailSkill(
                    id: "alpha-a",
                    title: "browse",
                    summary: "Browse things.",
                    version: "1.0.0",
                    author: "Acme",
                    originLabel: "ClawHub",
                    starCount: 1200,
                    folderPath: "/skills/browse",
                    relativeFolderPath: "skills/browse",
                    documents: [],
                    detailLines: ["SKILL.md"],
                    documentContent: "# browse",
                    isEnabled: true,
                    warningCount: 0
                )
            ]
        )

        let viewModel = DetailViewModel(snapshot: snapshot)

        XCTAssertEqual(viewModel.sourceId, snapshot.sourceId)
        XCTAssertEqual(viewModel.title, snapshot.title)
        XCTAssertEqual(viewModel.originalDisplayName, snapshot.originalDisplayName)
        XCTAssertTrue(viewModel.hasCustomDisplayName)
        XCTAssertEqual(viewModel.subtitle, snapshot.subtitle)
        XCTAssertEqual(viewModel.author, snapshot.author)
        XCTAssertEqual(viewModel.originLabel, snapshot.originLabel)
        XCTAssertEqual(viewModel.starCount, snapshot.starCount)
        XCTAssertEqual(viewModel.groupStats, snapshot.groupStats)
        XCTAssertEqual(viewModel.sourceDetailLines, snapshot.sourceDetailLines)
        XCTAssertEqual(viewModel.sourceRepositoryURL, snapshot.sourceRepositoryURL)
        XCTAssertEqual(viewModel.locator, snapshot.locator)
        XCTAssertEqual(viewModel.groupPath, snapshot.groupPath)
        XCTAssertEqual(viewModel.updatedAt, snapshot.updatedAt)
        XCTAssertEqual(viewModel.updatedRelative, snapshot.updatedRelative)
        XCTAssertEqual(viewModel.health, snapshot.health)
        XCTAssertEqual(viewModel.warningCount, snapshot.warningCount)
        XCTAssertEqual(viewModel.errorCount, snapshot.errorCount)
        XCTAssertEqual(viewModel.enabledSkillCount, snapshot.enabledSkillCount)
        XCTAssertEqual(viewModel.totalSkillCount, snapshot.totalSkillCount)
        XCTAssertEqual(viewModel.enabledTargetCount, snapshot.enabledTargetCount)
        XCTAssertEqual(viewModel.saveState, snapshot.saveState)
        XCTAssertEqual(viewModel.skillSelection, snapshot.skillSelection)
        XCTAssertEqual(viewModel.targetSelection, snapshot.targetSelection)
        XCTAssertEqual(viewModel.enabledTargetLabels, snapshot.enabledTargetLabels)
        XCTAssertEqual(viewModel.sourceFacts, snapshot.sourceFacts)
        XCTAssertEqual(viewModel.deploymentFacts, snapshot.deploymentFacts)
        XCTAssertEqual(viewModel.fileTree.count, snapshot.fileTree.count)
        XCTAssertEqual(viewModel.fileTree.first?.title, snapshot.fileTree.first?.title)
        XCTAssertEqual(viewModel.fileTree.first?.isDirectory, snapshot.fileTree.first?.isDirectory)
        XCTAssertEqual(viewModel.fileTree.first?.children.first?.skillId, "alpha-a")
        XCTAssertEqual(viewModel.groupDocuments.count, snapshot.groupDocuments.count)
        XCTAssertEqual(viewModel.groupDocuments.first?.title, snapshot.groupDocuments.first?.title)
        XCTAssertEqual(viewModel.groupDocuments.first?.metadata.first?.key, snapshot.groupDocuments.first?.metadata.first?.key)
        XCTAssertEqual(viewModel.targets.count, snapshot.targets.count)
        XCTAssertEqual(viewModel.targets.first?.label, snapshot.targets.first?.label)
        XCTAssertEqual(viewModel.targets.first?.shortLabel, snapshot.targets.first?.shortLabel)
        XCTAssertEqual(viewModel.skills.count, snapshot.skills.count)
        XCTAssertEqual(viewModel.skills.first?.title, snapshot.skills.first?.title)
        XCTAssertEqual(viewModel.skills.first?.documents.first?.title, snapshot.skills.first?.documents.first?.title)
        XCTAssertEqual(viewModel.skills.first?.documents.first?.externalURL, snapshot.skills.first?.documents.first?.externalURL)
    }

    func testSnapshotRevisionIncludesOriginalDisplayName() {
        let current = DetailViewModel.Snapshot(
            sourceId: "alpha",
            title: "Writing Tools",
            originalDisplayName: "AlphaHub",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: nil,
            groupStats: GroupCardStats(
                downloadCount: nil,
                starCount: nil,
                githubURL: nil,
                localPath: nil
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: nil,
            locator: "clawhub/alpha",
            groupPath: nil,
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: 1,
            saveState: SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: [],
            groupDocuments: [],
            targets: [],
            skills: []
        )
        let changedOriginal = DetailViewModel.Snapshot(
            sourceId: "alpha",
            title: "Writing Tools",
            originalDisplayName: "AlphaHub Next",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: nil,
            groupStats: GroupCardStats(
                downloadCount: nil,
                starCount: nil,
                githubURL: nil,
                localPath: nil
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: nil,
            locator: "clawhub/alpha",
            groupPath: nil,
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: 1,
            saveState: SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: [],
            groupDocuments: [],
            targets: [],
            skills: []
        )

        XCTAssertNotEqual(current.revision, changedOriginal.revision)
    }

    func testDetailRevisionTracksNestedVisibleChangesWithoutIdentityChanges() {
        let baseTree = FileTreeItem(
            id: "root",
            title: "Alpha",
            path: "/alpha",
            isDirectory: true,
            isSkillRoot: false,
            isSkillDocument: false,
            skillId: nil,
            children: []
        )
        let changedTree = FileTreeItem(
            id: "root",
            title: "Beta",
            path: "/alpha",
            isDirectory: true,
            isSkillRoot: false,
            isSkillDocument: false,
            skillId: nil,
            children: []
        )
        let baseDocument = DocumentDescriptor(
            id: "readme",
            title: "README.md",
            path: "README.md",
            metadata: [MetadataEntry(id: "name:Alpha", key: "name", value: "Alpha")],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )
        let changedDocument = DocumentDescriptor(
            id: "readme",
            title: "README.md",
            path: "README.md",
            metadata: [MetadataEntry(id: "name:Beta", key: "name", value: "Beta")],
            renderCacheKey: "readme-cache",
            externalURL: nil
        )
        let baseTarget = DetailTarget(id: "claude", label: "Claude", shortLabel: "Claude", isEnabled: true)
        let changedTarget = DetailTarget(id: "claude", label: "Claude Code", shortLabel: "Claude", isEnabled: true)
        let baseSkill = detailRevisionSkill(summary: "Alpha summary")
        let changedSkill = detailRevisionSkill(summary: "Beta summary")
        let base = detailRevision(
            groupStats: GroupCardStats(downloadCount: 1, starCount: 2, githubURL: nil, localPath: nil),
            fileTree: [baseTree],
            groupDocuments: [baseDocument],
            targets: [baseTarget],
            skills: [baseSkill]
        )

        XCTAssertNotEqual(
            base,
            detailRevision(
                groupStats: GroupCardStats(downloadCount: 2, starCount: 2, githubURL: nil, localPath: nil),
                fileTree: [baseTree],
                groupDocuments: [baseDocument],
                targets: [baseTarget],
                skills: [baseSkill]
            )
        )
        XCTAssertNotEqual(base, detailRevision(fileTree: [changedTree], groupDocuments: [baseDocument], targets: [baseTarget], skills: [baseSkill]))
        XCTAssertNotEqual(base, detailRevision(fileTree: [baseTree], groupDocuments: [changedDocument], targets: [baseTarget], skills: [baseSkill]))
        XCTAssertNotEqual(base, detailRevision(fileTree: [baseTree], groupDocuments: [baseDocument], targets: [changedTarget], skills: [baseSkill]))
        XCTAssertNotEqual(base, detailRevision(fileTree: [baseTree], groupDocuments: [baseDocument], targets: [baseTarget], skills: [changedSkill]))
    }

    func testFileTreeRendererPreservesAsciiBranches() {
        let tree = [
            FileTreeItem(
                id: "alpha",
                title: "alpha",
                path: "/alpha",
                isDirectory: true,
                isSkillRoot: false,
                isSkillDocument: false,
                skillId: nil,
                children: [
                    FileTreeItem(
                        id: "alpha/docs",
                        title: "docs",
                        path: "/alpha/docs",
                        isDirectory: true,
                        isSkillRoot: false,
                        isSkillDocument: false,
                        skillId: nil,
                        children: [
                            fileTreeFile(id: "alpha/docs/a.md", title: "a.md"),
                            fileTreeFile(id: "alpha/docs/b.md", title: "b.md"),
                        ]
                    ),
                    fileTreeFile(id: "alpha/README.md", title: "README.md"),
                ]
            ),
            fileTreeFile(id: "LICENSE", title: "LICENSE"),
        ]

        XCTAssertEqual(
            FileTreeRenderer.render(tree),
            """
            alpha
            |-- docs
            |   |-- a.md
            |   `-- b.md
            `-- README.md
            LICENSE
            """
        )
    }

    func testSnapshotStoresOnlyDescriptorDrivenGroupDocuments() {
        let descriptor = DocumentDescriptor(
            id: "readme",
            title: "README.md",
            path: "README.md",
            metadata: [],
            renderCacheKey: "descriptor-cache",
            externalURL: nil
        )

        let snapshot = DetailViewModel.Snapshot(
            sourceId: "alpha",
            revision: "alpha:rev-1",
            title: "AlphaHub",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: GroupCardStats(
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub",
                localPath: "/groups/alpha"
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: "https://example.com/alpha",
            locator: "clawhub/alpha",
            groupPath: "/groups/alpha",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: 1,
            saveState: SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: [],
            groupDocuments: [descriptor],
            targets: [],
            skills: []
        )

        XCTAssertEqual(snapshot.groupDocuments.first?.renderCacheKey, "descriptor-cache")
    }

    private func detailRevision(
        groupStats: GroupCardStats = GroupCardStats(
            downloadCount: 1,
            starCount: 2,
            githubURL: nil,
            localPath: nil
        ),
        fileTree: [FileTreeItem],
        groupDocuments: [DocumentDescriptor],
        targets: [DetailTarget],
        skills: [DetailSkill]
    ) -> String {
        DetailRevision.make(
            sourceId: "alpha",
            title: "Alpha",
            originalDisplayName: "Alpha",
            subtitle: "git",
            author: "Acme",
            originLabel: "GitHub",
            starCount: 2,
            groupStats: groupStats,
            sourceDetailLines: [],
            sourceRepositoryURL: nil,
            locator: "acme/alpha",
            groupPath: "/alpha",
            updatedAt: "2026-08-29T00:00:00Z",
            updatedRelative: "Today",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 1,
            enabledTargetCount: 1,
            saveState: SaveState(phase: .idle, detail: nil),
            skillSelection: .full,
            targetSelection: .full,
            enabledTargetLabels: ["Claude"],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            targets: targets,
            skills: skills
        )
    }

    private func detailRevisionSkill(summary: String) -> DetailSkill {
        DetailSkill(
            id: "browse",
            title: "Browse",
            summary: summary,
            version: nil,
            author: "Acme",
            originLabel: "GitHub",
            starCount: nil,
            folderPath: nil,
            relativeFolderPath: nil,
            documents: [],
            detailLines: [],
            documentContent: "",
            isEnabled: true,
            warningCount: 0
        )
    }

    private func fileTreeFile(id: String, title: String) -> FileTreeItem {
        FileTreeItem(
            id: id,
            title: title,
            path: "/\(id)",
            isDirectory: false,
            isSkillRoot: false,
            isSkillDocument: title.lowercased().hasSuffix(".md"),
            skillId: nil,
            children: []
        )
    }
}

import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailViewModelTests: XCTestCase {
    func testCopiesVisibleDetailShapeFromSnapshot() {
        let snapshot = DetailViewModel.Snapshot(
            sourceId: "alpha",
            title: "AlphaHub",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: MainViewModel.GroupCardStats(
                skillCount: 2,
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub"
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
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: ["2026-03-25T12:00:00Z"],
            deploymentFacts: ["Claude Code -> /Users/vint/.claude"],
            fileTree: [
                MainViewModel.FileTreeLine(
                    id: "root",
                    depth: 0,
                    prefix: "",
                    title: "alpha",
                    isFile: false
                )
            ],
            groupDocuments: [
                MainViewModel.DocumentTab(
                    id: "readme",
                    title: "README.md",
                    path: "README.md",
                    metadata: [
                        MainViewModel.MetadataEntry(id: "name", key: "name", value: "AlphaHub")
                    ],
                    content: "Hello",
                    renderCacheKey: "readme-cache",
                    externalURL: "https://github.com/acme/alpha-hub/blob/HEAD/README.md"
                )
            ],
            targets: [
                MainViewModel.DetailTarget(
                    id: "claude-code",
                    label: "Claude Code",
                    shortLabel: "Claude",
                    isEnabled: true
                )
            ],
            skills: [
                MainViewModel.DetailSkill(
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
        XCTAssertEqual(viewModel.fileTree.first?.isFile, snapshot.fileTree.first?.isFile)
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
}

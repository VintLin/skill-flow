import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailViewModelTests: XCTestCase {
    func testCopiesVisibleDetailShapeFromMainViewModelDetailViewData() {
        let detail = MainViewModel.DetailViewData(
            sourceId: "alpha",
            title: "AlphaHub",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
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
        let snapshot = DetailViewModel.Snapshot(detail: detail)

        let viewModel = DetailViewModel(snapshot: snapshot)

        XCTAssertEqual(viewModel.sourceId, detail.sourceId)
        XCTAssertEqual(viewModel.title, detail.title)
        XCTAssertEqual(viewModel.subtitle, detail.subtitle)
        XCTAssertEqual(viewModel.author, detail.author)
        XCTAssertEqual(viewModel.originLabel, detail.originLabel)
        XCTAssertEqual(viewModel.starCount, detail.starCount)
        XCTAssertEqual(viewModel.sourceDetailLines, detail.sourceDetailLines)
        XCTAssertEqual(viewModel.sourceRepositoryURL, detail.sourceRepositoryURL)
        XCTAssertEqual(viewModel.locator, detail.locator)
        XCTAssertEqual(viewModel.groupPath, detail.groupPath)
        XCTAssertEqual(viewModel.updatedAt, detail.updatedAt)
        XCTAssertEqual(viewModel.updatedRelative, detail.updatedRelative)
        XCTAssertEqual(viewModel.health, detail.health)
        XCTAssertEqual(viewModel.warningCount, detail.warningCount)
        XCTAssertEqual(viewModel.errorCount, detail.errorCount)
        XCTAssertEqual(viewModel.enabledSkillCount, detail.enabledSkillCount)
        XCTAssertEqual(viewModel.totalSkillCount, detail.totalSkillCount)
        XCTAssertEqual(viewModel.enabledTargetCount, detail.enabledTargetCount)
        XCTAssertEqual(viewModel.saveState, detail.saveState)
        XCTAssertEqual(viewModel.skillSelection, detail.skillSelection)
        XCTAssertEqual(viewModel.targetSelection, detail.targetSelection)
        XCTAssertEqual(viewModel.enabledTargetLabels, detail.enabledTargetLabels)
        XCTAssertEqual(viewModel.sourceFacts, detail.sourceFacts)
        XCTAssertEqual(viewModel.deploymentFacts, detail.deploymentFacts)
        XCTAssertEqual(viewModel.fileTree.count, detail.fileTree.count)
        XCTAssertEqual(viewModel.fileTree.first?.title, detail.fileTree.first?.title)
        XCTAssertEqual(viewModel.fileTree.first?.isFile, detail.fileTree.first?.isFile)
        XCTAssertEqual(viewModel.groupDocuments.count, detail.groupDocuments.count)
        XCTAssertEqual(viewModel.groupDocuments.first?.title, detail.groupDocuments.first?.title)
        XCTAssertEqual(viewModel.groupDocuments.first?.metadata.first?.key, detail.groupDocuments.first?.metadata.first?.key)
        XCTAssertEqual(viewModel.targets.count, detail.targets.count)
        XCTAssertEqual(viewModel.targets.first?.label, detail.targets.first?.label)
        XCTAssertEqual(viewModel.targets.first?.shortLabel, detail.targets.first?.shortLabel)
        XCTAssertEqual(viewModel.skills.count, detail.skills.count)
        XCTAssertEqual(viewModel.skills.first?.title, detail.skills.first?.title)
        XCTAssertEqual(viewModel.skills.first?.documents.first?.title, detail.skills.first?.documents.first?.title)
        XCTAssertEqual(viewModel.skills.first?.documents.first?.externalURL, detail.skills.first?.documents.first?.externalURL)
    }
}

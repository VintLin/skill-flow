import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailScreenContainerTests: XCTestCase {
    func testBuildsDetailViewModelFromCurrentDetailRoute() {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        let detail = DetailViewModel.Snapshot(detail: MainViewModel.DetailViewData(
            sourceId: "alpha",
            title: "AlphaHub",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            sourceDetailLines: ["Provider: clawhub"],
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
        ))

        let container = DetailScreenContainer(state: state) { sourceId in
            XCTAssertEqual(sourceId, "alpha")
            return detail
        }

        XCTAssertEqual(container.viewModel?.sourceId, "alpha")
        XCTAssertEqual(container.viewModel?.title, "AlphaHub")
        XCTAssertEqual(container.viewModel?.groupDocuments.first?.title, "README.md")
        XCTAssertEqual(container.viewModel?.targets.first?.label, "Claude Code")
    }

    func testReturnsNilWhenCurrentRouteIsNotDetail() {
        let state = DesktopAppState()
        let container = DetailScreenContainer(state: state) { _ in
            XCTFail("detail data provider should not be queried for non-detail routes")
            return nil
        }

        XCTAssertNil(container.viewModel)
    }

    func testReturnsNilWhenCurrentDetailRouteHasNoSnapshot() {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        let container = DetailScreenContainer(state: state) { sourceId in
            XCTAssertEqual(sourceId, "alpha")
            return nil
        }

        XCTAssertNil(container.viewModel)
    }
}

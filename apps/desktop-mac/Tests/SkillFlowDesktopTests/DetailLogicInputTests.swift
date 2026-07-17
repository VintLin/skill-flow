import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailLogicInputTests: XCTestCase {
    func testBuildsDetailFromTypedInputWithoutMainViewModel() {
        let logic = DetailLogic(
            detailEnrichmentQuery: DetailEnrichmentStub(),
            warningsSink: { _ in }
        )
        let summary = SourceManagement.WorkflowSummary(
            sourceId: "source-1",
            sourceKind: "github",
            sourceDisplayName: "Writing Tools",
            sourceOriginalDisplayName: "Writing Tools Original",
            sourceLocator: "github.com/acme/writing-tools",
            sourceCanonicalRepo: "acme/writing-tools",
            selectionMode: .all,
            leafs: [
                SourceManagement.LeafSummary(
                    id: "leaf-1",
                    sourceId: "source-1",
                    linkName: "writer",
                    name: "Writer",
                    description: "Drafts prose.",
                    sourceTitle: nil,
                    metadataWarnings: []
                )
            ],
            selectedLeafIds: ["leaf-1"],
            enabledTargets: ["claude-code"],
            targetLeafIdsByTarget: ["claude-code": ["leaf-1"]],
            health: "healthy",
            warningCount: 2,
            errorCount: 0,
            updatedAt: "2026-07-16T12:00:00Z"
        )
        let input = DetailLogic.DetailInput(
            summary: summary,
            draft: SourceManagement.DraftState(
                selectedLeafIds: ["leaf-1"],
                enabledTargets: ["claude-code"]
            ),
            inspectedPayload: [:],
            groupStats: GroupCardStats(
                downloadCount: 42,
                starCount: 7,
                githubURL: "https://github.com/acme/writing-tools",
                localPath: "/tmp/writing-tools"
            ),
            visibleTargetIds: ["claude-code"],
            customAgents: [],
            projectPath: "/tmp/project",
            saveState: SaveState(phase: .idle, detail: nil),
            skillSelection: .full,
            targetSelection: .full,
            projectedNamesByLeafId: ["leaf-1": "writer-v2"],
            fallbackGroupPath: "/tmp/writing-tools",
            gitHubRepoContext: nil,
            updatedRelative: "Updated yesterday"
        )

        let detail = logic.detailViewData(for: input)

        XCTAssertEqual(detail.sourceId, "source-1")
        XCTAssertEqual(detail.title, "Writing Tools")
        XCTAssertEqual(detail.originalDisplayName, "Writing Tools Original")
        XCTAssertEqual(detail.updatedRelative, "Updated yesterday")
        XCTAssertEqual(detail.groupStats.starCount, 7)
        XCTAssertEqual(detail.enabledTargetLabels, ["Claude Code"])
        XCTAssertEqual(detail.targets.map(\.id), ["claude-code"])
        XCTAssertEqual(detail.skills.map(\.title), ["writer-v2"])
        XCTAssertEqual(detail.skillSelection, .full)
        XCTAssertEqual(detail.targetSelection, .full)
    }
}

private struct DetailEnrichmentStub: DesktopDetailEnrichmentQuerying {}

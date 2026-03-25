import XCTest

@testable import SkillFlowDesktop

final class ProjectionRulesTests: XCTestCase {
    func testProjectionRulesDetectExactDuplicatesAndRenameConflicts() {
        let summaries = makeSummaries()
        let drafts: [String: ProjectionDraftState] = [
            "alpha": ProjectionDraftState(
                enabledTargets: ["claude-code"],
                selectedLeafIds: ["alpha-a", "alpha-b"]
            ),
            "beta": ProjectionDraftState(
                enabledTargets: ["claude-code"],
                selectedLeafIds: ["beta-a", "beta-b"]
            )
        ]

        let warnings = buildProjectionWarningMap(
            summaries: summaries,
            drafts: drafts,
            sourceId: "alpha"
        )
        let names = buildProjectionNameMap(
            summaries: summaries,
            drafts: drafts,
            sourceId: "alpha"
        )

        XCTAssertEqual(warnings["alpha-a"]?.first, "identical skill already selected in BetaHub, this one will be skipped")
        XCTAssertEqual(warnings["alpha-b"]?.first, "conflicts with BetaHub, will deploy as AlphaHub-browse")
        XCTAssertEqual(names["alpha-a"], "browse")
        XCTAssertEqual(names["alpha-b"], "AlphaHub-browse")
        XCTAssertEqual(names["beta-a"], "BetaHub-browse")
        XCTAssertEqual(names["beta-b"], "acme-BetaHub-browse")
    }

    func testProjectionRulesIgnoreSourcesWithoutTargetOverlap() {
        let summaries = makeSummaries()
        let drafts: [String: ProjectionDraftState] = [
            "alpha": ProjectionDraftState(
                enabledTargets: [],
                selectedLeafIds: ["alpha-a"]
            ),
            "beta": ProjectionDraftState(
                enabledTargets: [],
                selectedLeafIds: ["beta-a"]
            )
        ]

        XCTAssertEqual(
            buildProjectionWarningMap(summaries: summaries, drafts: drafts, sourceId: "alpha"),
            [:]
        )
        XCTAssertEqual(
            buildProjectionNameMap(summaries: summaries, drafts: drafts, sourceId: "alpha"),
            [:]
        )
    }

    private func makeSummaries() -> [ProjectionSourceSummary] {
        [
            ProjectionSourceSummary(
                sourceId: "alpha",
                displayName: "AlphaHub",
                locator: "https://github.com/acme/alpha-hub",
                leafs: [
                    ProjectionLeafSummary(id: "alpha-a", linkName: "browse", name: "browse", description: "Browse things."),
                    ProjectionLeafSummary(id: "alpha-b", linkName: "browse", name: "browse", description: "Browse other things.")
                ]
            ),
            ProjectionSourceSummary(
                sourceId: "beta",
                displayName: "BetaHub",
                locator: "https://github.com/acme/beta-hub",
                leafs: [
                    ProjectionLeafSummary(id: "beta-a", linkName: "browse", name: "browse", description: "Browse things."),
                    ProjectionLeafSummary(id: "beta-b", linkName: "browse", name: "browse", description: "Browse alternate things.")
                ]
            )
        ]
    }
}

import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class ImportViewModelTests: XCTestCase {
    func testProjectCardSummaryFollowsCurrentFallbackOrder() {
        let explicitSummary = makeItem(
            summary: "Explicit summary",
            snapshot: makeSnapshot(description: "Snapshot description"),
            matchedSkills: [MainViewModel.ImportMatchedSkill(skillId: "browse", title: "Browse", installs: 1200)],
            matchedSkillNames: ["Named skill"],
            previewPhase: .failed(.plain("Failed import"))
        )
        let fromSnapshot = makeItem(
            summary: "",
            snapshot: makeSnapshot(description: "Snapshot description"),
            matchedSkills: [MainViewModel.ImportMatchedSkill(skillId: "browse", title: "Browse", installs: 1200)],
            matchedSkillNames: ["Named skill"],
            previewPhase: .failed(.plain("Failed import"))
        )
        let fromMatchedSkills = makeItem(
            summary: "",
            snapshot: makeSnapshot(description: ""),
            matchedSkills: [
                MainViewModel.ImportMatchedSkill(skillId: "browse", title: "Browse", installs: 1200),
                MainViewModel.ImportMatchedSkill(skillId: "write", title: "Write", installs: nil)
            ],
            matchedSkillNames: ["Named skill"]
        )
        let fromMatchedSkillNames = makeItem(
            summary: "",
            snapshot: makeSnapshot(description: ""),
            matchedSkills: [],
            matchedSkillNames: ["Browse", "Write"]
        )
        let loadingFallback = makeItem(
            summary: "",
            snapshot: makeSnapshot(description: ""),
            matchedSkills: [],
            matchedSkillNames: [],
            previewPhase: .loading
        )
        let failedFallback = makeItem(
            summary: "",
            snapshot: makeSnapshot(description: ""),
            matchedSkills: [],
            matchedSkillNames: [],
            previewPhase: .failed(.plain("Failed import"))
        )

        let viewModel = ImportViewModel(
            groups: [
                explicitSummary,
                fromSnapshot,
                fromMatchedSkills,
                fromMatchedSkillNames,
                loadingFallback,
                failedFallback
            ],
            locale: Locale(identifier: "en")
        )

        XCTAssertEqual(viewModel.cards[0].summary, "Explicit summary")
        XCTAssertEqual(viewModel.cards[1].summary, "Snapshot description")
        XCTAssertEqual(viewModel.cards[2].summary, "Browse 1,200, Write")
        XCTAssertEqual(viewModel.cards[3].summary, "Browse, Write")
        XCTAssertEqual(viewModel.cards[4].summary, "Loading skills...")
        XCTAssertEqual(viewModel.cards[5].summary, "Failed import")
    }

    func testProjectCardSourceFactsPreferSnapshotValuesAndIncludeOwnerTrustAndMatches() {
        let viewModel = ImportViewModel(
            groups: [
                makeItem(
                    snapshot: makeSnapshot(
                        totalInstalls: 211_898,
                        skillCount: 4,
                        repoStars: 1_200,
                        owner: .init(
                            slug: "acme",
                            sourceURL: "https://example.com/acme",
                            githubURL: "https://github.com/acme",
                            sourceCount: 12,
                            skillCount: 34,
                            totalInstalls: 98_765
                        ),
                        trust: .init(official: true, trending: true, hot: false, audited: false),
                        description: "Snapshot description"
                    ),
                    matchedSkills: [
                        MainViewModel.ImportMatchedSkill(skillId: "browse", title: "Browse", installs: 1_200),
                        MainViewModel.ImportMatchedSkill(skillId: "write", title: "Write", installs: nil)
                    ]
                )
            ],
            locale: Locale(identifier: "en")
        )

        XCTAssertEqual(
            viewModel.cards[0].sourceFacts,
            [
                "Installs 211,898",
                "Stars 1,200",
                "Skills 4",
                "Owner @acme · 12 sources · 34 skills",
                "Trust Official · Trending",
                "Matches Browse 1,200, Write"
            ]
        )
    }

    func testProjectCardSourceFactsFallBackToItemLevelCountsWhenSnapshotIsMissing() {
        let viewModel = ImportViewModel(
            groups: [
                makeItem(
                    snapshot: nil,
                    totalInstalls: 18_400,
                    starCount: 230,
                    skillCount: 9
                )
            ],
            locale: Locale(identifier: "en")
        )

        XCTAssertEqual(
            viewModel.cards[0].sourceFacts,
            [
                "Installs 18,400",
                "Stars 230",
                "Skills 9"
            ]
        )
    }

    func testProjectCardSubtitleMatchesLocatorPatterns() {
        let viewModel = ImportViewModel(
            groups: [
                makeItem(locator: "github.com/anthropics/skills"),
                makeItem(locator: "git@github.com:anthropics/skills.git"),
                makeItem(locator: "anthropics/skills"),
                makeItem(locator: "not-a-repo")
            ],
            locale: Locale(identifier: "en")
        )

        XCTAssertEqual(viewModel.cards[0].subtitle, "by @anthropics")
        XCTAssertEqual(viewModel.cards[1].subtitle, "by @anthropics")
        XCTAssertEqual(viewModel.cards[2].subtitle, "by @anthropics")
        XCTAssertEqual(viewModel.cards[3].subtitle, "recommended")
    }

    private func makeItem(
        summary: String = "",
        snapshot: MainViewModel.SourceSnapshotData? = nil,
        matchedSkills: [MainViewModel.ImportMatchedSkill] = [],
        matchedSkillNames: [String] = [],
        totalInstalls: Int? = nil,
        starCount: Int? = nil,
        skillCount: Int? = nil,
        previewPhase: MainViewModel.ImportLoadPhase = .ready,
        enrichPhase: MainViewModel.ImportLoadPhase = .ready,
        locator: String = "github.com/anthropics/skills"
    ) -> MainViewModel.ImportGroupItem {
        MainViewModel.ImportGroupItem(
            id: locator,
            title: "Skills",
            locator: locator,
            canonicalRepo: "anthropics/skills",
            aliases: [],
            summary: summary,
            starCount: starCount,
            totalInstalls: totalInstalls,
            skillCount: skillCount,
            matchedSkillNames: matchedSkillNames,
            matchedSkills: matchedSkills,
            snapshot: snapshot,
            enrichPhase: enrichPhase,
            previewPhase: previewPhase,
            skills: [
                MainViewModel.ImportGroupSkill(
                    id: "browse",
                    title: "Browse",
                    summary: "Browse things.",
                    selectedByDefault: true
                ),
                MainViewModel.ImportGroupSkill(
                    id: "write",
                    title: "Write",
                    summary: "Write things.",
                    selectedByDefault: false
                )
            ],
            targets: [
                MainViewModel.ImportGroupTarget(id: "claude-code", selectedByDefault: true),
                MainViewModel.ImportGroupTarget(id: "codex", selectedByDefault: false)
            ]
        )
    }

    private func makeSnapshot(
        totalInstalls: Int? = nil,
        skillCount: Int? = nil,
        repoStars: Int? = nil,
        owner: MainViewModel.SnapshotOwner = .init(
            slug: "acme",
            sourceURL: "https://example.com/acme",
            githubURL: "https://github.com/acme",
            sourceCount: 12,
            skillCount: 34,
            totalInstalls: 98_765
        ),
        trust: MainViewModel.SnapshotTrust? = .init(official: true, trending: true, hot: false, audited: false),
        description: String = "Snapshot description"
    ) -> MainViewModel.SourceSnapshotData {
        MainViewModel.SourceSnapshotData(
            canonicalRepo: "anthropics/skills",
            title: "Skills",
            provider: "github",
            sourceURL: "https://example.com/source",
            repoURL: "https://github.com/anthropics/skills",
            repoLabel: "anthropics/skills",
            totalInstalls: totalInstalls,
            skillCount: skillCount,
            repoStars: repoStars,
            forkCount: nil,
            description: description,
            topics: [],
            language: nil,
            defaultBranch: nil,
            pushedAt: nil,
            owner: owner,
            skills: [],
            trust: trust
        )
    }
}

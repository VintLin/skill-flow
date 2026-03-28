import XCTest

@testable import SkillFlowDesktop

@MainActor
final class ImportViewModelTests: XCTestCase {
    private let locale = Locale(identifier: "en")

    func testSummaryPrefersExplicitSummaryThenSnapshotThenMatchesThenFallbackStates() {
        let explicit = makeItem(
            summary: "Explicit summary",
            matchedSkills: [makeMatchedSkill(title: "browse", installs: 1200)],
            snapshot: makeSnapshot(description: "Snapshot summary"),
            previewPhase: .loading
        )
        XCTAssertEqual(ImportViewModel.card(from: explicit, locale: locale).summary, "Explicit summary")

        let snapshot = makeItem(
            summary: "",
            matchedSkills: [makeMatchedSkill(title: "browse", installs: 1200)],
            snapshot: makeSnapshot(description: "Snapshot summary"),
            previewPhase: .loading
        )
        XCTAssertEqual(ImportViewModel.card(from: snapshot, locale: locale).summary, "Snapshot summary")

        let matchedSkills = makeItem(
            matchedSkills: [
                makeMatchedSkill(title: "browse", installs: 1200),
                makeMatchedSkill(title: "review", installs: nil)
            ]
        )
        XCTAssertEqual(ImportViewModel.card(from: matchedSkills, locale: locale).summary, "browse 1,200, review")

        let matchedNames = makeItem(
            matchedSkillNames: ["browse", "review"]
        )
        XCTAssertEqual(ImportViewModel.card(from: matchedNames, locale: locale).summary, "browse, review")

        let loading = makeItem(previewPhase: .loading)
        XCTAssertEqual(ImportViewModel.card(from: loading, locale: locale).summary, "Loading skills...")

        let failed = makeItem(previewPhase: .failed(.plain("Preview failed")))
        XCTAssertEqual(ImportViewModel.card(from: failed, locale: locale).summary, "Preview failed")

        let fallback = makeItem(canonicalRepo: "anthropics/skills")
        XCTAssertEqual(ImportViewModel.card(from: fallback, locale: locale).summary, "Import from anthropics/skills")
    }

    func testSourceFactsPreferSnapshotDataAndComposeOwnerTrustAndMatches() {
        let item = makeItem(
            starCount: 15,
            totalInstalls: 25,
            skillCount: 3,
            matchedSkills: [
                makeMatchedSkill(title: "browse", installs: 1200),
                makeMatchedSkill(title: "review", installs: nil)
            ],
            snapshot: makeSnapshot(
                totalInstalls: 2400,
                skillCount: 12,
                repoStars: 800,
                owner: MainViewModel.SnapshotOwner(
                    slug: "anthropics",
                    sourceURL: "https://example.com/anthropics",
                    githubURL: "https://github.com/anthropics",
                    sourceCount: 7,
                    skillCount: 42,
                    totalInstalls: 9999
                ),
                trust: MainViewModel.SnapshotTrust(
                    official: true,
                    trending: true,
                    hot: false,
                    audited: true
                )
            )
        )

        XCTAssertEqual(
            ImportViewModel.card(from: item, locale: locale).sourceFacts,
            [
                "Installs 2,400",
                "Stars 800",
                "Skills 12",
                "Owner @anthropics · 7 sources · 42 skills",
                "Trust Official · Trending · Audited",
                "Matches browse 1,200, review",
            ]
        )
    }

    func testSourceFactsFallBackToLoadingOrErrorWhenNoFactsExist() {
        let loading = makeItem(enrichPhase: .loading)
        XCTAssertEqual(ImportViewModel.card(from: loading, locale: locale).sourceFacts, ["Source loading..."])

        let failed = makeItem(enrichPhase: .failed(.plain("Enrich failed")))
        XCTAssertEqual(ImportViewModel.card(from: failed, locale: locale).sourceFacts, ["Enrich failed"])
    }

    func testSubtitleDerivesOwnerFromGitHubAndRepoPatterns() {
        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "https://github.com/anthropic/skills.git"),
                locale: locale
            ).subtitle,
            "by @anthropic"
        )

        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "git@github.com:anthropic/skills.git"),
                locale: locale
            ).subtitle,
            "by @anthropic"
        )

        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "anthropic/skills"),
                locale: locale
            ).subtitle,
            "by @anthropic"
        )

        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "https://example.com/custom-source"),
                locale: locale
            ).subtitle,
            "by @https:"
        )
    }

    private func makeItem(
        id: String = "anthropics-skills",
        title: String = "Anthropic Skills",
        locator: String = "anthropic/skills",
        canonicalRepo: String = "anthropics/skills",
        aliases: [String] = [],
        summary: String = "",
        starCount: Int? = nil,
        totalInstalls: Int? = nil,
        skillCount: Int? = nil,
        matchedSkillNames: [String] = [],
        matchedSkills: [MainViewModel.ImportMatchedSkill] = [],
        snapshot: MainViewModel.SourceSnapshotData? = nil,
        enrichPhase: MainViewModel.ImportLoadPhase = .ready,
        previewPhase: MainViewModel.ImportLoadPhase = .ready,
        skills: [MainViewModel.ImportGroupSkill] = [],
        targets: [MainViewModel.ImportGroupTarget] = []
    ) -> MainViewModel.ImportGroupItem {
        MainViewModel.ImportGroupItem(
            id: id,
            title: title,
            locator: locator,
            canonicalRepo: canonicalRepo,
            aliases: aliases,
            summary: summary,
            starCount: starCount,
            totalInstalls: totalInstalls,
            skillCount: skillCount,
            matchedSkillNames: matchedSkillNames,
            matchedSkills: matchedSkills,
            snapshot: snapshot,
            enrichPhase: enrichPhase,
            previewPhase: previewPhase,
            skills: skills,
            targets: targets
        )
    }

    private func makeMatchedSkill(title: String, installs: Int?) -> MainViewModel.ImportMatchedSkill {
        MainViewModel.ImportMatchedSkill(skillId: title, title: title, installs: installs)
    }

    private func makeSnapshot(
        description: String = "",
        totalInstalls: Int? = nil,
        skillCount: Int? = nil,
        repoStars: Int? = nil,
        owner: MainViewModel.SnapshotOwner = MainViewModel.SnapshotOwner(
            slug: "anthropics",
            sourceURL: "https://example.com/anthropics",
            githubURL: "https://github.com/anthropics",
            sourceCount: nil,
            skillCount: nil,
            totalInstalls: nil
        ),
        trust: MainViewModel.SnapshotTrust? = nil
    ) -> MainViewModel.SourceSnapshotData {
        MainViewModel.SourceSnapshotData(
            canonicalRepo: "anthropics/skills",
            title: "Anthropic Skills",
            provider: "clawhub",
            sourceURL: "https://example.com/anthropics/skills",
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

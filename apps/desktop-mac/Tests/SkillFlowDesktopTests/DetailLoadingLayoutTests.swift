import XCTest

@testable import SkillFlowDesktop

final class DetailLoadingLayoutTests: XCTestCase {
    @MainActor
    func testPreferredDetailGroupTitleUsesSnapshotTitleAndRejectsDirtyDisplayName() {
        XCTAssertEqual(
            MainViewModel.preferredDetailGroupTitle(
                sourceId: "alpha",
                displayName: "zsh-compatible: use find i...",
                snapshotTitle: "Anthropic Skills",
                locator: "https://github.com/anthropics/skills"
            ),
            "Anthropic Skills"
        )

        XCTAssertEqual(
            MainViewModel.preferredDetailGroupTitle(
                sourceId: "alpha",
                displayName: "zsh-compatible: use find i...",
                snapshotTitle: nil,
                locator: "https://github.com/anthropics/skills"
            ),
            "skills"
        )
    }

    @MainActor
    func testPreferredDetailSkillTitleUsesProjectedAndSnapshotNamesBeforeRawLeafName() {
        XCTAssertEqual(
            MainViewModel.preferredDetailSkillTitle(
                preparedTitle: nil,
                payloadTitle: nil,
                projectedName: "Browse Web",
                snapshotTitle: "Browse",
                rawLeafName: "zsh-compatible: use find i...",
                fallbackLinkName: "browse"
            ),
            "Browse Web"
        )

        XCTAssertEqual(
            MainViewModel.preferredDetailSkillTitle(
                preparedTitle: nil,
                payloadTitle: nil,
                projectedName: nil,
                snapshotTitle: "Browse",
                rawLeafName: "zsh-compatible: use find i...",
                fallbackLinkName: "browse"
            ),
            "Browse"
        )
    }

    func testGroupOverviewLoadingUsesDedicatedPlaceholderLayout() {
        XCTAssertEqual(DetailLoadingLayout.groupAgentPlaceholderWidths, [120, 132, 118])
        XCTAssertEqual(DetailLoadingLayout.groupDocumentTabPlaceholderWidths, [86, 98, 82])
        XCTAssertEqual(DetailLoadingLayout.groupDocumentLineCount, 10)
    }

    func testSkillLoadingUsesSingleDocumentPlaceholderLayout() {
        XCTAssertEqual(DetailLoadingLayout.skillDocumentTabPlaceholderWidths, [92, 84, 106])
        XCTAssertEqual(DetailLoadingLayout.skillDocumentLineCount, 12)
    }

    func testSidebarIndicatorAlignsFirstSkillToVisibleRowCenter() {
        let frame = DetailSidebarLayout.indicatorFrame(
            itemId: "skill:research",
            skillIds: ["research", "debugging"]
        )

        XCTAssertEqual(frame?.minY, 86)
        XCTAssertEqual(frame?.height, 36)
    }

    func testSidebarVersionTextNormalizesVersionPrefix() {
        XCTAssertEqual(
            DetailSidebarLayout.sidebarVersionText("1.0.0", locale: Locale(identifier: "en")),
            "Version v1.0.0"
        )
        XCTAssertEqual(
            DetailSidebarLayout.sidebarVersionText(nil, locale: Locale(identifier: "en")),
            " "
        )
    }

    @MainActor
    func testDetailRouteBootstrapSeedsDefaultSelectionsFromLoadedDetail() {
        let state = DetailScreenState()
        let detail = DetailViewModel(snapshot: .init(
            sourceId: "alpha",
            title: "Alpha",
            subtitle: "github",
            author: "@acme",
            originLabel: "GitHub",
            starCount: 12,
            groupStats: .init(skillCount: 1, downloadCount: nil, starCount: 12, githubURL: nil),
            sourceDetailLines: [],
            sourceRepositoryURL: nil,
            locator: "acme/alpha",
            groupPath: nil,
            updatedAt: "",
            updatedRelative: "",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 1,
            enabledTargetCount: 0,
            saveState: .init(phase: .idle, detail: nil),
            skillSelection: .full,
            targetSelection: .empty,
            enabledTargetLabels: [],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: [],
            groupDocuments: [
                .init(id: "readme", title: "README.md", path: "README.md", metadata: [], content: "# Readme", renderCacheKey: "readme", externalURL: nil)
            ],
            targets: [],
            skills: [
                .init(
                    id: "browse",
                    title: "Browse",
                    summary: "Browse things",
                    version: "1.0.0",
                    author: "@acme",
                    originLabel: "GitHub",
                    starCount: 12,
                    folderPath: nil,
                    relativeFolderPath: nil,
                    documents: [
                        .init(id: "skill-md", title: "SKILL.md", path: "SKILL.md", metadata: [], content: "# Skill", renderCacheKey: "skill-md", externalURL: nil)
                    ],
                    detailLines: [],
                    documentContent: "# Skill",
                    isEnabled: true,
                    warningCount: 0
                )
            ]
        ))

        DetailRouteBootstrap.applySelections(state: state, sourceId: "alpha", detail: detail)

        XCTAssertEqual(state.detailSkillIdByGroup["alpha"], "browse")
        XCTAssertEqual(state.detailDocumentTabIdByGroup["alpha"], "readme")
        XCTAssertEqual(state.detailDocumentTabIdBySkill["browse"], "skill-md")
        XCTAssertEqual(state.detailShowsGroupOverviewByGroup["alpha"], true)
    }

    func testDetailRouteBootstrapOnlyFetchesInspectWhenPayloadIsMissing() {
        XCTAssertTrue(DetailRouteBootstrap.shouldFetchInspect(hasInspectPayload: false, isInspectRequestInFlight: false))
        XCTAssertFalse(DetailRouteBootstrap.shouldFetchInspect(hasInspectPayload: true, isInspectRequestInFlight: false))
        XCTAssertFalse(DetailRouteBootstrap.shouldFetchInspect(hasInspectPayload: false, isInspectRequestInFlight: true))
    }

    func testDetailWordCountCountsWhitespaceSeparatedWords() {
        XCTAssertEqual(DetailInfoLayout.wordCount(from: "# Title\n\none two  three"), 4)
        XCTAssertNil(DetailInfoLayout.wordCount(from: "   "))
    }

    func testDetailHeaderInfoItemsNormalizeVersionAndWordCount() {
        XCTAssertEqual(
            DetailInfoLayout.headerItems(version: "1.2.3", documentContent: "one two three", locale: Locale(identifier: "en"))
                .map(\.text),
            ["v1.2.3", "3"]
        )
    }
}

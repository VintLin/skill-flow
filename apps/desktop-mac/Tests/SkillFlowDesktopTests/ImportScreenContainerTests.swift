import XCTest

@testable import SkillFlowDesktop

@MainActor
final class ImportScreenContainerTests: XCTestCase {
    func testIsActiveOnlyForImportRoute() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        XCTAssertFalse(container.isActive)

        state.view.currentRoute = .importPage
        XCTAssertTrue(container.isActive)

        state.view.currentRoute = .detail(sourceId: "alpha")
        XCTAssertFalse(container.isActive)
    }

    func testScreenStatePersistsAcrossRouteRoundTrip() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        container.screenState.searchText = "anthropic/skills"
        container.screenState.placeholderIndex = 2

        state.view.currentRoute = .importPage
        state.view.currentRoute = .home
        state.view.currentRoute = .importPage

        XCTAssertEqual(container.screenState.searchText, "anthropic/skills")
        XCTAssertEqual(container.screenState.placeholderIndex, 2)
    }

    func testDraftsPersistAcrossContainerRecreationThroughDesktopAppState() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let firstContainer = ImportScreenContainer(state: state, mainViewModel: model)
        state.view.currentRoute = .importPage

        let card = ImportViewModel.card(
            from: makeItem(
                id: "anthropics-skills",
                title: "Anthropic Skills",
                locator: "anthropic/skills"
            ),
            locale: Locale(identifier: "en")
        )

        firstContainer.setSkill("browse", enabled: false, for: card)
        firstContainer.setTarget("claude-code", enabled: true, for: card)

        let secondContainer = ImportScreenContainer(state: state, mainViewModel: model)

        XCTAssertEqual(
            secondContainer.draft(for: card),
            ImportDraftState(
                selectedSkillIds: [],
                enabledTargetIds: ["claude-code"]
            )
        )
    }

    func testSnapshotProjectsImportBusinessState() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        state.view.currentRoute = .importPage

        model.recommendedImportGroups = [
            makeItem(id: "recommended", title: "Recommended", locator: "anthropic/skills")
        ]
        model.searchImportGroups = [
            makeItem(id: "search", title: "Search", locator: "openai/skills")
        ]

        let recommended = container.snapshot(locale: Locale(identifier: "en"))

        XCTAssertEqual(recommended?.submittedQuery, "")
        XCTAssertEqual(recommended?.searchPhase, .idle)
        XCTAssertEqual(recommended?.cards.map(\.id), ["recommended"])

        model.importSubmittedQuery = "openai"
        model.importSearchPhase = .loading
        model.importingImportGroupId = "search"

        let searched = container.snapshot(locale: Locale(identifier: "en"))

        XCTAssertEqual(searched?.submittedQuery, "openai")
        XCTAssertEqual(searched?.searchPhase, .loading)
        XCTAssertEqual(searched?.cards.map(\.id), ["search"])
        XCTAssertEqual(searched?.importingGroupId, "search")
    }

    func testImportViewModelFallsBackToVisibleTargetsWhenPreviewTargetsAreUnavailable() {
        let viewModel = ImportViewModel(
            items: [
                MainViewModel.ImportGroupItem(
                    id: "recommended",
                    title: "Recommended",
                    locator: "anthropic/skills",
                    canonicalRepo: "anthropic/skills",
                    aliases: [],
                    summary: "",
                    starCount: nil,
                    totalInstalls: nil,
                    skillCount: nil,
                    matchedSkillNames: [],
                    matchedSkills: [],
                    snapshot: nil,
                    enrichPhase: .idle,
                    previewPhase: .loading,
                    skills: [],
                    targets: []
                )
            ],
            locale: Locale(identifier: "en"),
            fallbackTargetIds: ["claude-code", "cursor"]
        )

        XCTAssertEqual(viewModel.cards.first?.targets.map(\.id), ["claude-code", "cursor"])
        XCTAssertFalse(viewModel.cards.first?.targetsLoading ?? true)
    }

    func testImportScreenPreviewsEveryRenderedCardInsteadOfFirstFourOnly() {
        let cards = (0..<6).map { index in
            ImportViewModel.Card(
                id: "card-\(index)",
                title: "Card \(index)",
                locator: "owner/repo-\(index)",
                canonicalRepo: "owner/repo-\(index)",
                aliases: [],
                summary: "",
                subtitle: "by @owner",
                sourceFacts: [],
                stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
                skillsLoading: true,
                targetsLoading: false,
                skills: [],
                targets: []
            )
        }

        XCTAssertEqual(ImportScreen.previewGroupIDs(for: cards), cards.map(\.id))
        XCTAssertEqual(
            ImportScreen.autoPreviewTaskKey(cards: cards, submittedQuery: "browse"),
            "browse|card-0|card-1|card-2|card-3|card-4|card-5"
        )
    }

    func testImportScreenOnlyPreviewsCardsStillLoadingSkills() {
        let cards = [
            ImportViewModel.Card(
                id: "ready-card",
                title: "Ready",
                locator: "owner/ready",
                canonicalRepo: "owner/ready",
                aliases: [],
                summary: "",
                subtitle: "by @owner",
                sourceFacts: [],
                stats: .init(skillCount: 2, downloadCount: nil, starCount: nil, githubURL: nil),
                skillsLoading: false,
                targetsLoading: false,
                skills: [
                    .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true)
                ],
                targets: []
            ),
            ImportViewModel.Card(
                id: "loading-card",
                title: "Loading",
                locator: "owner/loading",
                canonicalRepo: "owner/loading",
                aliases: [],
                summary: "",
                subtitle: "by @owner",
                sourceFacts: [],
                stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
                skillsLoading: true,
                targetsLoading: false,
                skills: [],
                targets: []
            )
        ]

        XCTAssertEqual(ImportScreen.previewGroupIDs(for: cards), ["loading-card"])
        XCTAssertEqual(
            ImportScreen.autoPreviewTaskKey(cards: cards, submittedQuery: "browse"),
            "browse|loading-card"
        )
    }

    func testImportScreenUsesSpinnerForInitialLoadingInsteadOfSkeletonCards() {
        XCTAssertEqual(ImportScreen.loadingPresentationStyle(searchPhase: .loading, cardCount: 0), .spinner)
        XCTAssertEqual(ImportScreen.loadingPresentationStyle(searchPhase: .idle, cardCount: 0), .none)
        XCTAssertEqual(ImportScreen.loadingPresentationStyle(searchPhase: .loading, cardCount: 2), .none)
    }

    private func makeItem(id: String, title: String, locator: String) -> MainViewModel.ImportGroupItem {
        MainViewModel.ImportGroupItem(
            id: id,
            title: title,
            locator: locator,
            canonicalRepo: locator,
            aliases: [],
            summary: "",
            starCount: nil,
            totalInstalls: nil,
            skillCount: nil,
            matchedSkillNames: [],
            matchedSkills: [],
            snapshot: nil,
            enrichPhase: .idle,
            previewPhase: .idle,
            skills: [
                MainViewModel.ImportGroupSkill(
                    id: "browse",
                    title: "Browse",
                    summary: "Browse things.",
                    selectedByDefault: true
                )
            ],
            targets: [
                MainViewModel.ImportGroupTarget(
                    id: "claude-code",
                    selectedByDefault: false
                )
            ]
        )
    }
}

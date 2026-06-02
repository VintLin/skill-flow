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

    func testHomeLocatorHandoffRoutesToImportPageAndSubmitsDirectLocator() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        let handled = await container.homeContainer.handleHomeSearchSubmit("  \"anthropics/skills\"  ")

        XCTAssertTrue(handled)
        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.importContainer.screenState.searchText, "anthropics/skills")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "anthropics/skills")
    }

    func testHomeLocatorHandoffImportPageLoadKeepsDirectLocatorSearchState() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        let handled = await container.homeContainer.handleHomeSearchSubmit("anthropics/skills")
        XCTAssertTrue(handled)

        let searchItem = makeItem(
            id: "anthropics-skills-search",
            title: "Anthropic Skills",
            locator: "anthropics/skills"
        )
        container.mainViewModel.importSearchPhase = .loading
        container.mainViewModel.searchImportGroups = [searchItem]

        await container.mainViewModel.loadImportPageIfNeeded()

        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.importContainer.screenState.searchText, "anthropics/skills")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "anthropics/skills")
        XCTAssertEqual(container.mainViewModel.importSearchPhase, .loading)
        XCTAssertEqual(container.mainViewModel.searchImportGroups, [searchItem])
    }

    func testHomeSearchSubmitKeepsPlainTextOnHome() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)
        container.importContainer.screenState.searchText = "previous/import"
        container.mainViewModel.importSubmittedQuery = "previous/import"

        let handled = await container.homeContainer.handleHomeSearchSubmit("anthropics")

        XCTAssertFalse(handled)
        XCTAssertEqual(runtime.state.view.currentRoute, .home)
        XCTAssertEqual(container.importContainer.screenState.searchText, "previous/import")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "previous/import")
    }

    func testSupportedImportLocatorMatrix() {
        let cases: [(String, Bool)] = [
            ("https://github.com/owner/repo", true),
            ("https://github.com/owner/repo.git", true),
            ("https://github.com/owner/repo/tree/main", true),
            ("https://github.com/owner/repo/tree/main/path/to/skills", true),
            ("https://gitlab.com/owner/repo", true),
            ("https://gitlab.com/owner/repo.git", true),
            ("https://gitlab.com/owner/repo/-/tree/main", true),
            ("https://gitlab.com/owner/repo/-/tree/main/path", true),
            ("https://gitlab.com/group/subgroup/project", true),
            ("https://gitlab.com/group/subgroup/project/-/tree/main/path", true),
            ("https://gitlab.com/owner/repo/tree/main", false),
            ("https://gitlab.com/owner/repo/-/blob/main/README.md", false),
            ("https://gitlab.com/group/subgroup/project/-/blob/main/README.md", false),
            ("https://github.com/owner/repo/issues", false),
            ("https://github.com/owner/repo/pull/1", false),
            ("https://github.com/owner/repo/blob/main/SKILL.md", false),
            ("https://github.com/owner/repo/actions", false),
            ("https://github.com/owner/repo/releases", false),
            ("plain search text", false),
            ("\"/Users/Vint/skills\"", true),
            ("clawhub:anthropics/skills", true),
            ("git@github.com:owner/repo.git", true),
            ("owner/repo", true),
        ]

        for (locator, expected) in cases {
            XCTAssertEqual(
                MainViewModel.isSupportedImportLocator(locator),
                expected,
                "locator: \(locator)"
            )
        }
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

    func testSelectedLocalChoiceOverridesImportLocatorAndSelectedSkills() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-skills",
            title: "Local Skills",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true),
                .init(id: "review", title: "Review", summary: "", selectedByDefault: true),
            ],
            targets: [
                .init(id: "claude-code", selectedByDefault: false)
            ],
            localChoices: [
                MainViewModel.LocalImportChoice(
                    id: "choice-a",
                    label: "All",
                    locator: "file:///Users/Vint/skills",
                    selectedSkillIds: ["browse", "review"]
                ),
                MainViewModel.LocalImportChoice(
                    id: "choice-b",
                    label: "Browse only",
                    locator: "file:///Users/Vint/skills/browse",
                    selectedSkillIds: ["browse"]
                ),
            ]
        )

        container.setSkill("review", enabled: false, for: card)
        container.setTarget("claude-code", enabled: true, for: card)
        container.setLocalChoice("choice-b", for: card)

        await container.importGroup(card)

        XCTAssertEqual(container.selectedLocalChoice(for: card)?.id, "choice-b")
        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "file:///Users/Vint/skills/browse",
                selectedSkillIds: ["browse"],
                enabledTargets: ["claude-code"]
            )
        ])
    }

    func testBackendSelectedLocalChoiceIsUsedBeforeManualSelection() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-skills",
            title: "Local Skills",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true),
                .init(id: "review", title: "Review", summary: "", selectedByDefault: true),
            ],
            targets: [],
            selectedLocalChoiceId: "choice-b",
            localChoices: [
                MainViewModel.LocalImportChoice(
                    id: "choice-a",
                    label: "All",
                    locator: "file:///Users/Vint/skills",
                    selectedSkillIds: ["browse", "review"]
                ),
                MainViewModel.LocalImportChoice(
                    id: "choice-b",
                    label: "Browse only",
                    locator: "file:///Users/Vint/skills/browse",
                    selectedSkillIds: ["browse"]
                ),
            ]
        )

        await container.importGroup(card)

        XCTAssertEqual(container.selectedLocalChoice(for: card)?.id, "choice-b")
        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "file:///Users/Vint/skills/browse",
                selectedSkillIds: ["browse"],
                enabledTargets: []
            )
        ])
    }

    func testSnapshotProjectsImportBusinessState() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(
            state: state,
            mainViewModel: model,
            recommendationsProvider: {
                [
                    ImportRecommendationEntry(
                        canonicalRepo: "anthropics/skills",
                        locator: "anthropics/skills",
                        categoryId: "general",
                        primaryTagId: "general",
                        secondaryTagIds: [],
                        descriptionKey: "import.recommendation.description.anthropics_skills",
                        sortOrder: 10
                    )
                ]
            }
        )
        state.view.currentRoute = .importPage

        model.recommendedImportGroups = [
            makeItem(id: "recommended", title: "Recommended", locator: "anthropics/skills")
        ]
        model.searchImportGroups = [
            makeItem(id: "search", title: "Search", locator: "openai/skills")
        ]

        let recommended = container.snapshot(locale: Locale(identifier: "en"))

        XCTAssertEqual(recommended?.submittedQuery, "")
        XCTAssertEqual(recommended?.searchPhase, .idle)
        guard case .recommended(let sections) = recommended?.content else {
            return XCTFail("expected recommended content")
        }
        XCTAssertEqual(sections.flatMap(\.cards).map(\.id), ["recommended"])

        model.importSubmittedQuery = "openai"
        model.importSearchPhase = .loading
        model.importingImportGroupId = "search"

        let searched = container.snapshot(locale: Locale(identifier: "en"))

        XCTAssertEqual(searched?.submittedQuery, "openai")
        XCTAssertEqual(searched?.searchPhase, .loading)
        guard case .searchResults(let cards) = searched?.content else {
            return XCTFail("expected search content")
        }
        XCTAssertEqual(cards.map(\.id), ["search"])
        XCTAssertEqual(searched?.importingGroupId, "search")
    }

    func testLoadImportPageSeedsRecommendedContentFromLocalRecommendations() async {
        let recommendations = [
            ImportRecommendationEntry(
                canonicalRepo: "anthropics/skills",
                locator: "anthropics/skills",
                categoryId: "general",
                primaryTagId: "general",
                secondaryTagIds: [],
                descriptionKey: "import.recommendation.description.anthropics_skills",
                sortOrder: 10
            ),
            ImportRecommendationEntry(
                canonicalRepo: "obra/superpowers",
                locator: "obra/superpowers",
                categoryId: "development",
                primaryTagId: "development",
                secondaryTagIds: [],
                descriptionKey: "import.recommendation.description.obra_superpowers",
                sortOrder: 20
            ),
        ]

        let state = DesktopAppState()
        state.view.currentRoute = .importPage
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            recommendationsProvider: { recommendations }
        )
        let container = ImportScreenContainer(
            state: state,
            mainViewModel: model,
            recommendationsProvider: { recommendations }
        )

        await model.loadImportPageIfNeeded()

        XCTAssertEqual(model.importSearchPhase, MainViewModel.ImportLoadPhase.ready)
        XCTAssertEqual(model.recommendedImportGroups.map { $0.canonicalRepo }, [
            "anthropics/skills",
            "obra/superpowers",
        ])

        let snapshot = container.snapshot(locale: Locale(identifier: "en"))
        guard case .recommended(let sections) = snapshot?.content else {
            return XCTFail("expected recommended content")
        }

        XCTAssertEqual(sections.map { $0.categoryId }, ["general", "development"])
        XCTAssertEqual(sections[0].cards.map { $0.canonicalRepo }, ["anthropics/skills"])
        XCTAssertEqual(sections[1].cards.map { $0.canonicalRepo }, ["obra/superpowers"])
    }

    func testLoadImportPageIfNeededScansLocalImportGroupsOnlyOnce() async {
        let query = RecordingLocalImportQueryFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )

        await model.loadImportPageIfNeeded()
        await model.loadImportPageIfNeeded()

        XCTAssertEqual(query.scanPaths, [nil])

        await model.loadLocalImportGroups(path: "/Users/Vint/skills")

        XCTAssertEqual(query.scanPaths, [nil, "/Users/Vint/skills"])
    }

    func testImportLocalDirectoryUpdatesSearchTextAndProjectsLocalGroupsInSnapshot() async {
        let state = DesktopAppState()
        state.view.currentRoute = .importPage
        let query = RecordingLocalImportQueryFacade()
        query.localGroups = [
            [
                "id": "local-skills",
                "title": "Local Skills",
                "locator": "file:///Users/Vint/skills",
                "canonicalRepo": "local-skills",
                "provider": "local",
                "localImport": [
                    "validationStatus": "matched",
                    "choices": [
                        [
                            "id": "local",
                            "label": "Local",
                            "locator": "file:///Users/Vint/skills",
                            "selectedSkillIds": ["browse"],
                        ],
                    ],
                ],
            ],
        ]
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        await container.importLocalDirectory("/Users/Vint/skills")

        XCTAssertEqual(container.screenState.searchText, "/Users/Vint/skills")
        XCTAssertEqual(query.scanPaths, ["/Users/Vint/skills"])

        let snapshot = container.snapshot(locale: Locale(identifier: "en"))
        guard case .recommended(let sections) = snapshot?.content else {
            return XCTFail("expected recommended content")
        }

        XCTAssertEqual(sections.first?.categoryId, "local")
        XCTAssertEqual(sections.first?.cards.map(\.id), ["local-skills"])
    }

    func testHandleImportActionShowsToastWhenRecommendationAlreadyExistsLocally() async {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "anthropics-skills",
            title: "Anthropic Skills",
            locator: "anthropics/skills",
            canonicalRepo: "anthropics/skills",
            isInstalledLocally: true,
            aliases: [],
            summary: "",
            subtitle: "by @anthropics",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )

        await container.handleImportAction(for: card)

        XCTAssertEqual(model.importingImportGroupId, nil)
        XCTAssertEqual(model.toast?.style, .neutral)
        XCTAssertEqual(model.toast?.message, "This group is already available locally.")
    }

    func testImportActionIsDisabledWhenCardIsAlreadyInstalledLocally() {
        let installedCard = ImportViewModel.Card(
            id: "anthropics-skills",
            title: "Anthropic Skills",
            locator: "anthropics/skills",
            canonicalRepo: "anthropics/skills",
            isInstalledLocally: true,
            aliases: [],
            summary: "",
            subtitle: "by @anthropics",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )
        let freshCard = ImportViewModel.Card(
            id: "openai-skills",
            title: "OpenAI Skills",
            locator: "openai/skills",
            canonicalRepo: "openai/skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @openai",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )

        XCTAssertTrue(ImportScreen.importActionIsDisabled(for: installedCard))
        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: freshCard))
        XCTAssertEqual(
            ImportScreen.importActionTitle(for: installedCard, localized: { key in key == "group_card.action.installed" ? "Installed" : key }),
            "Installed"
        )
        XCTAssertNil(ImportScreen.importActionTitle(for: freshCard, localized: { $0 }))
    }

    func testImportViewModelFallsBackToVisibleTargetsWhenPreviewTargetsAreUnavailable() {
        let viewModel = ImportViewModel(
            items: [
                MainViewModel.ImportGroupItem(
                    id: "recommended",
                    title: "Recommended",
                    locator: "anthropic/skills",
                    canonicalRepo: "anthropic/skills",
                    isInstalledLocally: false,
                    aliases: [],
                    summary: "",
                    starCount: nil,
                    totalInstalls: nil,
                    skillCount: nil,
                    matchedSkillNames: [],
                    matchedSkills: [],
                    provider: "skills",
                    localImport: nil,
                    snapshot: nil,
                    enrichPhase: .idle,
                    previewPhase: .loading,
                    skills: [],
                    targets: []
                )
            ],
            locale: Locale(identifier: "en"),
            fallbackTargetIds: ["claude-code", "cursor"],
            submittedQuery: "recommended"
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
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                subtitle: "by @owner",
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
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                subtitle: "by @owner",
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
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                subtitle: "by @owner",
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

    func testTopBarSearchVisibilityMatchesHomeAndImportRoutes() {
        XCTAssertTrue(MainView.topBarShowsSearch(for: .home))
        XCTAssertTrue(MainView.topBarShowsSearch(for: .importPage))
        XCTAssertFalse(MainView.topBarShowsSearch(for: .settings))
        XCTAssertFalse(MainView.topBarShowsSearch(for: .detail(sourceId: "alpha")))
    }

    func testHeaderSearchFieldsUseExpandedWidth() {
        XCTAssertEqual(MainView.headerSearchFieldWidth, 384)
        XCTAssertEqual(MainView.headerSearchActionButtonSize, MainView.headerSearchFieldHeight)
    }

    func testHomeFilterBarsUseFixedLeadingButtonsAndSharedPillMetrics() {
        let zhWidth = MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "zh-Hans"))
        let enWidth = MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "en"))
        let jaWidth = MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "ja"))

        XCTAssertEqual(zhWidth, MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "zh-Hans")))
        XCTAssertEqual(enWidth, MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "en")))
        XCTAssertGreaterThan(zhWidth, 0)
        XCTAssertGreaterThan(enWidth, 0)
        XCTAssertGreaterThan(jaWidth, 0)
        XCTAssertGreaterThanOrEqual(jaWidth, enWidth)
        XCTAssertGreaterThanOrEqual(jaWidth, zhWidth)
        XCTAssertEqual(MainView.homeProjectPillHeight, MainView.homeFilterPillHeight)
        XCTAssertEqual(MainView.homeProjectPillCornerRadius, MainView.homeFilterPillCornerRadius)
    }

    func testSelectedProjectScopeUsesIndicatorWithoutLegacySubtitle() {
        XCTAssertTrue(MainView.projectScopeShowsSelectionIndicator(isSelected: true))
        XCTAssertFalse(MainView.projectScopeShowsSelectionIndicator(isSelected: false))
        XCTAssertFalse(MainView.projectScopeShowsLegacySubtitle(isSelected: true))
        XCTAssertFalse(MainView.projectScopeShowsLegacySubtitle(isSelected: false))
    }

    func testLeadingFixedButtonsUseCenteredAlignmentForStableWidth() {
        XCTAssertTrue(MainView.homeLeadingFixedButtonsAreCentered)
    }

    func testSearchPromptHidesOnFocusEvenWhenQueryIsEmpty() {
        XCTAssertTrue(MainView.shouldShowSearchPrompt(query: "", isFocused: false))
        XCTAssertFalse(MainView.shouldShowSearchPrompt(query: "", isFocused: true))
        XCTAssertFalse(MainView.shouldShowSearchPrompt(query: "anthropics", isFocused: false))
    }

    func testSearchFieldDoesNotAutoFocusOnHomeOrImportEntry() {
        XCTAssertFalse(MainView.shouldAutofocusSearchField(for: .home))
        XCTAssertFalse(MainView.shouldAutofocusSearchField(for: .importPage))
        XCTAssertFalse(MainView.shouldAutofocusSearchField(for: .settings))
    }

    func testWindowAppearClearsImplicitSearchFocusForRoutesThatShowSearch() {
        XCTAssertTrue(MainView.shouldClearImplicitSearchFocusOnAppear(for: .home))
        XCTAssertTrue(MainView.shouldClearImplicitSearchFocusOnAppear(for: .importPage))
        XCTAssertFalse(MainView.shouldClearImplicitSearchFocusOnAppear(for: .settings))
        XCTAssertFalse(MainView.shouldClearImplicitSearchFocusOnAppear(for: .detail(sourceId: "alpha")))
    }

    func testImportSearchPromptsExposeFixedInputSegmentAndAccentText() {
        let prompt = MainView.importSearchPrompts(locale: Locale(identifier: "zh-Hans"))[0]

        XCTAssertEqual(prompt.leadingText, "npx skills")
        XCTAssertEqual(prompt.fixedText, " 输入:")
        XCTAssertEqual(prompt.trailingText, " anthropics/skills")
    }

    func testImportSearchPromptsAreLocalizedWhileKeepingProviderKeywordsStable() {
        let enPrompt = MainView.importSearchPrompts(locale: Locale(identifier: "en"))[1]
        let jaPrompt = MainView.importSearchPrompts(locale: Locale(identifier: "ja"))[2]

        XCTAssertEqual(enPrompt.leadingText, "github link")
        XCTAssertEqual(enPrompt.fixedText, " Input:")
        XCTAssertEqual(enPrompt.trailingText, " https://github.com/...")

        XCTAssertEqual(jaPrompt.leadingText, "キーワード")
        XCTAssertEqual(jaPrompt.fixedText, " 入力:")
        XCTAssertEqual(jaPrompt.trailingText, " anthropics")
    }

    func testImportSearchActionStateTracksFocusQueryAndResults() {
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: false,
                query: "",
                searchPhase: .idle,
                resultCount: 0,
                submittedQuery: ""
            ),
            .hidden
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: true,
                query: "",
                searchPhase: .idle,
                resultCount: 0,
                submittedQuery: ""
            ),
            .submit
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: true,
                query: "anthropics",
                searchPhase: .idle,
                resultCount: 0,
                submittedQuery: ""
            ),
            .submit
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: false,
                query: "anthropics",
                searchPhase: .loading,
                resultCount: 0,
                submittedQuery: "anthropics"
            ),
            .loading
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: false,
                query: "anthropics",
                searchPhase: .idle,
                resultCount: 7,
                submittedQuery: "anthropics"
            ),
            .resultCount(7)
        )
    }

    func testImportSearchPromptTextWidthsUseMaxPromptTextInsteadOfFullFieldWidth() {
        let leadingWidth = MainView.importPromptLeadingWidth(for: Locale(identifier: "ja"))
        let trailingWidth = MainView.importPromptTrailingWidth(for: Locale(identifier: "ja"))

        XCTAssertLessThan(leadingWidth, MainView.headerSearchFieldWidth)
        XCTAssertLessThan(trailingWidth, MainView.headerSearchFieldWidth)
        XCTAssertGreaterThan(leadingWidth, 0)
        XCTAssertGreaterThan(trailingWidth, 0)
    }

    func testImportPageBodyOmitsLegacySectionHeader() {
        XCTAssertFalse(ImportScreen.showsResultsHeader(searchPhase: .idle, cardCount: 6))
        XCTAssertFalse(ImportScreen.showsResultsHeader(searchPhase: .loading, cardCount: 0))
    }

    func testImportEmptyAndLoadingStatesUsePlainCenteredPresentation() {
        XCTAssertFalse(ImportScreen.usesChromedEmptyState(searchPhase: .idle, cardCount: 0))
        XCTAssertFalse(ImportScreen.usesChromedEmptyState(searchPhase: .failed(.plain("x")), cardCount: 0))
        XCTAssertFalse(ImportScreen.usesChromedLoadingState(searchPhase: .loading, cardCount: 0))
        XCTAssertTrue(ImportScreen.usesCenteredStandaloneState(searchPhase: .idle, cardCount: 0))
        XCTAssertTrue(ImportScreen.usesCenteredStandaloneState(searchPhase: .loading, cardCount: 0))
        XCTAssertFalse(ImportScreen.usesCenteredStandaloneState(searchPhase: .loading, cardCount: 2))
    }

    private func makeItem(id: String, title: String, locator: String) -> MainViewModel.ImportGroupItem {
        MainViewModel.ImportGroupItem(
            id: id,
            title: title,
            locator: locator,
            canonicalRepo: locator,
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            starCount: nil,
            totalInstalls: nil,
            skillCount: nil,
            matchedSkillNames: [],
            matchedSkills: [],
            provider: "skills",
            localImport: nil,
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

private struct RecordedImportCall: Equatable {
    let locator: String
    let selectedSkillIds: [String]
    let enabledTargets: [String]
}

private final class RecordingImportCommandFacade: DesktopCommanding, @unchecked Sendable {
    private(set) var importCalls: [RecordedImportCall] = []

    func saveSettings(customTargets: [[String : String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        importCalls.append(
            RecordedImportCall(
                locator: locator,
                selectedSkillIds: selectedSkillIds,
                enabledTargets: enabledTargets
            )
        )
        return BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .importSource,
            ok: true,
            data: AnyCodable(["status": "ready", "sourceId": "local-skills"]),
            warnings: [],
            errors: []
        )
    }

    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func doctor() async throws -> BridgeResponse {
        fatalError("unused")
    }
}

@MainActor
private final class RecordingLocalImportQueryFacade: DesktopQuerying {
    private(set) var scanPaths: [String?] = []
    var localGroups: [[String: Any]] = []

    func bootstrap() async throws -> BridgeResponse {
        BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .bootstrap,
            ok: true,
            data: AnyCodable([String: Any]()),
            warnings: [],
            errors: []
        )
    }

    func list() async throws -> BridgeResponse {
        fatalError("unused")
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse {
        scanPaths.append(path)
        return BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .scanLocalImportGroups,
            ok: true,
            data: AnyCodable(["groups": localGroups]),
            warnings: [],
            errors: []
        )
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        fatalError("unused")
    }
}

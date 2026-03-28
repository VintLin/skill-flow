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
        container.screenState.draftsByItemId["anthropics-skills"] = ImportDraftState(
            selectedSkillIds: ["browse"],
            enabledTargetIds: ["claude-code"]
        )

        state.view.currentRoute = .importPage
        state.view.currentRoute = .home
        state.view.currentRoute = .importPage

        XCTAssertEqual(container.screenState.searchText, "anthropic/skills")
        XCTAssertEqual(container.screenState.placeholderIndex, 2)
        XCTAssertEqual(
            container.screenState.draftsByItemId["anthropics-skills"],
            ImportDraftState(
                selectedSkillIds: ["browse"],
                enabledTargetIds: ["claude-code"]
            )
        )
    }

    func testProjectedCardsFollowMainViewModelDisplayGroups() {
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

        XCTAssertEqual(container.viewModel(locale: Locale(identifier: "en"))?.cards.map(\.id), ["recommended"])

        model.importSubmittedQuery = "openai"

        XCTAssertEqual(container.viewModel(locale: Locale(identifier: "en"))?.cards.map(\.id), ["search"])
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
            skills: [],
            targets: []
        )
    }
}

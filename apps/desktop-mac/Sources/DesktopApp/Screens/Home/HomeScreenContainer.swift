import Observation
import SwiftUI

@MainActor
final class HomeScreenContainer {
    private let state: DesktopAppState
    private let groupTagController: GroupTagController
    let viewModel: HomeViewModel
    let mainViewModel: MainViewModel
    let settingsViewModel: SettingsViewModel
    let importContainer: ImportScreenContainer
    let detailContainer: DetailScreenContainer
    let navigation: MainView.NavigationActions

    init(
        state: DesktopAppState,
        mainViewModel: MainViewModel,
        groupTagController: GroupTagController,
        settingsViewModel: SettingsViewModel,
        importContainer: ImportScreenContainer,
        detailContainer: DetailScreenContainer
    ) {
        self.state = state
        self.groupTagController = groupTagController
        self.viewModel = HomeViewModel(state: state)
        self.mainViewModel = mainViewModel
        self.settingsViewModel = settingsViewModel
        self.importContainer = importContainer
        self.detailContainer = detailContainer
        self.navigation = MainView.NavigationActions(
            showHome: { [weak state] in
                state?.view.currentRoute = .home
            },
            showDetail: { [weak state] sourceId in
                state?.view.currentRoute = .detail(sourceId: sourceId)
            },
            showImportPage: { [weak state] in
                state?.view.currentRoute = .importPage
            },
            showSettings: { [weak state] in
                state?.view.currentRoute = .settings
            }
        )
        self.mainViewModel.bindRouteState(state)
        observeMainViewModelState()
    }

    func visibleGroupCards(locale: Locale) -> [MainViewModel.GroupCardModel] {
        mainViewModel.groupCards.filter { card in
            groupTagController.matchesHomeFilter(
                sourceId: card.id,
                sourceIds: mainViewModel.sourceIds,
                locale: locale
            )
        }
    }

    func groupTags(for sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        groupTagController.resolvedTags(forSourceId: sourceId, locale: locale)
    }

    func availableHomeTags(locale: Locale) -> [GroupTagDisplayItem] {
        groupTagController.availableHomeTags(sourceIds: mainViewModel.sourceIds, locale: locale)
    }

    func selectedHomeTagFilterKey(locale: Locale) -> String? {
        groupTagController.effectiveSelectedHomeFilterKey(sourceIds: mainViewModel.sourceIds, locale: locale)
    }

    func setSelectedHomeTagFilterKey(_ key: String?) {
        groupTagController.setSelectedHomeFilterKey(key)
    }

    func tagSuggestions(for sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        groupTagController.tagSuggestions(
            sourceIds: mainViewModel.sourceIds,
            excluding: sourceId,
            locale: locale
        )
    }

    func addCustomTag(_ title: String, accent: DesktopAccentColor?, toSourceId sourceId: String) {
        groupTagController.addCustomTag(title, accent: accent, toSourceId: sourceId)
    }

    func makeView() -> HomeScreen {
        HomeScreen(
            container: self,
            importContainer: importContainer,
            detailContainer: detailContainer,
            homeViewModel: viewModel,
            mainViewModel: mainViewModel,
            settingsViewModel: settingsViewModel
        )
    }

    func bootstrapIfNeeded() async {
        if case .idle = mainViewModel.loadState {
            await mainViewModel.bootstrap()
        }

        syncFoundationState()
    }

    private func syncFoundationState() {
        state.workspace.sourceIds = mainViewModel.sourceIds

        if let selectedSourceId = mainViewModel.selectedSourceId,
           mainViewModel.sourceIds.contains(selectedSourceId) {
            state.view.selectedSourceId = selectedSourceId
        }
    }

    private func observeMainViewModelState() {
        withObservationTracking {
            _ = mainViewModel.sourceIds
            _ = mainViewModel.selectedSourceId
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.syncFoundationState()
                self?.observeMainViewModelState()
            }
        }
    }
}

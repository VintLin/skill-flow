import Observation
import SwiftUI

@MainActor
final class HomeScreenContainer {
    private let state: DesktopAppState
    let viewModel: HomeViewModel
    let mainViewModel: MainViewModel
    let settingsViewModel: SettingsViewModel
    let importContainer: ImportScreenContainer
    let detailContainer: DetailScreenContainer
    let navigation: MainView.NavigationActions

    init(
        state: DesktopAppState,
        mainViewModel: MainViewModel,
        settingsViewModel: SettingsViewModel,
        importContainer: ImportScreenContainer,
        detailContainer: DetailScreenContainer
    ) {
        self.state = state
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
        self.mainViewModel.routeRequest = { [weak state] page in
            state?.view.currentRoute = Self.route(for: page)
        }
        self.mainViewModel.currentRouteProvider = { [weak state] in
            state?.view.currentRoute ?? .home
        }
        observeFoundationRouteState()
        observeMainViewModelState()
        syncViewModelRoute()
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
        syncViewModelRoute()
    }

    private func observeFoundationRouteState() {
        withObservationTracking {
            _ = state.view.currentRoute
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.syncViewModelRoute()
                self?.observeFoundationRouteState()
            }
        }
    }

    private func syncFoundationState() {
        state.workspace.sourceIds = mainViewModel.sourceIds

        if let selectedSourceId = mainViewModel.selectedSourceId,
           mainViewModel.sourceIds.contains(selectedSourceId) {
            state.view.selectedSourceId = selectedSourceId
        }
    }

    private func syncViewModelRoute() {
        mainViewModel.currentPage = page(for: state.view.currentRoute)
    }

    private func page(for route: DesktopRoute) -> MainViewModel.Page {
        switch route {
        case .home:
            return .home
        case .importPage:
            return .importPage
        case .settings:
            return .settings
        case .detail(let sourceId):
            return .detail(sourceId: sourceId)
        }
    }

    private static func route(for page: MainViewModel.Page) -> DesktopRoute {
        switch page {
        case .home:
            return .home
        case .importPage:
            return .importPage
        case .settings:
            return .settings
        case .detail(let sourceId):
            return .detail(sourceId: sourceId)
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

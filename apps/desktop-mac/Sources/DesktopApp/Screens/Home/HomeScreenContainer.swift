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
        return mainViewModel.filteredHomeGroupCards(locale: locale).filter { card in
            groupTagController.matchesHomeFilter(
                sourceId: card.id,
                sourceIds: mainViewModel.sourceIds,
                locale: locale
            )
        }
    }

    func homeTagSnapshot(locale: Locale) -> GroupTagController.HomeSnapshot {
        groupTagController.homeSnapshot(sourceIds: mainViewModel.sourceIds, locale: locale)
    }

    func visibleGroupCards(
        from cards: [MainViewModel.GroupCardModel],
        snapshot: GroupTagController.HomeSnapshot
    ) -> [MainViewModel.GroupCardModel] {
        let filtered = cards.filter { card in
            snapshot.contains(sourceId: card.id)
                && mainViewModel.matchesHomeSidebarFilters(card)
        }
        return Self.sortedHomeGroupCards(
            filtered,
            snapshot: snapshot,
            pinnedSourceIds: mainViewModel.pinnedSourceIds
        )
    }

    static func sortedHomeGroupCards(
        _ cards: [MainViewModel.GroupCardModel],
        snapshot: GroupTagController.HomeSnapshot,
        pinnedSourceIds: [String]
    ) -> [MainViewModel.GroupCardModel] {
        cards.sorted { lhs, rhs in
            let leftPin = pinRank(for: lhs.id, pinnedSourceIds: pinnedSourceIds)
            let rightPin = pinRank(for: rhs.id, pinnedSourceIds: pinnedSourceIds)
            if leftPin != rightPin {
                return leftPin < rightPin
            }

            let leftTag = firstTagRank(for: lhs.id, snapshot: snapshot)
            let rightTag = firstTagRank(for: rhs.id, snapshot: snapshot)
            if leftTag != rightTag {
                return leftTag < rightTag
            }

            let leftName = homeNameSortKey(lhs.title)
            let rightName = homeNameSortKey(rhs.title)
            if leftName != rightName {
                return leftName < rightName
            }

            return lhs.id.localizedCaseInsensitiveCompare(rhs.id) == .orderedAscending
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

    func homeAgentFilterOptions() -> [MainViewModel.HomeAgentFilterOption] {
        mainViewModel.homeAgentFilterOptions
    }

    func selectedHomeAgentFilterId() -> String? {
        mainViewModel.selectedHomeAgentFilterId
    }

    func setSelectedHomeAgentFilter(_ targetId: String?) {
        mainViewModel.setSelectedHomeAgentFilter(targetId)
    }

    func homeStatusFilterOptions() -> [MainViewModel.HomeSidebarFilterOption] {
        mainViewModel.homeStatusFilterOptions
    }

    func selectedHomeStatusFilterId() -> String {
        mainViewModel.selectedHomeStatusFilterId
    }

    func setSelectedHomeStatusFilter(_ filterId: String) {
        mainViewModel.setSelectedHomeStatusFilter(filterId)
    }

    func homeSourceTypeFilterOptions() -> [MainViewModel.HomeSidebarFilterOption] {
        mainViewModel.homeSourceTypeFilterOptions
    }

    func selectedHomeSourceTypeFilterId() -> String {
        mainViewModel.selectedHomeSourceTypeFilterId
    }

    func setSelectedHomeSourceTypeFilter(_ filterId: String) {
        mainViewModel.setSelectedHomeSourceTypeFilter(filterId)
    }

    func isHomeSidebarSectionExpanded(_ sectionId: String) -> Bool {
        state.view.expandedHomeSidebarSectionIds.contains(sectionId)
    }

    func toggleHomeSidebarSection(_ sectionId: String) {
        if state.view.expandedHomeSidebarSectionIds.contains(sectionId) {
            state.view.expandedHomeSidebarSectionIds.remove(sectionId)
        } else {
            state.view.expandedHomeSidebarSectionIds.insert(sectionId)
        }
    }

    func recentProjectScopes() -> [RecentProjectScopeItem] {
        mainViewModel.recentProjectScopes
    }

    func selectProjectScope(_ scope: ProjectScopeSelection) async {
        await mainViewModel.selectProjectScope(scope)
    }

    func refreshProjectScopes() async {
        await mainViewModel.refreshProjectScopes()
    }

    func handleHomeSearchSubmit(_ query: String) async -> Bool {
        let locator = MainViewModel.normalizedImportLocator(query)
        guard MainViewModel.isSupportedImportLocator(locator) else {
            return false
        }

        state.view.currentRoute = .importPage
        await importContainer.submitDirectLocator(locator)
        return true
    }

    func tagSuggestions(for sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        groupTagController.tagSuggestions(
            sourceIds: mainViewModel.sourceIds,
            excluding: sourceId,
            locale: locale
        )
    }

    func canAddTag(for sourceId: String, locale: Locale) -> Bool {
        groupTagController.canAddTag(forSourceId: sourceId, locale: locale)
    }

    func hasTags(for sourceId: String, locale: Locale) -> Bool {
        groupTagController.hasTags(forSourceId: sourceId, locale: locale)
    }

    func addCustomTag(_ title: String, accent: DesktopAccentColor?, toSourceId sourceId: String, locale: Locale) -> GroupTagMutationResult {
        let result = groupTagController.addCustomTag(title, accent: accent, toSourceId: sourceId, locale: locale)
        if let message = result.toastMessage(locale: locale) {
            mainViewModel.presentToast(message: message)
        }
        return result
    }

    func removeCustomTag(_ tagID: String, fromSourceId sourceId: String, locale: Locale) {
        let result = groupTagController.removeCustomTag(tagID, fromSourceId: sourceId, locale: locale)
        if let message = result.toastMessage(locale: locale) {
            mainViewModel.presentToast(message: message)
        }
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

    private static func pinRank(for sourceId: String, pinnedSourceIds: [String]) -> Int {
        pinnedSourceIds.firstIndex(of: sourceId) ?? Int.max
    }

    private static func firstTagRank(for sourceId: String, snapshot: GroupTagController.HomeSnapshot) -> Int {
        guard let firstTag = snapshot.tagsBySourceID[sourceId]?.first else {
            return Int.max
        }
        return snapshot.tagRankByID[firstTag.id] ?? Int.max - 1
    }

    private static func homeNameSortKey(_ title: String) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let latin = trimmed.applyingTransform(.mandarinToLatin, reverse: false) ?? trimmed
        let stripped = latin.applyingTransform(.stripCombiningMarks, reverse: false) ?? latin
        return stripped.folding(
            options: [.caseInsensitive, .diacriticInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
    }
}

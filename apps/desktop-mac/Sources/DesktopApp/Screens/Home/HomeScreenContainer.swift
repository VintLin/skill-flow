import Observation
import SwiftUI

@MainActor
final class HomeScreenContainer {
    struct HomeSortKey {
        let pinRank: Int
        let tagRank: Int
        let name: String
    }

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
            showUsage: { [weak state] in
                state?.view.currentRoute = .usage
            },
            showSettings: { [weak state] in
                state?.view.currentRoute = .settings
            }
        )
        self.mainViewModel.bindRouteState(state)
        observeMainViewModelState()
    }

    func visibleGroupCards(locale: Locale) -> [GroupCardModel] {
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
        from cards: [GroupCardModel],
        snapshot: GroupTagController.HomeSnapshot
    ) -> [GroupCardModel] {
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
        _ cards: [GroupCardModel],
        snapshot: GroupTagController.HomeSnapshot,
        pinnedSourceIds: [String]
    ) -> [GroupCardModel] {
        let sortKeys = makeHomeSortKeys(
            for: cards,
            snapshot: snapshot,
            pinnedSourceIds: pinnedSourceIds,
            nameKey: homeNameSortKey
        )

        return cards.sorted { lhs, rhs in
            guard let left = sortKeys[lhs.id], let right = sortKeys[rhs.id] else {
                return lhs.id.localizedCaseInsensitiveCompare(rhs.id) == .orderedAscending
            }
            if left.pinRank != right.pinRank {
                return left.pinRank < right.pinRank
            }

            if left.tagRank != right.tagRank {
                return left.tagRank < right.tagRank
            }

            if left.name != right.name {
                return left.name < right.name
            }

            return lhs.id.localizedCaseInsensitiveCompare(rhs.id) == .orderedAscending
        }
    }

    static func makeHomeSortKeys(
        for cards: [GroupCardModel],
        snapshot: GroupTagController.HomeSnapshot,
        pinnedSourceIds: [String],
        nameKey: (String) -> String
    ) -> [String: HomeSortKey] {
        var pinRanks: [String: Int] = [:]
        for (index, sourceId) in pinnedSourceIds.enumerated() where pinRanks[sourceId] == nil {
            pinRanks[sourceId] = index
        }

        var keys: [String: HomeSortKey] = [:]
        keys.reserveCapacity(cards.count)
        for card in cards {
            keys[card.id] = HomeSortKey(
                pinRank: pinRanks[card.id] ?? Int.max,
                tagRank: firstTagRank(for: card.id, snapshot: snapshot),
                name: nameKey(card.title)
            )
        }
        return keys
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

    func moveHomeTag(sourceTagID: String, targetTagID: String, placement: HomeTagMovePlacement) {
        groupTagController.moveHomeTag(
            sourceTagID: sourceTagID,
            targetTagID: targetTagID,
            placement: placement
        )
    }

    func homeAgentFilterOptions() -> [HomeAgentFilterOption] {
        mainViewModel.homeAgentFilterOptions
    }

    func homeAgentFilterOptions(from cards: [GroupCardModel]) -> [HomeAgentFilterOption] {
        mainViewModel.homeAgentFilterOptions(from: cards)
    }

    func selectedHomeAgentFilterId() -> String? {
        mainViewModel.selectedHomeAgentFilterId
    }

    func setSelectedHomeAgentFilter(_ targetId: String?) {
        mainViewModel.setSelectedHomeAgentFilter(targetId)
    }

    func homeStatusFilterOptions() -> [HomeSidebarFilterOption] {
        mainViewModel.homeStatusFilterOptions
    }

    func homeStatusFilterOptions(from cards: [GroupCardModel]) -> [HomeSidebarFilterOption] {
        mainViewModel.homeStatusFilterOptions(from: cards)
    }

    func selectedHomeStatusFilterId() -> String {
        mainViewModel.selectedHomeStatusFilterId
    }

    func setSelectedHomeStatusFilter(_ filterId: String) {
        mainViewModel.setSelectedHomeStatusFilter(filterId)
    }

    func homeSourceTypeFilterOptions() -> [HomeSidebarFilterOption] {
        mainViewModel.homeSourceTypeFilterOptions
    }

    func homeSourceTypeFilterOptions(from cards: [GroupCardModel]) -> [HomeSidebarFilterOption] {
        mainViewModel.homeSourceTypeFilterOptions(from: cards)
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
        let locator = ImportLocatorParser.normalize(query)
        guard ImportLocatorParser.isSupported(locator) else {
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

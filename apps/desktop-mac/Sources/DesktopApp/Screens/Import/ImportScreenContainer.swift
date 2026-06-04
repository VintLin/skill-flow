import Foundation
import Observation

@MainActor
@Observable
final class ImportScreenState {
    var searchText: String = ""
    var placeholderIndex: Int = 0
    var localChoiceByItemId: [String: String] = [:]
}

@MainActor
final class ImportScreenContainer {
    struct Snapshot {
        let searchPhase: MainViewModel.ImportLoadPhase
        let submittedQuery: String
        let cards: [ImportViewModel.Card]
        let content: ImportViewModel.Content
        let importingGroupId: String?
    }

    private let state: DesktopAppState
    private let mainViewModel: MainViewModel
    private let recommendationsProvider: () -> [ImportRecommendationEntry]

    let screenState = ImportScreenState()

    init(
        state: DesktopAppState,
        mainViewModel: MainViewModel,
        recommendationsProvider: @escaping () -> [ImportRecommendationEntry] = { ImportRecommendationLoader.load() }
    ) {
        self.state = state
        self.mainViewModel = mainViewModel
        self.recommendationsProvider = recommendationsProvider
    }

    var isActive: Bool {
        guard case .importPage = state.view.currentRoute else {
            return false
        }
        return true
    }

    var importPageMode: MainViewModel.ImportPageMode {
        mainViewModel.importPageMode
    }

    func setImportPageMode(_ mode: MainViewModel.ImportPageMode) {
        mainViewModel.importPageMode = mode
    }

    func snapshot(locale: Locale) -> Snapshot? {
        guard isActive else {
            return nil
        }
        let viewModel = ImportViewModel(
            items: mainViewModel.importDisplayGroups,
            locale: locale,
            fallbackTargetIds: mainViewModel.visibleTargets.map(\.id),
            submittedQuery: mainViewModel.importSubmittedQuery,
            recommendations: recommendationsProvider()
        )
        return Snapshot(
            searchPhase: mainViewModel.importSearchPhase,
            submittedQuery: mainViewModel.importSubmittedQuery,
            cards: viewModel.cards,
            content: viewModel.content,
            importingGroupId: mainViewModel.importingImportGroupId
        )
    }

    func submitSearch(_ query: String) async {
        await mainViewModel.submitImportSearch(query)
    }

    func submitDirectLocator(_ locator: String) async {
        screenState.searchText = locator
        await mainViewModel.submitImportSearch(locator)
    }

    func importLocalDirectory(_ path: String) async {
        screenState.searchText = path
        await mainViewModel.loadLocalImportGroups(path: path)
        mainViewModel.importPageMode = .localScan
    }

    func previewGroupsIfNeeded(_ groupIds: [String]) async {
        let maxConcurrentPreviews = 2
        var iterator = groupIds.makeIterator()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<maxConcurrentPreviews {
                guard let groupId = iterator.next() else { break }
                group.addTask { [mainViewModel] in
                    await mainViewModel.previewImportGroupIfNeeded(groupId)
                }
            }

            while await group.next() != nil {
                guard let groupId = iterator.next() else { continue }
                group.addTask { [mainViewModel] in
                    await mainViewModel.previewImportGroupIfNeeded(groupId)
                }
            }
        }
    }

    func importGroup(_ card: ImportViewModel.Card) async {
        let choice = selectedLocalChoice(for: card)
        let locator = choice?.locator ?? card.locator
        let selectedSkillIds = selectedSkillIdsForImport(for: card)
        guard !selectedSkillIds.isEmpty || card.skills.isEmpty else {
            return
        }
        let draft = draft(for: card)

        await mainViewModel.importImportGroup(
            groupId: card.id,
            locator: locator,
            selectedSkillIds: selectedSkillIds,
            enabledTargets: draft.enabledTargetIds
        )
    }

    func handleImportAction(for card: ImportViewModel.Card) async {
        if card.isInstalledLocally {
            mainViewModel.showImportAlreadyExistsToast()
            return
        }

        await importGroup(card)
    }

    func targetLabel(for targetId: String) -> String {
        mainViewModel.visibleTargets.first(where: { $0.id == targetId })?.label ?? targetId
    }

    func draft(for card: ImportViewModel.Card) -> ImportDraftState {
        state.importState.draftsByItemId[card.id]
            ?? ImportDraftState(
                selectedSkillIds: card.skills.filter(\.selectedByDefault).map(\.id),
                enabledTargetIds: []
            )
    }

    func selectedSkillIdsForImport(for card: ImportViewModel.Card) -> [String] {
        let draft = draft(for: card)
        guard let choice = selectedLocalChoice(for: card),
              !choice.selectedSkillIds.isEmpty else {
            return draft.selectedSkillIds
        }

        let draftSelected = Set(draft.selectedSkillIds)
        return choice.selectedSkillIds.filter { draftSelected.contains($0) }
    }

    func selectedLocalChoice(for card: ImportViewModel.Card) -> MainViewModel.LocalImportChoice? {
        let selectedChoiceId = screenState.localChoiceByItemId[card.id] ?? card.selectedLocalChoiceId
        return card.localChoices.first { $0.id == selectedChoiceId }
            ?? card.localChoices.first
    }

    func setLocalChoice(_ choiceId: String, for card: ImportViewModel.Card) {
        screenState.localChoiceByItemId[card.id] = choiceId
    }

    func setSkill(_ skillId: String, enabled: Bool, for card: ImportViewModel.Card) {
        let current = draft(for: card)
        let selectedIds = Set(current.selectedSkillIds)
        let nextSelectedIds: [String]

        if enabled {
            nextSelectedIds = card.skills.map(\.id).filter { selectedIds.union([skillId]).contains($0) }
        } else {
            nextSelectedIds = card.skills.map(\.id).filter { selectedIds.subtracting([skillId]).contains($0) }
        }

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkillIds: nextSelectedIds,
            enabledTargetIds: current.enabledTargetIds
        )
    }

    func toggleAllSkills(for card: ImportViewModel.Card) {
        let current = draft(for: card)
        let nextSelectedIds = current.selectedSkillIds.count == card.skills.count ? [] : card.skills.map(\.id)

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkillIds: nextSelectedIds,
            enabledTargetIds: current.enabledTargetIds
        )
    }

    func setTarget(_ targetId: String, enabled: Bool, for card: ImportViewModel.Card) {
        let current = draft(for: card)
        let enabledTargetIds = Set(current.enabledTargetIds)
        let nextTargetIds: [String]

        if enabled {
            nextTargetIds = card.targets.map(\.id).filter { enabledTargetIds.union([targetId]).contains($0) }
        } else {
            nextTargetIds = card.targets.map(\.id).filter { enabledTargetIds.subtracting([targetId]).contains($0) }
        }

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkillIds: current.selectedSkillIds,
            enabledTargetIds: nextTargetIds
        )
    }

    func toggleAllTargets(for card: ImportViewModel.Card) {
        let current = draft(for: card)
        let nextTargetIds = current.enabledTargetIds.count == card.targets.count ? [] : card.targets.map(\.id)

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkillIds: current.selectedSkillIds,
            enabledTargetIds: nextTargetIds
        )
    }
}

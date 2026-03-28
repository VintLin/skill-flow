import Foundation
import Observation

@MainActor
@Observable
final class ImportScreenState {
    var searchText: String = ""
    var placeholderIndex: Int = 0
}

@MainActor
final class ImportScreenContainer {
    struct Snapshot {
        let searchPhase: MainViewModel.ImportLoadPhase
        let submittedQuery: String
        let cards: [ImportViewModel.Card]
        let importingGroupId: String?
    }

    private let state: DesktopAppState
    private let mainViewModel: MainViewModel

    let screenState = ImportScreenState()

    init(state: DesktopAppState, mainViewModel: MainViewModel) {
        self.state = state
        self.mainViewModel = mainViewModel
    }

    var isActive: Bool {
        guard case .importPage = state.view.currentRoute else {
            return false
        }
        return true
    }

    func snapshot(locale: Locale) -> Snapshot? {
        guard isActive else {
            return nil
        }
        let viewModel = ImportViewModel(items: mainViewModel.importDisplayGroups, locale: locale)
        return Snapshot(
            searchPhase: mainViewModel.importSearchPhase,
            submittedQuery: mainViewModel.importSubmittedQuery,
            cards: viewModel.cards,
            importingGroupId: mainViewModel.importingImportGroupId
        )
    }

    func submitSearch(_ query: String) async {
        await mainViewModel.submitImportSearch(query)
    }

    func previewGroupsIfNeeded(_ groupIds: [String]) async {
        for groupId in groupIds {
            await mainViewModel.previewImportGroupIfNeeded(groupId)
        }
    }

    func importGroup(_ card: ImportViewModel.Card) async {
        let draft = draft(for: card)
        await mainViewModel.importImportGroup(
            groupId: card.id,
            locator: card.locator,
            selectedSkillIds: draft.selectedSkillIds,
            enabledTargets: draft.enabledTargetIds
        )
    }

    func targetLabel(for targetId: String) -> String {
        mainViewModel.visibleTargets.first(where: { $0.id == targetId })?.label ?? targetId
    }

    func draft(for card: ImportViewModel.Card) -> ImportDraftState {
        state.importState.draftsByItemId[card.id]
            ?? ImportDraftState(
                selectedSkillIds: card.skills.map(\.id),
                enabledTargetIds: []
            )
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

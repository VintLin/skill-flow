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

    var searchPhase: MainViewModel.ImportLoadPhase {
        mainViewModel.importSearchPhase
    }

    var submittedQuery: String {
        mainViewModel.importSubmittedQuery
    }

    var viewModel: ImportViewModel? {
        viewModel(locale: .current)
    }

    func viewModel(locale: Locale) -> ImportViewModel? {
        guard isActive else {
            return nil
        }
        return ImportViewModel(items: mainViewModel.importDisplayGroups, locale: locale)
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

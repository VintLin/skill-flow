import Foundation
import Observation

private actor ImportPreviewLimiter {
    private var availablePermits: Int
    private var waiters: [CheckedContinuation<Void, Never>] = []

    init(maxConcurrent: Int) {
        availablePermits = max(1, maxConcurrent)
    }

    func acquire() async {
        if availablePermits > 0 {
            availablePermits -= 1
            return
        }
        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func release() {
        if waiters.isEmpty {
            availablePermits += 1
        } else {
            waiters.removeFirst().resume()
        }
    }
}

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
        let searchPhase: ImportLoadPhase
        let submittedQuery: String
        let content: [ImportViewModel.Card]
        let importingGroupId: String?
        let importPhases: [String: GroupOperationQueue.Phase]
    }

    private let state: DesktopAppState
    private let mainViewModel: MainViewModel
    private let recommendations: [ImportRecommendationEntry]
    private let previewLimiter = ImportPreviewLimiter(maxConcurrent: 2)

    let screenState = ImportScreenState()

    init(
        state: DesktopAppState,
        mainViewModel: MainViewModel,
        recommendationsProvider: @escaping () -> [ImportRecommendationEntry] = { ImportRecommendationLoader.load() }
    ) {
        self.state = state
        self.mainViewModel = mainViewModel
        self.recommendations = recommendationsProvider()
    }

    var isActive: Bool {
        guard case .importPage = state.view.currentRoute else {
            return false
        }
        return true
    }

    var importPageMode: ImportPageMode {
        mainViewModel.importPageMode
    }

    func setImportPageMode(_ mode: ImportPageMode) {
        mainViewModel.importPageMode = mode
    }

    func snapshot(locale: Locale) -> Snapshot? {
        guard isActive else {
            return nil
        }
        let viewModel = ImportViewModel(
            items: mainViewModel.importDisplayGroups,
            locale: locale,
            targetVisibility: .settingsVisible(mainViewModel.importPageTargetIds),
            submittedQuery: mainViewModel.importSubmittedQuery,
            recommendations: recommendations
        )
        return Snapshot(
            searchPhase: mainViewModel.importSearchPhase,
            submittedQuery: mainViewModel.importSubmittedQuery,
            content: viewModel.content,
            importingGroupId: mainViewModel.importingImportGroupId,
            importPhases: mainViewModel.importOperationPhases
        )
    }

    func submitSearch(_ query: String) async {
        await mainViewModel.submitImportSearch(query)
    }

    func clearSearch() async {
        screenState.searchText = ""
        await mainViewModel.submitImportSearch("")
    }

    func submitDirectLocator(_ locator: String) async {
        screenState.searchText = locator
        await mainViewModel.submitImportSearch(locator)
    }

    func prefetchGroupSkillDetailsIfNeeded(_ groupId: String) async {
        await previewLimiter.acquire()
        guard !Task.isCancelled else {
            await previewLimiter.release()
            return
        }
        await mainViewModel.previewImportGroupIfNeeded(groupId)
        await previewLimiter.release()
    }

    func importLocalDirectory(_ path: String) async {
        screenState.searchText = path
        await mainViewModel.loadLocalImportGroups(path: path)
        mainViewModel.importPageMode = .localScan
    }

    func importGroup(_ card: ImportViewModel.Card) async {
        let initialDraft = draft(for: card)
        var importCard = card

        if card.needsSkillDetails {
            await mainViewModel.previewImportGroupIfNeeded(card.id)
            if let refreshedCard = refreshedImportCard(for: card) {
                importCard = refreshedCard
            }
        }

        let choice = selectedLocalChoice(for: importCard)
        let locator = choice?.locator ?? importCard.locator
        let selectedSkills = selectedSkillsForImport(for: importCard, draft: initialDraft)
        let skillSelectionMode = skillSelectionModeForImport(for: importCard)
        let draft = draft(for: importCard)

        await mainViewModel.importImportGroup(
            groupId: importCard.id,
            locator: locator,
            selectedSkills: selectedSkills,
            skillSelectionMode: skillSelectionMode,
            enabledTargets: draft.enabledTargetIds
        )
    }

    func handleImportAction(for card: ImportViewModel.Card) async {
        if mainViewModel.isImportingImportGroup(card.id) {
            if mainViewModel.isQueuedImportGroup(card.id) {
                mainViewModel.showOperationAlreadyQueuedToast()
            } else {
                mainViewModel.showImportInProgressToast()
            }
            return
        }

        if card.isInstalledLocally {
            mainViewModel.showImportAlreadyExistsToast()
            return
        }

        if card.requiresLocalVariantSelection {
            mainViewModel.showImportLocalVariantRequiredToast()
            return
        }

        if card.preparationStatus == "preparing" {
            mainViewModel.showImportPreparationInProgressToast()
            return
        }

        await importGroup(card)
    }

    func targetLabel(for targetId: String) -> String {
        mainViewModel.importTargetLabel(for: targetId)
    }

    func draft(for card: ImportViewModel.Card) -> ImportDraftState {
        state.importState.draftsByItemId[card.id]
            ?? ImportDraftState(
                selectedSkills: card.skills.map(\.selection),
                enabledTargetIds: card.targets.filter(\.selectedByDefault).map(\.id)
            )
    }

    func selectedSkillsForImport(for card: ImportViewModel.Card) -> [ImportSkillSelection] {
        selectedSkillsForImport(for: card, draft: draft(for: card))
    }

    private func selectedSkillsForImport(
        for card: ImportViewModel.Card,
        draft: ImportDraftState
    ) -> [ImportSkillSelection] {
        guard let choice = selectedLocalChoice(for: card),
              !choice.selectedSkills.isEmpty else {
            return ImportSkillSelectionResolver.selectedSkills(from: draft, for: card)
        }

        return ImportSkillSelectionResolver.selectedSkills(from: choice.selectedSkills, matching: draft)
    }

    func skillSelectionModeForImport(for card: ImportViewModel.Card) -> ImportSkillSelectionMode {
        if state.importState.draftsByItemId[card.id] != nil {
            return .selected
        }
        if card.selectedLocalChoiceId != nil {
            return .selected
        }
        if screenState.localChoiceByItemId[card.id] != nil {
            return .selected
        }
        return .all
    }

    func selectedLocalChoice(for card: ImportViewModel.Card) -> LocalImportChoice? {
        let selectedChoiceId = screenState.localChoiceByItemId[card.id] ?? card.selectedLocalChoiceId
        return card.localChoices.first { $0.id == selectedChoiceId }
            ?? card.localChoices.first
    }

    func setLocalChoice(_ choiceId: String, for card: ImportViewModel.Card) {
        screenState.localChoiceByItemId[card.id] = choiceId
    }

    func setSkill(_ skillId: String, enabled: Bool, for card: ImportViewModel.Card) {
        let current = draft(for: card)
        let selectedIds = Set(ImportSkillSelectionResolver.selectedSkillIds(for: card.skills, draft: current))
        let nextSelectedIds: [String]

        if enabled {
            nextSelectedIds = card.skills.map(\.id).filter { selectedIds.union([skillId]).contains($0) }
        } else {
            nextSelectedIds = card.skills.map(\.id).filter { selectedIds.subtracting([skillId]).contains($0) }
        }

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkills: card.skills.filter { nextSelectedIds.contains($0.id) }.map(\.selection),
            enabledTargetIds: current.enabledTargetIds
        )
    }

    func toggleAllSkills(for card: ImportViewModel.Card) {
        let current = draft(for: card)
        let selectedIds = ImportSkillSelectionResolver.selectedSkillIds(for: card.skills, draft: current)
        let nextSelectedIds = selectedIds.count == card.skills.count ? [] : card.skills.map(\.id)

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkills: card.skills.filter { nextSelectedIds.contains($0.id) }.map(\.selection),
            enabledTargetIds: current.enabledTargetIds
        )
    }

    func setTarget(_ targetId: String, enabled: Bool, for card: ImportViewModel.Card) {
        guard !isLockedTarget(targetId, for: card) else {
            return
        }
        let current = draft(for: card)
        let enabledTargetIds = Set(current.enabledTargetIds)
        let nextTargetIds: [String]

        if enabled {
            nextTargetIds = card.targets.map(\.id).filter { enabledTargetIds.union([targetId]).contains($0) }
        } else {
            nextTargetIds = card.targets.map(\.id).filter { enabledTargetIds.subtracting([targetId]).contains($0) }
        }

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkills: current.selectedSkills,
            enabledTargetIds: nextTargetIds
        )
    }

    func toggleAllTargets(for card: ImportViewModel.Card) {
        let current = draft(for: card)
        let lockedTargetIds = Set(card.targets.filter(\.isLocked).map(\.id))
        let editableTargetIds = card.targets.map(\.id).filter { !lockedTargetIds.contains($0) }
        let selectedTargetIds = Set(current.enabledTargetIds)
        let editableSelectedCount = editableTargetIds.filter { selectedTargetIds.contains($0) }.count
        let nextEditableTargetIds = editableSelectedCount == editableTargetIds.count ? [] : editableTargetIds
        let nextTargetIds = card.targets.map(\.id).filter {
            lockedTargetIds.contains($0) || nextEditableTargetIds.contains($0)
        }

        state.importState.draftsByItemId[card.id] = ImportDraftState(
            selectedSkills: current.selectedSkills,
            enabledTargetIds: nextTargetIds
        )
    }

    func handleTargetToggle(_ targetId: String, enabled: Bool, for card: ImportViewModel.Card) {
        if isLockedTarget(targetId, for: card) {
            mainViewModel.showImportLocalSourceTargetLockedToast(targetId: targetId)
            return
        }
        setTarget(targetId, enabled: enabled, for: card)
    }

    private func isLockedTarget(_ targetId: String, for card: ImportViewModel.Card) -> Bool {
        card.targets.first(where: { $0.id == targetId })?.isLocked ?? false
    }

    private func refreshedImportCard(for card: ImportViewModel.Card) -> ImportViewModel.Card? {
        mainViewModel.importDisplayGroups
            .first { $0.id == card.id }
            .map {
                ImportViewModel.card(
                    from: $0,
                    locale: Locale.current,
                    targetVisibility: .settingsVisible(mainViewModel.importPageTargetIds),
                    submittedQuery: mainViewModel.importSubmittedQuery
                )
            }
    }

}

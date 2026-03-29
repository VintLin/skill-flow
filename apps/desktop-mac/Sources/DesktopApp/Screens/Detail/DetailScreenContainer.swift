import Foundation

@MainActor
@Observable
final class DetailScreenState {
    var detailSkillIdByGroup: [String: String] = [:]
    var detailShowsGroupOverviewByGroup: [String: Bool] = [:]
    var detailHoveredItemIdByGroup: [String: String] = [:]
    var detailSelectedTreeItemIdByGroup: [String: String] = [:]
    var detailCollapsedTreeItemIdsByGroup: [String: [String]] = [:]
    var detailDocumentTabIdByGroup: [String: String] = [:]
    var detailDocumentTabIdBySkill: [String: String] = [:]
    var pendingDetailSkillIdByGroup: [String: String] = [:]
    var pendingDetailDocumentIdByGroup: [String: String] = [:]
    var pendingDetailDocumentIdBySkill: [String: String] = [:]
    var detailSkillSelectionTokenByGroup: [String: UInt64] = [:]
    var detailDocumentSelectionTokenByGroup: [String: UInt64] = [:]
    var detailDocumentSelectionTokenBySkill: [String: UInt64] = [:]
}

@MainActor
final class DetailScreenContainer {
    private let state: DesktopAppState
    private let detailSnapshot: (String) -> DetailViewModel.Snapshot?
    private let fallbackRowProvider: (String) -> MainViewModel.SourceRow?
    private let hasInspectPayloadProvider: (String) -> Bool
    private let isInspectRequestInFlightProvider: (String) -> Bool
    private let isUpdatingCurrentGroupProvider: () -> Bool
    private let selectSourceAction: (String) async -> Void
    private let updateCurrentGroupAction: () async -> Void
    private let toggleAllSkillsAction: (String) async -> Void
    private let setSkillEnabledAction: (String, Bool, String) async -> Void
    private let toggleAllTargetsAction: (String) async -> Void
    private let setTargetEnabledAction: (String, Bool, String) async -> Void
    let screenState = DetailScreenState()

    init(
        state: DesktopAppState,
        detailSnapshot: @escaping (String) -> DetailViewModel.Snapshot?,
        fallbackRow: @escaping (String) -> MainViewModel.SourceRow? = { _ in nil },
        hasInspectPayload: @escaping (String) -> Bool = { _ in false },
        isInspectRequestInFlight: @escaping (String) -> Bool = { _ in false },
        isUpdatingCurrentGroup: @escaping () -> Bool = { false },
        selectSource: @escaping (String) async -> Void = { _ in },
        updateCurrentGroup: @escaping () async -> Void = {},
        toggleAllSkills: @escaping (String) async -> Void = { _ in },
        setSkillEnabled: @escaping (String, Bool, String) async -> Void = { _, _, _ in },
        toggleAllTargets: @escaping (String) async -> Void = { _ in },
        setTargetEnabled: @escaping (String, Bool, String) async -> Void = { _, _, _ in }
    ) {
        self.state = state
        self.detailSnapshot = detailSnapshot
        self.fallbackRowProvider = fallbackRow
        self.hasInspectPayloadProvider = hasInspectPayload
        self.isInspectRequestInFlightProvider = isInspectRequestInFlight
        self.isUpdatingCurrentGroupProvider = isUpdatingCurrentGroup
        self.selectSourceAction = selectSource
        self.updateCurrentGroupAction = updateCurrentGroup
        self.toggleAllSkillsAction = toggleAllSkills
        self.setSkillEnabledAction = setSkillEnabled
        self.toggleAllTargetsAction = toggleAllTargets
        self.setTargetEnabledAction = setTargetEnabled
    }

    var sourceId: String? {
        guard case .detail(let sourceId) = state.view.currentRoute else {
            return nil
        }
        return sourceId
    }

    var fallbackRow: MainViewModel.SourceRow? {
        guard let sourceId else {
            return nil
        }
        return fallbackRowProvider(sourceId)
    }

    var isUpdatingCurrentGroup: Bool {
        isUpdatingCurrentGroupProvider()
    }

    func hasInspectPayload(for sourceId: String) -> Bool {
        hasInspectPayloadProvider(sourceId)
    }

    func isInspectRequestInFlight(for sourceId: String) -> Bool {
        isInspectRequestInFlightProvider(sourceId)
    }

    var viewModel: DetailViewModel? {
        guard let sourceId,
              let snapshot = detailSnapshot(sourceId) else {
            return nil
        }

        return DetailViewModel(snapshot: snapshot)
    }

    func selectSource(_ sourceId: String) async {
        await selectSourceAction(sourceId)
    }

    func updateCurrentGroup() async {
        await updateCurrentGroupAction()
    }

    func toggleAllSkills(sourceId: String) async {
        await toggleAllSkillsAction(sourceId)
    }

    func setSkillEnabled(_ skillId: String, enabled: Bool, sourceId: String) async {
        await setSkillEnabledAction(skillId, enabled, sourceId)
    }

    func toggleAllTargets(sourceId: String) async {
        await toggleAllTargetsAction(sourceId)
    }

    func setTargetEnabled(_ targetId: String, enabled: Bool, sourceId: String) async {
        await setTargetEnabledAction(targetId, enabled, sourceId)
    }
}

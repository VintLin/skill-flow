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
    private let groupTagController: GroupTagController
    private let detailSnapshot: (String) -> DetailViewModel.Snapshot?
    private let groupDocumentProvider: (String, String) -> MainViewModel.DocumentTab?
    private let fallbackRowProvider: (String) -> MainViewModel.SourceRow?
    private let toastPresenter: (MainViewModel.ToastStyle, String) -> Void
    private let hasInspectPayloadProvider: (String) -> Bool
    private let isInspectRequestInFlightProvider: (String) -> Bool
    private let isUpdatingCurrentGroupProvider: () -> Bool
    private let selectSourceAction: (String) async -> Void
    private let updateCurrentGroupAction: () async -> Void
    private let toggleAllSkillsAction: (String) async -> Void
    private let setSkillEnabledAction: (String, Bool, String) async -> Void
    private let toggleAllTargetsAction: (String) async -> Void
    private let setTargetEnabledAction: (String, Bool, Bool, String) async -> Void
    private var cachedDetailSourceId: String?
    private var cachedDetailRevision: String?
    private var cachedDetailViewModel: DetailViewModel?
    let screenState = DetailScreenState()

    private static func defaultGroupTagController(state: DesktopAppState) -> GroupTagController {
        GroupTagController(
            state: state,
            store: DesktopGroupTagStore(),
            recommendationsProvider: { [] },
            sourceCanonicalRepo: { _ in nil },
            sourceLocator: { _ in nil },
            randomAccent: { .blue }
        )
    }

    init(
        state: DesktopAppState,
        groupTagController: GroupTagController,
        detailSnapshot: @escaping (String) -> DetailViewModel.Snapshot?,
        groupDocument: @escaping (String, String) -> MainViewModel.DocumentTab? = { _, _ in nil },
        fallbackRow: @escaping (String) -> MainViewModel.SourceRow? = { _ in nil },
        toastPresenter: @escaping (MainViewModel.ToastStyle, String) -> Void = { _, _ in },
        hasInspectPayload: @escaping (String) -> Bool = { _ in false },
        isInspectRequestInFlight: @escaping (String) -> Bool = { _ in false },
        isUpdatingCurrentGroup: @escaping () -> Bool = { false },
        selectSource: @escaping (String) async -> Void = { _ in },
        updateCurrentGroup: @escaping () async -> Void = {},
        toggleAllSkills: @escaping (String) async -> Void = { _ in },
        setSkillEnabled: @escaping (String, Bool, String) async -> Void = { _, _, _ in },
        toggleAllTargets: @escaping (String) async -> Void = { _ in },
        setTargetEnabled: @escaping (String, Bool, Bool, String) async -> Void = { _, _, _, _ in }
    ) {
        self.state = state
        self.groupTagController = groupTagController
        self.detailSnapshot = detailSnapshot
        self.groupDocumentProvider = groupDocument
        self.fallbackRowProvider = fallbackRow
        self.toastPresenter = toastPresenter
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

    convenience init(
        state: DesktopAppState,
        detailSnapshot: @escaping (String) -> DetailViewModel.Snapshot?,
        groupDocument: @escaping (String, String) -> MainViewModel.DocumentTab? = { _, _ in nil },
        fallbackRow: @escaping (String) -> MainViewModel.SourceRow? = { _ in nil },
        toastPresenter: @escaping (MainViewModel.ToastStyle, String) -> Void = { _, _ in },
        hasInspectPayload: @escaping (String) -> Bool = { _ in false },
        isInspectRequestInFlight: @escaping (String) -> Bool = { _ in false },
        isUpdatingCurrentGroup: @escaping () -> Bool = { false },
        selectSource: @escaping (String) async -> Void = { _ in },
        updateCurrentGroup: @escaping () async -> Void = {},
        toggleAllSkills: @escaping (String) async -> Void = { _ in },
        setSkillEnabled: @escaping (String, Bool, String) async -> Void = { _, _, _ in },
        toggleAllTargets: @escaping (String) async -> Void = { _ in },
        setTargetEnabled: @escaping (String, Bool, Bool, String) async -> Void = { _, _, _, _ in }
    ) {
        self.init(
            state: state,
            groupTagController: Self.defaultGroupTagController(state: state),
            detailSnapshot: detailSnapshot,
            groupDocument: groupDocument,
            fallbackRow: fallbackRow,
            toastPresenter: toastPresenter,
            hasInspectPayload: hasInspectPayload,
            isInspectRequestInFlight: isInspectRequestInFlight,
            isUpdatingCurrentGroup: isUpdatingCurrentGroup,
            selectSource: selectSource,
            updateCurrentGroup: updateCurrentGroup,
            toggleAllSkills: toggleAllSkills,
            setSkillEnabled: setSkillEnabled,
            toggleAllTargets: toggleAllTargets,
            setTargetEnabled: setTargetEnabled
        )
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

        if cachedDetailSourceId == sourceId,
           cachedDetailRevision == snapshot.revision,
           let cachedDetailViewModel {
            return cachedDetailViewModel
        }

        let nextViewModel = DetailViewModel(snapshot: snapshot)
        cachedDetailSourceId = sourceId
        cachedDetailRevision = snapshot.revision
        cachedDetailViewModel = nextViewModel
        return nextViewModel
    }

    func groupDocument(sourceId: String, documentId: String) -> MainViewModel.DocumentTab? {
        guard !sourceId.isEmpty, !documentId.isEmpty else {
            return nil
        }
        return groupDocumentProvider(sourceId, documentId)
    }

    func groupTags(for sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        groupTagController.resolvedTags(forSourceId: sourceId, locale: locale)
    }

    func tagSuggestions(for sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        groupTagController.tagSuggestions(
            sourceIds: state.workspace.sourceIds,
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
            toastPresenter(.neutral, message)
        }
        return result
    }

    func removeCustomTag(_ tagID: String, fromSourceId sourceId: String, locale: Locale) {
        let result = groupTagController.removeCustomTag(tagID, fromSourceId: sourceId, locale: locale)
        if let message = result.toastMessage(locale: locale) {
            toastPresenter(.neutral, message)
        }
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

    func setTargetEnabled(
        _ targetId: String,
        enabled: Bool,
        expectedCurrentEnabled: Bool,
        sourceId: String
    ) async {
        await setTargetEnabledAction(targetId, enabled, expectedCurrentEnabled, sourceId)
    }
}

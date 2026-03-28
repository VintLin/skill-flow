import Foundation

@MainActor
@Observable
final class DetailScreenState {
    var detailSkillIdByGroup: [String: String] = [:]
    var detailShowsGroupOverviewByGroup: [String: Bool] = [:]
    var detailHoveredItemIdByGroup: [String: String] = [:]
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
    let screenState = DetailScreenState()

    init(
        state: DesktopAppState,
        detailSnapshot: @escaping (String) -> DetailViewModel.Snapshot?
    ) {
        self.state = state
        self.detailSnapshot = detailSnapshot
    }

    var sourceId: String? {
        guard case .detail(let sourceId) = state.view.currentRoute else {
            return nil
        }
        return sourceId
    }

    var viewModel: DetailViewModel? {
        guard let sourceId,
              let snapshot = detailSnapshot(sourceId) else {
            return nil
        }

        return DetailViewModel(snapshot: snapshot)
    }
}

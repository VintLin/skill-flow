import Foundation

@MainActor
final class DetailScreenContainer {
    private let state: DesktopAppState
    private let detailSnapshot: (String) -> DetailViewModel.Snapshot?

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

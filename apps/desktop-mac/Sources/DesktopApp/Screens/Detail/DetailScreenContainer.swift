import Foundation

@MainActor
final class DetailScreenContainer {
    private let state: DesktopAppState
    private let detailViewData: (String) -> MainViewModel.DetailViewData?

    init(
        state: DesktopAppState,
        detailViewData: @escaping (String) -> MainViewModel.DetailViewData?
    ) {
        self.state = state
        self.detailViewData = detailViewData
    }

    var viewModel: DetailViewModel? {
        guard case .detail(let sourceId) = state.view.currentRoute,
              let detail = detailViewData(sourceId) else {
            return nil
        }

        return DetailViewModel(detail: detail)
    }
}

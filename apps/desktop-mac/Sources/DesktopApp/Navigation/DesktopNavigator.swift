import Foundation
import Observation

@MainActor
@Observable
final class DesktopNavigator {
    @ObservationIgnored private var appState: DesktopAppState?
    @ObservationIgnored private var isSyncingFromAppState = false

    var currentRoute: DesktopRoute = .home {
        didSet {
            guard let appState, !isSyncingFromAppState else { return }
            appState.view.currentRoute = currentRoute
        }
    }

    init() {
    }

    init(appState: DesktopAppState) {
        self.appState = appState
        currentRoute = appState.view.currentRoute
        observeBoundRoute()
    }

    func showHome() {
        currentRoute = .home
    }

    func showDetail(sourceId: String) {
        currentRoute = .detail(sourceId: sourceId)
    }

    func showImportPage() {
        currentRoute = .importPage
    }

    func showUsage() {
        currentRoute = .usage
    }

    func showSettings() {
        currentRoute = .settings
    }

    private func observeBoundRoute() {
        guard let appState else { return }

        withObservationTracking {
            _ = appState.view.currentRoute
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.syncRouteFromBoundAppState()
            }
        }
    }

    private func syncRouteFromBoundAppState() {
        guard let appState else { return }

        isSyncingFromAppState = true
        currentRoute = appState.view.currentRoute
        isSyncingFromAppState = false
        observeBoundRoute()
    }
}

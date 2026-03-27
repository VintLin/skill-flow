import Foundation
import Observation

@MainActor
@Observable
final class DesktopNavigator {
    private final class RouteBox {
        var currentRoute: DesktopRoute = .home
    }

    private enum RouteSource {
        case standalone(RouteBox)
        case appState(DesktopAppState)
    }

    private var routeSource: RouteSource

    init() {
        routeSource = .standalone(RouteBox())
    }

    init(appState: DesktopAppState) {
        routeSource = .appState(appState)
    }

    var currentRoute: DesktopRoute {
        get {
            switch routeSource {
            case .standalone(let box):
                return box.currentRoute
            case .appState(let state):
                return state.view.currentRoute
            }
        }
        set {
            switch routeSource {
            case .standalone(let box):
                box.currentRoute = newValue
            case .appState(let state):
                state.view.currentRoute = newValue
            }
        }
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

    func showSettings() {
        currentRoute = .settings
    }
}

import Foundation
import Observation

@MainActor
@Observable
final class DesktopNavigator {
    var currentRoute: DesktopRoute = .home

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

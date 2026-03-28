import Foundation
import Observation

@MainActor
@Observable
final class DesktopAppState {
    var workspace = WorkspaceState()
    var view = ViewState()
    var importState = ImportState()
    var settings = SettingsState()
    var asyncResources = AsyncResourceState()
}

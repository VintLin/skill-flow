import Observation

@MainActor
@Observable
final class MenuBarScreenState {
    var searchQuery: String = ""
}

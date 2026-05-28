import Foundation

struct ViewState {
    var currentRoute: DesktopRoute = .home
    var selectedSourceId: String?
    var selectedHomeAgentFilterId: String? = nil
    var selectedHomeStatusFilterId: String = "all"
    var selectedHomeSourceTypeFilterId: String = "all"
    var expandedHomeSidebarSectionIds: Set<String> = ["status", "sourceType"]
}

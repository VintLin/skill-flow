import Foundation

enum DesktopRoute: Equatable {
    case home
    case detail(sourceId: String)
    case importPage
    case usage
    case settings
}

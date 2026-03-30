import Foundation

struct GroupTagPreference: Codable, Equatable {
    let title: String
    let accentRawValue: String

    var accent: DesktopAccentColor {
        DesktopAccentColor(rawValue: accentRawValue) ?? .blue
    }
}

struct GroupTagState {
    var customTagsBySourceId: [String: GroupTagPreference] = [:]
    var selectedHomeFilterKey: String? = nil
}

import Foundation

struct GroupTagPreference: Codable, Equatable {
    let title: String
    let accentRawValue: String
    let tagId: String?

    var accent: DesktopAccentColor {
        DesktopAccentColor(rawValue: accentRawValue) ?? .blue
    }

    init(title: String, accentRawValue: String, tagId: String? = nil) {
        self.title = title
        self.accentRawValue = accentRawValue
        self.tagId = tagId
    }
}

struct GroupTagState {
    var customTagsBySourceId: [String: [GroupTagPreference]] = [:]
    var selectedHomeFilterKey: String? = nil
}

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

struct GroupTagCollection: Codable, Equatable {
    static let currentSchemaVersion = 2

    var schemaVersion: Int
    var tagsByGroupKey: [String: [GroupTagPreference]]

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        tagsByGroupKey: [String: [GroupTagPreference]] = [:]
    ) {
        self.schemaVersion = schemaVersion
        self.tagsByGroupKey = tagsByGroupKey
    }
}

struct GroupTagState {
    var tagCollection = GroupTagCollection()
    var selectedHomeFilterKey: String? = nil
}

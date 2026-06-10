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
    var orderedTagKeys: [String]

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        tagsByGroupKey: [String: [GroupTagPreference]] = [:],
        orderedTagKeys: [String] = []
    ) {
        self.schemaVersion = schemaVersion
        self.tagsByGroupKey = tagsByGroupKey
        self.orderedTagKeys = orderedTagKeys
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case tagsByGroupKey
        case orderedTagKeys
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        self.tagsByGroupKey = try container.decode([String: [GroupTagPreference]].self, forKey: .tagsByGroupKey)
        self.orderedTagKeys = try container.decodeIfPresent([String].self, forKey: .orderedTagKeys) ?? []
    }
}

struct GroupTagState {
    var tagCollection = GroupTagCollection()
    var selectedHomeFilterKey: String? = nil
}

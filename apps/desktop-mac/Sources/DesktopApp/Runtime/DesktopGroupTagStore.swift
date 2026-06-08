import Foundation

struct DesktopGroupTagStore {
    static let tagCollectionKey = "desktop.groupTags.v2.tagsByGroupKey"

    let userDefaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func loadTagCollection() -> GroupTagCollection {
        guard let data = userDefaults.data(forKey: Self.tagCollectionKey) else {
            return GroupTagCollection()
        }

        guard let decoded = try? decoder.decode(GroupTagCollection.self, from: data),
              decoded.schemaVersion == GroupTagCollection.currentSchemaVersion else {
            return GroupTagCollection()
        }

        return decoded
    }

    func saveTagCollection(_ tagCollection: GroupTagCollection) {
        let encoded = try? encoder.encode(tagCollection)
        userDefaults.set(encoded, forKey: Self.tagCollectionKey)
    }
}

import Foundation

struct DesktopGroupTagStore {
    static let customTagsKey = "desktop.groupTags.customTagsBySourceId"

    let userDefaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func loadCustomTags() -> [String: [GroupTagPreference]] {
        guard let data = userDefaults.data(forKey: Self.customTagsKey) else {
            return [:]
        }

        if let decoded = try? decoder.decode([String: [GroupTagPreference]].self, from: data) {
            return decoded
        }

        if let legacy = try? decoder.decode([String: GroupTagPreference].self, from: data) {
            return legacy.mapValues { [$0] }
        }

        return [:]
    }

    func saveCustomTags(_ customTagsBySourceId: [String: [GroupTagPreference]]) {
        let encoded = try? encoder.encode(customTagsBySourceId)
        userDefaults.set(encoded, forKey: Self.customTagsKey)
    }
}

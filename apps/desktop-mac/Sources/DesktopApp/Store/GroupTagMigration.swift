import Foundation

struct GroupTagSourceIdentity: Equatable {
    let currentKey: String
    let legacyKeys: [String]
}

struct GroupTagMigration {
    static let legacyCustomTagsKey = "desktop.groupTags.customTagsBySourceId"

    static func migrateLegacyStoredTags(
        legacyData: Data?,
        decoder: JSONDecoder
    ) -> GroupTagCollection? {
        guard let legacyData else {
            return nil
        }

        if let decoded = try? decoder.decode([String: [GroupTagPreference]].self, from: legacyData) {
            return GroupTagCollection(tagsByGroupKey: sourceKeyedTags(decoded))
        }

        if let decoded = try? decoder.decode([String: GroupTagPreference].self, from: legacyData) {
            return GroupTagCollection(tagsByGroupKey: sourceKeyedTags(decoded.mapValues { [$0] }))
        }

        return nil
    }

    static func migrateGroupKeys(
        in collection: GroupTagCollection,
        sourceIdentities: [GroupTagSourceIdentity]
    ) -> GroupTagCollection {
        var next = collection
        for identity in sourceIdentities {
            guard next.tagsByGroupKey[identity.currentKey] == nil else {
                continue
            }

            guard let legacyKey = identity.legacyKeys.first(where: { key in
                key != identity.currentKey && next.tagsByGroupKey[key] != nil
            }) else {
                continue
            }

            next.tagsByGroupKey[identity.currentKey] = next.tagsByGroupKey[legacyKey]
            next.tagsByGroupKey.removeValue(forKey: legacyKey)
        }
        return next
    }

    static func sourceIdentity(
        sourceId: String,
        currentKey: String,
        sourceLocator: String?,
        sourceCanonicalRepo: String?
    ) -> GroupTagSourceIdentity {
        GroupTagSourceIdentity(
            currentKey: currentKey,
            legacyKeys: [
                sourceGroupKey(sourceId),
                sourceLocator.flatMap(normalizedGroupKeyMaterial).map { "locator:\($0)" },
                sourceCanonicalRepo.flatMap(normalizedGroupKeyMaterial).map { "repo:\($0)" },
            ].compactMap { $0 }
        )
    }

    private static func sourceKeyedTags(_ legacy: [String: [GroupTagPreference]]) -> [String: [GroupTagPreference]] {
        var tagsByGroupKey: [String: [GroupTagPreference]] = [:]
        for (sourceId, tags) in legacy {
            tagsByGroupKey[sourceGroupKey(sourceId), default: []].append(contentsOf: tags)
        }
        return tagsByGroupKey
    }

    private static func sourceGroupKey(_ sourceId: String) -> String {
        "source:\(sourceId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())"
    }

    private static func normalizedGroupKeyMaterial(_ value: String?) -> String? {
        let normalized = (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .lowercased()
        return normalized.isEmpty ? nil : normalized
    }
}

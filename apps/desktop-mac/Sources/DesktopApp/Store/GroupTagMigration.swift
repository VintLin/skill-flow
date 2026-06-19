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

            let legacyKeys = identity.legacyKeys.filter { key in
                key != identity.currentKey && next.tagsByGroupKey[key] != nil
            }
            guard !legacyKeys.isEmpty else {
                continue
            }

            var migratedTags: [GroupTagPreference] = []
            var seenTagKeys = Set<String>()
            for legacyKey in legacyKeys {
                for tag in next.tagsByGroupKey[legacyKey] ?? [] {
                    if seenTagKeys.insert(tagKey(tag)).inserted {
                        migratedTags.append(tag)
                    }
                }
                next.tagsByGroupKey.removeValue(forKey: legacyKey)
            }
            next.tagsByGroupKey[identity.currentKey] = migratedTags
        }
        return next
    }

    static func sourceIdentity(
        sourceId: String,
        currentKey: String,
        sourceLocator: String?,
        sourceCanonicalRepo: String?
    ) -> GroupTagSourceIdentity {
        let normalizedLocator = normalizedGroupKeyMaterial(sourceLocator)
        let normalizedCanonicalRepo = normalizedGroupKeyMaterial(sourceCanonicalRepo)
        let normalizedLocatorRepo = ImportRepositoryIdentity.normalizedGitHubRepo(sourceLocator)
        let normalizedCanonicalRepoAlias = ImportRepositoryIdentity.normalizedGitHubRepo(sourceCanonicalRepo)
        return GroupTagSourceIdentity(
            currentKey: currentKey,
            legacyKeys: [
                sourceGroupKey(sourceId),
                normalizedLocator.map { "source:\($0)" },
                normalizedCanonicalRepo.map { "source:\($0)" },
                normalizedLocatorRepo.map { "source:\($0)" },
                normalizedCanonicalRepoAlias.map { "source:\($0)" },
                normalizedLocator.map { "locator:\($0)" },
                normalizedCanonicalRepo.map { "repo:\($0)" },
                normalizedLocatorRepo.map { "repo:\($0)" },
                normalizedCanonicalRepoAlias.map { "repo:\($0)" },
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

    private static func tagKey(_ tag: GroupTagPreference) -> String {
        if let tagId = tag.tagId?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !tagId.isEmpty {
            return "preset:\(tagId)"
        }
        return "custom:\(tag.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())"
    }
}

import Foundation

struct GroupTagDisplayItem: Identifiable, Equatable {
    let id: String
    let title: String
    let accent: DesktopAccentColor
}

struct GroupTagInputRule: Equatable {
    let maximumCharacters: Int
    let maximumWords: Int?

    static func forLocale(_ locale: Locale) -> GroupTagInputRule {
        switch DesktopLanguage.supportedIdentifier(for: locale.identifier) {
        case DesktopLanguage.zhHans.rawValue:
            return GroupTagInputRule(maximumCharacters: 4, maximumWords: nil)
        case DesktopLanguage.ja.rawValue:
            return GroupTagInputRule(maximumCharacters: 7, maximumWords: nil)
        case DesktopLanguage.en.rawValue, nil:
            return GroupTagInputRule(maximumCharacters: 20, maximumWords: 2)
        default:
            return GroupTagInputRule(maximumCharacters: 20, maximumWords: 2)
        }
    }

    func normalizedTitle(from rawTitle: String) -> String {
        let trimmed = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ""
        }

        let constrainedByWords: String
        if let maximumWords {
            constrainedByWords = trimmed
                .split(whereSeparator: \.isWhitespace)
                .prefix(maximumWords)
                .joined(separator: " ")
        } else {
            constrainedByWords = trimmed
        }

        return String(constrainedByWords.prefix(maximumCharacters))
    }
}

enum GroupTagMutationResult: Equatable {
    case added
    case removed
    case duplicate
    case limitReached
    case empty
    case notFound

    func toastMessage(locale: Locale) -> String? {
        switch self {
        case .added, .removed:
            return nil
        case .duplicate:
            return L10n.string("group_tag.toast.duplicate", locale: locale)
        case .limitReached:
            return L10n.string("group_tag.toast.limit", locale: locale)
        case .empty:
            return L10n.string("group_tag.toast.empty", locale: locale)
        case .notFound:
            return L10n.string("group_tag.toast.not_found", locale: locale)
        }
    }
}

@MainActor
final class GroupTagController {
    struct HomeSnapshot {
        let availableTags: [GroupTagDisplayItem]
        let tagCountsByID: [String: Int]
        let selectedKey: String?
        let visibleSourceIDs: [String]
        let tagsBySourceID: [String: [GroupTagDisplayItem]]
        let suggestionsBySourceID: [String: [GroupTagDisplayItem]]

        fileprivate let visibleSourceIDSet: Set<String>

        func contains(sourceId: String) -> Bool {
            visibleSourceIDSet.contains(sourceId)
        }
    }

    static let maximumTagCount = 3
    private static let localizedTagIDs = [
        "general",
        "development",
        "design",
        "creation",
        "marketing",
        "research",
        "teamwork",
        "automation",
        "frontend",
        "backend",
        "database",
        "writing",
        "content",
        "video",
        "productivity",
        "education",
        "knowledge",
        "workflow",
    ]

    private let state: DesktopAppState
    private let store: DesktopGroupTagStore
    private let recommendationsProvider: () -> [ImportRecommendationEntry]
    private let sourceCanonicalRepo: (String) -> String?
    private let sourceLocator: (String) -> String?
    private let randomAccent: () -> DesktopAccentColor

    init(
        state: DesktopAppState,
        store: DesktopGroupTagStore,
        recommendationsProvider: @escaping () -> [ImportRecommendationEntry] = { ImportRecommendationLoader.load() },
        sourceCanonicalRepo: @escaping (String) -> String?,
        sourceLocator: @escaping (String) -> String?,
        randomAccent: @escaping () -> DesktopAccentColor = { DesktopAccentColor.allCases.randomElement() ?? .blue }
    ) {
        self.state = state
        self.store = store
        self.recommendationsProvider = recommendationsProvider
        self.sourceCanonicalRepo = sourceCanonicalRepo
        self.sourceLocator = sourceLocator
        self.randomAccent = randomAccent
    }

    func resolvedTags(forSourceId sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        savedTagPreferences(forSourceId: sourceId, locale: locale)
            .prefix(Self.maximumTagCount)
            .map { preference in
                GroupTagDisplayItem(
                    id: Self.tagKey(for: preference),
                    title: Self.displayTitle(for: preference, locale: locale),
                    accent: preference.accent
                )
            }
    }

    func homeSnapshot(sourceIds: [String], locale: Locale) -> HomeSnapshot {
        var tagsBySourceID: [String: [GroupTagDisplayItem]] = [:]
        tagsBySourceID.reserveCapacity(sourceIds.count)

        var availableTags: [GroupTagDisplayItem] = []
        var tagCountsByID: [String: Int] = [:]
        var seenTagIDs = Set<String>()

        for sourceId in sourceIds {
            let tags = resolvedTags(forSourceId: sourceId, locale: locale)
            tagsBySourceID[sourceId] = tags

            for item in tags {
                tagCountsByID[item.id, default: 0] += 1
                if seenTagIDs.insert(item.id).inserted {
                    availableTags.append(item)
                }
            }
        }

        availableTags.sort(by: Self.sortTags)

        let selectedKey: String?
        if let selected = state.groupTags.selectedHomeFilterKey,
           seenTagIDs.contains(selected) {
            selectedKey = selected
        } else {
            selectedKey = nil
        }

        let visibleSourceIDs = sourceIds.filter { sourceId in
            guard let selectedKey else {
                return true
            }

            return tagsBySourceID[sourceId, default: []].contains(where: { $0.id == selectedKey })
        }
        let visibleSourceIDSet = Set(visibleSourceIDs)

        var suggestionsBySourceID: [String: [GroupTagDisplayItem]] = [:]
        suggestionsBySourceID.reserveCapacity(sourceIds.count)
        for sourceId in sourceIds {
            let currentTagIDs = Set(tagsBySourceID[sourceId, default: []].map(\.id))
            suggestionsBySourceID[sourceId] = currentTagIDs.count < Self.maximumTagCount
                ? availableTags.filter { !currentTagIDs.contains($0.id) }
                : []
        }

        return HomeSnapshot(
            availableTags: availableTags,
            tagCountsByID: tagCountsByID,
            selectedKey: selectedKey,
            visibleSourceIDs: visibleSourceIDs,
            tagsBySourceID: tagsBySourceID,
            suggestionsBySourceID: suggestionsBySourceID,
            visibleSourceIDSet: visibleSourceIDSet
        )
    }

    func availableHomeTags(sourceIds: [String], locale: Locale) -> [GroupTagDisplayItem] {
        homeSnapshot(sourceIds: sourceIds, locale: locale).availableTags
    }

    func effectiveSelectedHomeFilterKey(sourceIds: [String], locale: Locale) -> String? {
        homeSnapshot(sourceIds: sourceIds, locale: locale).selectedKey
    }

    func setSelectedHomeFilterKey(_ key: String?) {
        state.groupTags.selectedHomeFilterKey = key
    }

    func matchesHomeFilter(sourceId: String, sourceIds: [String], locale: Locale) -> Bool {
        homeSnapshot(sourceIds: sourceIds, locale: locale).visibleSourceIDSet.contains(sourceId)
    }

    func tagSuggestions(sourceIds: [String], excluding sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        homeSnapshot(sourceIds: sourceIds, locale: locale).suggestionsBySourceID[sourceId] ?? []
    }

    func canAddTag(forSourceId sourceId: String, locale: Locale) -> Bool {
        resolvedTags(forSourceId: sourceId, locale: locale).count < Self.maximumTagCount
    }

    func hasTags(forSourceId sourceId: String, locale: Locale) -> Bool {
        !resolvedTags(forSourceId: sourceId, locale: locale).isEmpty
    }

    func addCustomTag(
        _ rawTitle: String,
        accent: DesktopAccentColor?,
        toSourceId sourceId: String,
        locale: Locale
    ) -> GroupTagMutationResult {
        guard canAddTag(forSourceId: sourceId, locale: locale) else {
            return .limitReached
        }

        let normalized = Self.normalizedTagInput(rawTitle, locale: locale)
        guard !normalized.title.isEmpty else {
            return .empty
        }

        let key = groupKey(forSourceId: sourceId)
        var current = savedTagPreferences(forSourceId: sourceId, locale: locale)
        let existingIdentities = Set(current.flatMap(Self.tagIdentities))
        let candidateIdentities = Self.tagIdentities(
            forTitle: normalized.title,
            tagId: normalized.tagId
        )
        guard existingIdentities.isDisjoint(with: candidateIdentities) else {
            return .duplicate
        }

        current.append(
            GroupTagPreference(
                title: normalized.title,
                accentRawValue: (accent ?? randomAccent()).rawValue,
                tagId: normalized.tagId
            )
        )
        state.groupTags.tagCollection.tagsByGroupKey[key] = Array(current.prefix(Self.maximumTagCount))
        store.saveTagCollection(state.groupTags.tagCollection)
        return .added
    }

    func removeCustomTag(_ tagID: String, fromSourceId sourceId: String, locale: Locale) -> GroupTagMutationResult {
        let key = groupKey(forSourceId: sourceId)
        let current = savedTagPreferences(forSourceId: sourceId, locale: locale)
        let next = current.filter { Self.tagKey(for: $0) != tagID }

        guard next.count != current.count else {
            return .notFound
        }

        state.groupTags.tagCollection.tagsByGroupKey[key] = next
        store.saveTagCollection(state.groupTags.tagCollection)
        return .removed
    }

    static func inputRule(for locale: Locale) -> GroupTagInputRule {
        GroupTagInputRule.forLocale(locale)
    }

    static func normalizedInputTitle(_ rawTitle: String, locale: Locale) -> String {
        normalizedTagInput(rawTitle, locale: locale).title
    }

    private func savedTagPreferences(forSourceId sourceId: String, locale: Locale) -> [GroupTagPreference] {
        let key = groupKey(forSourceId: sourceId)
        if let stored = state.groupTags.tagCollection.tagsByGroupKey[key] {
            return Array(stored.prefix(Self.maximumTagCount))
        }

        let defaults = Array(
            (presetTags(
                canonicalRepo: sourceCanonicalRepo(sourceId),
                locator: sourceLocator(sourceId),
                locale: locale
            ) ?? []).prefix(Self.maximumTagCount)
        )
        state.groupTags.tagCollection.tagsByGroupKey[key] = defaults
        store.saveTagCollection(state.groupTags.tagCollection)
        return defaults
    }

    private func groupKey(forSourceId sourceId: String) -> String {
        if let canonicalRepo = Self.normalizedGroupKeyMaterial(sourceCanonicalRepo(sourceId)) {
            return "repo:\(canonicalRepo)"
        }

        if let locator = Self.normalizedGroupKeyMaterial(sourceLocator(sourceId)) {
            return "locator:\(locator)"
        }

        return "source:\(Self.normalizedKey(sourceId))"
    }

    private func presetTags(canonicalRepo: String?, locator: String?, locale: Locale) -> [GroupTagPreference]? {
        guard let recommendation = matchingRecommendation(canonicalRepo: canonicalRepo, locator: locator) else {
            return nil
        }

        let tagId = recommendation.primaryTagId
        return [
            GroupTagPreference(
                title: L10n.string("import.recommendation.tag.\(tagId)", locale: locale),
                accentRawValue: SharedGroupCard.recommendationBadgeAccent(tagId: tagId).rawValue,
                tagId: tagId
            )
        ]
    }

    private func matchingRecommendation(canonicalRepo: String?, locator: String?) -> ImportRecommendationEntry? {
        let normalizedCanonicalRepo = Self.normalizedKey(canonicalRepo)
        let normalizedLocator = Self.normalizedKey(locator)

        return recommendationsProvider().first { entry in
            let entryRepo = Self.normalizedKey(entry.canonicalRepo)
            let entryLocator = Self.normalizedKey(entry.locator)
            return (!normalizedCanonicalRepo.isEmpty && (entryRepo == normalizedCanonicalRepo || entryLocator == normalizedCanonicalRepo))
                || (!normalizedLocator.isEmpty && (entryRepo == normalizedLocator || entryLocator == normalizedLocator))
        }
    }

    private static func sortTags(_ lhs: GroupTagDisplayItem, _ rhs: GroupTagDisplayItem) -> Bool {
        return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
    }

    private static func normalizedTagInput(_ rawTitle: String, locale: Locale) -> (title: String, tagId: String?) {
        let title = inputRule(for: locale).normalizedTitle(from: rawTitle)
        guard !title.isEmpty else {
            return ("", nil)
        }

        if let tagId = matchingLocalizedTagID(for: title) {
            return (localizedTitle(forTagID: tagId, locale: locale), tagId)
        }

        return (title, nil)
    }

    private static func matchingLocalizedTagID(for rawTitle: String) -> String? {
        let normalizedTitle = normalizedKey(rawTitle)
        guard !normalizedTitle.isEmpty else {
            return nil
        }

        for tagId in localizedTagIDs {
            for localeIdentifier in [DesktopLanguage.en.rawValue, DesktopLanguage.zhHans.rawValue, DesktopLanguage.ja.rawValue] {
                let localized = L10n.string(
                    "import.recommendation.tag.\(tagId)",
                    locale: Locale(identifier: localeIdentifier)
                )
                if normalizedKey(localized) == normalizedTitle {
                    return tagId
                }
            }
        }

        return nil
    }

    private static func localizedTitle(forTagID tagId: String, locale: Locale) -> String {
        L10n.string("import.recommendation.tag.\(tagId)", locale: locale)
    }

    private static func displayTitle(for preference: GroupTagPreference, locale: Locale) -> String {
        guard let tagId = preference.tagId else {
            return preference.title
        }
        return localizedTitle(forTagID: tagId, locale: locale)
    }

    private static func tagIdentities(_ preference: GroupTagPreference) -> [String] {
        tagIdentities(forTitle: preference.title, tagId: preference.tagId)
    }

    private static func tagIdentities(forTitle title: String, tagId: String?) -> [String] {
        var identities = [normalizedKey(title)]
        if let tagId {
            identities.append("preset:\(tagId)")
        }
        return identities
    }

    private static func normalizedKey(_ value: String?) -> String {
        (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private static func normalizedGroupKeyMaterial(_ value: String?) -> String? {
        let normalized = (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .lowercased()
        return normalized.isEmpty ? nil : normalized
    }

    private static func tagKey(for preference: GroupTagPreference) -> String {
        preference.tagId.map { "preset:\($0)" } ?? "custom:\(normalizedKey(preference.title))"
    }
}

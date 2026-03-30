import Foundation

struct GroupTagDisplayItem: Identifiable, Equatable {
    let id: String
    let title: String
    let accent: DesktopAccentColor
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
    static let maximumTagCount = 3

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
        effectiveTagPreferences(forSourceId: sourceId, locale: locale)
            .prefix(Self.maximumTagCount)
            .map { preference in
                GroupTagDisplayItem(
                    id: Self.customTagKey(for: preference.title),
                    title: preference.title,
                    accent: preference.accent
                )
            }
    }

    func availableHomeTags(sourceIds: [String], locale: Locale) -> [GroupTagDisplayItem] {
        var ordered: [GroupTagDisplayItem] = []
        var seen = Set<String>()

        for sourceId in sourceIds {
            for item in resolvedTags(forSourceId: sourceId, locale: locale) where seen.insert(item.id).inserted {
                ordered.append(item)
            }
        }

        return ordered.sorted(by: Self.sortTags)
    }

    func effectiveSelectedHomeFilterKey(sourceIds: [String], locale: Locale) -> String? {
        guard let selected = state.groupTags.selectedHomeFilterKey else {
            return nil
        }

        let availableKeys = Set(availableHomeTags(sourceIds: sourceIds, locale: locale).map(\.id))
        return availableKeys.contains(selected) ? selected : nil
    }

    func setSelectedHomeFilterKey(_ key: String?) {
        state.groupTags.selectedHomeFilterKey = key
    }

    func matchesHomeFilter(sourceId: String, sourceIds: [String], locale: Locale) -> Bool {
        guard let selected = effectiveSelectedHomeFilterKey(sourceIds: sourceIds, locale: locale) else {
            return true
        }

        return resolvedTags(forSourceId: sourceId, locale: locale).contains(where: { $0.id == selected })
    }

    func tagSuggestions(sourceIds: [String], excluding sourceId: String, locale: Locale) -> [GroupTagDisplayItem] {
        let currentTagIDs = Set(resolvedTags(forSourceId: sourceId, locale: locale).map(\.id))
        guard currentTagIDs.count < Self.maximumTagCount else {
            return []
        }

        return availableHomeTags(sourceIds: sourceIds, locale: locale)
            .filter { !currentTagIDs.contains($0.id) }
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

        let title = Self.normalizedCustomTitle(rawTitle)
        guard !title.isEmpty else {
            return .empty
        }

        var current = effectiveTagPreferences(forSourceId: sourceId, locale: locale)
        let existingTitles = Set(
            current
                .map(\.title)
                .map(Self.normalizedKey)
        )
        guard !existingTitles.contains(Self.normalizedKey(title)) else {
            return .duplicate
        }

        current.append(
            GroupTagPreference(title: title, accentRawValue: (accent ?? randomAccent()).rawValue)
        )
        state.groupTags.customTagsBySourceId[sourceId] = Array(current.prefix(Self.maximumTagCount))
        store.saveCustomTags(state.groupTags.customTagsBySourceId)
        return .added
    }

    func removeCustomTag(_ tagID: String, fromSourceId sourceId: String, locale: Locale) -> GroupTagMutationResult {
        let current = effectiveTagPreferences(forSourceId: sourceId, locale: locale)
        let next = current.filter { Self.customTagKey(for: $0.title) != tagID }

        guard next.count != current.count else {
            return .notFound
        }

        state.groupTags.customTagsBySourceId[sourceId] = next
        store.saveCustomTags(state.groupTags.customTagsBySourceId)
        return .removed
    }

    private func effectiveTagPreferences(forSourceId sourceId: String, locale: Locale) -> [GroupTagPreference] {
        if let stored = state.groupTags.customTagsBySourceId[sourceId] {
            return Array(stored.prefix(Self.maximumTagCount))
        }

        return Array(
            (presetTags(
                canonicalRepo: sourceCanonicalRepo(sourceId),
                locator: sourceLocator(sourceId),
                locale: locale
            ) ?? []).prefix(Self.maximumTagCount)
        )
    }

    private func presetTags(canonicalRepo: String?, locator: String?, locale: Locale) -> [GroupTagPreference]? {
        guard let recommendation = matchingRecommendation(canonicalRepo: canonicalRepo, locator: locator) else {
            return nil
        }

        let tagIds = [recommendation.primaryTagId] + Array(recommendation.secondaryTagIds.prefix(2))
        return tagIds.map { tagId in
            GroupTagPreference(
                title: L10n.string("import.recommendation.tag.\(tagId)", locale: locale),
                accentRawValue: SharedGroupCard.recommendationBadgeAccent(tagId: tagId).rawValue
            )
        }
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

    private static func normalizedCustomTitle(_ rawTitle: String) -> String {
        String(rawTitle.trimmingCharacters(in: .whitespacesAndNewlines).prefix(4))
    }

    private static func normalizedKey(_ value: String?) -> String {
        (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private static func customTagKey(for title: String) -> String {
        "custom:\(normalizedKey(title))"
    }
}

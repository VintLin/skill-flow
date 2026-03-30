import Foundation

struct GroupTagDisplayItem: Identifiable, Equatable {
    let id: String
    let title: String
    let accent: DesktopAccentColor
}

@MainActor
final class GroupTagController {
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
        if let preset = presetTags(
            canonicalRepo: sourceCanonicalRepo(sourceId),
            locator: sourceLocator(sourceId),
            locale: locale
        ) {
            return preset
        }

        guard let preference = state.groupTags.customTagsBySourceId[sourceId] else {
            return []
        }

        return [
            GroupTagDisplayItem(
                id: Self.customTagKey(for: preference.title),
                title: preference.title,
                accent: preference.accent
            )
        ]
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
        guard resolvedTags(forSourceId: sourceId, locale: locale).isEmpty else {
            return []
        }
        return availableHomeTags(sourceIds: sourceIds, locale: locale)
    }

    func addCustomTag(_ rawTitle: String, accent: DesktopAccentColor?, toSourceId sourceId: String) {
        guard presetTags(
            canonicalRepo: sourceCanonicalRepo(sourceId),
            locator: sourceLocator(sourceId),
            locale: Locale(identifier: "en")
        ) == nil else {
            return
        }

        let title = Self.normalizedCustomTitle(rawTitle)
        guard !title.isEmpty else {
            return
        }

        state.groupTags.customTagsBySourceId[sourceId] = GroupTagPreference(
            title: title,
            accentRawValue: (accent ?? randomAccent()).rawValue
        )
        store.saveCustomTags(state.groupTags.customTagsBySourceId)
    }

    private func presetTags(canonicalRepo: String?, locator: String?, locale: Locale) -> [GroupTagDisplayItem]? {
        guard let recommendation = matchingRecommendation(canonicalRepo: canonicalRepo, locator: locator) else {
            return nil
        }

        let tagIds = [recommendation.primaryTagId] + Array(recommendation.secondaryTagIds.prefix(2))
        return tagIds.map { tagId in
            GroupTagDisplayItem(
                id: Self.presetTagKey(for: tagId),
                title: L10n.string("import.recommendation.tag.\(tagId)", locale: locale),
                accent: SharedGroupCard.recommendationBadgeAccent(tagId: tagId)
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
        let lhsPreset = lhs.id.hasPrefix("preset:")
        let rhsPreset = rhs.id.hasPrefix("preset:")
        if lhsPreset != rhsPreset {
            return lhsPreset
        }
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

    private static func presetTagKey(for tagId: String) -> String {
        "preset:\(tagId)"
    }

    private static func customTagKey(for title: String) -> String {
        "custom:\(normalizedKey(title))"
    }
}

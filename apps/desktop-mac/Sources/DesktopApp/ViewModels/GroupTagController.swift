import Foundation

struct GroupTagDisplayItem: Identifiable, Equatable {
    let id: String
    let title: String
    let accent: DesktopAccentColor
    let isRemovable: Bool
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
        let preset = presetTags(
            canonicalRepo: sourceCanonicalRepo(sourceId),
            locator: sourceLocator(sourceId),
            locale: locale
        ) ?? []
        let presetIDs = Set(preset.map(\.id))
        let custom = (state.groupTags.customTagsBySourceId[sourceId] ?? []).compactMap { preference in
            let item = GroupTagDisplayItem(
                id: Self.customTagKey(for: preference.title),
                title: preference.title,
                accent: preference.accent,
                isRemovable: true
            )
            return presetIDs.contains(item.id) ? nil : item
        }

        return Array((preset + custom).prefix(Self.maximumTagCount))
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

    func hasRemovableTags(forSourceId sourceId: String) -> Bool {
        !(state.groupTags.customTagsBySourceId[sourceId] ?? []).isEmpty
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

        let nextItem = GroupTagDisplayItem(
            id: Self.customTagKey(for: title),
            title: title,
            accent: accent ?? randomAccent(),
            isRemovable: true
        )
        let existingTitles = Set(
            resolvedTags(forSourceId: sourceId, locale: locale)
                .map(\.title)
                .map(Self.normalizedKey)
        )
        guard !existingTitles.contains(Self.normalizedKey(title)) else {
            return .duplicate
        }

        state.groupTags.customTagsBySourceId[sourceId, default: []].append(
            GroupTagPreference(title: title, accentRawValue: nextItem.accent.rawValue)
        )
        store.saveCustomTags(state.groupTags.customTagsBySourceId)
        return .added
    }

    func removeCustomTag(_ tagID: String, fromSourceId sourceId: String) -> GroupTagMutationResult {
        let current = state.groupTags.customTagsBySourceId[sourceId] ?? []
        let next = current.filter { Self.customTagKey(for: $0.title) != tagID }

        guard next.count != current.count else {
            return .notFound
        }

        if next.isEmpty {
            state.groupTags.customTagsBySourceId.removeValue(forKey: sourceId)
        } else {
            state.groupTags.customTagsBySourceId[sourceId] = next
        }
        store.saveCustomTags(state.groupTags.customTagsBySourceId)
        return .removed
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
                accent: SharedGroupCard.recommendationBadgeAccent(tagId: tagId),
                isRemovable: false
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

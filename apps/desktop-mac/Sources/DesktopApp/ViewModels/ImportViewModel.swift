import Foundation

struct ImportViewModel: Equatable {
    struct RecommendationBadgeItem: Identifiable, Equatable {
        let id: String
        let title: String
        let isPrimary: Bool
    }

    struct Stats: Equatable {
        let skillCount: Int?
        let downloadCount: Int?
        let starCount: Int?
        let githubURL: String?
    }

    struct Skill: Identifiable, Equatable {
        let id: String
        let title: String
        let summary: String
        let selectedByDefault: Bool
        let highlightQuery: String?
        let selection: ImportSkillSelection
        let selectorAliases: [String]

        init(
            id: String,
            title: String,
            summary: String,
            selectedByDefault: Bool,
            highlightQuery: String? = nil,
            selection: ImportSkillSelection? = nil,
            selectorAliases: [String] = []
        ) {
            self.id = id
            self.title = title
            self.summary = summary
            self.selectedByDefault = selectedByDefault
            self.highlightQuery = highlightQuery
            self.selection = selection ?? .repoPath(id)
            self.selectorAliases = selectorAliases
        }
    }

    struct Target: Identifiable, Equatable {
        let id: String
        let selectedByDefault: Bool
        let isLocked: Bool

        init(
            id: String,
            selectedByDefault: Bool,
            isLocked: Bool = false
        ) {
            self.id = id
            self.selectedByDefault = selectedByDefault
            self.isLocked = isLocked
        }
    }

    struct Card: Identifiable, Equatable {
        let id: String
        let title: String
        let locator: String
        let canonicalRepo: String
        let preparationId: String?
        let preparationStatus: String?
        let isInstalledLocally: Bool
        let aliases: [String]
        let summary: String
        let subtitle: String
        let headerMetaLine: String?
        let stats: Stats
        let skillsLoading: Bool
        let targetsLoading: Bool
        let skills: [Skill]
        let targets: [Target]
        let recommendationBadgeItems: [RecommendationBadgeItem]
        let recommendationDescription: String?
        let provider: String
        let localValidationStatus: String?
        let selectedLocalChoiceId: String?
        let localChoices: [MainViewModel.LocalImportChoice]
        let requiresLocalVariantSelection: Bool
        let needsSkillDetails: Bool

        init(
            id: String,
            title: String,
            locator: String,
            canonicalRepo: String,
            preparationId: String? = nil,
            preparationStatus: String? = nil,
            isInstalledLocally: Bool,
            aliases: [String],
            summary: String,
            subtitle: String,
            headerMetaLine: String? = nil,
            stats: Stats,
            skillsLoading: Bool,
            targetsLoading: Bool,
            skills: [Skill],
            targets: [Target],
            recommendationBadgeItems: [RecommendationBadgeItem] = [],
            recommendationDescription: String? = nil,
            provider: String = "skills",
            localValidationStatus: String? = nil,
            selectedLocalChoiceId: String? = nil,
            localChoices: [MainViewModel.LocalImportChoice] = [],
            requiresLocalVariantSelection: Bool = false,
            needsSkillDetails: Bool = false
        ) {
            self.id = id
            self.title = title
            self.locator = locator
            self.canonicalRepo = canonicalRepo
            self.preparationId = preparationId
            self.preparationStatus = preparationStatus
            self.isInstalledLocally = isInstalledLocally
            self.aliases = aliases
            self.summary = summary
            self.subtitle = subtitle
            self.headerMetaLine = headerMetaLine
            self.stats = stats
            self.skillsLoading = skillsLoading
            self.targetsLoading = targetsLoading
            self.skills = skills
            self.targets = targets
            self.recommendationBadgeItems = recommendationBadgeItems
            self.recommendationDescription = recommendationDescription
            self.provider = provider
            self.localValidationStatus = localValidationStatus
            self.selectedLocalChoiceId = selectedLocalChoiceId
            self.localChoices = localChoices
            self.requiresLocalVariantSelection = requiresLocalVariantSelection
            self.needsSkillDetails = needsSkillDetails
        }
    }

    let content: [Card]

    init(
        items: [MainViewModel.ImportGroupItem],
        locale: Locale,
        fallbackTargetIds: [String] = [],
        submittedQuery: String = "",
        recommendations: [ImportRecommendationEntry] = []
    ) {
        let baseCards = items.map {
            Self.card(from: $0, locale: locale, fallbackTargetIds: fallbackTargetIds, submittedQuery: submittedQuery)
        }

        if submittedQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            self.content = Self.recommendedCards(cards: baseCards, recommendations: recommendations, locale: locale)
        } else {
            self.content = baseCards
        }
    }

    static func card(
        from item: MainViewModel.ImportGroupItem,
        locale: Locale,
        fallbackTargetIds: [String] = [],
        submittedQuery: String = ""
    ) -> Card {
        let resolvedSkills = resolvedSkills(for: item, submittedQuery: submittedQuery)
        return Card(
            id: item.id,
            title: item.title,
            locator: item.locator,
            canonicalRepo: item.canonicalRepo,
            preparationId: item.preparationId,
            preparationStatus: item.preparationStatus,
            isInstalledLocally: item.isInstalledLocally,
            aliases: item.aliases,
            summary: summary(for: item, locale: locale),
            subtitle: subtitle(for: item, locale: locale),
            headerMetaLine: headerMetaLine(for: item, locale: locale),
            stats: stats(for: item),
            skillsLoading: shouldShowSkillLoadingState(for: item),
            targetsLoading: false,
            skills: resolvedSkills,
            targets: resolvedTargets(for: item, fallbackTargetIds: fallbackTargetIds).map {
                Target(
                    id: $0.id,
                    selectedByDefault: $0.selectedByDefault,
                    isLocked: $0.isLocked
                )
            },
            recommendationBadgeItems: [],
            recommendationDescription: nil,
            provider: item.provider,
            localValidationStatus: item.localImport?.validationStatus,
            selectedLocalChoiceId: item.localImport?.selectedChoiceId,
            localChoices: item.localImport?.choices ?? [],
            requiresLocalVariantSelection: item.localImport?.validationStatus == "version-conflict",
            needsSkillDetails: needsSkillDetails(for: item)
        )
    }

    private static func recommendedCards(
        cards: [Card],
        recommendations: [ImportRecommendationEntry],
        locale: Locale
    ) -> [Card] {
        let localCards = cards.filter { $0.provider == "local" || $0.localValidationStatus != nil }
        let remoteCards = cards.filter { card in
            !localCards.contains(where: { $0.id == card.id })
        }
        let cardsByCanonicalRepo = cardsByRecommendationKey(remoteCards, key: \.canonicalRepo)
        let cardsByLocator = cardsByRecommendationKey(remoteCards, key: \.locator)
        let recommendedRemoteCards = recommendations
            .sorted(by: recommendationSort)
            .compactMap { entry -> Card? in
                let key = normalizedRecommendationKey(entry.canonicalRepo)
                let locatorKey = normalizedRecommendationKey(entry.locator)
                guard let baseCard = cardsByCanonicalRepo[key] ?? cardsByLocator[locatorKey] else {
                    return nil
                }

                return decoratedRecommendationCard(from: baseCard, entry: entry, locale: locale)
            }

        return localCards + recommendedRemoteCards
    }

    private static func decoratedRecommendationCard(
        from baseCard: Card,
        entry: ImportRecommendationEntry,
        locale: Locale
    ) -> Card {
        Card(
            id: baseCard.id,
            title: baseCard.title,
            locator: baseCard.locator,
            canonicalRepo: baseCard.canonicalRepo,
            preparationId: baseCard.preparationId,
            preparationStatus: baseCard.preparationStatus,
            isInstalledLocally: baseCard.isInstalledLocally,
            aliases: baseCard.aliases,
            summary: baseCard.summary,
            subtitle: baseCard.subtitle,
            headerMetaLine: baseCard.headerMetaLine,
            stats: baseCard.stats,
            skillsLoading: baseCard.skillsLoading,
            targetsLoading: baseCard.targetsLoading,
            skills: baseCard.skills,
            targets: baseCard.targets,
            recommendationBadgeItems: recommendationBadgeItems(for: entry, locale: locale),
            recommendationDescription: localized(entry.descriptionKey, locale: locale),
            provider: baseCard.provider,
            localValidationStatus: baseCard.localValidationStatus,
            selectedLocalChoiceId: baseCard.selectedLocalChoiceId,
            localChoices: baseCard.localChoices,
            requiresLocalVariantSelection: baseCard.requiresLocalVariantSelection
        )
    }

    private static func cardsByRecommendationKey(_ cards: [Card], key: KeyPath<Card, String>) -> [String: Card] {
        var result: [String: Card] = [:]
        for card in cards {
            let normalizedKey = normalizedRecommendationKey(card[keyPath: key])
            guard result[normalizedKey] == nil else {
                continue
            }
            result[normalizedKey] = card
        }
        return result
    }

    private static func recommendationBadgeItems(
        for entry: ImportRecommendationEntry,
        locale: Locale
    ) -> [RecommendationBadgeItem] {
        [
            RecommendationBadgeItem(
                id: entry.primaryTagId,
                title: localized("import.recommendation.tag.\(entry.primaryTagId)", locale: locale),
                isPrimary: true
            )
        ]
    }

    private static func recommendationSort(_ lhs: ImportRecommendationEntry, _ rhs: ImportRecommendationEntry) -> Bool {
        if lhs.sortOrder != rhs.sortOrder {
            return lhs.sortOrder < rhs.sortOrder
        }
        if lhs.categoryId != rhs.categoryId {
            return lhs.categoryId < rhs.categoryId
        }
        return lhs.canonicalRepo < rhs.canonicalRepo
    }

    private static func normalizedRecommendationKey(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private static func stats(for item: MainViewModel.ImportGroupItem) -> Stats {
        Stats(
            skillCount: item.snapshot?.skillCount ?? item.skillCount,
            downloadCount: item.snapshot?.totalInstalls ?? item.totalInstalls,
            starCount: item.snapshot?.repoStars ?? item.starCount,
            githubURL: item.snapshot?.repoURL
        )
    }

    private static func shouldShowSkillLoadingState(for item: MainViewModel.ImportGroupItem) -> Bool {
        if !resolvedBaseSkills(for: item).isEmpty {
            return false
        }

        switch item.previewPhase {
        case .loading:
            return item.skills.isEmpty
        case .idle:
            return false
        case .ready, .failed:
            return false
        }
    }

    private static func resolvedBaseSkills(for item: MainViewModel.ImportGroupItem) -> [MainViewModel.ImportGroupSkill] {
        if !item.skills.isEmpty {
            return item.skills
        }

        return item.snapshot?.skills.map { skill in
            MainViewModel.ImportGroupSkill(
                id: skill.skillId,
                title: skill.title,
                summary: skill.summary,
                selectedByDefault: true,
                selectorAliases: [skill.skillId]
            )
        } ?? []
    }

    private static func needsSkillDetails(for item: MainViewModel.ImportGroupItem) -> Bool {
        guard item.provider != "local" else {
            return false
        }
        guard case .idle = item.previewPhase else {
            return false
        }
        return true
    }

    private static func resolvedSkills(
        for item: MainViewModel.ImportGroupItem,
        submittedQuery: String
    ) -> [Skill] {
        let baseSkills = resolvedBaseSkills(for: item)
        let normalizedQuery = submittedQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let queryKey = normalizedQuery.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)

        let matchedKeys = Set(
            item.matchedSkillNames.map(normalizedMatchKey)
                + item.matchedSkills.flatMap { [normalizedMatchKey($0.skillId), normalizedMatchKey($0.title)] }
        )

        return baseSkills.enumerated()
            .map { index, skill in
                let titleKey = normalizedMatchKey(skill.title)
                let idKey = normalizedMatchKey(skill.id)
                let matchesQuery = !queryKey.isEmpty && (
                    titleKey.contains(queryKey) || idKey.contains(queryKey)
                )
                let isMatched = matchesQuery || matchedKeys.contains(titleKey) || matchedKeys.contains(idKey)

                return (
                    index: index,
                    matched: isMatched,
                    skill: Skill(
                        id: skill.id,
                        title: skill.title,
                        summary: skill.summary,
                        selectedByDefault: skill.selectedByDefault,
                        highlightQuery: matchesQuery ? normalizedQuery : nil,
                        selection: skill.selection,
                        selectorAliases: skill.selectorAliases
                    )
                )
            }
            .sorted { lhs, rhs in
                if lhs.matched != rhs.matched {
                    return lhs.matched && !rhs.matched
                }
                return lhs.index < rhs.index
            }
            .map(\.skill)
    }

    private struct ResolvedTarget {
        let id: String
        let selectedByDefault: Bool
        let isLocked: Bool
    }

    private static func resolvedTargets(
        for item: MainViewModel.ImportGroupItem,
        fallbackTargetIds: [String]
    ) -> [ResolvedTarget] {
        let sourceTargetIds = localSourceTargetIds(for: item)
        let explicitTargetsById = Dictionary(uniqueKeysWithValues: item.targets.map { ($0.id, $0) })
        var orderedTargetIds: [String] = []

        for targetId in item.targets.map(\.id) + fallbackTargetIds + sourceTargetIds {
            guard !orderedTargetIds.contains(targetId) else {
                continue
            }
            orderedTargetIds.append(targetId)
        }

        return orderedTargetIds.map { targetId in
            ResolvedTarget(
                id: targetId,
                selectedByDefault: explicitTargetsById[targetId]?.selectedByDefault ?? sourceTargetIds.contains(targetId),
                isLocked: sourceTargetIds.contains(targetId)
            )
        }
    }

    private static func localSourceTargetIds(for item: MainViewModel.ImportGroupItem) -> [String] {
        var targetIds: [String] = []

        for detectedSkill in item.localImport?.detectedSkills ?? [] {
            for targetId in detectedSkill.discoveredTargets {
                guard !targetIds.contains(targetId) else {
                    continue
                }
                targetIds.append(targetId)
            }
        }

        return targetIds
    }

    private static func summary(for item: MainViewModel.ImportGroupItem, locale: Locale) -> String {
        if !item.summary.isEmpty {
            return item.summary
        }
        if let snapshot = item.snapshot, !snapshot.description.isEmpty {
            return snapshot.description
        }
        if !item.matchedSkills.isEmpty {
            return item.matchedSkills.map { skill in
                if let installs = skill.installs {
                    return "\(skill.title) \(formattedCount(installs))"
                }
                return skill.title
            }.joined(separator: ", ")
        }
        if !item.matchedSkillNames.isEmpty {
            return item.matchedSkillNames.joined(separator: ", ")
        }
        switch item.previewPhase {
        case .loading:
            return localized("import.card.summary.loading_skills", locale: locale)
        case .failed(let message):
            return message.resolve(locale: locale)
        case .idle, .ready:
            return localized("import.card.summary.import_from", locale: locale, item.canonicalRepo)
        }
    }

    private static func subtitle(for item: MainViewModel.ImportGroupItem, locale: Locale) -> String {
        if item.provider == "local" || item.localImport != nil {
            return localized("import.card.subtitle.local_scan", locale: locale)
        }

        let locator = item.locator
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        let patterns = [
            #"github\.com/([^/\s]+)/"#,
            #"git@github\.com:([^/\s]+)/"#,
            #"^([^/\s]+)/"#,
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else {
                continue
            }
            let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
            guard let match = regex.firstMatch(in: trimmed, range: range),
                  match.numberOfRanges > 1,
                  let ownerRange = Range(match.range(at: 1), in: trimmed) else {
                continue
            }
            return localized("import.card.subtitle.by_owner", locale: locale, String(trimmed[ownerRange]))
        }

        return localized("import.card.subtitle.recommended", locale: locale)
    }

    private static func headerMetaLine(for item: MainViewModel.ImportGroupItem, locale: Locale) -> String? {
        guard item.provider == "local" || item.localImport != nil else {
            return nil
        }
        let sourcePathCount = Set((item.localImport?.detectedSkills ?? []).map(\.localPath)).count
        guard sourcePathCount > 0 else {
            return nil
        }
        return localized("import.card.meta.local_scan_sources", locale: locale, sourcePathCount)
    }

    private static func formattedCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private static func normalizedMatchKey(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    }

    private static func localized(_ key: String, locale: Locale, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }
}

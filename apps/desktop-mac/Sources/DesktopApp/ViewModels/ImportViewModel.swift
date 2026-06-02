import Foundation

struct ImportViewModel: Equatable {
    struct RecommendationBadgeItem: Identifiable, Equatable {
        let id: String
        let title: String
        let isPrimary: Bool
    }

    struct RecommendedCategorySection: Identifiable, Equatable {
        let id: String
        let categoryId: String
        let title: String
        let cards: [Card]
    }

    enum Content: Equatable {
        case recommended([RecommendedCategorySection])
        case searchResults([Card])
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

        init(
            id: String,
            title: String,
            summary: String,
            selectedByDefault: Bool,
            highlightQuery: String? = nil
        ) {
            self.id = id
            self.title = title
            self.summary = summary
            self.selectedByDefault = selectedByDefault
            self.highlightQuery = highlightQuery
        }
    }

    struct Target: Identifiable, Equatable {
        let id: String
        let selectedByDefault: Bool
    }

    struct Card: Identifiable, Equatable {
        let id: String
        let title: String
        let locator: String
        let canonicalRepo: String
        let isInstalledLocally: Bool
        let aliases: [String]
        let summary: String
        let subtitle: String
        let stats: Stats
        let skillsLoading: Bool
        let targetsLoading: Bool
        let skills: [Skill]
        let targets: [Target]
        let recommendationBadgeItems: [RecommendationBadgeItem]
        let recommendationDescription: String?
        let provider: String
        let localValidationStatus: String?
        let localChoices: [MainViewModel.LocalImportChoice]

        init(
            id: String,
            title: String,
            locator: String,
            canonicalRepo: String,
            isInstalledLocally: Bool,
            aliases: [String],
            summary: String,
            subtitle: String,
            stats: Stats,
            skillsLoading: Bool,
            targetsLoading: Bool,
            skills: [Skill],
            targets: [Target],
            recommendationBadgeItems: [RecommendationBadgeItem] = [],
            recommendationDescription: String? = nil,
            provider: String = "skills",
            localValidationStatus: String? = nil,
            localChoices: [MainViewModel.LocalImportChoice] = []
        ) {
            self.id = id
            self.title = title
            self.locator = locator
            self.canonicalRepo = canonicalRepo
            self.isInstalledLocally = isInstalledLocally
            self.aliases = aliases
            self.summary = summary
            self.subtitle = subtitle
            self.stats = stats
            self.skillsLoading = skillsLoading
            self.targetsLoading = targetsLoading
            self.skills = skills
            self.targets = targets
            self.recommendationBadgeItems = recommendationBadgeItems
            self.recommendationDescription = recommendationDescription
            self.provider = provider
            self.localValidationStatus = localValidationStatus
            self.localChoices = localChoices
        }
    }

    let cards: [Card]
    let content: Content

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
        self.cards = baseCards

        if submittedQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let sections = Self.recommendedSections(cards: baseCards, recommendations: recommendations, locale: locale)
            self.content = .recommended(sections)
        } else {
            self.content = .searchResults(baseCards)
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
            isInstalledLocally: item.isInstalledLocally,
            aliases: item.aliases,
            summary: summary(for: item, locale: locale),
            subtitle: subtitle(for: item.locator, locale: locale),
            stats: stats(for: item),
            skillsLoading: shouldShowSkillLoadingState(for: item),
            targetsLoading: false,
            skills: resolvedSkills,
            targets: resolvedTargets(for: item, fallbackTargetIds: fallbackTargetIds).map {
                Target(
                    id: $0.id,
                    selectedByDefault: $0.selectedByDefault
                )
            },
            recommendationBadgeItems: [],
            recommendationDescription: nil,
            provider: item.provider,
            localValidationStatus: item.localImport?.validationStatus,
            localChoices: item.localImport?.choices ?? []
        )
    }

    private static func recommendedSections(
        cards: [Card],
        recommendations: [ImportRecommendationEntry],
        locale: Locale
    ) -> [RecommendedCategorySection] {
        let cardsByCanonicalRepo = Dictionary(uniqueKeysWithValues: cards.map { (normalizedRecommendationKey($0.canonicalRepo), $0) })
        let cardsByLocator = Dictionary(uniqueKeysWithValues: cards.map { (normalizedRecommendationKey($0.locator), $0) })
        var sectionsByCategoryId: [String: [(entry: ImportRecommendationEntry, card: Card)]] = [:]

        for entry in recommendations.sorted(by: recommendationSort) {
            let key = normalizedRecommendationKey(entry.canonicalRepo)
            let locatorKey = normalizedRecommendationKey(entry.locator)
            guard let baseCard = cardsByCanonicalRepo[key] ?? cardsByLocator[locatorKey] else {
                continue
            }

            let decoratedCard = Card(
                id: baseCard.id,
                title: baseCard.title,
                locator: baseCard.locator,
                canonicalRepo: baseCard.canonicalRepo,
                isInstalledLocally: baseCard.isInstalledLocally,
                aliases: baseCard.aliases,
                summary: baseCard.summary,
                subtitle: baseCard.subtitle,
                stats: baseCard.stats,
                skillsLoading: baseCard.skillsLoading,
                targetsLoading: baseCard.targetsLoading,
                skills: baseCard.skills,
                targets: baseCard.targets,
                recommendationBadgeItems: recommendationBadgeItems(for: entry, locale: locale),
                recommendationDescription: localized(entry.descriptionKey, locale: locale),
                provider: baseCard.provider,
                localValidationStatus: baseCard.localValidationStatus,
                localChoices: baseCard.localChoices
            )

            sectionsByCategoryId[entry.categoryId, default: []].append((entry: entry, card: decoratedCard))
        }

        let localCards = cards.filter { $0.provider == "local" || $0.localValidationStatus != nil }
        let remoteSections = sectionsByCategoryId
            .map { categoryId, entries in
                return RecommendedCategorySection(
                    id: categoryId,
                    categoryId: categoryId,
                    title: localized("import.recommendation.category.\(categoryId)", locale: locale),
                    cards: entries.sorted(by: { recommendationSort($0.entry, $1.entry) }).map(\.card)
                )
            }
            .sorted { lhs, rhs in
                guard let lhsOrder = sectionsByCategoryId[lhs.categoryId]?.map(\.entry.sortOrder).min(),
                      let rhsOrder = sectionsByCategoryId[rhs.categoryId]?.map(\.entry.sortOrder).min() else {
                    return lhs.categoryId < rhs.categoryId
                }
                if lhsOrder != rhsOrder {
                    return lhsOrder < rhsOrder
                }
                return lhs.categoryId < rhs.categoryId
            }

        guard !localCards.isEmpty else {
            return remoteSections
        }

        return [
            RecommendedCategorySection(
                id: "local",
                categoryId: "local",
                title: localized("import.local.detected.title", locale: locale),
                cards: localCards
            )
        ] + remoteSections
    }

    private static func recommendationBadgeItems(
        for entry: ImportRecommendationEntry,
        locale: Locale
    ) -> [RecommendationBadgeItem] {
        let secondaryTagIds = Array(entry.secondaryTagIds.prefix(2))
        let tagIds = [entry.primaryTagId] + secondaryTagIds

        return tagIds.enumerated().map { index, tagId in
            RecommendationBadgeItem(
                id: tagId,
                title: localized("import.recommendation.tag.\(tagId)", locale: locale),
                isPrimary: index == 0
            )
        }
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
            return item.skills.isEmpty
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
                selectedByDefault: true
            )
        } ?? []
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
                        highlightQuery: matchesQuery ? normalizedQuery : nil
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

    private static func resolvedTargets(
        for item: MainViewModel.ImportGroupItem,
        fallbackTargetIds: [String]
    ) -> [MainViewModel.ImportGroupTarget] {
        if !item.targets.isEmpty {
            return item.targets
        }

        return fallbackTargetIds.map { targetId in
            MainViewModel.ImportGroupTarget(id: targetId, selectedByDefault: false)
        }
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

    private static func subtitle(for locator: String, locale: Locale) -> String {
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

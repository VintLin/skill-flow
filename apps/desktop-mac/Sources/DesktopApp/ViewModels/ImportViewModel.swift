import Foundation

struct ImportViewModel: Equatable {
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
        let aliases: [String]
        let summary: String
        let subtitle: String
        let sourceFacts: [String]
        let stats: Stats
        let skillsLoading: Bool
        let targetsLoading: Bool
        let skills: [Skill]
        let targets: [Target]
    }

    let cards: [Card]

    init(items: [MainViewModel.ImportGroupItem], locale: Locale, fallbackTargetIds: [String] = []) {
        self.cards = items.map { Self.card(from: $0, locale: locale, fallbackTargetIds: fallbackTargetIds) }
    }

    static func card(
        from item: MainViewModel.ImportGroupItem,
        locale: Locale,
        fallbackTargetIds: [String] = []
    ) -> Card {
        let resolvedSkills = resolvedSkills(for: item)
        return Card(
            id: item.id,
            title: item.title,
            locator: item.locator,
            canonicalRepo: item.canonicalRepo,
            aliases: item.aliases,
            summary: summary(for: item, locale: locale),
            subtitle: subtitle(for: item.locator, locale: locale),
            sourceFacts: [],
            stats: stats(for: item),
            skillsLoading: shouldShowSkillLoadingState(for: item),
            targetsLoading: false,
            skills: resolvedSkills.map {
                Skill(
                    id: $0.id,
                    title: $0.title,
                    summary: $0.summary,
                    selectedByDefault: $0.selectedByDefault
                )
            },
            targets: resolvedTargets(for: item, fallbackTargetIds: fallbackTargetIds).map {
                Target(
                    id: $0.id,
                    selectedByDefault: $0.selectedByDefault
                )
            }
        )
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
        if !resolvedSkills(for: item).isEmpty {
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

    private static func resolvedSkills(for item: MainViewModel.ImportGroupItem) -> [MainViewModel.ImportGroupSkill] {
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

    private static func localized(_ key: String, locale: Locale, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }
}

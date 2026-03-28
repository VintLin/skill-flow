import Foundation

struct ImportViewModel: Equatable {
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
        let skills: [Skill]
        let targets: [Target]
    }

    let cards: [Card]

    init(items: [MainViewModel.ImportGroupItem], locale: Locale) {
        self.cards = items.map { Self.card(from: $0, locale: locale) }
    }

    static func card(from item: MainViewModel.ImportGroupItem, locale: Locale) -> Card {
        Card(
            id: item.id,
            title: item.title,
            locator: item.locator,
            canonicalRepo: item.canonicalRepo,
            aliases: item.aliases,
            summary: summary(for: item, locale: locale),
            subtitle: subtitle(for: item.locator, locale: locale),
            sourceFacts: sourceFacts(for: item, locale: locale),
            skills: item.skills.map {
                Skill(
                    id: $0.id,
                    title: $0.title,
                    summary: $0.summary,
                    selectedByDefault: $0.selectedByDefault
                )
            },
            targets: item.targets.map {
                Target(
                    id: $0.id,
                    selectedByDefault: $0.selectedByDefault
                )
            }
        )
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

    private static func sourceFacts(for item: MainViewModel.ImportGroupItem, locale: Locale) -> [String] {
        var facts: [String] = []
        let totalInstalls = item.snapshot?.totalInstalls ?? item.totalInstalls
        let starCount = item.snapshot?.repoStars ?? item.starCount
        let skillCount = item.snapshot?.skillCount ?? item.skillCount

        if let totalInstalls, totalInstalls > 0 {
            facts.append(localized("import.card.facts.installs", locale: locale, formattedCount(totalInstalls)))
        }
        if let starCount, starCount > 0 {
            facts.append(localized("import.card.facts.stars", locale: locale, formattedCount(starCount)))
        }
        if let skillCount, skillCount > 0 {
            facts.append(localized("import.card.facts.skills", locale: locale, String(skillCount)))
        }
        if let owner = item.snapshot?.owner {
            var ownerFacts: [String] = [localized("import.card.facts.owner", locale: locale, owner.slug)]
            if let sourceCount = owner.sourceCount {
                ownerFacts.append(localized("import.card.facts.owner_sources", locale: locale, String(sourceCount)))
            }
            if let skillCount = owner.skillCount {
                ownerFacts.append(localized("import.card.facts.owner_skills", locale: locale, String(skillCount)))
            }
            facts.append(ownerFacts.joined(separator: " · "))
        }
        if let trust = item.snapshot?.trust, !trust.labels.isEmpty {
            facts.append(localized("import.card.facts.trust", locale: locale, trust.labels.joined(separator: " · ")))
        }
        if !item.matchedSkills.isEmpty {
            let matches = item.matchedSkills.map { skill in
                if let installs = skill.installs {
                    return "\(skill.title) \(formattedCount(installs))"
                }
                return skill.title
            }
            facts.append(localized("import.card.facts.matches", locale: locale, matches.joined(separator: ", ")))
        } else if !item.matchedSkillNames.isEmpty {
            facts.append(localized("import.card.facts.matches", locale: locale, item.matchedSkillNames.joined(separator: ", ")))
        }
        if facts.isEmpty {
            switch item.enrichPhase {
            case .loading:
                return [localized("import.card.facts.source_loading", locale: locale)]
            case .failed(let message):
                return [message.resolve(locale: locale)]
            case .idle, .ready:
                break
            }
        }
        return facts
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

import Foundation

struct ProjectionLeafSummary {
    let id: String
    let linkName: String
    let name: String
    let description: String
}

struct ProjectionSourceSummary {
    let sourceId: String
    let displayName: String
    let locator: String
    let leafs: [ProjectionLeafSummary]
}

struct ProjectionDraftState {
    let enabledTargets: [String]
    let selectedLeafIds: [String]
}

typealias ProjectionWarningMap = [String: [String]]
typealias ProjectionNameMap = [String: String]

func buildProjectionWarningMap(
    summaries: [ProjectionSourceSummary],
    drafts: [String: ProjectionDraftState],
    sourceId: String
) -> ProjectionWarningMap {
    let currentSummary = summaries.first(where: { $0.sourceId == sourceId })
    let currentDraft = drafts[sourceId] ?? ProjectionDraftState(enabledTargets: [], selectedLeafIds: [])

    guard let currentSummary = currentSummary, !currentDraft.enabledTargets.isEmpty else {
        return [:]
    }

    let currentEnabledTargets = Set(currentDraft.enabledTargets)
    let currentSelectedLeafIds = Set(currentDraft.selectedLeafIds)
    let otherSelectedLeafs = selectedLeafCandidates(
        summaries: summaries,
        drafts: drafts,
        excluding: sourceId,
        enabledTargets: currentEnabledTargets
    )

    let projectedNames = resolveProjectedSkillNames(
        selectedLeafCandidates(summaries: summaries, drafts: drafts, excluding: nil, enabledTargets: currentEnabledTargets)
    )

    var warningsByLeafId: ProjectionWarningMap = [:]
    for leaf in currentSummary.leafs where currentSelectedLeafIds.contains(leaf.id) {
        let exactKey = exactDuplicateKey(leaf: leaf)
        if let duplicate = otherSelectedLeafs.first(where: { exactDuplicateKey(leaf: $0.leaf) == exactKey }) {
            warningsByLeafId[leaf.id] = [
                "identical skill already selected in \(duplicate.source.displayName), this one will be skipped",
            ]
            continue
        }

        if let conflict = otherSelectedLeafs.first(where: { $0.leaf.linkName == leaf.linkName }) {
            let projectedName = projectedNames[leaf.id] ?? preferredProjectedName(
                sourceId: currentSummary.sourceId,
                groupName: currentSummary.displayName,
                groupAuthor: author(from: currentSummary.locator),
                skillName: leaf.linkName
            )
            warningsByLeafId[leaf.id] = [
                "conflicts with \(conflict.source.displayName), will deploy as \(projectedName)",
            ]
        }
    }

    return warningsByLeafId
}

func buildProjectionNameMap(
    summaries: [ProjectionSourceSummary],
    drafts: [String: ProjectionDraftState],
    sourceId: String
) -> ProjectionNameMap {
    let currentSummary = summaries.first(where: { $0.sourceId == sourceId })
    let currentDraft = drafts[sourceId] ?? ProjectionDraftState(enabledTargets: [], selectedLeafIds: [])

    guard currentSummary != nil, !currentDraft.enabledTargets.isEmpty else {
        return [:]
    }

    let currentEnabledTargets = Set(currentDraft.enabledTargets)
    let candidates = selectedLeafCandidates(
        summaries: summaries,
        drafts: drafts,
        excluding: nil,
        enabledTargets: currentEnabledTargets
    )
    return resolveProjectedSkillNames(candidates)
}

private struct ProjectionCandidate {
    let source: ProjectionSourceSummary
    let leaf: ProjectionLeafSummary
}

private func selectedLeafCandidates(
    summaries: [ProjectionSourceSummary],
    drafts: [String: ProjectionDraftState],
    excluding excludedSourceId: String?,
    enabledTargets: Set<String>
) -> [ProjectionCandidate] {
    summaries.flatMap { summary -> [ProjectionCandidate] in
        if summary.sourceId == excludedSourceId {
            return []
        }

        let draft = drafts[summary.sourceId] ?? ProjectionDraftState(enabledTargets: [], selectedLeafIds: [])
        let hasTargetOverlap = draft.enabledTargets.contains(where: { enabledTargets.contains($0) })
        guard hasTargetOverlap else {
            return []
        }

        return draft.selectedLeafIds.compactMap { leafId in
            guard let leaf = summary.leafs.first(where: { $0.id == leafId }) else {
                return nil
            }
            return ProjectionCandidate(source: summary, leaf: leaf)
        }
    }
}

private func resolveProjectedSkillNames(_ candidates: [ProjectionCandidate]) -> ProjectionNameMap {
    var reservedNames = Set<String>()
    var projectedNames: ProjectionNameMap = [:]

    for candidate in candidates {
        let currentAuthor = author(from: candidate.source.locator)
        let preferredNames = projectedNameCandidates(
            sourceId: candidate.source.sourceId,
            groupName: candidate.source.displayName,
            groupAuthor: currentAuthor,
            skillName: candidate.leaf.linkName
        )

        let chosenName = preferredNames.first { !reservedNames.contains($0) } ?? preferredNames.last!
        reservedNames.insert(chosenName)
        projectedNames[candidate.leaf.id] = chosenName
    }

    return projectedNames
}

private func projectedNameCandidates(
    sourceId: String,
    groupName: String,
    groupAuthor: String?,
    skillName: String
) -> [String] {
    var names = [skillName, "\(groupName)-\(skillName)"]
    if let groupAuthor, !groupAuthor.isEmpty {
        names.append("\(groupAuthor)-\(groupName)-\(skillName)")
    }
    names.append("\(sourceId)-\(skillName)")
    return uniquePreservingOrder(names)
}

private func preferredProjectedName(
    sourceId: String,
    groupName: String,
    groupAuthor: String?,
    skillName: String
) -> String {
    projectedNameCandidates(
        sourceId: sourceId,
        groupName: groupName,
        groupAuthor: groupAuthor,
        skillName: skillName
    ).first ?? skillName
}

private func exactDuplicateKey(leaf: ProjectionLeafSummary) -> String {
    "\(leaf.linkName)\n\(leaf.name)\n\(leaf.description)"
}

private func author(from locator: String) -> String? {
    let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        return nil
    }

    if let githubRange = trimmed.range(of: "github.com/", options: [.caseInsensitive]) {
        let suffix = trimmed[githubRange.upperBound...]
        return suffix.split(separator: "/").first.map(String.init)
    }

    if let githubRange = trimmed.range(of: "github.com:", options: [.caseInsensitive]) {
        let suffix = trimmed[githubRange.upperBound...]
        return suffix.split(separator: "/").first.map(String.init)
    }

    let components = trimmed.split(separator: "/")
    guard components.count >= 2 else {
        return nil
    }
    return String(components.first ?? "")
}

private func uniquePreservingOrder(_ values: [String]) -> [String] {
    var seen = Set<String>()
    var unique: [String] = []
    for value in values where !seen.contains(value) {
        seen.insert(value)
        unique.append(value)
    }
    return unique
}

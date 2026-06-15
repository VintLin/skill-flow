import Foundation

enum ImportSkillSelectionResolver {
    static func selectedSkillIds(
        for skills: [ImportViewModel.Skill],
        draft: ImportDraftState
    ) -> [String] {
        guard !draft.selectedSkills.isEmpty else {
            return []
        }

        let selectedIds = selectedSkillIdSet(for: skills, selectedSkills: draft.selectedSkills)
        return skills
            .filter { selectedIds.contains($0.id) }
            .map(\.id)
    }

    static func selectedSkills(
        from draft: ImportDraftState,
        for card: ImportViewModel.Card
    ) -> [ImportSkillSelection] {
        guard !draft.selectedSkills.isEmpty else {
            return []
        }

        let selectedIds = Set(selectedSkillIds(for: card.skills, draft: draft))
        let refreshedSelections = card.skills
            .filter { selectedIds.contains($0.id) }
            .map(\.selection)

        return refreshedSelections.isEmpty ? draft.selectedSkills : refreshedSelections
    }

    static func selectedSkills(
        from choices: [ImportSkillSelection],
        matching draft: ImportDraftState
    ) -> [ImportSkillSelection] {
        guard !choices.isEmpty, !draft.selectedSkills.isEmpty else {
            return []
        }

        let selectedKeys = Set(draft.selectedSkills.flatMap { selectionKeys(for: $0) })
        return choices.filter { choice in
            !selectedKeys.isDisjoint(with: selectionKeys(for: choice))
        }
    }

    private static func selectionKeys(for selection: ImportSkillSelection) -> Set<String> {
        switch selection.selector {
        case .repoPath(let path):
            return Set([selection.uiId, path])
        }
    }

    private static func selectedSkillIdSet(
        for skills: [ImportViewModel.Skill],
        selectedSkills: [ImportSkillSelection]
    ) -> Set<String> {
        let stableIndex = uniqueSkillIndex(for: skills) { skill in
            stableSkillKeys(for: skill)
        }
        let aliasIndex = uniqueSkillIndex(for: skills) { skill in
            Set(skill.selectorAliases)
        }
        var selectedIds = Set<String>()

        for selection in selectedSkills {
            let keys = selectionKeys(for: selection)
            let stableMatches = Set(keys.compactMap { stableIndex[$0] })
            if !stableMatches.isEmpty {
                selectedIds.formUnion(stableMatches)
                continue
            }
            selectedIds.formUnion(keys.compactMap { aliasIndex[$0] })
        }

        return selectedIds
    }

    private static func stableSkillKeys(for skill: ImportViewModel.Skill) -> Set<String> {
        Set([skill.id])
            .union(selectionKeys(for: skill.selection))
    }

    private static func uniqueSkillIndex(
        for skills: [ImportViewModel.Skill],
        keys: (ImportViewModel.Skill) -> Set<String>
    ) -> [String: String] {
        var idsByKey: [String: Set<String>] = [:]
        for skill in skills {
            for key in keys(skill) {
                idsByKey[key, default: []].insert(skill.id)
            }
        }

        return idsByKey.compactMapValues { ids in
            ids.count == 1 ? ids.first : nil
        }
    }
}

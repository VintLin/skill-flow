enum DetailRevision {
    static func make(
        sourceId: String,
        title: String,
        originalDisplayName: String,
        subtitle: String,
        author: String,
        originLabel: String,
        starCount: Int?,
        groupStats: GroupCardStats,
        sourceDetailLines: [String],
        sourceRepositoryURL: String?,
        locator: String,
        groupPath: String?,
        updatedAt: String,
        updatedRelative: String,
        health: String,
        warningCount: Int,
        errorCount: Int,
        enabledSkillCount: Int,
        totalSkillCount: Int,
        enabledTargetCount: Int,
        saveState: SaveState,
        skillSelection: SelectionState,
        targetSelection: SelectionState,
        enabledTargetLabels: [String],
        sourceFacts: [String],
        deploymentFacts: [String],
        fileTree: [FileTreeItem],
        groupDocuments: [DocumentDescriptor],
        targets: [DetailTarget],
        skills: [DetailSkill]
    ) -> String {
        let components: [String] = [
            sourceId,
            title,
            originalDisplayName,
            subtitle,
            author,
            originLabel,
            starCount.map(String.init) ?? "",
            signature(groupStats),
            sourceDetailLines.joined(separator: "\u{1f}"),
            sourceRepositoryURL ?? "",
            locator,
            groupPath ?? "",
            updatedAt,
            updatedRelative,
            health,
            String(warningCount),
            String(errorCount),
            String(enabledSkillCount),
            String(totalSkillCount),
            String(enabledTargetCount),
            signature(saveState),
            signature(skillSelection),
            signature(targetSelection),
            enabledTargetLabels.joined(separator: "\u{1f}"),
            sourceFacts.joined(separator: "\u{1f}"),
            deploymentFacts.joined(separator: "\u{1f}"),
            signature(fileTree),
            signature(groupDocuments),
            signature(targets),
            signature(skills),
        ]
        return components.joined(separator: "\u{1e}")
    }

    private static func signature(_ value: Any) -> String {
        String(describing: value)
    }

    private static func signature(_ skills: [DetailSkill]) -> String {
        var hasher = Hasher()
        hasher.combine(skills.count)

        for skill in skills {
            hasher.combine(skill.id)
            hasher.combine(skill.title)
            hasher.combine(skill.summary)
            hasher.combine(skill.version)
            hasher.combine(skill.author)
            hasher.combine(skill.originLabel)
            hasher.combine(skill.starCount)
            hasher.combine(skill.folderPath)
            hasher.combine(skill.relativeFolderPath)
            hasher.combine(skill.detailLines.count)
            skill.detailLines.forEach { hasher.combine($0) }
            hasher.combine(skill.documentContent)
            hasher.combine(skill.isEnabled)
            hasher.combine(skill.warningCount)
            combine(skill.documents, into: &hasher)
        }

        return String(hasher.finalize())
    }

    private static func combine(_ documents: [DocumentTab], into hasher: inout Hasher) {
        hasher.combine(documents.count)
        for document in documents {
            hasher.combine(document.id)
            hasher.combine(document.title)
            hasher.combine(document.path)
            hasher.combine(document.content)
            hasher.combine(document.renderCacheKey)
            hasher.combine(document.externalURL)
            hasher.combine(document.isLoaded)
            hasher.combine(document.metadata.count)
            for entry in document.metadata {
                hasher.combine(entry.id)
                hasher.combine(entry.key)
                hasher.combine(entry.value)
            }
        }
    }
}

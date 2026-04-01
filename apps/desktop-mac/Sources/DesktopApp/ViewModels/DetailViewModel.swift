import Foundation
import Observation

@MainActor
@Observable
final class DetailViewModel {
    typealias SaveState = MainViewModel.SaveState
    typealias FileTreeItem = MainViewModel.FileTreeItem
    typealias DocumentTab = MainViewModel.DocumentTab
    typealias DocumentDescriptor = MainViewModel.DocumentDescriptor
    typealias DetailTarget = MainViewModel.DetailTarget
    typealias DetailSkill = MainViewModel.DetailSkill

    struct Snapshot: Equatable {
        let sourceId: String
        let revision: String
        let title: String
        let subtitle: String
        let author: String
        let originLabel: String
        let starCount: Int?
        let groupStats: MainViewModel.GroupCardStats
        let sourceDetailLines: [String]
        let sourceRepositoryURL: String?
        let locator: String
        let groupPath: String?
        let updatedAt: String
        let updatedRelative: String
        let health: String
        let warningCount: Int
        let errorCount: Int
        let enabledSkillCount: Int
        let totalSkillCount: Int
        let enabledTargetCount: Int
        let saveState: SaveState
        let skillSelection: SelectionState
        let targetSelection: SelectionState
        let enabledTargetLabels: [String]
        let sourceFacts: [String]
        let deploymentFacts: [String]
        let fileTree: [FileTreeItem]
        let groupDocuments: [DocumentTab]
        let targets: [DetailTarget]
        let skills: [DetailSkill]
    }

    let sourceId: String
    let title: String
    let subtitle: String
    let author: String
    let originLabel: String
    let starCount: Int?
    let groupStats: MainViewModel.GroupCardStats
    let sourceDetailLines: [String]
    let sourceRepositoryURL: String?
    let locator: String
    let groupPath: String?
    let updatedAt: String
    let updatedRelative: String
    let health: String
    let warningCount: Int
    let errorCount: Int
    let enabledSkillCount: Int
    let totalSkillCount: Int
    let enabledTargetCount: Int
    let saveState: MainViewModel.SaveState
    let skillSelection: SelectionState
    let targetSelection: SelectionState
    let enabledTargetLabels: [String]
    let sourceFacts: [String]
    let deploymentFacts: [String]
    let fileTree: [MainViewModel.FileTreeItem]
    let groupDocuments: [MainViewModel.DocumentTab]
    let targets: [MainViewModel.DetailTarget]
    let skills: [MainViewModel.DetailSkill]

    init(snapshot: Snapshot) {
        sourceId = snapshot.sourceId
        title = snapshot.title
        subtitle = snapshot.subtitle
        author = snapshot.author
        originLabel = snapshot.originLabel
        starCount = snapshot.starCount
        groupStats = snapshot.groupStats
        sourceDetailLines = snapshot.sourceDetailLines
        sourceRepositoryURL = snapshot.sourceRepositoryURL
        locator = snapshot.locator
        groupPath = snapshot.groupPath
        updatedAt = snapshot.updatedAt
        updatedRelative = snapshot.updatedRelative
        health = snapshot.health
        warningCount = snapshot.warningCount
        errorCount = snapshot.errorCount
        enabledSkillCount = snapshot.enabledSkillCount
        totalSkillCount = snapshot.totalSkillCount
        enabledTargetCount = snapshot.enabledTargetCount
        saveState = snapshot.saveState
        skillSelection = snapshot.skillSelection
        targetSelection = snapshot.targetSelection
        enabledTargetLabels = snapshot.enabledTargetLabels
        sourceFacts = snapshot.sourceFacts
        deploymentFacts = snapshot.deploymentFacts
        fileTree = snapshot.fileTree
        groupDocuments = snapshot.groupDocuments
        targets = snapshot.targets
        skills = snapshot.skills
    }
}

extension DetailViewModel.Snapshot {
    init(
        sourceId: String,
        revision: String,
        title: String,
        subtitle: String,
        author: String,
        originLabel: String,
        starCount: Int?,
        groupStats: MainViewModel.GroupCardStats,
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
        saveState: MainViewModel.SaveState,
        skillSelection: SelectionState,
        targetSelection: SelectionState,
        enabledTargetLabels: [String],
        sourceFacts: [String],
        deploymentFacts: [String],
        fileTree: [MainViewModel.FileTreeItem],
        groupDocuments: [MainViewModel.DocumentDescriptor],
        targets: [MainViewModel.DetailTarget],
        skills: [MainViewModel.DetailSkill]
    ) {
        self.init(
            sourceId: sourceId,
            revision: revision,
            title: title,
            subtitle: subtitle,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
            groupStats: groupStats,
            sourceDetailLines: sourceDetailLines,
            sourceRepositoryURL: sourceRepositoryURL,
            locator: locator,
            groupPath: groupPath,
            updatedAt: updatedAt,
            updatedRelative: updatedRelative,
            health: health,
            warningCount: warningCount,
            errorCount: errorCount,
            enabledSkillCount: enabledSkillCount,
            totalSkillCount: totalSkillCount,
            enabledTargetCount: enabledTargetCount,
            saveState: saveState,
            skillSelection: skillSelection,
            targetSelection: targetSelection,
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: groupDocuments.map {
                MainViewModel.DocumentTab(
                    id: $0.id,
                    title: $0.title,
                    path: $0.path,
                    metadata: $0.metadata,
                    content: "",
                    renderCacheKey: $0.renderCacheKey,
                    externalURL: $0.externalURL
                )
            },
            targets: targets,
            skills: skills
        )
    }

    init(
        sourceId: String,
        title: String,
        subtitle: String,
        author: String,
        originLabel: String,
        starCount: Int?,
        groupStats: MainViewModel.GroupCardStats,
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
        saveState: MainViewModel.SaveState,
        skillSelection: SelectionState,
        targetSelection: SelectionState,
        enabledTargetLabels: [String],
        sourceFacts: [String],
        deploymentFacts: [String],
        fileTree: [MainViewModel.FileTreeItem],
        groupDocuments: [MainViewModel.DocumentTab],
        targets: [MainViewModel.DetailTarget],
        skills: [MainViewModel.DetailSkill]
    ) {
        self.init(
            sourceId: sourceId,
            revision: Self.buildRevision(
                sourceId: sourceId,
                title: title,
                subtitle: subtitle,
                author: author,
                originLabel: originLabel,
                starCount: starCount,
                groupStats: groupStats,
                sourceDetailLines: sourceDetailLines,
                sourceRepositoryURL: sourceRepositoryURL,
                locator: locator,
                groupPath: groupPath,
                updatedAt: updatedAt,
                updatedRelative: updatedRelative,
                health: health,
                warningCount: warningCount,
                errorCount: errorCount,
                enabledSkillCount: enabledSkillCount,
                totalSkillCount: totalSkillCount,
                enabledTargetCount: enabledTargetCount,
                saveState: saveState,
                skillSelection: skillSelection,
                targetSelection: targetSelection,
                enabledTargetLabels: enabledTargetLabels,
                sourceFacts: sourceFacts,
                deploymentFacts: deploymentFacts,
                fileTree: fileTree,
                groupDocuments: groupDocuments,
                targets: targets,
                skills: skills
            ),
            title: title,
            subtitle: subtitle,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
            groupStats: groupStats,
            sourceDetailLines: sourceDetailLines,
            sourceRepositoryURL: sourceRepositoryURL,
            locator: locator,
            groupPath: groupPath,
            updatedAt: updatedAt,
            updatedRelative: updatedRelative,
            health: health,
            warningCount: warningCount,
            errorCount: errorCount,
            enabledSkillCount: enabledSkillCount,
            totalSkillCount: totalSkillCount,
            enabledTargetCount: enabledTargetCount,
            saveState: saveState,
            skillSelection: skillSelection,
            targetSelection: targetSelection,
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            targets: targets,
            skills: skills
        )
    }

    init(detail: MainViewModel.DetailViewData) {
        sourceId = detail.sourceId
        revision = Self.buildRevision(detail: detail)
        title = detail.title
        subtitle = detail.subtitle
        author = detail.author
        originLabel = detail.originLabel
        starCount = detail.starCount
        groupStats = detail.groupStats
        sourceDetailLines = detail.sourceDetailLines
        sourceRepositoryURL = detail.sourceRepositoryURL
        locator = detail.locator
        groupPath = detail.groupPath
        updatedAt = detail.updatedAt
        updatedRelative = detail.updatedRelative
        health = detail.health
        warningCount = detail.warningCount
        errorCount = detail.errorCount
        enabledSkillCount = detail.enabledSkillCount
        totalSkillCount = detail.totalSkillCount
        enabledTargetCount = detail.enabledTargetCount
        saveState = detail.saveState
        skillSelection = detail.skillSelection
        targetSelection = detail.targetSelection
        enabledTargetLabels = detail.enabledTargetLabels
        sourceFacts = detail.sourceFacts
        deploymentFacts = detail.deploymentFacts
        fileTree = detail.fileTree
        groupDocuments = detail.groupDocuments
        targets = detail.targets
        skills = detail.skills
    }

    private static func buildRevision(detail: MainViewModel.DetailViewData) -> String {
        buildRevision(
            sourceId: detail.sourceId,
            title: detail.title,
            subtitle: detail.subtitle,
            author: detail.author,
            originLabel: detail.originLabel,
            starCount: detail.starCount,
            groupStats: detail.groupStats,
            sourceDetailLines: detail.sourceDetailLines,
            sourceRepositoryURL: detail.sourceRepositoryURL,
            locator: detail.locator,
            groupPath: detail.groupPath,
            updatedAt: detail.updatedAt,
            updatedRelative: detail.updatedRelative,
            health: detail.health,
            warningCount: detail.warningCount,
            errorCount: detail.errorCount,
            enabledSkillCount: detail.enabledSkillCount,
            totalSkillCount: detail.totalSkillCount,
            enabledTargetCount: detail.enabledTargetCount,
            saveState: detail.saveState,
            skillSelection: detail.skillSelection,
            targetSelection: detail.targetSelection,
            enabledTargetLabels: detail.enabledTargetLabels,
            sourceFacts: detail.sourceFacts,
            deploymentFacts: detail.deploymentFacts,
            fileTree: detail.fileTree,
            groupDocuments: detail.groupDocuments,
            targets: detail.targets,
            skills: detail.skills
        )
    }

    private static func buildRevision(
        sourceId: String,
        title: String,
        subtitle: String,
        author: String,
        originLabel: String,
        starCount: Int?,
        groupStats: MainViewModel.GroupCardStats,
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
        saveState: MainViewModel.SaveState,
        skillSelection: SelectionState,
        targetSelection: SelectionState,
        enabledTargetLabels: [String],
        sourceFacts: [String],
        deploymentFacts: [String],
        fileTree: [MainViewModel.FileTreeItem],
        groupDocuments: [MainViewModel.DocumentTab],
        targets: [MainViewModel.DetailTarget],
        skills: [MainViewModel.DetailSkill]
    ) -> String {
        let skillRevision = skills.map { skill in
            [
                skill.id,
                skill.title,
                skill.version ?? "",
                skill.author,
                skill.originLabel,
                skill.starCount.map(String.init) ?? "",
                skill.folderPath ?? "",
                skill.relativeFolderPath ?? "",
                skill.isEnabled ? "1" : "0",
                String(skill.warningCount),
                skill.documents.map(\.renderCacheKey).joined(separator: "\u{1E}")
            ]
            .joined(separator: "\u{1D}")
        }
        .joined(separator: "\u{1F}")
        let fileTreeRevision = fileTree.map(\.id).joined(separator: "\u{1F}")
        let groupDocumentRevision = groupDocuments.map(\.renderCacheKey).joined(separator: "\u{1F}")
        let targetRevision = targets.map { target in
            "\(target.id):\(target.isEnabled)"
        }
        .joined(separator: "\u{1F}")

        var components: [String] = []
        components.append(sourceId)
        components.append(title)
        components.append(subtitle)
        components.append(author)
        components.append(originLabel)
        components.append(starCount.map(String.init) ?? "")
        components.append(groupStats.skillCount.map(String.init) ?? "")
        components.append(groupStats.downloadCount.map(String.init) ?? "")
        components.append(groupStats.starCount.map(String.init) ?? "")
        components.append(groupStats.githubURL ?? "")
        components.append(groupStats.localPath ?? "")
        components.append(sourceDetailLines.joined(separator: "\u{1F}"))
        components.append(sourceRepositoryURL ?? "")
        components.append(locator)
        components.append(groupPath ?? "")
        components.append(updatedAt)
        components.append(updatedRelative)
        components.append(health)
        components.append(String(warningCount))
        components.append(String(errorCount))
        components.append(String(enabledSkillCount))
        components.append(String(totalSkillCount))
        components.append(String(enabledTargetCount))
        components.append(saveState.phase.rawValue)
        components.append(saveState.detail ?? "")
        components.append(skillSelection.rawValue)
        components.append(targetSelection.rawValue)
        components.append(enabledTargetLabels.joined(separator: "\u{1F}"))
        components.append(sourceFacts.joined(separator: "\u{1F}"))
        components.append(deploymentFacts.joined(separator: "\u{1F}"))
        components.append(fileTreeRevision)
        components.append(groupDocumentRevision)
        components.append(targetRevision)
        components.append(skillRevision)
        return components.joined(separator: "\u{1C}")
    }
}

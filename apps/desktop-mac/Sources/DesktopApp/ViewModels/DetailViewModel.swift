import Foundation
import Observation

@MainActor
@Observable
final class DetailViewModel {
    typealias DetailSkill = SkillFlowDesktop.DetailSkill
    typealias DocumentTab = SkillFlowDesktop.DocumentTab
    typealias DocumentDescriptor = SkillFlowDesktop.DocumentDescriptor
    typealias FileTreeItem = SkillFlowDesktop.FileTreeItem

    struct Snapshot: Equatable {
        let sourceId: String
        let revision: String
        let title: String
        let originalDisplayName: String
        let subtitle: String
        let author: String
        let originLabel: String
        let starCount: Int?
        let groupStats: GroupCardStats
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
        let groupDocuments: [DocumentDescriptor]
        let targets: [DetailTarget]
        let skills: [DetailSkill]

        init(
            sourceId: String,
            revision: String,
            title: String,
            originalDisplayName: String? = nil,
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
        ) {
            self.sourceId = sourceId
            self.revision = revision
            self.title = title
            self.originalDisplayName = originalDisplayName ?? title
            self.subtitle = subtitle
            self.author = author
            self.originLabel = originLabel
            self.starCount = starCount
            self.groupStats = groupStats
            self.sourceDetailLines = sourceDetailLines
            self.sourceRepositoryURL = sourceRepositoryURL
            self.locator = locator
            self.groupPath = groupPath
            self.updatedAt = updatedAt
            self.updatedRelative = updatedRelative
            self.health = health
            self.warningCount = warningCount
            self.errorCount = errorCount
            self.enabledSkillCount = enabledSkillCount
            self.totalSkillCount = totalSkillCount
            self.enabledTargetCount = enabledTargetCount
            self.saveState = saveState
            self.skillSelection = skillSelection
            self.targetSelection = targetSelection
            self.enabledTargetLabels = enabledTargetLabels
            self.sourceFacts = sourceFacts
            self.deploymentFacts = deploymentFacts
            self.fileTree = fileTree
            self.groupDocuments = groupDocuments
            self.targets = targets
            self.skills = skills
        }

        var hasCustomDisplayName: Bool {
            title.trimmingCharacters(in: .whitespacesAndNewlines)
                != originalDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    let sourceId: String
    let title: String
    let originalDisplayName: String
    let subtitle: String
    let author: String
    let originLabel: String
    let starCount: Int?
    let groupStats: GroupCardStats
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
    let groupDocuments: [DocumentDescriptor]
    let targets: [DetailTarget]
    let skills: [DetailSkill]

    var hasCustomDisplayName: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
            != originalDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    init(snapshot: Snapshot) {
        sourceId = snapshot.sourceId
        title = snapshot.title
        originalDisplayName = snapshot.originalDisplayName
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
        title: String,
        originalDisplayName: String? = nil,
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
    ) {
        let resolvedOriginalDisplayName = originalDisplayName ?? title
        self.init(
            sourceId: sourceId,
            revision: Self.buildRevision(
                sourceId: sourceId,
                title: title,
                originalDisplayName: resolvedOriginalDisplayName,
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
            originalDisplayName: resolvedOriginalDisplayName,
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

    init(detail: DetailViewData) {
        let visibleRevision = MainViewModel.detailRevision(
            sourceId: detail.sourceId,
            title: detail.title,
            originalDisplayName: detail.originalDisplayName,
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
            groupDocuments: detail.groupDocuments.map(\.descriptor),
            targets: detail.targets,
            skills: detail.skills
        )
        self.init(
            sourceId: detail.sourceId,
            revision: "\(detail.revision)|\(visibleRevision)",
            title: detail.title,
            originalDisplayName: detail.originalDisplayName,
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
            groupDocuments: detail.groupDocuments.map(\.descriptor),
            targets: detail.targets,
            skills: detail.skills
        )
    }

    private static func buildRevision(
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
        MainViewModel.detailRevision(
            sourceId: sourceId,
            title: title,
            originalDisplayName: originalDisplayName,
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
}

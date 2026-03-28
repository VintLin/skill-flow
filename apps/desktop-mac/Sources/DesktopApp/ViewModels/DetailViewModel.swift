import Foundation
import Observation

@MainActor
@Observable
final class DetailViewModel {
    let sourceId: String
    let title: String
    let subtitle: String
    let author: String
    let originLabel: String
    let starCount: Int?
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
    let fileTree: [MainViewModel.FileTreeLine]
    let groupDocuments: [MainViewModel.DocumentTab]
    let targets: [MainViewModel.DetailTarget]
    let skills: [MainViewModel.DetailSkill]

    init(detail: MainViewModel.DetailViewData) {
        sourceId = detail.sourceId
        title = detail.title
        subtitle = detail.subtitle
        author = detail.author
        originLabel = detail.originLabel
        starCount = detail.starCount
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
}

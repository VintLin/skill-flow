import Foundation
import Observation

@MainActor
@Observable
final class DetailViewModel {
    typealias SaveState = MainViewModel.SaveState
    typealias FileTreeItem = MainViewModel.FileTreeItem
    typealias DocumentTab = MainViewModel.DocumentTab
    typealias DetailTarget = MainViewModel.DetailTarget
    typealias DetailSkill = MainViewModel.DetailSkill

    struct Snapshot: Equatable {
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
    init(detail: MainViewModel.DetailViewData) {
        sourceId = detail.sourceId
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
}

import Foundation

enum Page: Equatable {
    case home
    case importPage
    case usage
    case settings
    case detail(sourceId: String)
}

enum LoadState: Equatable {
    case idle
    case loading
    case ready
    case failed(String)
}

enum Section: String, CaseIterable, Identifiable {
    case overview = "Overview"
    case sources = "Sources"
    case skills = "Skills"
    case targets = "Targets"
    case deployments = "Deployments"
    case doctor = "Doctor"
    case activity = "Activity"
    case settings = "Settings"

    var id: String { rawValue }
}

enum PageViewState {
    case loading
    case empty
    case error(String)
    case partial
    case success
}

enum SavePhase: String, Equatable {
    case idle
    case saving
    case saved
    case failed
}

struct SaveState: Equatable {
    var phase: SavePhase
    var detail: String?
}

enum ToastStyle {
    case loading
    case success
    case neutral
    case error
}

enum PresentationText: Equatable {
    case plain(String)
    case localized(String, [String] = [])

    func resolve(locale: Locale) -> String {
        switch self {
        case .plain(let value):
            return value
        case .localized(let key, let arguments):
            return L10n.string(key, locale: locale, arguments: arguments.map { $0 as CVarArg })
        }
    }

    static var presentationLocale: Locale {
        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
        return DesktopLanguage(storageValue: rawValue).locale
    }
}

enum HealthStatus: Equatable {
    case unknown
    case healthy
    case warnings
    case error

    var menuIconSystemName: String {
        switch self {
        case .healthy:
            return "checkmark.circle"
        case .warnings:
            return "exclamationmark.triangle"
        case .error:
            return "xmark.circle"
        case .unknown:
            return "circle"
        }
    }
}

struct ToastState: Identifiable, Equatable {
    let id: UUID
    let style: ToastStyle
    let text: PresentationText

    var message: String {
        text.resolve(locale: PresentationText.presentationLocale)
    }

    init(id: UUID = UUID(), style: ToastStyle, message: String) {
        self.id = id
        self.style = style
        self.text = .plain(message)
    }

    init(id: UUID = UUID(), style: ToastStyle, text: PresentationText) {
        self.id = id
        self.style = style
        self.text = text
    }
}

struct TargetOption: Identifiable {
    let id: String
    let label: String
}

struct HomeAgentFilterOption: Identifiable, Equatable {
    let id: String
    let label: String
    let enabledGroupCount: Int
}

struct HomeSidebarFilterOption: Identifiable, Equatable {
    let id: String
    let count: Int
}

enum CollectionValidationResult: Equatable {
    case valid
    case nameRequired
    case skillsRequired
    case groupsRequired
}

struct CollectionSkillOption: Identifiable, Equatable {
    let id: String
    let sourceId: String
    let sourceTitle: String
    let sourceSubtitle: String
    let leafId: String
    let title: String
    let isEnabled: Bool
}

struct CollectionSourceOption: Identifiable, Equatable {
    let id: String
    let title: String
    let sourceSubtitle: String
    let skillCount: Int
    let isCollection: Bool
}

struct CollectionEditorOptions: Equatable {
    let skillOptions: [CollectionSkillOption]
    let mergeSourceOptions: [CollectionSourceOption]
    let restoreSourceOptions: [CollectionSourceOption]
}

struct UsageSnapshotViewData: Equatable {
    let generatedAt: String
    let rangeLabel: String
    let kpis: UsageKpisViewData
    let topSkills: [UsageTopSkillViewData]
    let recentObservations: [UsageRecentObservationViewData]
    let agentCoverage: [UsageAgentCoverageViewData]
}

struct UsageKpisViewData: Equatable {
    let observedUses: Int
    let activeSkills: Int
    let activeAgents: Int
    let activeProjects: Int
    let lastObservedAt: String?
    let inferredSignals: Int
}

struct UsageTopSkillViewData: Identifiable, Equatable {
    let id: String
    let skillLabel: String
    let observedUses: Int
    let activeAgentCount: Int
    let activeProjectCount: Int
    let lastObservedAt: String?
}

struct UsageRecentObservationViewData: Identifiable, Equatable {
    let id: String
    let observedAt: String
    let agent: String
    let skillLabel: String
    let projectLabel: String
    let evidenceKind: String
    let confidence: String
}

struct UsageAgentCoverageViewData: Identifiable, Equatable {
    let id: String
    let agent: String
    let status: String
    let observedUses: Int
    let inferredSignals: Int
    let lastScannedAt: String?
}

struct SourceRow: Identifiable {
    let id: String
    let displayName: String
    let locator: String
    let kind: String
    let status: String
    let lastUpdate: String
    let warningCount: Int
    let errorCount: Int
}

struct GroupCardSkill: Identifiable {
    let id: String
    let label: String
    let description: String
    let isEnabled: Bool
    let sourceTitle: String?
    let highlightQuery: String?

    init(
        id: String,
        label: String,
        description: String,
        isEnabled: Bool,
        sourceTitle: String? = nil,
        highlightQuery: String? = nil
    ) {
        self.id = id
        self.label = label
        self.description = description
        self.isEnabled = isEnabled
        self.sourceTitle = sourceTitle
        self.highlightQuery = highlightQuery
    }
}

struct GroupCardTarget: Identifiable {
    let id: String
    let label: String
    let shortLabel: String
    let isEnabled: Bool
}

struct GroupCardStats: Equatable {
    let downloadCount: Int?
    let starCount: Int?
    let githubURL: String?
    let localPath: String?
}

struct GroupCardModel: Identifiable {
    let id: String
    let title: String
    let showsRecentlyUpdatedIndicator: Bool
    let originalDisplayName: String?
    let byline: String?
    let headerMetaLine: String?
    let groupPath: String?
    let sourceKind: String
    let sourceLocator: String
    let isPinned: Bool
    let health: String
    let warningCount: Int
    let errorCount: Int
    let skillSelection: SelectionState
    let targetSelection: SelectionState
    let stats: GroupCardStats
    let skillsLoading: Bool
    let targetsLoading: Bool
    let skills: [GroupCardSkill]
    let targets: [GroupCardTarget]
    let saveState: SaveState

    init(
        id: String,
        title: String,
        showsRecentlyUpdatedIndicator: Bool = false,
        originalDisplayName: String? = nil,
        byline: String?,
        headerMetaLine: String? = nil,
        groupPath: String?,
        sourceKind: String,
        sourceLocator: String,
        isPinned: Bool,
        health: String,
        warningCount: Int,
        errorCount: Int,
        skillSelection: SelectionState,
        targetSelection: SelectionState,
        stats: GroupCardStats,
        skillsLoading: Bool,
        targetsLoading: Bool,
        skills: [GroupCardSkill],
        targets: [GroupCardTarget],
        saveState: SaveState
    ) {
        self.id = id
        self.title = title
        self.showsRecentlyUpdatedIndicator = showsRecentlyUpdatedIndicator
        self.originalDisplayName = originalDisplayName
        self.byline = byline
        self.headerMetaLine = headerMetaLine
        self.groupPath = groupPath
        self.sourceKind = sourceKind
        self.sourceLocator = sourceLocator
        self.isPinned = isPinned
        self.health = health
        self.warningCount = warningCount
        self.errorCount = errorCount
        self.skillSelection = skillSelection
        self.targetSelection = targetSelection
        self.stats = stats
        self.skillsLoading = skillsLoading
        self.targetsLoading = targetsLoading
        self.skills = skills
        self.targets = targets
        self.saveState = saveState
    }

    var hasCustomDisplayName: Bool {
        Self.normalizedDisplayName(title) != Self.normalizedDisplayName(originalDisplayName ?? title)
    }

    private static func normalizedDisplayName(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct DetailSkill: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let summary: String
    let version: String?
    let author: String
    let originLabel: String
    let starCount: Int?
    let folderPath: String?
    let relativeFolderPath: String?
    let documents: [DocumentTab]
    let detailLines: [String]
    let documentContent: String
    let isEnabled: Bool
    let warningCount: Int
}

struct MetadataEntry: Identifiable, Equatable, Sendable {
    let id: String
    let key: String
    let value: String
}

struct DocumentDescriptor: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let path: String
    let metadata: [MetadataEntry]
    let renderCacheKey: String
    let externalURL: String?
}

struct DocumentTab: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let path: String
    let metadata: [MetadataEntry]
    let content: String
    let renderCacheKey: String
    let externalURL: String?
    let isLoaded: Bool

    init(
        id: String,
        title: String,
        path: String,
        metadata: [MetadataEntry],
        content: String,
        renderCacheKey: String,
        externalURL: String?,
        isLoaded: Bool = true
    ) {
        self.id = id
        self.title = title
        self.path = path
        self.metadata = metadata
        self.content = content
        self.renderCacheKey = renderCacheKey
        self.externalURL = externalURL
        self.isLoaded = isLoaded
    }
}

struct DetailTarget: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let shortLabel: String
    let isEnabled: Bool
}

struct FileTreeLine: Identifiable, Sendable {
    let id: String
    let depth: Int
    let prefix: String
    let title: String
    let isFile: Bool
}

struct FileTreeItem: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let path: String
    let isDirectory: Bool
    let isSkillRoot: Bool
    let isSkillDocument: Bool
    let skillId: String?
    let children: [FileTreeItem]
}

struct SnapshotTrust: Equatable, Sendable {
    let official: Bool
    let trending: Bool
    let hot: Bool
    let audited: Bool

    var labels: [String] {
        var values: [String] = []
        if official { values.append("Official") }
        if trending { values.append("Trending") }
        if hot { values.append("Hot") }
        if audited { values.append("Audited") }
        return values
    }
}

struct SnapshotOwner: Equatable, Sendable {
    let slug: String
    let sourceURL: String
    let githubURL: String?
    let sourceCount: Int?
    let skillCount: Int?
    let totalInstalls: Int?
}

struct SnapshotInstalledOn: Equatable, Sendable {
    let agent: String
    let installs: Int?
}

struct SnapshotAudits: Equatable, Sendable {
    let gen: String?
    let socket: String?
    let snyk: String?
    let riskLevel: String?
}

struct SnapshotSkill: Equatable, Sendable {
    let skillId: String
    let title: String
    let installs: Int?
    let weeklyInstalls: Int?
    let firstSeen: String?
    let summary: String
    let installedOn: [SnapshotInstalledOn]
    let audits: SnapshotAudits?
}

struct SourceSnapshotData: Equatable, Sendable {
    let canonicalRepo: String
    let title: String
    let provider: String
    let sourceURL: String
    let repoURL: String
    let repoLabel: String
    let totalInstalls: Int?
    let skillCount: Int?
    let repoStars: Int?
    let forkCount: Int?
    let description: String
    let topics: [String]
    let language: String?
    let defaultBranch: String?
    let pushedAt: String?
    let owner: SnapshotOwner
    let skills: [SnapshotSkill]
    let trust: SnapshotTrust?
}

struct ImportMatchedSkill: Equatable {
    let skillId: String
    let title: String
    let installs: Int?
}

struct DetailViewData {
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
    let groupDocuments: [DocumentTab]
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
        groupDocuments: [DocumentTab],
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

enum ImportLoadPhase: Equatable {
    case idle
    case loading
    case ready
    case failed(PresentationText)
}

enum ImportPageMode: String, Equatable {
    case recommended
    case localScan
}

struct ImportGroupSkill: Identifiable, Equatable {
    let id: String
    let title: String
    let summary: String
    let selectedByDefault: Bool
    let selection: ImportSkillSelection
    let selectorAliases: [String]

    init(
        id: String,
        title: String,
        summary: String,
        selectedByDefault: Bool,
        selection: ImportSkillSelection? = nil,
        selectorAliases: [String] = []
    ) {
        self.id = id
        self.title = title
        self.summary = summary
        self.selectedByDefault = selectedByDefault
        self.selection = selection ?? .repoPath(id)
        self.selectorAliases = selectorAliases
    }
}

struct ImportGroupTarget: Identifiable, Equatable {
    let id: String
    let selectedByDefault: Bool
}

struct LocalImportChoice: Identifiable, Equatable {
    let id: String
    let label: String
    let locator: String
    let selectedSkills: [ImportSkillSelection]
}

struct LocalImportDetectedSkill: Identifiable, Equatable {
    let id: String
    let title: String
    let localPath: String
    let discoveredTargets: [String]
    let validationStatus: String
    let originSkillId: String?
}

struct LocalImportInfo: Equatable {
    let validationStatus: String
    let selectedChoiceId: String?
    let choices: [LocalImportChoice]
    let detectedSkills: [LocalImportDetectedSkill]
}

struct ImportGroupItem: Identifiable, Equatable {
    let id: String
    let title: String
    let locator: String
    let canonicalRepo: String
    let preparationId: String?
    let preparationStatus: String?
    let preparedAt: String?
    let expiresAt: String?
    let isInstalledLocally: Bool
    let aliases: [String]
    let summary: String
    let starCount: Int?
    let totalInstalls: Int?
    let skillCount: Int?
    let matchedSkillNames: [String]
    let matchedSkills: [ImportMatchedSkill]
    let provider: String
    let localImport: LocalImportInfo?
    let snapshot: SourceSnapshotData?
    let enrichPhase: ImportLoadPhase
    let previewPhase: ImportLoadPhase
    let skills: [ImportGroupSkill]
    let targets: [ImportGroupTarget]

    init(
        id: String,
        title: String,
        locator: String,
        canonicalRepo: String,
        preparationId: String? = nil,
        preparationStatus: String? = nil,
        preparedAt: String? = nil,
        expiresAt: String? = nil,
        isInstalledLocally: Bool,
        aliases: [String],
        summary: String,
        starCount: Int?,
        totalInstalls: Int?,
        skillCount: Int?,
        matchedSkillNames: [String],
        matchedSkills: [ImportMatchedSkill],
        provider: String,
        localImport: LocalImportInfo?,
        snapshot: SourceSnapshotData?,
        enrichPhase: ImportLoadPhase,
        previewPhase: ImportLoadPhase,
        skills: [ImportGroupSkill],
        targets: [ImportGroupTarget]
    ) {
        self.id = id
        self.title = title
        self.locator = locator
        self.canonicalRepo = canonicalRepo
        self.preparationId = preparationId
        self.preparationStatus = preparationStatus
        self.preparedAt = preparedAt
        self.expiresAt = expiresAt
        self.isInstalledLocally = isInstalledLocally
        self.aliases = aliases
        self.summary = summary
        self.starCount = starCount
        self.totalInstalls = totalInstalls
        self.skillCount = skillCount
        self.matchedSkillNames = matchedSkillNames
        self.matchedSkills = matchedSkills
        self.provider = provider
        self.localImport = localImport
        self.snapshot = snapshot
        self.enrichPhase = enrichPhase
        self.previewPhase = previewPhase
        self.skills = skills
        self.targets = targets
    }
}

struct DeploymentRow: Identifiable {
    let id: String
    let kind: String
    let skill: String
    let target: String
    let path: String
    let result: String
}

struct DeploymentSummary {
    let create: Int
    let update: Int
    let remove: Int
    let blocked: Int
    let noop: Int

    static let empty = DeploymentSummary(create: 0, update: 0, remove: 0, blocked: 0, noop: 0)
}

struct DoctorIssueRow: Identifiable {
    let id: String
    let severity: String
    let code: String
    let message: String
    let sourceId: String
    let target: String
}

struct PendingDetailRename: Equatable {
    let sourceId: String
    let title: String
    let originalDisplayName: String
}

import Foundation

func usageColorIndex(for value: String) -> Int {
    var hash: UInt64 = 2_166_136_261
    for scalar in value.unicodeScalars {
        hash ^= UInt64(scalar.value)
        hash &*= 16_777_619
    }
    return Int(hash & UInt64(Int.max))
}

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

enum UsageRangePresetViewData: String, CaseIterable, Identifiable {
    case today
    case twentyFourHours = "24h"
    case sevenDays = "7d"
    case thirtyDays = "30d"
    case ninetyDays = "90d"
    case custom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "今天"
        case .twentyFourHours: return "24H"
        case .sevenDays: return "7D"
        case .thirtyDays: return "30D"
        case .ninetyDays: return "90D"
        case .custom: return "自定义"
        }
    }
}

enum UsageChartSelectionViewData: Equatable {
    case all
    case skill(String)
    case agent(String)
}

struct UsageSnapshotViewData: Equatable {
    let generatedAt: String
    let rangeLabel: String
    let rangePreset: UsageRangePresetViewData
    let kpis: UsageKpisViewData
    let topSkills: [UsageTopSkillViewData]
    let topAgents: [UsageTopAgentViewData]
    let timeBuckets: [UsageTimeBucketViewData]
    let hourlyActivity: [UsageHourlyActivityViewData]
    let skillAgentMatrix: [UsageSkillAgentMatrixViewData]
    let recentObservations: [UsageRecentObservationViewData]
    let agentCoverage: [UsageAgentCoverageViewData]
    let chartSkillsTruncated: Bool
    let matrixTruncated: Bool

    func chartData(for selection: UsageChartSelectionViewData) -> UsageChartViewData {
        let labels = timeBuckets.map(\.label)
        let candidateRows: [(id: String, label: String, count: Int)]
        switch selection {
        case .all:
            candidateRows = allChartSkillRows()
        case .skill(let skillKey):
            candidateRows = agentRows(for: skillKey).map { (id: $0.id, label: $0.agent, count: $0.observedUses) }
        case .agent(let agent):
            candidateRows = skillRows(for: agent).map { (id: $0.id, label: $0.skillLabel, count: $0.observedUses) }
        }
        let rows = Array(candidateRows.prefix(20))

        let series = rows.enumerated().map { index, row in
            let values = timeBuckets.map { bucket -> Int in
                switch selection {
                case .all:
                    return bucket.bySkill.first(where: { $0.id == row.id })?.observedUses ?? 0
                case .skill(let skillKey):
                    return bucket.bySkillAgent.first(where: { $0.skillKey == skillKey && $0.agent == row.id })?.observedUses ?? 0
                case .agent(let agent):
                    return bucket.bySkillAgent.first(where: { $0.skillKey == row.id && $0.agent == agent })?.observedUses ?? 0
                }
            }
            return UsageChartSeriesViewData(
                id: row.id,
                label: row.label,
                values: values,
                colorIndex: usageColorIndex(for: row.id)
            )
        }
        let totals = timeBuckets.indices.map { index in
            series.reduce(0) { total, item in
                total + (index < item.values.count ? item.values[index] : 0)
            }
        }
        return UsageChartViewData(labels: labels, series: series, totals: totals)
    }

    private func allChartSkillRows() -> [(id: String, label: String, count: Int)] {
        var counts: [String: (label: String, count: Int)] = [:]
        for bucket in timeBuckets {
            for item in bucket.bySkill {
                let current = counts[item.id]
                counts[item.id] = (label: current?.label ?? item.skillLabel, count: (current?.count ?? 0) + item.observedUses)
            }
        }
        let ranked = counts.map { (id: $0.key, label: $0.value.label, count: $0.value.count) }
            .sorted { $0.count > $1.count || ($0.count == $1.count && $0.label < $1.label) }
        let topIds = Set(topSkills.map(\.id))
        let topRows = topSkills.compactMap { skill in
            counts[skill.id].map { (id: skill.id, label: skill.skillLabel, count: $0.count) }
        }
        return topRows + ranked.filter { !topIds.contains($0.id) }
    }

    func skillRows(for agent: String? = nil) -> [UsageTopSkillViewData] {
        guard let agent else { return topSkills }
        let grouped = Dictionary(grouping: skillAgentMatrix.filter { $0.agent == agent }, by: \.skillKey)
        return grouped.map { key, entries in
            let source = topSkills.first(where: { $0.id == key })
            return UsageTopSkillViewData(
                id: key,
                skillLabel: source?.skillLabel ?? entries.first?.skillLabel ?? "Unmatched skill",
                observedUses: entries.reduce(0) { $0 + $1.observedUses },
                activeAgentCount: 1,
                activeProjectCount: source?.activeProjectCount ?? 0,
                lastObservedAt: source?.lastObservedAt,
                inventoryStatus: source?.inventoryStatus ?? "unknown"
            )
        }.sorted { $0.observedUses > $1.observedUses || ($0.observedUses == $1.observedUses && $0.skillLabel < $1.skillLabel) }
    }

    func agentRows(for skillKey: String? = nil) -> [UsageTopAgentViewData] {
        guard let skillKey else { return topAgents }
        let grouped = Dictionary(grouping: skillAgentMatrix.filter { $0.skillKey == skillKey }, by: \.agent)
        return grouped.map { agent, entries in
            let source = topAgents.first(where: { $0.id == agent })
            return UsageTopAgentViewData(
                id: agent,
                agent: agent,
                observedUses: entries.reduce(0) { $0 + $1.observedUses },
                activeSkills: 1,
                activeProjects: source?.activeProjects ?? 0,
                lastObservedAt: source?.lastObservedAt
            )
        }.sorted { $0.observedUses > $1.observedUses || ($0.observedUses == $1.observedUses && $0.agent < $1.agent) }
    }
}

struct UsageKpisViewData: Equatable {
    let observedUses: Int
    let activeSkills: Int
    let activeAgents: Int
    let activeProjects: Int
    let lastObservedAt: String?
    let inferredSignals: Int
    let totalSkills: Int
    let usedSkills: Int
    let skillRuns: Int
    let chatRecords: Int
}

struct UsageTopSkillViewData: Identifiable, Equatable {
    let id: String
    let skillLabel: String
    let observedUses: Int
    let activeAgentCount: Int
    let activeProjectCount: Int
    let lastObservedAt: String?
    let inventoryStatus: String
}

struct UsageTopAgentViewData: Identifiable, Equatable {
    let id: String
    let agent: String
    let observedUses: Int
    let activeSkills: Int
    let activeProjects: Int
    let lastObservedAt: String?
}

struct UsageSkillSeriesViewData: Identifiable, Equatable {
    let id: String
    let skillLabel: String
    let observedUses: Int
}

struct UsageAgentSeriesViewData: Identifiable, Equatable {
    let id: String
    let agent: String
    let observedUses: Int
}

struct UsageSkillAgentSeriesViewData: Equatable {
    let skillKey: String
    let agent: String
    let observedUses: Int
}

struct UsageTimeBucketViewData: Identifiable, Equatable {
    let id: String
    let label: String
    let startAt: String
    let endAt: String
    let observedUses: Int
    let bySkill: [UsageSkillSeriesViewData]
    let byAgent: [UsageAgentSeriesViewData]
    let bySkillAgent: [UsageSkillAgentSeriesViewData]
}

struct UsageHourlyActivityViewData: Equatable {
    let weekday: Int
    let hour: Int
    let observedUses: Int
}

struct UsageSkillAgentMatrixViewData: Equatable {
    let skillKey: String
    let skillRef: String?
    let skillLabel: String
    let agent: String
    let observedUses: Int
}

struct UsageChartSeriesViewData: Identifiable, Equatable {
    let id: String
    let label: String
    let values: [Int]
    let colorIndex: Int
}

struct UsageChartViewData: Equatable {
    let labels: [String]
    let series: [UsageChartSeriesViewData]
    let totals: [Int]
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
    let sourceKind: String?
    let parserRevision: String?
    let observedUses: Int
    let inferredSignals: Int
    let lastScannedAt: String?
    let coverageFrom: String?
    let coverageTo: String?
    let diagnosticsCount: Int
    let sourcesFound: Int?
    let sourceFilesScanned: Int?
    let sourceBytesScanned: Int?
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

    var placeholderTab: DocumentTab {
        DocumentTab(
            id: id,
            title: title,
            path: path,
            metadata: metadata,
            content: "",
            renderCacheKey: renderCacheKey,
            externalURL: externalURL,
            isLoaded: false
        )
    }
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

    var descriptor: DocumentDescriptor {
        DocumentDescriptor(
            id: id,
            title: title,
            path: path,
            metadata: metadata,
            renderCacheKey: renderCacheKey,
            externalURL: externalURL
        )
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

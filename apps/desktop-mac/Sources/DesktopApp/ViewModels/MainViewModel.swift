import Foundation
import Observation
import CryptoKit
import Yams

@MainActor
@Observable
final class MainViewModel {
    private struct ScopedSourceKey: Hashable {
        let scope: ProjectScopeSelection
        let sourceId: String
    }

    enum Page: Equatable {
        case home
        case importPage
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
            text.resolve(locale: MainViewModel.presentationLocale)
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

    enum VirtualGroupValidationResult: Equatable {
        case valid
        case nameRequired
        case skillsRequired
        case groupsRequired
    }

    struct VirtualGroupSkillOption: Identifiable, Equatable {
        let id: String
        let sourceId: String
        let sourceTitle: String
        let sourceSubtitle: String
        let leafId: String
        let title: String
        let isEnabled: Bool
    }

    struct VirtualGroupSourceOption: Identifiable, Equatable {
        let id: String
        let title: String
        let sourceSubtitle: String
        let skillCount: Int
        let isVirtual: Bool
    }

    struct VirtualGroupEditorOptions: Equatable {
        let skillOptions: [VirtualGroupSkillOption]
        let mergeSourceOptions: [VirtualGroupSourceOption]
        let restoreSourceOptions: [VirtualGroupSourceOption]
    }

    struct SourceRow: Identifiable {
        let id: String
        let displayName: String
        let locator: String
        let kind: String
        let skillCount: Int
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
        let skillCount: Int?
        let downloadCount: Int?
        let starCount: Int?
        let githubURL: String?
        let localPath: String?
    }

    struct GroupCardModel: Identifiable {
        let id: String
        let title: String
        let originalDisplayName: String?
        let byline: String?
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
            originalDisplayName: String? = nil,
            byline: String?,
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
            self.originalDisplayName = originalDisplayName
            self.byline = byline
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

    private struct SourceMetadataPresentation {
        let lines: [String]
        let starCount: Int?
        let repositoryURL: String?
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

    struct ImportGroupSkill: Identifiable, Equatable {
        let id: String
        let title: String
        let summary: String
        let selectedByDefault: Bool
    }

    struct ImportGroupTarget: Identifiable, Equatable {
        let id: String
        let selectedByDefault: Bool
    }

    struct LocalImportChoice: Identifiable, Equatable {
        let id: String
        let label: String
        let locator: String
        let selectedSkillIds: [String]
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

    private struct LeafSummary: Sendable {
        let id: String
        let sourceId: String?
        let linkName: String
        let name: String
        let description: String
        let sourceTitle: String?
        let metadataWarnings: [String]
    }

    private struct DraftState: Equatable {
        var selectedLeafIds: [String]
        var enabledTargets: [String]
    }

    private struct WorkflowSummary: Sendable {
        let sourceId: String
        let sourceKind: String
        let sourceDisplayName: String
        let sourceOriginalDisplayName: String
        let sourceLocator: String
        let sourceCanonicalRepo: String?
        let leafs: [LeafSummary]
        let selectedLeafIds: [String]
        let enabledTargets: [String]
        let targetLeafIdsByTarget: [String: [String]]
        let health: String
        let warningCount: Int
        let errorCount: Int
        let updatedAt: String

        func renamed(displayName: String, originalDisplayName: String) -> WorkflowSummary {
            WorkflowSummary(
                sourceId: sourceId,
                sourceKind: sourceKind,
                sourceDisplayName: displayName,
                sourceOriginalDisplayName: originalDisplayName,
                sourceLocator: sourceLocator,
                sourceCanonicalRepo: sourceCanonicalRepo,
                leafs: leafs,
                selectedLeafIds: selectedLeafIds,
                enabledTargets: enabledTargets,
                targetLeafIdsByTarget: targetLeafIdsByTarget,
                health: health,
                warningCount: warningCount,
                errorCount: errorCount,
                updatedAt: updatedAt
            )
        }
    }

    private struct FileTreeNode: Sendable {
        var name: String
        var isFile: Bool
        var children: [String: FileTreeNode]

        init(name: String, isFile: Bool = false, children: [String: FileTreeNode] = [:]) {
            self.name = name
            self.isFile = isFile
            self.children = children
        }
    }

    private struct FileTreeSkillReference: Sendable {
        let skillId: String
        let folderPath: String
        let displayTitle: String
    }

    private struct ParsedDocument: Sendable {
        let frontMatter: SkillFrontMatter?
        let metadata: [MetadataEntry]
        let body: String
    }

    private struct SkillFrontMatter: Decodable, Sendable {
        let name: String?
        let description: String?
        let version: String?
        let enabled: Bool?
    }

    private struct GitHubRepoContext: Sendable {
        let owner: String
        let repo: String
        let revision: String
    }

    private struct PreparedDetailSkillContent: Sendable {
        let title: String
        let version: String?
        let folderPath: String?
        let relativeFolderPath: String?
        let documents: [DocumentTab]
        let documentContent: String
    }

    private struct PreparedDetailContent: Sendable {
        let groupPath: String?
        let fileTree: [FileTreeItem]
        let groupDocuments: [DocumentDescriptor]
        let skillsByLeafId: [String: PreparedDetailSkillContent]
    }

    private struct PreparedDetailLeafInput: Sendable {
        let id: String
        let linkName: String
        let name: String
        let description: String
        let warningCount: Int
        let skillFilePath: String?
        let relativePath: String?
        let absolutePath: String?
        let title: String?
    }

    private struct PreparedDetailWarmupInput: Sendable {
        let summary: WorkflowSummary
        let sourceLocator: String
        let sourceSnapshot: SourceSnapshotData?
        let groupPath: String?
        let gitHubRepoContext: GitHubRepoContext?
        let projectedNamesByLeafId: [String: String]
        let leaves: [PreparedDetailLeafInput]
    }

    private let bridgeClient: BridgeClient
    private let queryFacade: any DesktopQuerying
    private let commandFacade: any DesktopCommanding
    private let mutationCoordinator: DesktopMutationCoordinator
    private let settingsStore: DesktopSettingsStore
    private let detailDocumentStore = DetailDocumentStore()

    nonisolated private static var presentationLocale: Locale {
        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
        return DesktopLanguage(storageValue: rawValue).locale
    }

    @MainActor static var currentDateProvider: () -> Date = Date.init

    private static var targetOrder: [String] { AgentDisplayCatalog.defaultTargetOrder }
    private static var minimumSaveLoadingDuration: Duration { .milliseconds(200) }

    private let legacyPinnedSourceIdsKey = "desktop.pinnedSourceIds"
    private let pinnedSourceIdsMigrationKey = "desktop.pinnedSourceIds.migratedToSharedPreferences"
    private let recommendationsProvider: () -> [ImportRecommendationEntry]
    private var workingDrafts: [ScopedSourceKey: DraftState] = [:]
    private var detectedTargets: Set<String> = []
    private var inspectedPayloadBySourceId: [ScopedSourceKey: [String: Any]] = [:]
    private var detailEnrichmentPayloadBySourceId: [String: [String: Any]] = [:]
    private var renamedSourceDisplayNameOverridesBySourceId: [String: String] = [:]
    private var renamedSourceOriginalDisplayNameOverridesBySourceId: [String: String] = [:]
    private var preparedDetailContentBySourceId: [String: PreparedDetailContent] = [:]
    @ObservationIgnored private var listRequestTask: Task<BridgeResponse, Error>?
    private var listRequestToken: UInt64 = 0
    private var activeListRequestToken: UInt64?
    @ObservationIgnored private var doctorRequestTask: Task<BridgeResponse, Error>?
    private var doctorRequestToken: UInt64 = 0
    private var activeDoctorRequestToken: UInt64?
    @ObservationIgnored private var inspectRequestTasksBySourceId: [ScopedSourceKey: Task<BridgeResponse, Error>] = [:]
    private var inspectRequestTokensBySourceId: [ScopedSourceKey: UInt64] = [:]
    private var inspectRequestTokenSeed: UInt64 = 0
    @ObservationIgnored private var detailEnrichmentTasksBySourceId: [String: Task<Void, Never>] = [:]
    private var detailEnrichmentTokensBySourceId: [String: UInt64] = [:]
    private var detailEnrichmentTokenSeed: UInt64 = 0
    @ObservationIgnored private var detailWarmupTasksBySourceId: [String: Task<Void, Never>] = [:]
    private var detailWarmupTokensBySourceId: [String: UInt64] = [:]
    private var detailWarmupTokenSeed: UInt64 = 0
    @ObservationIgnored private var importSearchTasksByQuery: [String: Task<BridgeResponse, Error>] = [:]
    private var importSearchTokensByQuery: [String: UInt64] = [:]
    private var importSearchTokenSeed: UInt64 = 0
    @ObservationIgnored private var importPreviewTasksByGroupId: [String: Task<BridgeResponse, Error>] = [:]
    private var importPreviewTokensByGroupId: [String: UInt64] = [:]
    private var importPreviewTokenSeed: UInt64 = 0
    @ObservationIgnored private var saveStateResetTasksBySourceId: [ScopedSourceKey: Task<Void, Never>] = [:]

    private var allSummaries: [WorkflowSummary] = []


    struct PendingDetailRename: Equatable {
        let sourceId: String
        let title: String
        let originalDisplayName: String
    }

    var loadState: LoadState = .idle
    var selectedSection: Section = .overview

    var sourceIds: [String] = []
    var selectedSourceId: String?
    var searchQuery: String = ""
    var importSubmittedQuery: String = ""
    var importSearchPhase: ImportLoadPhase = .idle
    var recommendedImportGroups: [ImportGroupItem] = []
    var localImportGroups: [ImportGroupItem] = []
    var localImportScanPhase: ImportLoadPhase = .idle
    var searchImportGroups: [ImportGroupItem] = []
    var importingImportGroupId: String?
    @ObservationIgnored private weak var routeState: DesktopAppState?

    var healthStatus: HealthStatus = .unknown
    var latestWarnings: [BridgeIssue] = []

    var inspectorVisible: Bool = true
    var compactSidebarVisible: Bool = true
    var showAllTargets: Bool = false

    var isRefreshing: Bool = false
    var updatingSourceIds: Set<String> = []
    private var saveStateBySourceId: [ScopedSourceKey: SaveState] = [:]
    var toast: ToastState?
    var pendingDetailRename: PendingDetailRename?

    var doctorIssues: [DoctorIssueRow] = []
    var lastDoctorError: String?

    var deploymentFilterTarget: String = "All"
    var deploymentFilterKind: String = "All"
    var pinnedSourceIds: [String]
    private var projectScopeChangeToken: UInt64 = 0
    private var cachedSelectedProjectScope: ProjectScopeSelection = .global
    private var cachedRecentProjectScopes: [RecentProjectScopeItem] = []
    @ObservationIgnored var detailWarmupDelay: Duration = .milliseconds(40)

    init(
        bridgeClient: BridgeClient,
        queryFacade: (any DesktopQuerying)? = nil,
        commandFacade: (any DesktopCommanding)? = nil,
        mutationCoordinator: DesktopMutationCoordinator? = nil,
        settingsStore: DesktopSettingsStore = DesktopSettingsStore(),
        recommendationsProvider: @escaping () -> [ImportRecommendationEntry] = { ImportRecommendationLoader.load() }
    ) {
        let resolvedQueryFacade = queryFacade ?? DesktopBridgeQueryFacade(bridgeClient: bridgeClient)
        let resolvedCommandFacade = commandFacade ?? DesktopBridgeCommandFacade(bridgeClient: bridgeClient)
        let resolvedMutationCoordinator = mutationCoordinator ?? DesktopMutationCoordinator(commandFacade: resolvedCommandFacade)

        self.bridgeClient = bridgeClient
        self.queryFacade = resolvedQueryFacade
        self.commandFacade = resolvedCommandFacade
        self.mutationCoordinator = resolvedMutationCoordinator
        self.settingsStore = settingsStore
        self.recommendationsProvider = recommendationsProvider
        self.pinnedSourceIds = []
    }

    static func isSupportedImportLocator(_ value: String) -> Bool {
        let candidate = normalizedImportLocator(value)
        guard !candidate.isEmpty else {
            return false
        }

        let lowercasedCandidate = candidate.lowercased()
        if lowercasedCandidate.hasPrefix("file://"), candidate.count > "file://".count {
            return true
        }

        if lowercasedCandidate.hasPrefix("clawhub:"), candidate.count > "clawhub:".count {
            return true
        }

        if candidate.hasPrefix("/") || candidate.hasPrefix("~/") {
            return true
        }

        if isSupportedGitHTTPSLocator(candidate) {
            return true
        }

        if matches(candidate, pattern: #"^git@(github|gitlab)\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$"#) {
            return true
        }

        if matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$"#) {
            return true
        }

        if matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?@[A-Za-z0-9_.-]+$"#) {
            return true
        }

        return matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?(?:/[A-Za-z0-9_.-]+)+$"#)
    }

    static func normalizedImportLocator(_ value: String) -> String {
        var candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard candidate.count >= 2 else {
            return candidate
        }

        let first = candidate.first
        let last = candidate.last
        if (first == "\"" && last == "\"") || (first == "'" && last == "'") {
            candidate.removeFirst()
            candidate.removeLast()
            candidate = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return candidate
    }

    func bindRouteState(_ state: DesktopAppState) {
        routeState = state
        cachedSelectedProjectScope = state.settings.selectedProjectScope
        cachedRecentProjectScopes = Array(state.settings.recentProjectScopes.prefix(10))
        projectScopeChangeToken &+= 1
    }

    var availableGroups: [String] {
        sourceIds
    }

    var selectedProjectScope: ProjectScopeSelection {
        _ = projectScopeChangeToken
        return routeState?.settings.selectedProjectScope ?? cachedSelectedProjectScope
    }

    var recentProjectScopes: [RecentProjectScopeItem] {
        _ = projectScopeChangeToken
        return Array((routeState?.settings.recentProjectScopes ?? cachedRecentProjectScopes).prefix(10))
    }

    var selectedGroupId: String? {
        selectedSourceId
    }

    var selectedHomeAgentFilterId: String? {
        get {
            routeState?.view.selectedHomeAgentFilterId
        }
        set {
            routeState?.view.selectedHomeAgentFilterId = newValue
        }
    }

    var selectedHomeStatusFilterId: String {
        get { routeState?.view.selectedHomeStatusFilterId ?? "all" }
        set { routeState?.view.selectedHomeStatusFilterId = newValue }
    }

    var selectedHomeSourceTypeFilterId: String {
        get { routeState?.view.selectedHomeSourceTypeFilterId ?? "all" }
        set { routeState?.view.selectedHomeSourceTypeFilterId = newValue }
    }

    var isUpdatingCurrentGroup: Bool {
        guard let selectedSourceId else {
            return false
        }
        return updatingSourceIds.contains(selectedSourceId)
    }

    var currentRoute: DesktopRoute {
        routeState?.view.currentRoute ?? .home
    }

    private var selectedDetailInspectSourceId: String? {
        currentDetailSourceId
    }

    private var currentDetailSourceId: String? {
        guard case .detail(let sourceId) = currentRoute else {
            return nil
        }
        return sourceId
    }

    var selectedGroupSourceIds: [String] {
        guard let selectedSourceId, let summary = allSummaries.first(where: { $0.sourceId == selectedSourceId }) else {
            return []
        }
        if summary.sourceKind == "clawhub" {
            return allSummaries
                .filter { $0.sourceKind == "clawhub" }
                .map(\.sourceId)
        }
        return [selectedSourceId]
    }

    var visibleTargets: [TargetOption] {
        let targetIds = visibleTargetIds()

        return targetIds.map { target in
            TargetOption(id: target, label: AgentDisplayCatalog.label(for: target, customAgents: routeState?.settings.customAgents ?? []))
        }
    }

    var homeAgentFilterOptions: [HomeAgentFilterOption] {
        let cards = groupCards
        let enabledGroupCountsByTargetId = Dictionary(
            grouping: cards.flatMap { card in
                card.targets.filter(\.isEnabled).map { target in
                    (target.id, card.id)
                }
            },
            by: { $0.0 }
        ).mapValues { entries in
            Set(entries.map(\.1)).count
        }

        return visibleTargetIds().map { targetId in
            HomeAgentFilterOption(
                id: targetId,
                label: AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                enabledGroupCount: enabledGroupCountsByTargetId[targetId] ?? 0
            )
        }
    }

    var homeStatusFilterOptions: [HomeSidebarFilterOption] {
        let cards = groupCards
        return [
            HomeSidebarFilterOption(id: "all", count: cards.count),
            HomeSidebarFilterOption(id: "pinned", count: cards.filter(\.isPinned).count),
        ]
    }

    var homeSourceTypeFilterOptions: [HomeSidebarFilterOption] {
        let cards = groupCards
        return [
            HomeSidebarFilterOption(id: "all", count: cards.count),
            HomeSidebarFilterOption(id: "local", count: cards.filter(Self.isLocalHomeSource).count),
            HomeSidebarFilterOption(id: "remote", count: cards.filter(Self.isRemoteHomeSource).count),
            HomeSidebarFilterOption(id: "virtual", count: cards.filter(Self.isVirtualHomeSource).count),
        ]
    }

    var effectiveSelectedHomeAgentFilterId: String? {
        guard let selectedHomeAgentFilterId else {
            return nil
        }
        let optionIds = Set(homeAgentFilterOptions.map(\.id))
        return optionIds.contains(selectedHomeAgentFilterId) ? selectedHomeAgentFilterId : nil
    }

    var detectedTargetIdsForSettings: [String] {
        AgentDisplayCatalog.orderedTargetIds(in: detectedTargets, customAgents: routeState?.settings.customAgents ?? [])
    }

    var sourceRows: [SourceRow] {
        sourceRows(matching: searchQuery)
    }

    func sourceRows(matching rawQuery: String) -> [SourceRow] {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let summaries = query.isEmpty
            ? allSummaries
            : allSummaries.filter { summary in
                summary.sourceId.lowercased().contains(query)
                    || summary.sourceDisplayName.lowercased().contains(query)
                    || summary.sourceLocator.lowercased().contains(query)
                    || summary.sourceKind.lowercased().contains(query)
                    || summary.health.lowercased().contains(query)
                    || summary.leafs.contains(where: { leaf in
                        leaf.name.lowercased().contains(query)
                            || leaf.linkName.lowercased().contains(query)
                    })
            }
        let rows = summaries.map { summary in
            SourceRow(
                id: summary.sourceId,
                displayName: summary.sourceDisplayName,
                locator: summary.sourceLocator,
                kind: summary.sourceKind,
                skillCount: summary.leafs.count,
                status: summary.health,
                lastUpdate: summary.updatedAt,
                warningCount: summary.warningCount,
                errorCount: summary.errorCount
            )
        }
        if query.isEmpty {
            return sortedSourceRows(rows)
        }
        return sortedSourceRows(rows)
    }

    var groupCards: [GroupCardModel] {
        groupCards(matching: searchQuery)
    }

    var virtualGroupSourceOptions: [VirtualGroupSourceOption] {
        groupCards.map { virtualGroupSourceOption(for: $0) }
    }

    func virtualGroupSkillOptions(for sourceId: String) -> [VirtualGroupSkillOption] {
        guard let card = groupCards.first(where: { $0.id == sourceId }) else {
            return []
        }

        return virtualGroupSkillOptions(for: card)
    }

    func virtualGroupEditorOptions() -> VirtualGroupEditorOptions {
        let cards = groupCards
        let sourceOptions = cards.map { virtualGroupSourceOption(for: $0) }
        let mergeSourceIds = Set(sourceOptions.filter { !$0.isVirtual }.map(\.id))
        return VirtualGroupEditorOptions(
            skillOptions: cards
                .filter { mergeSourceIds.contains($0.id) }
                .flatMap { virtualGroupSkillOptions(for: $0) },
            mergeSourceOptions: sourceOptions.filter { !$0.isVirtual },
            restoreSourceOptions: sourceOptions.filter(\.isVirtual)
        )
    }

    private func virtualGroupSourceOption(for card: GroupCardModel) -> VirtualGroupSourceOption {
        VirtualGroupSourceOption(
            id: card.id,
            title: card.title,
            sourceSubtitle: virtualGroupSkillSourceSubtitle(for: card),
            skillCount: card.skills.count,
            isVirtual: card.sourceKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "virtual"
        )
    }

    private func virtualGroupSkillOptions(for card: GroupCardModel) -> [VirtualGroupSkillOption] {
        let sourceSubtitle = virtualGroupSkillSourceSubtitle(for: card)
        return card.skills.map { skill in
            VirtualGroupSkillOption(
                id: "\(card.id):\(skill.id)",
                sourceId: card.id,
                sourceTitle: card.title,
                sourceSubtitle: sourceSubtitle,
                leafId: skill.id,
                title: skill.label,
                isEnabled: skill.isEnabled
            )
        }
    }

    private func virtualGroupSkillSourceSubtitle(for card: GroupCardModel) -> String {
        let author = Self.normalizedVirtualGroupAuthor(from: card.byline)
        if let author {
            return "\(author) · \(card.title)"
        }
        return card.title
    }

    nonisolated private static func normalizedVirtualGroupAuthor(from byline: String?) -> String? {
        let trimmed = byline?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty else {
            return nil
        }
        if trimmed.lowercased().hasPrefix("by ") {
            let value = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty ? nil : value
        }
        return trimmed
    }

    func validateVirtualGroupCreate(
        displayName: String,
        selectedSkills: [VirtualGroupSkillRef]
    ) -> VirtualGroupValidationResult {
        if displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .nameRequired
        }
        if selectedSkills.isEmpty {
            return .skillsRequired
        }
        return .valid
    }

    func validateVirtualGroupMerge(
        displayName: String,
        sourceIds: [String]
    ) -> VirtualGroupValidationResult {
        if displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .nameRequired
        }
        if normalizedUniqueValues(sourceIds).count < 2 {
            return .groupsRequired
        }
        return .valid
    }

    func setSelectedHomeAgentFilter(_ targetId: String?) {
        selectedHomeAgentFilterId = targetId
    }

    func setSelectedHomeStatusFilter(_ filterId: String) {
        selectedHomeStatusFilterId = ["all", "pinned"].contains(filterId) ? filterId : "all"
    }

    func setSelectedHomeSourceTypeFilter(_ filterId: String) {
        selectedHomeSourceTypeFilterId = ["all", "local", "remote", "virtual"].contains(filterId) ? filterId : "all"
    }

    func reconcileHomeAgentFilter() {
        guard selectedHomeAgentFilterId != nil else {
            return
        }
        if effectiveSelectedHomeAgentFilterId == nil {
            self.selectedHomeAgentFilterId = nil
        }
    }

    func filteredHomeGroupCards(locale: Locale) -> [GroupCardModel] {
        _ = locale
        return groupCards.filter { card in
            matchesHomeSidebarFilters(card)
        }
    }

    func matchesHomeSidebarFilters(_ card: GroupCardModel) -> Bool {
        if selectedHomeStatusFilterId == "pinned", !card.isPinned {
            return false
        }
        if selectedHomeSourceTypeFilterId == "local", !Self.isLocalHomeSource(card) {
            return false
        }
        if selectedHomeSourceTypeFilterId == "remote", !Self.isRemoteHomeSource(card) {
            return false
        }
        if selectedHomeSourceTypeFilterId == "virtual", !Self.isVirtualHomeSource(card) {
            return false
        }
        guard let selectedHomeAgentFilterId = effectiveSelectedHomeAgentFilterId else {
            return true
        }
        return card.targets.contains { target in
            target.id == selectedHomeAgentFilterId && target.isEnabled
        }
    }

    static func isLocalHomeSource(_ card: GroupCardModel) -> Bool {
        homeSourceType(for: card) == "local"
    }

    static func isRemoteHomeSource(_ card: GroupCardModel) -> Bool {
        homeSourceType(for: card) == "remote"
    }

    static func isVirtualHomeSource(_ card: GroupCardModel) -> Bool {
        homeSourceType(for: card) == "virtual"
    }

    private static func homeSourceType(for card: GroupCardModel) -> String {
        let kind = card.sourceKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let locator = card.sourceLocator.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if kind == "virtual" {
            return "virtual"
        }
        if ["local", "path", "filesystem"].contains(kind) {
            return "local"
        }
        if ["git", "clawhub"].contains(kind) {
            return "remote"
        }
        if locator.hasPrefix("~/")
            || locator.hasPrefix("/")
            || locator.hasPrefix("file://") {
            return "local"
        }
        if locator.hasPrefix("http://")
            || locator.hasPrefix("https://")
            || locator.hasPrefix("git@")
            || locator.contains("github.com")
            || locator.contains("gitlab.com") {
            return "remote"
        }
        return "remote"
    }

    func groupCards(matching rawQuery: String) -> [GroupCardModel] {
        sourceRows(matching: rawQuery).compactMap { row -> GroupCardModel? in
            guard let summary = summary(for: row.id), let draft = draft(for: row.id) else {
                return nil
            }

            let enabledLeafIds = Set(draft.selectedLeafIds)
            let enabledTargets = Set(draft.enabledTargets)
            let metadata = groupCardMetadata(sourceId: row.id, summary: summary, row: row)
            let payload = detailEnrichmentPayloadBySourceId[row.id] ?? [:]
            let cachedGroupPath = (payload["groupPath"] as? String)?.nonEmpty
            let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
            let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
            let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
            let groupPath = cachedGroupPath ?? preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
            let sourceTitlesById = Dictionary(uniqueKeysWithValues: allSummaries.map { ($0.sourceId, $0.sourceDisplayName) })

            return GroupCardModel(
                id: row.id,
                title: row.displayName,
                originalDisplayName: summary.sourceOriginalDisplayName,
                byline: metadata.byline,
                groupPath: groupPath,
                sourceKind: row.kind,
                sourceLocator: row.locator,
                isPinned: pinnedSourceIds.contains(row.id),
                health: row.status,
                warningCount: row.warningCount,
                errorCount: row.errorCount,
                skillSelection: skillSelectionState(sourceId: row.id),
                targetSelection: targetSelectionState(sourceId: row.id),
                stats: metadata.stats,
                skillsLoading: false,
                targetsLoading: false,
                skills: summary.leafs.map { leaf in
                    GroupCardSkill(
                        id: leaf.id,
                        label: leaf.name,
                        description: leaf.description,
                        isEnabled: enabledLeafIds.contains(leaf.id),
                        sourceTitle: leaf.sourceTitle
                            ?? leaf.sourceId.flatMap { sourceId in
                                sourceId == summary.sourceId ? nil : sourceTitlesById[sourceId]
                            }
                    )
                },
                targets: visibleTargetIds().map { targetId in
                    GroupCardTarget(
                        id: targetId,
                        label: AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                        shortLabel: AgentDisplayCatalog.shortLabel(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                        isEnabled: enabledTargets.contains(targetId)
                    )
                },
                saveState: saveState(for: row.id)
            )
        }
    }

    func sourceCanonicalRepo(for sourceId: String) -> String? {
        summary(for: sourceId)?.sourceCanonicalRepo
    }

    func sourceLocator(for sourceId: String) -> String? {
        summary(for: sourceId)?.sourceLocator
    }

    func prefetchHomeGroupCardMetadataIfNeeded(_ sourceIds: [String]) async {
        guard currentRoute == .home else {
            return
        }
        for sourceId in sourceIds {
            guard currentRoute == .home else {
                return
            }
            guard detailEnrichmentPayloadBySourceId[sourceId] == nil else {
                continue
            }
            guard detailEnrichmentTasksBySourceId[sourceId] == nil else {
                continue
            }
            scheduleDetailEnrichmentFetch(sourceId: sourceId)
        }
    }

    func togglePinned(sourceId: String) async {
        let previousPinnedSourceIds = pinnedSourceIds
        pinnedSourceIds = toggledPinnedSourceIds(from: pinnedSourceIds, sourceId: sourceId)

        do {
            let result = try await mutationCoordinator.togglePinned(sourceId: sourceId)
            pinnedSourceIds = result.pinnedSourceIds
        } catch {
            pinnedSourceIds = previousPinnedSourceIds
            showToast(style: .error, text: localizedText("toast.pin.failed", firstErrorLine(from: error)))
        }
    }

    func renameSource(sourceId: String, displayName: String) async {
        let normalizedSourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedSourceId.isEmpty else {
            showToast(style: .error, text: localizedText("toast.rename.empty"))
            return
        }

        do {
            let result = try await mutationCoordinator.renameSource(
                sourceId: normalizedSourceId,
                displayName: requestedDisplayName
            )
            applyRenamedSource(
                sourceId: result.sourceId,
                displayName: result.displayName,
                originalDisplayName: result.originalDisplayName
            )
            let toastKey = result.isResetToOriginal ? "toast.rename.reset_success" : "toast.rename.success"
            showToast(style: .success, text: localizedText(toastKey, result.displayName))
        } catch {
            showToast(style: .error, text: localizedText("toast.rename.failed", firstErrorLine(from: error)))
        }
    }

    func createVirtualGroup(
        displayName: String,
        skills: [VirtualGroupSkillRef],
        enabledTargets: [String]
    ) async {
        let normalizedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard validateVirtualGroupCreate(displayName: normalizedDisplayName, selectedSkills: skills) == .valid else {
            return
        }

        do {
            let response = try await commandFacade.createVirtualGroup(
                displayName: normalizedDisplayName,
                skills: skills,
                enabledTargets: enabledTargets
            )
            guard response.ok else {
                showBridgeCommandFailure(response)
                return
            }
            await refreshList()
        } catch {
            showToast(style: .error, message: firstErrorLine(from: error))
        }
    }

    func mergeGroups(
        displayName: String,
        sourceIds: [String],
        enabledTargets: [String]
    ) async {
        let normalizedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedSourceIds = normalizedUniqueValues(sourceIds)
        guard validateVirtualGroupMerge(displayName: normalizedDisplayName, sourceIds: normalizedSourceIds) == .valid else {
            return
        }

        do {
            let response = try await commandFacade.mergeGroups(
                displayName: normalizedDisplayName,
                sourceIds: normalizedSourceIds,
                enabledTargets: enabledTargets
            )
            guard response.ok else {
                showBridgeCommandFailure(response)
                return
            }
            await refreshList()
        } catch {
            showToast(style: .error, message: firstErrorLine(from: error))
        }
    }

    func restoreMergedGroups(virtualGroupId: String) async {
        let normalizedVirtualGroupId = virtualGroupId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedVirtualGroupId.isEmpty else {
            return
        }

        do {
            let response = try await commandFacade.restoreMergedGroups(virtualGroupId: normalizedVirtualGroupId)
            guard response.ok else {
                showBridgeCommandFailure(response)
                return
            }
            await refreshList()
        } catch {
            showToast(style: .error, message: firstErrorLine(from: error))
        }
    }

    private func sortedSourceRows(_ rows: [SourceRow]) -> [SourceRow] {
        rows.sorted { lhs, rhs in
            let leftRank = pinRank(for: lhs.id)
            let rightRank = pinRank(for: rhs.id)
            if leftRank != rightRank {
                return leftRank < rightRank
            }
            return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
        }
    }

    private func pinRank(for sourceId: String) -> Int {
        pinnedSourceIds.firstIndex(of: sourceId) ?? Int.max
    }

    private func subtitleText(locator: String, kind: String) -> String {
        "by \(authorName(locator: locator, kind: kind))"
    }

    private func authorName(locator: String, kind: String) -> String {
        let normalizedKind = kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["local", "path", "filesystem"].contains(normalizedKind) {
            return localized("source.author.local")
        }
        if normalizedKind == "virtual" {
            return localized("source.author.virtual")
        }
        if let handle = Self.authorHandle(from: locator) {
            return handle
        }
        return normalizedKind
    }

    private func groupCardMetadata(
        sourceId: String,
        summary: WorkflowSummary,
        row: SourceRow
    ) -> (byline: String, stats: GroupCardStats) {
        let payload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
        let sourceSnapshot = parseSourceSnapshot(payload["sourceSnapshot"] as? [String: Any])
        let sourceMetadata = (payload["sourceMetadata"] as? [String: Any])?["data"] as? [String: Any]
        let cachedGroupPath = (payload["groupPath"] as? String)?.nonEmpty
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []

        let byline = sourceSnapshot.map { "by @\($0.owner.slug)" }
            ?? ((sourceMetadata?["ownerHandle"] as? String)?.nonEmpty.map { "by \($0)" })
            ?? subtitleText(locator: row.locator, kind: row.kind)

        let stats = GroupCardStats(
            skillCount: sourceSnapshot?.skillCount ?? summary.leafs.count,
            downloadCount: sourceSnapshot?.totalInstalls
                ?? sourceMetadata?["totalInstalls"] as? Int
                ?? sourceMetadata?["downloadCount"] as? Int,
            starCount: sourceSnapshot?.repoStars ?? sourceMetadata?["starCount"] as? Int,
            githubURL: sourceSnapshot?.repoURL ?? (sourceMetadata?["repoUrl"] as? String)?.nonEmpty,
            localPath: cachedGroupPath ?? preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        )

        return (byline, stats)
    }

    var deploymentSummary: DeploymentSummary {
        guard !deploymentRows.isEmpty else { return .empty }
        var create = 0
        var update = 0
        var remove = 0
        var blocked = 0
        var noop = 0

        for row in deploymentRows {
            switch row.kind {
            case "create": create += 1
            case "remove": remove += 1
            case "blocked": blocked += 1
            case "noop": noop += 1
            default: update += 1
            }
        }

        return DeploymentSummary(
            create: create,
            update: update,
            remove: remove,
            blocked: blocked,
            noop: noop
        )
    }

    var deploymentTargets: [String] {
        let targets = Set(deploymentRows.map(\.target))
        return ["All"] + targets.sorted()
    }

    var deploymentKinds: [String] {
        ["All", "create", "update", "remove", "blocked", "noop"]
    }

    var filteredDeploymentRows: [DeploymentRow] {
        deploymentRows.filter { row in
            (deploymentFilterTarget == "All" || row.target == deploymentFilterTarget)
                && (deploymentFilterKind == "All" || row.kind == deploymentFilterKind)
        }
    }

    var overviewState: PageViewState {
        switch loadState {
        case .loading:
            return .loading
        case .failed(let message):
            return .error(message)
        case .idle:
            return .loading
        case .ready:
            if sourceRows.isEmpty {
                return .empty
            }
            if !latestWarnings.isEmpty {
                return .partial
            }
            return .success
        }
    }

    var sourcesState: PageViewState {
        switch loadState {
        case .loading:
            return .loading
        case .failed(let message):
            return .error(message)
        case .idle:
            return .loading
        case .ready:
            if sourceRows.isEmpty {
                return .empty
            }
            if sourceRows.contains(where: { $0.warningCount > 0 || $0.errorCount > 0 }) {
                return .partial
            }
            return .success
        }
    }

    var deploymentsState: PageViewState {
        switch loadState {
        case .loading:
            return .loading
        case .failed(let message):
            return .error(message)
        case .idle:
            return .loading
        case .ready:
            if filteredDeploymentRows.isEmpty {
                return .empty
            }
            if filteredDeploymentRows.contains(where: { $0.kind == "blocked" }) {
                return .partial
            }
            return .success
        }
    }

    var doctorState: PageViewState {
        if let lastDoctorError {
            return .error(lastDoctorError)
        }
        if doctorIssues.isEmpty {
            return .empty
        }
        if doctorIssues.contains(where: { $0.severity == "error" || $0.severity == "warning" }) {
            return .partial
        }
        return .success
    }

    var groupedDoctorIssues: [(String, [DoctorIssueRow])] {
        let groups = Dictionary(grouping: doctorIssues, by: \.severity)
        return ["error", "warning", "info"].compactMap { severity in
            guard let issues = groups[severity], !issues.isEmpty else { return nil }
            return (severity, issues)
        }
    }

    var currentSaveState: SaveState {
        guard let groupId = selectedGroupId else {
            return SaveState(phase: .idle, detail: nil)
        }
        return saveState(for: groupId)
    }

    func saveState(for sourceId: String) -> SaveState {
        guard let key = scopedSourceKey(sourceId: sourceId) else {
            return SaveState(phase: .idle, detail: nil)
        }
        return saveStateBySourceId[key] ?? SaveState(phase: .idle, detail: nil)
    }

    func isSaving(sourceId: String? = nil) -> Bool {
        saveState(for: resolveSourceId(sourceId) ?? "").phase == .saving
    }

    func skillSelectionState(sourceId: String? = nil) -> SelectionState {
        guard let summary = summary(for: sourceId), let draft = draft(for: sourceId) else {
            return .empty
        }
        let treeState = TreeSelectionState(
            allLeafIds: summary.leafs.map(\.id),
            selectedLeafIds: draft.selectedLeafIds
        )
        return getParentSelectionState(treeState)
    }

    func targetSelectionState(sourceId: String? = nil) -> SelectionState {
        guard let sourceId = resolveSourceId(sourceId) else {
            return .empty
        }
        let targetIds = visibleTargetIds()
        guard !targetIds.isEmpty else {
            return .empty
        }
        let selectedTargets = visibleEnabledTargets(for: sourceId, within: targetIds)
        return selectionState(allIds: targetIds, selectedIds: selectedTargets)
    }

    func isSkillEnabled(_ leafId: String, sourceId: String? = nil) -> Bool {
        draft(for: sourceId)?.selectedLeafIds.contains(leafId) == true
    }

    func toggleAllSkills(sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = draft(for: sourceId) else {
            return
        }
        guard !isSaving(sourceId: sourceId) else {
            return
        }

        let treeState = TreeSelectionState(
            allLeafIds: summary.leafs.map(\.id),
            selectedLeafIds: draft.selectedLeafIds
        )
        let nextState = toggleParent(treeState)
        draft.selectedLeafIds = nextState.selectedLeafIds
        await commitDraftChange(
            sourceId: sourceId,
            nextDraft: draft,
            successMessage: compactSkillsToastMessage(sourceId: sourceId, enabled: !nextState.selectedLeafIds.isEmpty),
            successStyle: nextState.selectedLeafIds.isEmpty ? .neutral : .success
        )
    }

    func setSkillEnabled(_ leafId: String, enabled: Bool, sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = draft(for: sourceId) else {
            return
        }
        guard !isSaving(sourceId: sourceId) else {
            return
        }
        guard summary.leafs.contains(where: { $0.id == leafId }) else {
            return
        }

        let selectedLeafIds = Set(draft.selectedLeafIds)
        guard selectedLeafIds.contains(leafId) != enabled else {
            return
        }

        let nextSelectedLeafIds: [String]
        if enabled {
            nextSelectedLeafIds = summary.leafs
                .map(\.id)
                .filter { selectedLeafIds.union([leafId]).contains($0) }
        } else {
            nextSelectedLeafIds = summary.leafs
                .map(\.id)
                .filter { selectedLeafIds.subtracting([leafId]).contains($0) }
        }

        draft.selectedLeafIds = nextSelectedLeafIds
        await commitDraftChange(
            sourceId: sourceId,
            nextDraft: draft,
            successMessage: compactSkillToastMessage(sourceId: sourceId, leafId: leafId, enabled: enabled),
            successStyle: enabled ? .success : .neutral
        )
    }

    func toggleAllTargets(sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), var draft = draft(for: sourceId) else {
            return
        }
        guard !isSaving(sourceId: sourceId) else {
            return
        }

        let targetIds = visibleTargetIds()
        guard !targetIds.isEmpty else {
            return
        }
        let visibleEnabledTargets = visibleEnabledTargets(for: sourceId, within: targetIds)
        let hiddenTargets = draft.enabledTargets.filter { !targetIds.contains($0) }
        let nextVisibleTargets = visibleEnabledTargets.count == targetIds.count ? [] : targetIds
        draft.enabledTargets = normalizedTargets(hiddenTargets + nextVisibleTargets)
        await commitDraftChange(
            sourceId: sourceId,
            nextDraft: draft,
            successMessage: compactAgentsToastMessage(sourceId: sourceId, enabled: !draft.enabledTargets.isEmpty),
            successStyle: draft.enabledTargets.isEmpty ? .neutral : .success
        )
    }

    private var deploymentRows: [DeploymentRow] {
        var rows: [DeploymentRow] = []

        for summary in allSummaries {
            let draft = draft(for: summary.sourceId) ?? buildInitialDraftFromSummary(summary)
            let selectedLeafIds = draft.selectedLeafIds
            let enabledTargets = draft.enabledTargets

            if enabledTargets.isEmpty {
                rows.append(
                    DeploymentRow(
                        id: "noop-\(summary.sourceId)",
                        kind: "noop",
                        skill: "-",
                        target: "-",
                        path: "-",
                        result: "No enabled targets"
                    )
                )
                continue
            }

            for target in enabledTargets {
                let targetLabel = AgentDisplayCatalog.label(for: target, customAgents: routeState?.settings.customAgents ?? [])

                if selectedLeafIds.isEmpty {
                    rows.append(
                        DeploymentRow(
                            id: "blocked-\(summary.sourceId)-\(target)",
                            kind: "blocked",
                            skill: "-",
                            target: targetLabel,
                            path: "-",
                            result: "No selected skills"
                        )
                    )
                    continue
                }

                for leafId in selectedLeafIds {
                    rows.append(
                        DeploymentRow(
                            id: "\(summary.sourceId)-\(target)-\(leafId)",
                            kind: "update",
                            skill: leafId,
                            target: targetLabel,
                            path: "~/.skillflow/<target>/\(leafId)",
                            result: summary.health
                        )
                    )
                }
            }
        }

        return rows
    }

    func bootstrap() async {
        loadState = .loading
        do {
            let bootstrap = try await queryFacade.bootstrap()
            latestWarnings = bootstrap.warnings
            parseBootstrapData(bootstrap.data?.value)
            await migrateLegacyPinnedSourceIdsIfNeeded()

            loadState = .ready
            healthStatus = bootstrap.warnings.isEmpty ? .healthy : .warnings
            Task { [weak self] in
                await self?.prefetchRecommendedImportGroupsIfNeeded()
            }
        } catch {
            loadState = .failed(error.localizedDescription)
            healthStatus = .error
        }
    }

    func refreshList() async {
        await refreshList(showProjectScopeToast: false)
    }

    func refreshProjectScopes() async {
        await refreshList(showProjectScopeToast: true)
    }

    private func refreshList(showProjectScopeToast: Bool) async {
        isRefreshing = true
        if showProjectScopeToast {
            showToast(style: .loading, text: localizedText("toast.project_scope.refresh.loading"))
        }
        defer { isRefreshing = false }

        do {
            let previousScope = currentProjectScope()
            let sourceToReinspect = currentDetailSourceId ?? selectedSourceId
            let response = try await fetchListResponse()
            applyList(response)
            if currentProjectScope() != previousScope, let sourceToReinspect {
                await selectSource(sourceToReinspect)
            }
            latestWarnings = response.warnings
            healthStatus = response.warnings.isEmpty ? .healthy : .warnings
            if showProjectScopeToast {
                showToast(
                    style: .success,
                    text: localizedText(
                        "toast.project_scope.refresh.success",
                        String(recentProjectScopes.count)
                    )
                )
            }
        } catch {
            if showProjectScopeToast {
                showToast(style: .error, text: localizedText("toast.project_scope.refresh.failed", error.localizedDescription))
            }
            loadState = .failed(error.localizedDescription)
        }
    }

    func selectSource(_ sourceId: String) async {
        selectedSourceId = sourceId
        do {
            let response = try await fetchInspectResponse(sourceId: sourceId)
            if let payload = response.data?.value as? [String: Any] {
                let normalizedPayload = payloadWithRenameDisplayNameOverride(payload, sourceId: sourceId)
                if let key = scopedSourceKey(sourceId: sourceId) {
                    inspectedPayloadBySourceId[key] = normalizedPayload
                }
                invalidatePreparedDetailContent(for: sourceId)
                scheduleDetailContentWarmupIfNeeded(sourceId: sourceId)
                scheduleDetailEnrichmentFetch(sourceId: sourceId)
            }
            latestWarnings = response.warnings
        } catch {
            applyProjectScopeStateIfAvailable(from: error)
            showToast(style: .error, text: localizedText("toast.details.load_failed", sourceId))
        }
    }

    func selectProjectScope(_ scope: ProjectScopeSelection) async {
        let normalizedScope: ProjectScopeSelection
        switch scope {
        case .global:
            normalizedScope = .global
        case .project(let projectId):
            normalizedScope = recentProjectScopes.contains(where: { $0.projectId == projectId }) ? .project(projectId) : .global
        }

        guard selectedProjectScope != normalizedScope else {
            return
        }

        let didInitializeProjectDrafts = ensureProjectDraftsInitializedIfNeeded(for: normalizedScope)

        cachedSelectedProjectScope = normalizedScope
        routeState?.settings.selectedProjectScope = normalizedScope
        persistProjectScopeSettingsIfNeeded()
        projectScopeChangeToken &+= 1
        showToast(
            style: .success,
            text: localizedText(
                didInitializeProjectDrafts
                    ? "toast.project_scope.initialized"
                    : "toast.project_scope.switched",
                projectScopeTitle(for: normalizedScope)
            )
        )

        if let sourceId = currentDetailSourceId ?? selectedSourceId {
            await selectSource(sourceId)
        }
    }

    func runDoctor() async {
        do {
            let response = try await fetchDoctorResponse()
            latestWarnings = response.warnings
            healthStatus = response.warnings.isEmpty ? .healthy : .warnings
            lastDoctorError = nil
            doctorIssues = parseDoctorIssues(response.data?.value)
        } catch {
            healthStatus = .error
            lastDoctorError = error.localizedDescription
        }
    }

    func updateAll() async {
        do {
            cancelDeferredDraftSync()
            let response = try await bridgeClient.updateAll()
            await synchronizeState(refreshDoctor: true, inspectSourceId: selectedDetailInspectSourceId)
            showToast(style: .success, text: .plain(updateSummaryMessage(from: response.data?.value, fallbackCount: sourceIds.count)))
        } catch {
            showToast(style: .error, text: localizedText("toast.update.failed", error.localizedDescription))
        }
    }

    func updateAllGroupsFromHome() async {
        let sourceIds = self.sourceIds
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !sourceIds.isEmpty else {
            showToast(style: .neutral, text: localizedText("toast.update.none"))
            return
        }

        updatingSourceIds.formUnion(sourceIds)
        defer { updatingSourceIds.subtract(sourceIds) }

        do {
            cancelDeferredDraftSync()
            let response = try await bridgeClient.updateSources(sourceIds)
            await synchronizeState(refreshDoctor: true, inspectSourceId: selectedDetailInspectSourceId)
            showToast(style: .success, text: .plain(updateSummaryMessage(from: response.data?.value, fallbackCount: sourceIds.count)))
        } catch {
            showToast(style: .error, text: localizedText("toast.update.failed", error.localizedDescription))
        }
    }

    func updateCurrentGroup() async {
        await submitSelectedUpdate(selectedSourceId, showLoadingToast: true)
    }

    func isUpdatingSource(_ sourceId: String) -> Bool {
        updatingSourceIds.contains(sourceId)
    }

    func updateSource(_ sourceId: String) async {
        await submitSelectedUpdate(sourceId, showLoadingToast: true)
    }

    private func submitSelectedUpdate(_ requestedSourceId: String?, showLoadingToast: Bool) async {
        let sourceId = requestedSourceId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !sourceId.isEmpty else {
            showToast(style: .error, text: localizedText("toast.update.no_group_selected"))
            return
        }

        updatingSourceIds.insert(sourceId)
        if showLoadingToast {
            showToast(style: .loading, text: localizedText("toast.update.loading", groupLabel(for: sourceId)))
        }
        defer { updatingSourceIds.remove(sourceId) }

        do {
            let result = try await mutationCoordinator.updateSelectedSource(requestedSourceId)
            guard case let .submitted(submittedSourceId, response) = result else {
                showToast(style: .error, text: localizedText("toast.update.no_group_selected"))
                return
            }
            cancelDeferredDraftSync()
            let shouldInspect = selectedGroupId == submittedSourceId || selectedSourceId == submittedSourceId
            await synchronizeState(
                refreshDoctor: true,
                inspectSourceId: shouldInspect ? submittedSourceId : nil
            )
            showToast(style: .success, text: .plain(updateSummaryMessage(from: response.data?.value, fallbackCount: 1)))
        } catch {
            showToast(style: .error, text: localizedText("toast.update.failed", error.localizedDescription))
        }
    }

    var importDisplayGroups: [ImportGroupItem] {
        importSubmittedQuery.isEmpty ? recommendedImportGroups + localImportGroups : searchImportGroups
    }

    func isImportingImportGroup(_ groupId: String) -> Bool {
        importingImportGroupId == groupId
    }

    func loadImportPageIfNeeded() async {
        seedRecommendedImportGroupsIfNeeded()
        await loadLocalImportGroups(path: nil)
    }

    func loadRecommendedImportGroups() async {
        seedRecommendedImportGroupsIfNeeded()
    }

    func loadLocalImportGroups(path: String?) async {
        if path == nil {
            switch localImportScanPhase {
            case .loading, .ready:
                return
            case .idle, .failed:
                break
            }
        }

        localImportScanPhase = .loading
        do {
            let response = try await queryFacade.scanLocalImportGroups(path: path)
            let payload = response.data?.value as? [String: Any] ?? [:]
            let groups = parseImportGroupsPayload(payload: payload)

            if path == nil {
                localImportGroups = groups
            } else {
                var merged = localImportGroups
                for group in groups {
                    if let index = merged.firstIndex(where: { $0.id == group.id }) {
                        merged[index] = group
                    } else {
                        merged.append(group)
                    }
                }
                localImportGroups = merged
            }

            localImportScanPhase = .ready
        } catch {
            localImportScanPhase = .failed(.plain(error.localizedDescription))
            showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
        }
    }

    func submitImportSearch(_ query: String) async {
        let submitted = query.trimmingCharacters(in: .whitespacesAndNewlines)
        importSubmittedQuery = submitted

        if submitted.isEmpty {
            searchImportGroups = []
            await loadRecommendedImportGroups()
            return
        }

        importSearchPhase = .loading
        do {
            let response = try await fetchImportSearchResponse(query: submitted)
            let payload = response.data?.value as? [String: Any] ?? [:]
            searchImportGroups = parseImportGroupsPayload(payload: payload)
            importSearchPhase = .ready
        } catch {
            importSearchPhase = .failed(localizedText("import.error.search_groups"))
            showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
        }
    }

    func previewImportGroupIfNeeded(_ groupId: String) async {
        guard let item = importGroupItem(id: groupId) else { return }
        guard item.previewPhase == .idle else { return }

        setPreviewPhase(.loading, for: groupId)
        do {
            let response = try await fetchImportPreviewResponse(groupId: groupId, locator: item.locator)
            let payload = response.data?.value as? [String: Any] ?? [:]
            applyImportPreviewPayload(payload, for: groupId, fallbackLocator: item.locator)
        } catch {
            setPreviewPhase(.failed(.plain(error.localizedDescription)), for: groupId)
        }
    }

    func importImportGroup(
        groupId: String,
        locator: String,
        selectedSkillIds: [String],
        enabledTargets: [String]
    ) async {
        guard importingImportGroupId == nil else { return }
        importingImportGroupId = groupId
        defer { importingImportGroupId = nil }

        var finalSelectedSkillIds = selectedSkillIds
        var finalEnabledTargets = enabledTargets

        if finalSelectedSkillIds.isEmpty,
           let item = importGroupItem(id: groupId),
           item.skills.isEmpty {
            await previewImportGroupIfNeeded(groupId)
            if let refreshed = importGroupItem(id: groupId) {
                finalSelectedSkillIds = refreshed.skills.filter(\.selectedByDefault).map(\.id)
                finalEnabledTargets = refreshed.targets.filter(\.selectedByDefault).map(\.id)
            }
        }

        do {
            let response = try await commandFacade.importSource(
                locator: locator,
                selectedSkillIds: finalSelectedSkillIds,
                enabledTargets: finalEnabledTargets
            )
            guard let payload = response.data?.value as? [String: Any],
                  let status = payload["status"] as? String
            else {
                showToast(style: .error, text: localizedText("toast.import.invalid_response"))
                return
            }

            if status != "ready" {
                let reasonCode = payload["reasonCode"] as? String ?? "unknown"
                showToast(style: .error, text: importFailureToastText(reasonCode: reasonCode))
                return
            }

            let sourceId = payload["sourceId"] as? String ?? ""
            cancelDeferredDraftSync()
            await synchronizeState(
                refreshDoctor: true,
                inspectSourceId: sourceId.nonEmpty
            )
            if currentRoute != .importPage, let sourceId = sourceId.nonEmpty {
                routeState?.view.currentRoute = .detail(sourceId: sourceId)
            }
            showToast(style: .success, text: localizedText("toast.import.success"))
        } catch {
            showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
        }
    }

    func showImportAlreadyExistsToast() {
        showToast(style: .neutral, text: localizedText("toast.import.exists"))
    }

    private func parseImportGroupsPayload(payload: [String: Any]) -> [ImportGroupItem] {
        let groups = payload["groups"] as? [[String: Any]] ?? []
        return groups.compactMap { group in
            guard let id = (group["id"] as? String)?.nonEmpty,
                  let title = (group["title"] as? String)?.nonEmpty,
                  let locator = (group["locator"] as? String)?.nonEmpty,
                  let canonicalRepo = (group["canonicalRepo"] as? String)?.nonEmpty
            else {
                return nil
            }

            let aliases = uniqueSorted(group["aliases"] as? [String] ?? [])
            let matchedSkillNames = uniqueSorted(group["matchedSkillNames"] as? [String] ?? [])
            let matchedSkills = parseMatchedSkills(group["matchedSkills"] as? [[String: Any]])
            let snapshot = parseSourceSnapshot(group["snapshot"] as? [String: Any])
            let provider = group["provider"] as? String ?? "skills"
            let localImport = parseLocalImport(group["localImport"] as? [String: Any])
            let summary = (group["summary"] as? String)?.nonEmpty
                ?? snapshot?.description.nonEmpty
                ?? ""
            let skills = snapshot?.skills.map { skill in
                ImportGroupSkill(
                    id: skill.skillId,
                    title: skill.title,
                    summary: skill.summary,
                    selectedByDefault: true
                )
            } ?? []
            let previewPhase: ImportLoadPhase = skills.isEmpty
                ? parseImportLoadPhase(group["previewState"] as? [String: Any])
                : .ready

            return ImportGroupItem(
                id: id,
                title: title,
                locator: locator,
                canonicalRepo: canonicalRepo,
                isInstalledLocally: group["installed"] as? Bool ?? false,
                aliases: aliases,
                summary: summary,
                starCount: group["starCount"] as? Int ?? snapshot?.repoStars,
                totalInstalls: group["totalInstalls"] as? Int ?? snapshot?.totalInstalls,
                skillCount: group["skillCount"] as? Int ?? snapshot?.skillCount,
                matchedSkillNames: matchedSkillNames,
                matchedSkills: matchedSkills,
                provider: provider,
                localImport: localImport,
                snapshot: snapshot,
                enrichPhase: parseImportLoadPhase(group["enrichState"] as? [String: Any]),
                previewPhase: previewPhase,
                skills: skills,
                targets: []
            )
        }
    }

    private func parseLocalImport(_ payload: [String: Any]?) -> LocalImportInfo? {
        guard let payload,
              let validationStatus = (payload["validationStatus"] as? String)?.nonEmpty else {
            return nil
        }

        return LocalImportInfo(
            validationStatus: validationStatus,
            selectedChoiceId: (payload["selectedChoiceId"] as? String)?.nonEmpty,
            choices: parseLocalImportChoices(payload["choices"] as? [[String: Any]]),
            detectedSkills: parseLocalImportDetectedSkills(payload["detectedSkills"] as? [[String: Any]])
        )
    }

    private func parseLocalImportChoices(_ payload: [[String: Any]]?) -> [LocalImportChoice] {
        (payload ?? []).compactMap { choice in
            guard let id = (choice["id"] as? String)?.nonEmpty,
                  let label = (choice["label"] as? String)?.nonEmpty,
                  let locator = (choice["locator"] as? String)?.nonEmpty else {
                return nil
            }

            return LocalImportChoice(
                id: id,
                label: label,
                locator: locator,
                selectedSkillIds: choice["selectedSkillIds"] as? [String] ?? []
            )
        }
    }

    private func parseLocalImportDetectedSkills(_ payload: [[String: Any]]?) -> [LocalImportDetectedSkill] {
        (payload ?? []).compactMap { skill in
            guard let id = (skill["id"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty,
                  let localPath = (skill["localPath"] as? String)?.nonEmpty,
                  let validationStatus = (skill["validationStatus"] as? String)?.nonEmpty else {
                return nil
            }

            return LocalImportDetectedSkill(
                id: id,
                title: title,
                localPath: localPath,
                discoveredTargets: skill["discoveredTargets"] as? [String] ?? [],
                validationStatus: validationStatus,
                originSkillId: (skill["originSkillId"] as? String)?.nonEmpty
            )
        }
    }

    private func seedRecommendedImportGroupsIfNeeded() {
        guard recommendedImportGroups.isEmpty else {
            if importSubmittedQuery.isEmpty, importSearchPhase == .idle {
                importSearchPhase = .ready
            }
            return
        }

        recommendedImportGroups = makeLocalRecommendedImportGroups(recommendationsProvider())
        if importSubmittedQuery.isEmpty {
            importSearchPhase = .ready
        }
    }

    private func makeLocalRecommendedImportGroups(_ recommendations: [ImportRecommendationEntry]) -> [ImportGroupItem] {
        let installedLocators = Set(
            allSummaries.flatMap { summary in
                [summary.sourceCanonicalRepo, summary.sourceLocator]
                    .compactMap { $0 }
                    .map(Self.normalizedImportRecommendationKey)
            }
        )

        return recommendations
            .sorted(by: { lhs, rhs in
                if lhs.sortOrder != rhs.sortOrder {
                    return lhs.sortOrder < rhs.sortOrder
                }
                return lhs.canonicalRepo < rhs.canonicalRepo
            })
            .map { recommendation in
                let normalizedRepo = Self.normalizedImportRecommendationKey(recommendation.canonicalRepo)
                let isInstalledLocally = installedLocators.contains(normalizedRepo)

                return ImportGroupItem(
                    id: normalizedRepo.replacingOccurrences(of: "/", with: "-"),
                    title: Self.localRecommendationTitle(for: recommendation.canonicalRepo),
                    locator: recommendation.locator,
                    canonicalRepo: recommendation.canonicalRepo,
                    isInstalledLocally: isInstalledLocally,
                    aliases: uniqueSorted([recommendation.canonicalRepo, recommendation.locator]),
                    summary: "",
                    starCount: nil,
                    totalInstalls: nil,
                    skillCount: nil,
                    matchedSkillNames: [],
                    matchedSkills: [],
                    provider: "skills",
                    localImport: nil,
                    snapshot: nil,
                    enrichPhase: .idle,
                    previewPhase: .idle,
                    skills: [],
                    targets: []
                )
            }
    }

    private static func normalizedImportRecommendationKey(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ""
        }

        let lowered = trimmed
            .lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let patterns = [
            #"^https?://github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?$"#,
            #"^git@github\.com:([^/\s]+)/([^/\s]+?)(?:\.git)?$"#,
            #"^([^/\s]+)/([^/\s]+?)(?:\.git)?$"#,
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
                continue
            }
            let range = NSRange(lowered.startIndex..<lowered.endIndex, in: lowered)
            guard let match = regex.firstMatch(in: lowered, options: [], range: range),
                  let ownerRange = Range(match.range(at: 1), in: lowered),
                  let repoRange = Range(match.range(at: 2), in: lowered) else {
                continue
            }

            return importRecommendationAlias("\(lowered[ownerRange])/\(lowered[repoRange])")
        }

        return importRecommendationAlias(lowered.replacingOccurrences(of: ".git", with: ""))
    }

    private static func importRecommendationAlias(_ repo: String) -> String {
        switch repo {
        case "anthropic/skills":
            return "anthropics/skills"
        default:
            return repo
        }
    }

    private static func localRecommendationTitle(for canonicalRepo: String) -> String {
        let repoName = canonicalRepo
            .split(separator: "/")
            .last
            .map(String.init) ?? canonicalRepo

        return repoName
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { token in
                guard let first = token.first else { return "" }
                return String(first).uppercased() + token.dropFirst()
            }
            .joined(separator: " ")
    }

    private func parseImportLoadPhase(_ payload: [String: Any]?) -> ImportLoadPhase {
        guard let payload, let status = payload["status"] as? String else {
            return .idle
        }

        switch status {
        case "loading":
            return .loading
        case "ready":
            return .ready
        case "failed":
            return .failed(importReasonText(reasonCode: payload["reasonCode"] as? String))
        default:
            return .idle
        }
    }

    private func parseMatchedSkills(_ payload: [[String: Any]]?) -> [ImportMatchedSkill] {
        (payload ?? []).compactMap { skill in
            guard let skillId = (skill["skillId"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty else {
                return nil
            }

            return ImportMatchedSkill(
                skillId: skillId,
                title: title,
                installs: skill["installs"] as? Int
            )
        }
    }

    private func parseSourceSnapshot(_ payload: [String: Any]?) -> SourceSnapshotData? {
        guard let payload,
              let canonicalRepo = (payload["canonicalRepo"] as? String)?.nonEmpty,
              let title = (payload["title"] as? String)?.nonEmpty,
              let provider = (payload["provider"] as? String)?.nonEmpty,
              let sourceURL = (payload["sourceUrl"] as? String)?.nonEmpty,
              let repoURL = (payload["repoUrl"] as? String)?.nonEmpty,
              let repoLabel = (payload["repoLabel"] as? String)?.nonEmpty,
              let owner = parseSourceOwner(payload["owner"] as? [String: Any]) else {
            return nil
        }

        return SourceSnapshotData(
            canonicalRepo: canonicalRepo,
            title: title,
            provider: provider,
            sourceURL: sourceURL,
            repoURL: repoURL,
            repoLabel: repoLabel,
            totalInstalls: payload["totalInstalls"] as? Int,
            skillCount: payload["skillCount"] as? Int,
            repoStars: payload["repoStars"] as? Int,
            forkCount: payload["forkCount"] as? Int,
            description: (payload["description"] as? String) ?? "",
            topics: uniqueSorted(payload["topics"] as? [String] ?? []),
            language: (payload["language"] as? String)?.nonEmpty,
            defaultBranch: (payload["defaultBranch"] as? String)?.nonEmpty,
            pushedAt: (payload["pushedAt"] as? String)?.nonEmpty,
            owner: owner,
            skills: parseSnapshotSkills(payload["skills"] as? [[String: Any]]),
            trust: parseSnapshotTrust(payload["trust"] as? [String: Any])
        )
    }

    private func parseSourceOwner(_ payload: [String: Any]?) -> SnapshotOwner? {
        guard let payload,
              let slug = (payload["slug"] as? String)?.nonEmpty,
              let sourceURL = (payload["sourceUrl"] as? String)?.nonEmpty else {
            return nil
        }

        return SnapshotOwner(
            slug: slug,
            sourceURL: sourceURL,
            githubURL: (payload["githubUrl"] as? String)?.nonEmpty,
            sourceCount: payload["sourceCount"] as? Int,
            skillCount: payload["skillCount"] as? Int,
            totalInstalls: payload["totalInstalls"] as? Int
        )
    }

    private func parseSnapshotSkills(_ payload: [[String: Any]]?) -> [SnapshotSkill] {
        (payload ?? []).compactMap { skill in
            guard let skillId = (skill["skillId"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty else {
                return nil
            }

            return SnapshotSkill(
                skillId: skillId,
                title: title,
                installs: skill["installs"] as? Int,
                weeklyInstalls: skill["weeklyInstalls"] as? Int,
                firstSeen: (skill["firstSeen"] as? String)?.nonEmpty,
                summary: (skill["summary"] as? String) ?? "",
                installedOn: parseSnapshotInstalledOn(skill["installedOn"] as? [[String: Any]]),
                audits: parseSnapshotAudits(skill["audits"] as? [String: Any])
            )
        }
    }

    private func parseSnapshotInstalledOn(_ payload: [[String: Any]]?) -> [SnapshotInstalledOn] {
        (payload ?? []).compactMap { item in
            guard let agent = (item["agent"] as? String)?.nonEmpty else {
                return nil
            }
            return SnapshotInstalledOn(agent: agent, installs: item["installs"] as? Int)
        }
    }

    private func parseSnapshotAudits(_ payload: [String: Any]?) -> SnapshotAudits? {
        guard let payload else {
            return nil
        }

        let audits = SnapshotAudits(
            gen: (payload["gen"] as? String)?.nonEmpty,
            socket: (payload["socket"] as? String)?.nonEmpty,
            snyk: (payload["snyk"] as? String)?.nonEmpty,
            riskLevel: (payload["riskLevel"] as? String)?.nonEmpty
        )

        return audits.gen != nil || audits.socket != nil || audits.snyk != nil || audits.riskLevel != nil
            ? audits
            : nil
    }

    private func parseSnapshotTrust(_ payload: [String: Any]?) -> SnapshotTrust? {
        guard let payload else {
            return nil
        }

        let trust = SnapshotTrust(
            official: payload["official"] as? Bool ?? false,
            trending: payload["trending"] as? Bool ?? false,
            hot: payload["hot"] as? Bool ?? false,
            audited: payload["audited"] as? Bool ?? false
        )
        return trust.labels.isEmpty ? nil : trust
    }

    private func applyImportPreviewPayload(
        _ payload: [String: Any],
        for groupId: String,
        fallbackLocator: String
    ) {
        guard let status = payload["status"] as? String else {
            setPreviewPhase(.failed(localizedText("import.error.invalid_preview_response")), for: groupId)
            return
        }

        if status != "ready" {
            setPreviewPhase(.failed(importReasonText(reasonCode: payload["reasonCode"] as? String)), for: groupId)
            return
        }

        let skillsPayload = payload["skills"] as? [[String: Any]] ?? []
        let targetsPayload = payload["targets"] as? [[String: Any]] ?? []
        let selectedSkillIds = Set(payload["selectedSkillIds"] as? [String] ?? [])
        let enabledTargets = Set(payload["enabledTargets"] as? [String] ?? [])
        let snapshot = parseSourceSnapshot(payload["snapshot"] as? [String: Any])

        let skills = skillsPayload.compactMap { skill -> ImportGroupSkill? in
            guard let id = (skill["id"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty
            else {
                return nil
            }
            return ImportGroupSkill(
                id: id,
                title: title,
                summary: (skill["summary"] as? String) ?? "",
                selectedByDefault: selectedSkillIds.contains(id)
            )
        }

        let targets = targetsPayload.compactMap { target -> ImportGroupTarget? in
            guard let id = (target["id"] as? String)?.nonEmpty else {
                return nil
            }
            return ImportGroupTarget(
                id: id,
                selectedByDefault: enabledTargets.contains(id)
            )
        }

        mutateImportGroup(groupId) { item in
            ImportGroupItem(
                id: item.id,
                title: snapshot?.title ?? item.title,
                locator: (payload["locator"] as? String)?.nonEmpty ?? fallbackLocator,
                canonicalRepo: item.canonicalRepo,
                isInstalledLocally: item.isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary.nonEmpty ?? snapshot?.description ?? "",
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                provider: item.provider,
                localImport: item.localImport,
                snapshot: snapshot ?? item.snapshot,
                enrichPhase: snapshot != nil ? .ready : item.enrichPhase,
                previewPhase: .ready,
                skills: skills,
                targets: targets
            )
        }
    }

    private func setPreviewPhase(_ phase: ImportLoadPhase, for groupId: String) {
        mutateImportGroup(groupId) { item in
            ImportGroupItem(
                id: item.id,
                title: item.title,
                locator: item.locator,
                canonicalRepo: item.canonicalRepo,
                isInstalledLocally: item.isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary,
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                provider: item.provider,
                localImport: item.localImport,
                snapshot: item.snapshot,
                enrichPhase: item.enrichPhase,
                previewPhase: phase,
                skills: item.skills,
                targets: item.targets
            )
        }
    }

    private func importGroupItem(id groupId: String) -> ImportGroupItem? {
        if let group = recommendedImportGroups.first(where: { $0.id == groupId }) {
            return group
        }
        if let group = localImportGroups.first(where: { $0.id == groupId }) {
            return group
        }
        return searchImportGroups.first(where: { $0.id == groupId })
    }

    private func mutateImportGroup(_ groupId: String, transform: (ImportGroupItem) -> ImportGroupItem) {
        if let index = recommendedImportGroups.firstIndex(where: { $0.id == groupId }) {
            recommendedImportGroups[index] = transform(recommendedImportGroups[index])
        }
        if let index = localImportGroups.firstIndex(where: { $0.id == groupId }) {
            localImportGroups[index] = transform(localImportGroups[index])
        }
        if let index = searchImportGroups.firstIndex(where: { $0.id == groupId }) {
            searchImportGroups[index] = transform(searchImportGroups[index])
        }
    }

    private func importReasonText(reasonCode: String?) -> PresentationText {
        switch reasonCode {
        case "provider_not_supported":
            return localizedText("import.reason.provider_not_supported")
        case "provider_data_unavailable":
            return localizedText("common.source_metadata.unavailable")
        case "provider_rate_limited":
            return localizedText("import.reason.provider_rate_limited")
        case "provider_response_invalid":
            return localizedText("import.reason.provider_response_invalid")
        case "NO_VALID_LEAFS":
            return localizedText("import.reason.no_valid_leafs")
        case "SOURCE_PATH_NOT_FOUND":
            return localizedText("import.reason.source_path_not_found")
        case "ADD_AGENT_NOT_AVAILABLE":
            return localizedText("import.reason.add_agent_not_available")
        default:
            return localizedText("import.reason.request_failed")
        }
    }

    private func importFailureToastText(reasonCode: String?) -> PresentationText {
        switch reasonCode {
        case "provider_not_supported":
            return localizedText("toast.import.failed.provider_not_supported")
        case "provider_data_unavailable":
            return localizedText("toast.import.failed.provider_data_unavailable")
        case "provider_rate_limited":
            return localizedText("toast.import.failed.provider_rate_limited")
        case "provider_response_invalid":
            return localizedText("toast.import.failed.provider_response_invalid")
        case "provider_request_failed":
            return localizedText("toast.import.failed.provider_request_failed")
        case "NO_VALID_LEAFS":
            return localizedText("toast.import.failed.no_valid_leafs")
        case "SOURCE_PATH_NOT_FOUND":
            return localizedText("toast.import.failed.source_path_not_found")
        case "ADD_AGENT_NOT_AVAILABLE":
            return localizedText("toast.import.failed.add_agent_not_available")
        case "IMPORT_PREPARE_FAILED", "IMPORT_PREVIEW_INVALID", "IMPORT_APPLY_FAILED":
            return localizedText("toast.import.failed.invalid_response")
        default:
            return localizedText("toast.import.failed.generic")
        }
    }

    func uninstallSelectedSource() async {
        guard let selectedSourceId else {
            showToast(style: .error, text: localizedText("toast.uninstall.no_group_selected"))
            return
        }
        await deleteSource(sourceId: selectedSourceId)
    }

    func deleteSource(sourceId: String) async {
        do {
            _ = try await bridgeClient.uninstall(sourceIds: [sourceId])
            if selectedSourceId == sourceId {
                selectedSourceId = nil
            }
            workingDrafts = workingDrafts.filter { $0.key.sourceId != sourceId }
            inspectedPayloadBySourceId = inspectedPayloadBySourceId.filter { $0.key.sourceId != sourceId }
            saveStateBySourceId = saveStateBySourceId.filter { $0.key.sourceId != sourceId }
            detailEnrichmentPayloadBySourceId.removeValue(forKey: sourceId)
            invalidatePreparedDetailContent(for: sourceId)
            detailWarmupTokensBySourceId.removeValue(forKey: sourceId)
            cancelDeferredDraftSync()
            await synchronizeState(refreshDoctor: true)

            if let first = sourceIds.first {
                await selectSource(first)
            } else {
                requestPage(.home)
            }
            if currentDetailSourceId == sourceId {
                requestPage(.home)
            }
            showToast(style: .success, text: localizedText("toast.uninstall.success", sourceId))
        } catch {
            showToast(style: .error, text: localizedText("toast.uninstall.failed", error.localizedDescription))
        }
    }

    func isTargetEnabled(_ target: String) -> Bool {
        guard let groupId = selectedGroupId, let draft = draft(for: groupId) else {
            return false
        }
        return draft.enabledTargets.contains(target)
    }

    func setTargetEnabled(
        _ target: String,
        enabled: Bool,
        sourceId: String? = nil,
        expectedCurrentEnabled: Bool? = nil
    ) async {
        guard let groupId = resolveSourceId(sourceId), var draft = draft(for: groupId) else {
            return
        }
        guard !isSaving(sourceId: groupId) else {
            return
        }

        let currentlyEnabled = draft.enabledTargets.contains(target)
        if let expectedCurrentEnabled, currentlyEnabled != expectedCurrentEnabled {
            return
        }
        guard currentlyEnabled != enabled else {
            return
        }

        if enabled {
            draft.enabledTargets = normalizedTargets(draft.enabledTargets + [target])
        } else {
            draft.enabledTargets.removeAll { $0 == target }
        }

        await commitDraftChange(
            sourceId: groupId,
            nextDraft: draft,
            successMessage: compactAgentToastMessage(sourceId: groupId, targetId: target, enabled: enabled),
            successStyle: enabled ? .success : .neutral
        )
    }

    private func parseBootstrapData(_ value: Any?) {
        guard let data = value as? [String: Any] else { return }

        applyCachedGroupCardEnrichment(data)
        applyPinnedSourceIds(data)
        applyProjectScopeState(data)
        applySummaries(parseSummariesPayload(data))

        if let availableTargets = data["availableTargets"] as? [String] {
            detectedTargets.formUnion(availableTargets)
        }

        if let initialDrafts = data["initialDrafts"] as? [String: Any] {
            for (sourceId, rawDraft) in initialDrafts {
                guard let draftObject = rawDraft as? [String: Any] else { continue }
                let selectedLeafIds = uniqueSorted(draftObject["selectedLeafIds"] as? [String] ?? [])
                let enabledTargets = normalizedTargets(draftObject["enabledTargets"] as? [String] ?? [])
                let draft = DraftState(selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
                workingDrafts[ScopedSourceKey(scope: .global, sourceId: sourceId)] = draft
            }
        }

        if let projectDrafts = data["projectDrafts"] as? [String: Any] {
            for (projectId, rawSourceDrafts) in projectDrafts {
                guard let sourceDrafts = rawSourceDrafts as? [String: Any] else { continue }
                for (sourceId, rawDraft) in sourceDrafts {
                    guard let draftObject = rawDraft as? [String: Any] else { continue }
                    let selectedLeafIds = uniqueSorted(draftObject["selectedLeafIds"] as? [String] ?? [])
                    let enabledTargets = normalizedTargets(draftObject["enabledTargets"] as? [String] ?? [])
                    let draft = DraftState(selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
                    workingDrafts[ScopedSourceKey(scope: .project(projectId), sourceId: sourceId)] = draft
                }
            }
        }

        if let audit = data["audit"] {
            doctorIssues = parseDoctorIssues(audit)
            lastDoctorError = nil
        }
    }

    private func prefetchRecommendedImportGroupsIfNeeded() async {
        seedRecommendedImportGroupsIfNeeded()
    }

    private func applyList(_ response: BridgeResponse) {
        if let data = response.data?.value as? [String: Any] {
            applyCachedGroupCardEnrichment(data)
            applyProjectScopeState(data)
        }
        applyPinnedSourceIds(response.data?.value)
        applySummaries(parseSummariesPayload(response.data?.value))
    }

    private func applyProjectScopeState(_ data: [String: Any]) {
        if data.keys.contains("selectedProjectScope"),
           let scope = parseProjectScopeSelection(data["selectedProjectScope"]) {
            cachedSelectedProjectScope = scope
            routeState?.settings.selectedProjectScope = scope
        }

        if data.keys.contains("recentProjects") {
            cachedRecentProjectScopes = parseRecentProjectScopes(data["recentProjects"])
            routeState?.settings.recentProjectScopes = cachedRecentProjectScopes
        }

        if data.keys.contains("customTargets") {
            let customAgents = parseCustomAgents(data["customTargets"])
            routeState?.settings.customAgents = customAgents
        }

        if data.keys.contains("agentDisplayOrder") {
            let order = (data["agentDisplayOrder"] as? [String]) ?? []
            let existingPreferences = routeState?.settings.agentDisplayPreferences ?? []
            let existingById = Dictionary(uniqueKeysWithValues: existingPreferences.map { ($0.targetId, $0) })
            let rebuilt = order.enumerated().map { index, targetId in
                AgentDisplayPreference(
                    targetId: targetId,
                    isVisible: existingById[targetId]?.isVisible ?? true,
                    sortOrder: index
                )
            }
            routeState?.settings.agentDisplayPreferences = AgentDisplayCatalog.normalize(
                rebuilt,
                customAgents: routeState?.settings.customAgents ?? []
            )
        }

        persistProjectScopeSettingsIfNeeded()
        projectScopeChangeToken &+= 1
    }

    private func applyCachedGroupCardEnrichment(_ data: [String: Any]) {
        guard let entries = data["groupCardEnrichmentBySourceId"] as? [String: Any] else {
            return
        }

        for (sourceId, rawValue) in entries {
            guard let payload = rawValue as? [String: Any] else {
                continue
            }

            let normalizedPayload = payloadWithRenameDisplayNameOverride(payload, sourceId: sourceId)
            var mergedPayload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
            if let sourceMetadata = normalizedPayload["sourceMetadata"] {
                mergedPayload["sourceMetadata"] = sourceMetadata
            }
            if let sourceSnapshot = normalizedPayload["sourceSnapshot"] {
                mergedPayload["sourceSnapshot"] = sourceSnapshot
            }
            if let groupPath = normalizedPayload["groupPath"] {
                mergedPayload["groupPath"] = groupPath
            }
            if !mergedPayload.isEmpty {
                detailEnrichmentPayloadBySourceId[sourceId] = mergedPayload
            }
        }
    }

    private func parseSummaries(_ response: BridgeResponse) -> [WorkflowSummary] {
        parseSummariesPayload(response.data?.value)
    }

    private func parseSummaryPayload(_ summary: [String: Any]) -> WorkflowSummary? {
        parseSummariesPayload(["summaries": [summary]]).first
    }

    private func parseSummariesPayload(_ value: Any?) -> [WorkflowSummary] {
        guard
            let data = value as? [String: Any],
            let summaries = data["summaries"] as? [[String: Any]]
        else {
            return []
        }

        return summaries.compactMap { summary in
            guard
                let source = summary["source"] as? [String: Any],
                let rawSourceId = source["id"] as? String
            else {
                return nil
            }
            let sourceId = rawSourceId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !sourceId.isEmpty else {
                return nil
            }

            let kind = source["kind"] as? String ?? "unknown"
            let rawSourceDisplayName = source["displayName"] as? String
            let rawSourceOriginalDisplayName = source["originalDisplayName"] as? String
            clearRenameDisplayNameOverrideIfConfirmed(sourceId: sourceId, displayName: rawSourceDisplayName)
            clearRenameOriginalDisplayNameOverrideIfConfirmed(sourceId: sourceId, originalDisplayName: rawSourceOriginalDisplayName)
            let parsedSourceDisplayName = Self.normalizedSummaryDisplayName(
                kind: kind,
                displayName: rawSourceDisplayName,
                originalDisplayName: rawSourceOriginalDisplayName,
                fallback: sourceId
            )
            let sourceDisplayName = renamedSourceDisplayNameOverridesBySourceId[sourceId]
                ?? parsedSourceDisplayName
            let sourceOriginalDisplayName = renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId]
                ?? rawSourceOriginalDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
                ?? sourceDisplayName
            let sourceLocator = source["locator"] as? String ?? ""
            let sourceCanonicalRepo = (source["canonicalRepo"] as? String)?.nonEmpty
                ?? (source["originLocator"] as? String)?.nonEmpty

            let lock = summary["lock"] as? [String: Any]
            let updatedAt = lock?["updatedAt"] as? String ?? "-"

            let leafs: [LeafSummary] = (summary["leafs"] as? [[String: Any]] ?? []).compactMap { leaf in
                guard let leafId = leaf["id"] as? String else {
                    return nil
                }
                return LeafSummary(
                    id: leafId,
                    sourceId: (leaf["sourceId"] as? String)?.nonEmpty,
                    linkName: leaf["linkName"] as? String ?? leafId,
                    name: leaf["name"] as? String ?? leafId,
                    description: leaf["description"] as? String ?? "",
                    sourceTitle: [
                        (leaf["sourceTitle"] as? String)?.nonEmpty,
                        (leaf["sourceLabel"] as? String)?.nonEmpty,
                        (leaf["sourceName"] as? String)?.nonEmpty,
                        (leaf["sourceDisplayName"] as? String)?.nonEmpty,
                    ].compactMap { $0 }.first,
                    metadataWarnings: leaf["metadataWarnings"] as? [String] ?? []
                )
            }

            let bindings = summary["bindings"] as? [String: Any] ?? [:]
            let selectedLeafIds = uniqueSorted(bindings["selectedLeafIds"] as? [String] ?? [])
            let targets = bindings["targets"] as? [String: Any] ?? [:]

            var enabledTargets: [String] = []
            var targetLeafIdsByTarget: [String: [String]] = [:]
            for (targetId, rawBinding) in targets {
                guard let binding = rawBinding as? [String: Any] else { continue }
                let leafIds = uniqueSorted(binding["leafIds"] as? [String] ?? [])
                targetLeafIdsByTarget[targetId] = leafIds
                if (binding["enabled"] as? Bool) == true {
                    enabledTargets.append(targetId)
                }
            }

            let issueCounts = summary["issueCounts"] as? [String: Int] ?? [:]
            let warningCount = issueCounts["warning"] ?? 0
            let errorCount = issueCounts["error"] ?? 0

            return WorkflowSummary(
                sourceId: sourceId,
                sourceKind: kind,
                sourceDisplayName: sourceDisplayName,
                sourceOriginalDisplayName: sourceOriginalDisplayName,
                sourceLocator: sourceLocator,
                sourceCanonicalRepo: sourceCanonicalRepo,
                leafs: leafs,
                selectedLeafIds: selectedLeafIds,
                enabledTargets: normalizedTargets(enabledTargets),
                targetLeafIdsByTarget: targetLeafIdsByTarget,
                health: summary["health"] as? String ?? "UNKNOWN",
                warningCount: warningCount,
                errorCount: errorCount,
                updatedAt: updatedAt
            )
        }
    }

    private func applySummaries(_ summaries: [WorkflowSummary]) {
        allSummaries = summaries
        sourceIds = summaries.map(\.sourceId)
        pruneStateMaps(allowedSourceIds: Set(sourceIds))
        refreshImportGroupInstalledState()

        if selectedSourceId == nil || !sourceIds.contains(selectedSourceId ?? "") {
            selectedSourceId = sourceIds.first
        }

        for summary in summaries {
            let serverDraft = buildInitialDraftFromSummary(summary)
            let key = ScopedSourceKey(scope: .global, sourceId: summary.sourceId)
            let savePhase = saveStateBySourceId[key]?.phase ?? .idle

            if savePhase == .saving {
                if workingDrafts[key] == nil {
                    workingDrafts[key] = serverDraft
                }
            } else {
                workingDrafts[key] = serverDraft
                if savePhase == .saved {
                    saveStateBySourceId[key] = SaveState(phase: .idle, detail: nil)
                }
            }

            detectedTargets.formUnion(summary.enabledTargets)
        }

    }

    private func refreshImportGroupInstalledState() {
        let installedLocators = Set(
            allSummaries.flatMap { summary in
                [summary.sourceCanonicalRepo, summary.sourceLocator]
                    .compactMap { $0 }
                    .map(Self.normalizedImportRecommendationKey)
            }
        )

        func update(_ item: ImportGroupItem) -> ImportGroupItem {
            let isInstalledLocally = installedLocators.contains(
                Self.normalizedImportRecommendationKey(item.canonicalRepo)
            )

            return ImportGroupItem(
                id: item.id,
                title: item.title,
                locator: item.locator,
                canonicalRepo: item.canonicalRepo,
                isInstalledLocally: isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary,
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                provider: item.provider,
                localImport: item.localImport,
                snapshot: item.snapshot,
                enrichPhase: item.enrichPhase,
                previewPhase: item.previewPhase,
                skills: item.skills,
                targets: item.targets
            )
        }

        recommendedImportGroups = recommendedImportGroups.map(update)
        localImportGroups = localImportGroups.map(update)
        searchImportGroups = searchImportGroups.map(update)
    }

    func requestPage(_ page: Page) {
        routeState?.view.currentRoute = Self.route(for: page)
    }

    static func route(for page: Page) -> DesktopRoute {
        switch page {
        case .home:
            return .home
        case .importPage:
            return .importPage
        case .settings:
            return .settings
        case .detail(let sourceId):
            return .detail(sourceId: sourceId)
        }
    }

    private func parseDoctorIssues(_ value: Any?) -> [DoctorIssueRow] {
        guard let data = value as? [String: Any] else { return [] }
        guard let issues = data["issues"] as? [[String: Any]] else { return [] }

        return issues.enumerated().map { index, issue in
            let severity = (issue["severity"] as? String) ?? "info"
            let code = (issue["code"] as? String) ?? "UNKNOWN"
            let message = (issue["message"] as? String) ?? "No message"
            let sourceId = (issue["sourceId"] as? String) ?? "-"
            let target = (issue["target"] as? String) ?? "-"

            return DoctorIssueRow(
                id: "\(severity)-\(code)-\(index)",
                severity: severity,
                code: code,
                message: message,
                sourceId: sourceId,
                target: target
            )
        }
    }

    private func buildInitialDraftFromSummary(_ summary: WorkflowSummary) -> DraftState {
        let selectedLeafIds: [String]
        if !summary.selectedLeafIds.isEmpty {
            selectedLeafIds = uniqueSorted(summary.selectedLeafIds)
        } else {
            let enabledTargetLeafIds = normalizedTargets(summary.enabledTargets).flatMap { target in
                summary.targetLeafIdsByTarget[target] ?? []
            }
            selectedLeafIds = uniqueSorted(enabledTargetLeafIds)
        }

        return DraftState(
            selectedLeafIds: selectedLeafIds,
            enabledTargets: normalizedTargets(summary.enabledTargets)
        )
    }

    static func preferredDetailGroupTitle(
        sourceId: String,
        displayName: String?,
        snapshotTitle: String?,
        locator: String
    ) -> String {
        if let displayName = sanitizedDetailTitle(displayName) {
            return displayName
        }

        if let snapshotTitle = snapshotTitle?.nonEmpty {
            return snapshotTitle
        }

        return detailTitleFallback(from: locator, sourceId: sourceId)
    }

    static func preferredDetailSkillTitle(
        preparedTitle: String?,
        payloadTitle: String?,
        projectedName: String?,
        snapshotTitle: String?,
        rawLeafName: String?,
        fallbackLinkName: String
    ) -> String {
        preparedTitle?.nonEmpty
            ?? payloadTitle?.nonEmpty
            ?? projectedName?.nonEmpty
            ?? snapshotTitle?.nonEmpty
            ?? sanitizedDetailTitle(rawLeafName)
            ?? fallbackLinkName
    }

    private func draft(for sourceId: String?) -> DraftState? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        guard let summary = summary(for: sourceId) else {
            return nil
        }

        let serverDraft = buildInitialDraftFromSummary(summary)
        guard let key = scopedSourceKey(sourceId: sourceId) else {
            return serverDraft
        }
        return workingDrafts[key] ?? serverDraft
    }

    private func visibleEnabledTargets(for sourceId: String, within targetIds: [String]) -> [String] {
        guard let draft = draft(for: sourceId) else {
            return []
        }
        let enabledTargets = Set(draft.enabledTargets)
        return targetIds.filter { enabledTargets.contains($0) }
    }

    private func summary(for sourceId: String?) -> WorkflowSummary? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        return allSummaries.first(where: { $0.sourceId == sourceId })
    }

    private func resolveSourceId(_ sourceId: String?) -> String? {
        let resolved = (sourceId ?? selectedGroupId)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let resolved, !resolved.isEmpty else {
            return nil
        }
        return resolved
    }

    private func visibleTargetIds() -> [String] {
        let preferences = AgentDisplayCatalog.normalize(
            routeState?.settings.agentDisplayPreferences ?? [],
            customAgents: routeState?.settings.customAgents ?? []
        )
        let visibleTargetIds = preferences
            .filter(\.isVisible)
            .map(\.targetId)
        let customTargetIds = Set((routeState?.settings.customAgents ?? []).map(\.id))

        if showAllTargets {
            return visibleTargetIds
        }

        return Array(
            visibleTargetIds
                .filter { detectedTargets.contains($0) || customTargetIds.contains($0) }
                .prefix(10)
        )
    }

    private func normalizedTargets(_ values: [String]) -> [String] {
        return AgentDisplayCatalog.orderedTargetIds(in: values, customAgents: routeState?.settings.customAgents ?? [])
    }

    private func normalizedUniqueValues(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var normalized: [String] = []

        for value in values {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else {
                continue
            }
            seen.insert(trimmed)
            normalized.append(trimmed)
        }

        return normalized
    }

    private func normalizeDraft(_ draft: DraftState) -> DraftState {
        DraftState(
            selectedLeafIds: uniqueSorted(draft.selectedLeafIds),
            enabledTargets: normalizedTargets(draft.enabledTargets)
        )
    }

    func detailViewData(for sourceId: String) -> DetailViewData? {
        guard let summary = summary(for: sourceId), let draft = draft(for: sourceId) else {
            return nil
        }

        let payload = mergedDetailPayload(for: sourceId)
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let summarySourcePayload = summaryPayload["source"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let sourceSnapshot = parseSourceSnapshot(payload["sourceSnapshot"] as? [String: Any])
        let deploymentsPayload = payload["deployments"] as? [[String: Any]] ?? []
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let preparedDetailContent = preparedDetailContentBySourceId[sourceId]

        let selectedLeafIds = Set(draft.selectedLeafIds)
        let enabledTargetLabels = draft.enabledTargets.map { AgentDisplayCatalog.label(for: $0, customAgents: routeState?.settings.customAgents ?? []) }
        let enabledTargets = Set(draft.enabledTargets)
        let inspectedLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let preferredLeafIds = inspectedLeafIds.isEmpty ? summary.leafs.map(\.id) : inspectedLeafIds
        let groupPath = preparedDetailContent?.groupPath ?? preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        let author = sourceSnapshot.map { "@\($0.owner.slug)" }
            ?? authorName(
                locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
                kind: summary.sourceKind
            )
        let originLabel = sourceSnapshot.flatMap { Self.displayOriginLabel(from: $0.sourceURL) }
            ?? Self.displayOriginLabel(from: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator)
        let groupStats = groupCardMetadata(sourceId: sourceId, summary: summary, row: SourceRow(
            id: summary.sourceId,
            displayName: summary.sourceDisplayName,
            locator: summary.sourceLocator,
            kind: summary.sourceKind,
            skillCount: summary.leafs.count,
            status: summary.health,
            lastUpdate: summary.updatedAt,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount
        )).stats
        let starCount = groupStats.starCount
        let projectedNamesByLeafId = projectionNameMap(for: sourceId)

        if preparedDetailContent == nil, !payload.isEmpty {
            scheduleDetailContentWarmupIfNeeded(sourceId: sourceId)
        }

        let skills: [DetailSkill] = preferredLeafIds.compactMap { leafId -> DetailSkill? in
            guard let leaf = summary.leafs.first(where: { $0.id == leafId }) else {
                return nil
            }
            let leafPayload = leafPayloads.first(where: { ($0["id"] as? String) == leafId }) ?? [:]
            let preparedSkill = preparedDetailContent?.skillsByLeafId[leafId]
            let skillFilePath = leafPayload["skillFilePath"] as? String
            let leafRelativePath = leafPayload["relativePath"] as? String
            let linkName = leafPayload["linkName"] as? String ?? leaf.linkName
            let snapshotSkill = sourceSnapshot?.skills.first(where: { $0.skillId == linkName })
            let projectedName = projectedNamesByLeafId[leaf.id]
            let title = Self.preferredDetailSkillTitle(
                preparedTitle: preparedSkill?.title,
                payloadTitle: leafPayload["title"] as? String,
                projectedName: projectedName,
                snapshotTitle: snapshotSkill?.title,
                rawLeafName: leaf.name,
                fallbackLinkName: linkName
            )

            return DetailSkill(
                id: leaf.id,
                title: title,
                summary: leaf.description.isEmpty ? linkName : leaf.description,
                version: preparedSkill?.version,
                author: author,
                originLabel: originLabel,
                starCount: starCount,
                folderPath: preparedSkill?.folderPath,
                relativeFolderPath: Self.projectedRelativeFolderPath(
                    preparedSkill?.relativeFolderPath ?? leafRelativePath,
                    projectedName: projectedName,
                    fallbackName: linkName
                ),
                documents: preparedSkill?.documents ?? [],
                detailLines: buildSkillDetailLines(
                    leafRelativePath: leafRelativePath,
                    skillFilePath: skillFilePath,
                    linkName: linkName,
                    snapshotSkill: snapshotSkill
                ),
                documentContent: preparedSkill?.documentContent ?? (leaf.description.isEmpty ? "Loading skill document..." : leaf.description),
                isEnabled: selectedLeafIds.contains(leaf.id),
                warningCount: leaf.metadataWarnings.count
            )
        }

        let sourceFacts = [
            sourcePayload["addedAt"] as? String,
            sourcePayload["originLocator"] as? String,
            sourcePayload["requestedPath"] as? String,
            sourcePayload["selectionMode"] as? String,
            lockPayload["checkoutPath"] as? String,
            lockPayload["commitSha"] as? String,
            lockPayload["resolvedVersion"] as? String,
        ]
        .compactMap { $0?.nonEmpty }

        let deploymentFacts = deploymentsPayload.prefix(4).compactMap { deployment -> String? in
            deploymentFact(from: deployment)
        }

        let targets = visibleTargetIds().map { targetId in
            DetailTarget(
                id: targetId,
                label: AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                shortLabel: AgentDisplayCatalog.shortLabel(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                isEnabled: enabledTargets.contains(targetId)
            )
        }

        let fileTree = preparedDetailContent?.fileTree ?? []
        let groupDocumentDescriptors = preparedDetailContent?.groupDocuments ?? []
        let originalDisplayName = (sourcePayload["originalDisplayName"] as? String)?.nonEmpty
            ?? (summarySourcePayload["originalDisplayName"] as? String)?.nonEmpty
            ?? summary.sourceOriginalDisplayName
        let title = Self.preferredDetailGroupTitle(
            sourceId: summary.sourceId,
            displayName: (sourcePayload["displayName"] as? String)?.nonEmpty
                ?? (summarySourcePayload["displayName"] as? String)?.nonEmpty
                ?? summary.sourceDisplayName,
            snapshotTitle: sourceSnapshot?.title,
            locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator
        )
        let subtitle = (sourcePayload["kind"] as? String)?.nonEmpty ?? summary.sourceKind
        let locator = (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator
        let updatedAt = (lockPayload["updatedAt"] as? String)?.nonEmpty ?? summary.updatedAt
        let updatedRelative = relativeUpdateLabel(updatedAt)
        let revision = Self.detailRevision(
            sourceId: summary.sourceId,
            title: title,
            originalDisplayName: originalDisplayName,
            subtitle: subtitle,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
            groupStats: groupStats,
            sourceDetailLines: [],
            sourceRepositoryURL: groupStats.githubURL,
            locator: locator,
            groupPath: groupPath,
            updatedAt: updatedAt,
            updatedRelative: updatedRelative,
            health: summary.health,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount,
            enabledSkillCount: draft.selectedLeafIds.count,
            totalSkillCount: skills.count,
            enabledTargetCount: draft.enabledTargets.count,
            saveState: saveState(for: sourceId),
            skillSelection: skillSelectionState(sourceId: sourceId),
            targetSelection: targetSelectionState(sourceId: sourceId),
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: groupDocumentDescriptors,
            targets: targets,
            skills: skills
        )

        return DetailViewData(
            sourceId: summary.sourceId,
            revision: revision,
            title: title,
            originalDisplayName: originalDisplayName,
            subtitle: subtitle,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
            groupStats: groupStats,
            sourceDetailLines: [],
            sourceRepositoryURL: groupStats.githubURL,
            locator: locator,
            groupPath: groupPath,
            updatedAt: updatedAt,
            updatedRelative: updatedRelative,
            health: summary.health,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount,
            enabledSkillCount: draft.selectedLeafIds.count,
            totalSkillCount: skills.count,
            enabledTargetCount: draft.enabledTargets.count,
            saveState: saveState(for: sourceId),
            skillSelection: skillSelectionState(sourceId: sourceId),
            targetSelection: targetSelectionState(sourceId: sourceId),
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: Self.placeholderDocumentTabs(groupDocumentDescriptors),
            targets: targets,
            skills: skills
        )
    }

    func detailSnapshot(for sourceId: String) -> DetailViewModel.Snapshot? {
        guard let detail = detailViewData(for: sourceId) else {
            return nil
        }
        return DetailViewModel.Snapshot(detail: detail)
    }

    func groupDocument(for sourceId: String, documentId: String) async -> DocumentTab? {
        let prepared = preparedDetailContentBySourceId[sourceId]
        if prepared == nil {
            _ = detailSnapshot(for: sourceId)
        }

        guard let preparedContent = preparedDetailContentBySourceId[sourceId]
        else {
            return nil
        }

        if let descriptor = preparedContent.groupDocuments.first(where: { $0.id == documentId }) {
            if descriptor.id == "group:filetree" {
                return DocumentTab(
                    id: descriptor.id,
                    title: descriptor.title,
                    path: descriptor.path,
                    metadata: descriptor.metadata,
                    content: Self.renderFileTree(preparedContent.fileTree),
                    renderCacheKey: descriptor.renderCacheKey,
                    externalURL: descriptor.externalURL
                )
            }

            return await loadedDocumentTab(from: descriptor)
        }

        guard let placeholder = preparedContent.skillsByLeafId.values
            .flatMap(\.documents)
            .first(where: { $0.id == documentId })
        else {
            return nil
        }

        if !placeholder.content.isEmpty || !placeholder.isMarkdown {
            return placeholder
        }

        return await loadedDocumentTab(from: Self.documentDescriptor(for: placeholder))
    }

    private func loadedDocumentTab(from descriptor: DocumentDescriptor) async -> DocumentTab? {
        do {
            let loaded = try await detailDocumentStore.document(for: descriptor)
            return DocumentTab(
                id: loaded.id,
                title: descriptor.title,
                path: descriptor.path,
                metadata: loaded.metadata,
                content: loaded.content,
                renderCacheKey: loaded.renderCacheKey,
                externalURL: descriptor.externalURL
            )
        } catch {
            return DocumentTab(
                id: descriptor.id,
                title: descriptor.title,
                path: descriptor.path,
                metadata: [],
                content: Self.documentLoadFailureContent,
                renderCacheKey: descriptor.renderCacheKey,
                externalURL: descriptor.externalURL
            )
        }
    }

    func hasInspectPayload(for sourceId: String) -> Bool {
        guard let key = scopedSourceKey(sourceId: sourceId) else {
            return false
        }
        return inspectedPayloadBySourceId[key] != nil
    }

    func isInspectRequestInFlight(for sourceId: String) -> Bool {
        guard let key = scopedSourceKey(sourceId: sourceId) else {
            return false
        }
        return inspectRequestTasksBySourceId[key] != nil
    }

    private func mergedDetailPayload(for sourceId: String) -> [String: Any] {
        let key = scopedSourceKey(sourceId: sourceId)
        var payload = key.flatMap { inspectedPayloadBySourceId[$0] } ?? [:]
        let enrichmentPayload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
        for (key, value) in enrichmentPayload {
            payload[key] = value
        }
        return payload
    }

    private func scheduleDetailEnrichmentFetch(sourceId: String, force: Bool = false) {
        if !force, detailEnrichmentTasksBySourceId[sourceId] != nil {
            return
        }
        if force {
            detailEnrichmentTasksBySourceId[sourceId]?.cancel()
            detailEnrichmentTasksBySourceId.removeValue(forKey: sourceId)
        }

        detailEnrichmentTokenSeed &+= 1
        let token = detailEnrichmentTokenSeed
        detailEnrichmentTokensBySourceId[sourceId] = token

        let task = Task { @MainActor [weak self, sourceId] in
            guard let self else { return }
            do {
                let response = try await self.bridgeClient.inspectEnrichment(sourceId: sourceId)
                guard !Task.isCancelled else { return }

                if let payload = response.data?.value as? [String: Any],
                   self.detailEnrichmentTokensBySourceId[sourceId] == token
                {
                    let normalizedPayload: [String: Any]
                    if let summary = self.summary(for: sourceId) {
                        let displayName = self.renamedSourceDisplayNameOverridesBySourceId[sourceId]
                            ?? summary.sourceDisplayName
                        let originalDisplayName = self.renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId]
                            ?? summary.sourceOriginalDisplayName
                        normalizedPayload = self.enrichmentPayloadWithDisplayName(
                            payload,
                            displayName: displayName,
                            originalDisplayName: originalDisplayName
                        )
                    } else {
                        normalizedPayload = payload
                    }
                    self.detailEnrichmentPayloadBySourceId[sourceId] = normalizedPayload
                }
                if self.detailEnrichmentTokensBySourceId[sourceId] == token {
                    self.latestWarnings = response.warnings
                    self.detailEnrichmentTasksBySourceId.removeValue(forKey: sourceId)
                    self.detailEnrichmentTokensBySourceId.removeValue(forKey: sourceId)
                }
            } catch {
                if self.detailEnrichmentTokensBySourceId[sourceId] == token {
                    self.detailEnrichmentTasksBySourceId.removeValue(forKey: sourceId)
                    self.detailEnrichmentTokensBySourceId.removeValue(forKey: sourceId)
                }
            }
        }

        detailEnrichmentTasksBySourceId[sourceId] = task
    }

    private func scheduleDetailContentWarmupIfNeeded(sourceId: String) {
        guard detailWarmupTasksBySourceId[sourceId] == nil else {
            return
        }
        guard let summary = summary(for: sourceId),
              let key = scopedSourceKey(sourceId: sourceId),
              let payload = inspectedPayloadBySourceId[key],
              !payload.isEmpty
        else {
            return
        }
        let input = buildPreparedDetailWarmupInput(sourceId: sourceId, summary: summary, payload: payload)
        let token: UInt64
        if let currentToken = detailWarmupTokensBySourceId[sourceId] {
            token = currentToken
        } else {
            detailWarmupTokenSeed &+= 1
            token = detailWarmupTokenSeed
            detailWarmupTokensBySourceId[sourceId] = token
        }

        var task: Task<Void, Never>?
        task = Task { [weak self, sourceId, input] in
            guard let self else { return }
            let delay = await MainActor.run { self.detailWarmupDelay }
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }

            let prepared = await Task.detached {
                Self.prepareDetailContent(input: input)
            }.value

            await MainActor.run {
                guard self.detailWarmupTasksBySourceId[sourceId] == task else { return }
                defer {
                    self.detailWarmupTasksBySourceId.removeValue(forKey: sourceId)
                }
                guard !Task.isCancelled,
                      self.detailWarmupTokensBySourceId[sourceId] == token
                else {
                    return
                }
                self.preparedDetailContentBySourceId[sourceId] = prepared
            }
        }
        detailWarmupTasksBySourceId[sourceId] = task
    }

    private func invalidatePreparedDetailContent(for sourceId: String) {
        preparedDetailContentBySourceId.removeValue(forKey: sourceId)
        detailWarmupTasksBySourceId[sourceId]?.cancel()
        detailWarmupTasksBySourceId.removeValue(forKey: sourceId)
        detailWarmupTokenSeed &+= 1
        detailWarmupTokensBySourceId[sourceId] = detailWarmupTokenSeed
    }

    private func buildPreparedDetailWarmupInput(
        sourceId: String,
        summary: WorkflowSummary,
        payload: [String: Any]
    ) -> PreparedDetailWarmupInput {
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let sourceSnapshot = parseSourceSnapshot(payload["sourceSnapshot"] as? [String: Any])
        let preferredLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String }).isEmpty
            ? summary.leafs.map(\.id)
            : uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let groupPath = preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        let gitHubRepoContext = gitHubRepoContext(
            locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
            lockPayload: lockPayload
        )
        let projectedNamesByLeafId = projectionNameMap(for: sourceId)
        let leaves = preferredLeafIds.compactMap { leafId -> PreparedDetailLeafInput? in
            guard let leaf = summary.leafs.first(where: { $0.id == leafId }) else {
                return nil
            }

            let leafPayload = leafPayloads.first(where: { ($0["id"] as? String) == leafId }) ?? [:]
            return PreparedDetailLeafInput(
                id: leaf.id,
                linkName: leafPayload["linkName"] as? String ?? leaf.linkName,
                name: leaf.name,
                description: leaf.description,
                warningCount: leaf.metadataWarnings.count,
                skillFilePath: leafPayload["skillFilePath"] as? String,
                relativePath: leafPayload["relativePath"] as? String,
                absolutePath: (leafPayload["absolutePath"] as? String)?.nonEmpty,
                title: (leafPayload["title"] as? String)?.nonEmpty
            )
        }

        return PreparedDetailWarmupInput(
            summary: summary,
            sourceLocator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
            sourceSnapshot: sourceSnapshot,
            groupPath: groupPath,
            gitHubRepoContext: gitHubRepoContext,
            projectedNamesByLeafId: projectedNamesByLeafId,
            leaves: leaves
        )
    }

    nonisolated private static func prepareDetailContent(input: PreparedDetailWarmupInput) -> PreparedDetailContent {
        var skillsByLeafId: [String: PreparedDetailSkillContent] = [:]
        var lightweightSkills: [DetailSkill] = []

        for leaf in input.leaves {
            let folderPath = leaf.absolutePath
                ?? leaf.skillFilePath.flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty }
            let documents = leaf.skillFilePath.map { path in
                documentPlaceholderTabs(
                    for: path,
                    groupPath: input.groupPath,
                    gitHubRepoContext: input.gitHubRepoContext
                )
            } ?? [
                DocumentTab(
                    id: "inline-skill-md:\(leaf.id)",
                    title: "SKILL.md",
                    path: "SKILL.md",
                    metadata: [],
                    content: leaf.description,
                    renderCacheKey: "inline-skill-md:\(leaf.id):\(leaf.description.hashValue)",
                    externalURL: nil
                )
            ]
            let projectedName = input.projectedNamesByLeafId[leaf.id]
            let title = folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
                ?? leaf.title
                ?? leaf.name.nonEmpty
                ?? leaf.linkName
            let relativeFolderPath = input.groupPath.flatMap { basePath in
                folderPath.flatMap { relativePath(from: basePath, to: $0) }
            } ?? leaf.relativePath
            let documentContent = leaf.skillFilePath.flatMap(loadDetailDocumentBody) ?? leaf.description

            skillsByLeafId[leaf.id] = PreparedDetailSkillContent(
                title: title,
                version: nil,
                folderPath: folderPath,
                relativeFolderPath: relativeFolderPath,
                documents: documents,
                documentContent: documentContent
            )

            lightweightSkills.append(
                DetailSkill(
                    id: leaf.id,
                    title: title,
                    summary: leaf.description.isEmpty ? leaf.linkName : leaf.description,
                    version: nil,
                    author: input.sourceSnapshot.map { "@\($0.owner.slug)" }
                        ?? authorHandle(from: input.sourceLocator)
                        ?? "@\(input.summary.sourceKind.lowercased())",
                    originLabel: input.sourceSnapshot.map { displayOriginLabel(from: $0.sourceURL) }
                        ?? displayOriginLabel(from: input.sourceLocator),
                    starCount: input.sourceSnapshot?.repoStars,
                    folderPath: folderPath,
                    relativeFolderPath: projectedRelativeFolderPath(
                        relativeFolderPath,
                        projectedName: projectedName,
                        fallbackName: leaf.linkName
                    ),
                    documents: documents,
                    detailLines: [],
                    documentContent: documentContent,
                    isEnabled: false,
                    warningCount: leaf.warningCount
                )
            )
        }

        let fileTree = buildFileTreeItems(groupPath: input.groupPath, skills: lightweightSkills)
        let groupDocuments = groupDocumentDescriptors(
            groupPath: input.groupPath,
            gitHubRepoContext: input.gitHubRepoContext
        )

        return PreparedDetailContent(
            groupPath: input.groupPath,
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            skillsByLeafId: skillsByLeafId
        )
    }

    func dismissToast(id: ToastState.ID? = nil) {
        guard let id else {
            toast = nil
            return
        }
        guard toast?.id == id else {
            return
        }
        toast = nil
    }

    func presentToast(style: ToastStyle = .neutral, message: String) {
        showToast(style: style, message: message)
    }

    private func commitDraftChange(
        sourceId: String,
        nextDraft: DraftState,
        successMessage: PresentationText,
        successStyle: ToastStyle
    ) async {
        let sourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sourceId.isEmpty else {
            showToast(style: .error, text: localizedText("toast.save.no_source_id"))
            return
        }

        let normalizedDraft = normalizeDraft(nextDraft)
        let currentDraft = normalizeDraft(draft(for: sourceId) ?? normalizedDraft)
        guard currentDraft != normalizedDraft else {
            return
        }
        guard let key = scopedSourceKey(sourceId: sourceId) else {
            return
        }

        let previousDraft = currentDraft
        let saveStartedAt = ContinuousClock.now
        selectedSourceId = sourceId
        workingDrafts[key] = normalizedDraft
        saveStateBySourceId[key] = SaveState(phase: .saving, detail: nil)

        do {
            let response = try await commandFacade.apply(
                sourceId: sourceId,
                scope: key.scope,
                selectedLeafIds: normalizedDraft.selectedLeafIds,
                enabledTargets: normalizedDraft.enabledTargets
            )
            await ensureMinimumSaveLoadingDuration(since: saveStartedAt)
            workingDrafts[key] = normalizedDraft
            saveStateBySourceId[key] = SaveState(phase: .saved, detail: nil)
            applyPostApplyResponse(response, sourceId: sourceId, scope: key.scope)
            scheduleSaveStateReset(for: key)
            latestWarnings = response.warnings
            healthStatus = response.warnings.isEmpty ? .healthy : .warnings
            showToast(style: successStyle, text: successMessage)
        } catch {
            let firstReason = firstErrorLine(from: error)
            await ensureMinimumSaveLoadingDuration(since: saveStartedAt)
            applyProjectScopeStateIfAvailable(from: error)
            workingDrafts[key] = previousDraft
            saveStateBySourceId[key] = SaveState(phase: .failed, detail: firstReason)
            showToast(style: .error, text: localizedText("toast.save.failed", firstReason))
        }
    }

    private func ensureMinimumSaveLoadingDuration(since start: ContinuousClock.Instant) async {
        let minimum = Self.minimumSaveLoadingDuration
        let elapsed = start.duration(to: ContinuousClock.now)
        guard elapsed < minimum else {
            return
        }
        try? await Task.sleep(for: minimum - elapsed)
    }

    private func fetchListResponse() async throws -> BridgeResponse {
        if let existingTask = listRequestTask {
            return try await existingTask.value
        }

        listRequestToken &+= 1
        let token = listRequestToken
        let task = Task { try await queryFacade.list() }
        listRequestTask = task
        activeListRequestToken = token

        do {
            let response = try await task.value
            if activeListRequestToken == token {
                listRequestTask = nil
                activeListRequestToken = nil
            }
            return response
        } catch {
            if activeListRequestToken == token {
                listRequestTask = nil
                activeListRequestToken = nil
            }
            throw error
        }
    }

    private func fetchDoctorResponse() async throws -> BridgeResponse {
        if let existingTask = doctorRequestTask {
            return try await existingTask.value
        }

        doctorRequestToken &+= 1
        let token = doctorRequestToken
        let task = Task { try await bridgeClient.doctor() }
        doctorRequestTask = task
        activeDoctorRequestToken = token

        do {
            let response = try await task.value
            if activeDoctorRequestToken == token {
                doctorRequestTask = nil
                activeDoctorRequestToken = nil
            }
            return response
        } catch {
            if activeDoctorRequestToken == token {
                doctorRequestTask = nil
                activeDoctorRequestToken = nil
            }
            throw error
        }
    }

    private func fetchInspectResponse(sourceId: String) async throws -> BridgeResponse {
        guard let key = scopedSourceKey(sourceId: sourceId) else {
            throw BridgeClientError.invalidResponse
        }

        if let existingTask = inspectRequestTasksBySourceId[key] {
            return try await existingTask.value
        }

        inspectRequestTokenSeed &+= 1
        let token = inspectRequestTokenSeed
        let task = Task { try await queryFacade.inspect(sourceId: sourceId, scope: key.scope) }
        inspectRequestTasksBySourceId[key] = task
        inspectRequestTokensBySourceId[key] = token

        do {
            let response = try await task.value
            if inspectRequestTokensBySourceId[key] == token {
                inspectRequestTasksBySourceId.removeValue(forKey: key)
                inspectRequestTokensBySourceId.removeValue(forKey: key)
            }
            return response
        } catch {
            if inspectRequestTokensBySourceId[key] == token {
                inspectRequestTasksBySourceId.removeValue(forKey: key)
                inspectRequestTokensBySourceId.removeValue(forKey: key)
            }
            throw error
        }
    }

    private func fetchImportSearchResponse(query: String?) async throws -> BridgeResponse {
        let normalizedQuery = query?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? "__recommended__"

        if let existingTask = importSearchTasksByQuery[normalizedQuery] {
            return try await existingTask.value
        }

        importSearchTokenSeed &+= 1
        let token = importSearchTokenSeed
        let task = Task { try await bridgeClient.searchImportGroups(query: query) }
        importSearchTasksByQuery[normalizedQuery] = task
        importSearchTokensByQuery[normalizedQuery] = token

        do {
            let response = try await task.value
            if importSearchTokensByQuery[normalizedQuery] == token {
                importSearchTasksByQuery.removeValue(forKey: normalizedQuery)
                importSearchTokensByQuery.removeValue(forKey: normalizedQuery)
            }
            return response
        } catch {
            if importSearchTokensByQuery[normalizedQuery] == token {
                importSearchTasksByQuery.removeValue(forKey: normalizedQuery)
                importSearchTokensByQuery.removeValue(forKey: normalizedQuery)
            }
            throw error
        }
    }

    private func fetchImportPreviewResponse(
        groupId: String,
        locator: String
    ) async throws -> BridgeResponse {
        if let existingTask = importPreviewTasksByGroupId[groupId] {
            return try await existingTask.value
        }

        importPreviewTokenSeed &+= 1
        let token = importPreviewTokenSeed
        let task = Task { try await bridgeClient.previewImportSource(locator: locator) }
        importPreviewTasksByGroupId[groupId] = task
        importPreviewTokensByGroupId[groupId] = token

        do {
            let response = try await task.value
            if importPreviewTokensByGroupId[groupId] == token {
                importPreviewTasksByGroupId.removeValue(forKey: groupId)
                importPreviewTokensByGroupId.removeValue(forKey: groupId)
            }
            return response
        } catch {
            if importPreviewTokensByGroupId[groupId] == token {
                importPreviewTasksByGroupId.removeValue(forKey: groupId)
                importPreviewTokensByGroupId.removeValue(forKey: groupId)
            }
            throw error
        }
    }

    private func synchronizeState(
        refreshDoctor: Bool,
        inspectSourceId: String? = nil
    ) async {
        await refreshList()
        if refreshDoctor {
            await runDoctor()
        }

        guard let inspectSourceId = inspectSourceId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !inspectSourceId.isEmpty,
              sourceIds.contains(inspectSourceId)
        else {
            return
        }

        await selectSource(inspectSourceId)
    }

    private func cancelDeferredDraftSync() {
        // Deferred full-list refresh after apply was removed once apply began
        // returning fresh summary and inspect payloads directly.
    }

    private func applyPostApplyResponse(_ response: BridgeResponse, sourceId: String, scope: ProjectScopeSelection) {
        guard let data = response.data?.value as? [String: Any] else {
            return
        }
        applyProjectScopeState(data)

        if let summaryPayload = data["summary"] as? [String: Any],
           let summary = parseSummaryPayload(summaryPayload) {
            if scope == .global {
                replaceSummary(summary)
            } else {
                workingDrafts[ScopedSourceKey(scope: scope, sourceId: sourceId)] = buildInitialDraftFromSummary(summary)
            }
            saveStateBySourceId[ScopedSourceKey(scope: scope, sourceId: sourceId)] = SaveState(phase: .saved, detail: nil)
        }

        if let inspectPayload = data["inspect"] as? [String: Any] {
            inspectedPayloadBySourceId[ScopedSourceKey(scope: scope, sourceId: sourceId)] = payloadWithRenameDisplayNameOverride(
                inspectPayload,
                sourceId: sourceId
            )
            invalidatePreparedDetailContent(for: sourceId)
            scheduleDetailContentWarmupIfNeeded(sourceId: sourceId)
            scheduleDetailEnrichmentFetch(sourceId: sourceId, force: true)
        }
    }

    private func ensureProjectDraftsInitializedIfNeeded(for scope: ProjectScopeSelection) -> Bool {
        guard case .project(let projectId) = scope else {
            return false
        }

        var didInitialize = false
        for summary in allSummaries {
            let key = ScopedSourceKey(scope: .project(projectId), sourceId: summary.sourceId)
            guard workingDrafts[key] == nil else {
                continue
            }

            workingDrafts[key] = DraftState(
                selectedLeafIds: summary.leafs.map(\.id),
                enabledTargets: []
            )
            saveStateBySourceId[key] = SaveState(phase: .idle, detail: nil)
            didInitialize = true
        }

        return didInitialize
    }

    private func replaceSummary(_ summary: WorkflowSummary) {
        var nextSummaries = allSummaries
        if let existingIndex = nextSummaries.firstIndex(where: { $0.sourceId == summary.sourceId }) {
            nextSummaries[existingIndex] = summary
        } else {
            nextSummaries.append(summary)
        }
        applySummaries(nextSummaries)
    }

    private func applyRenamedSource(sourceId: String, displayName: String, originalDisplayName: String) {
        renamedSourceDisplayNameOverridesBySourceId[sourceId] = displayName
        renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId] = originalDisplayName
        guard let existing = summary(for: sourceId) else {
            updateCachedDetailDisplayName(
                sourceId: sourceId,
                displayName: displayName,
                originalDisplayName: originalDisplayName
            )
            return
        }

        replaceSummary(existing.renamed(displayName: displayName, originalDisplayName: originalDisplayName))
        updateCachedDetailDisplayName(
            sourceId: sourceId,
            displayName: displayName,
            originalDisplayName: originalDisplayName
        )
    }

    private func updateCachedDetailDisplayName(sourceId: String, displayName: String, originalDisplayName: String) {
        for key in inspectedPayloadBySourceId.keys where key.sourceId == sourceId {
            inspectedPayloadBySourceId[key] = payloadWithDisplayName(
                inspectedPayloadBySourceId[key] ?? [:],
                sourceId: sourceId,
                displayName: displayName,
                originalDisplayName: originalDisplayName
            )
        }

        if let payload = detailEnrichmentPayloadBySourceId[sourceId] {
            detailEnrichmentPayloadBySourceId[sourceId] = enrichmentPayloadWithDisplayName(
                payload,
                displayName: displayName,
                originalDisplayName: originalDisplayName
            )
        }
    }

    private func payloadWithRenameDisplayNameOverride(_ payload: [String: Any], sourceId: String) -> [String: Any] {
        clearRenameDisplayNameOverrideIfConfirmed(sourceId: sourceId, payload: payload)
        guard let displayName = renamedSourceDisplayNameOverridesBySourceId[sourceId] else {
            return payload
        }
        let originalDisplayName = renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId] ?? displayName
        return payloadWithDisplayName(
            payload,
            sourceId: sourceId,
            displayName: displayName,
            originalDisplayName: originalDisplayName
        )
    }

    private func clearRenameDisplayNameOverrideIfConfirmed(sourceId: String, payload: [String: Any]) {
        let sourceDisplayName = (payload["source"] as? [String: Any])?["displayName"] as? String
        let summarySourceDisplayName = ((payload["summary"] as? [String: Any])?["source"] as? [String: Any])?["displayName"] as? String

        clearRenameDisplayNameOverrideIfConfirmed(sourceId: sourceId, displayName: sourceDisplayName)
        clearRenameDisplayNameOverrideIfConfirmed(sourceId: sourceId, displayName: summarySourceDisplayName)

        let sourceOriginalDisplayName = (payload["source"] as? [String: Any])?["originalDisplayName"] as? String
        let summarySourceOriginalDisplayName = ((payload["summary"] as? [String: Any])?["source"] as? [String: Any])?["originalDisplayName"] as? String
        clearRenameOriginalDisplayNameOverrideIfConfirmed(sourceId: sourceId, originalDisplayName: sourceOriginalDisplayName)
        clearRenameOriginalDisplayNameOverrideIfConfirmed(sourceId: sourceId, originalDisplayName: summarySourceOriginalDisplayName)
    }

    private func clearRenameDisplayNameOverrideIfConfirmed(sourceId: String, displayName: String?) {
        guard let override = renamedSourceDisplayNameOverridesBySourceId[sourceId],
              let displayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines),
              !displayName.isEmpty,
              displayName == override else {
            return
        }
        renamedSourceDisplayNameOverridesBySourceId.removeValue(forKey: sourceId)
    }

    private func clearRenameOriginalDisplayNameOverrideIfConfirmed(sourceId: String, originalDisplayName: String?) {
        guard let override = renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId],
              let originalDisplayName = originalDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines),
              !originalDisplayName.isEmpty,
              originalDisplayName == override else {
            return
        }
        renamedSourceOriginalDisplayNameOverridesBySourceId.removeValue(forKey: sourceId)
    }

    private func payloadWithDisplayName(
        _ payload: [String: Any],
        sourceId: String,
        displayName: String,
        originalDisplayName: String
    ) -> [String: Any] {
        var nextPayload = payload

        var sourcePayload = nextPayload["source"] as? [String: Any] ?? [:]
        sourcePayload["id"] = sourcePayload["id"] ?? sourceId
        sourcePayload["displayName"] = displayName
        sourcePayload["originalDisplayName"] = originalDisplayName
        nextPayload["source"] = sourcePayload

        if var summaryPayload = nextPayload["summary"] as? [String: Any] {
            var summarySourcePayload = summaryPayload["source"] as? [String: Any] ?? [:]
            summarySourcePayload["id"] = summarySourcePayload["id"] ?? sourceId
            summarySourcePayload["displayName"] = displayName
            summarySourcePayload["originalDisplayName"] = originalDisplayName
            summaryPayload["source"] = summarySourcePayload
            nextPayload["summary"] = summaryPayload
        }

        if var sourceSnapshotPayload = nextPayload["sourceSnapshot"] as? [String: Any] {
            sourceSnapshotPayload["title"] = displayName
            nextPayload["sourceSnapshot"] = sourceSnapshotPayload
        }

        return nextPayload
    }

    private func enrichmentPayloadWithDisplayName(
        _ payload: [String: Any],
        displayName: String,
        originalDisplayName: String
    ) -> [String: Any] {
        var nextPayload = payload

        if var sourcePayload = nextPayload["source"] as? [String: Any] {
            if sourcePayload.keys.contains("displayName") {
                sourcePayload["displayName"] = displayName
            }
            if sourcePayload.keys.contains("originalDisplayName") {
                sourcePayload["originalDisplayName"] = originalDisplayName
            }
            nextPayload["source"] = sourcePayload
        }

        if var summaryPayload = nextPayload["summary"] as? [String: Any],
           var summarySourcePayload = summaryPayload["source"] as? [String: Any] {
            if summarySourcePayload.keys.contains("displayName") {
                summarySourcePayload["displayName"] = displayName
            }
            if summarySourcePayload.keys.contains("originalDisplayName") {
                summarySourcePayload["originalDisplayName"] = originalDisplayName
            }
            summaryPayload["source"] = summarySourcePayload
            nextPayload["summary"] = summaryPayload
        }

        if var sourceSnapshotPayload = nextPayload["sourceSnapshot"] as? [String: Any] {
            sourceSnapshotPayload["title"] = displayName
            nextPayload["sourceSnapshot"] = sourceSnapshotPayload
        }

        return nextPayload
    }

    private func scheduleSaveStateReset(for key: ScopedSourceKey) {
        saveStateResetTasksBySourceId[key]?.cancel()
        saveStateResetTasksBySourceId[key] = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            if saveStateBySourceId[key]?.phase == .saved {
                saveStateBySourceId[key] = SaveState(phase: .idle, detail: nil)
            }
            saveStateResetTasksBySourceId.removeValue(forKey: key)
        }
    }

    private func updateSummaryMessage(from value: Any?, fallbackCount: Int) -> String {
        guard let payload = value as? [String: Any] else {
            return fallbackCount == 1
                ? localized("toast.update.summary.single")
                : localized("toast.update.summary.multiple", String(fallbackCount))
        }
        let items = payload["updated"] as? [[String: Any]] ?? []
        if items.isEmpty {
            return fallbackCount == 1
                ? localized("toast.update.summary.single")
                : localized("toast.update.summary.multiple", String(fallbackCount))
        }

        var changedCount = 0
        var upToDateCount = 0
        var reviewCount = 0

        for item in items {
            let changed = item["changed"] as? Bool ?? false
            let invalidatedLeafCount = (item["invalidatedLeafIds"] as? [String])?.count ?? 0
            let addedLeafCount = (item["addedLeafIds"] as? [String])?.count ?? 0
            let removedLeafCount = (item["removedLeafIds"] as? [String])?.count ?? 0

            if invalidatedLeafCount > 0 {
                reviewCount += 1
            } else if changed || addedLeafCount > 0 || removedLeafCount > 0 {
                changedCount += 1
            } else {
                upToDateCount += 1
            }
        }

        var parts: [String] = []
        if changedCount > 0 {
            parts.append(localized("toast.update.summary.updated_count", String(changedCount)))
        }
        if upToDateCount > 0 {
            parts.append(localized("toast.update.summary.up_to_date_count", String(upToDateCount)))
        }
        if reviewCount > 0 {
            parts.append(localized("toast.update.summary.needs_review_count", String(reviewCount)))
        }

        guard !parts.isEmpty else {
            return items.count == 1
                ? localized("toast.update.summary.single")
                : localized("toast.update.summary.multiple", String(items.count))
        }

        return parts.joined(separator: " · ")
    }

    private func groupLabel(for sourceId: String) -> String {
        summary(for: sourceId)?.sourceDisplayName ?? sourceId
    }

    private func leafLabel(for leafId: String, sourceId: String) -> String {
        summary(for: sourceId)?.leafs.first(where: { $0.id == leafId })?.name ?? leafId
    }

    private func targetLabel(for targetId: String) -> String {
        AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? [])
    }

    private func compactSkillToastMessage(sourceId: String, leafId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.skill",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId),
            leafLabel(for: leafId, sourceId: sourceId)
        )
    }

    private func compactSkillsToastMessage(sourceId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.skills",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId)
        )
    }

    private func compactAgentToastMessage(sourceId: String, targetId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.agent",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId),
            targetLabel(for: targetId)
        )
    }

    private func compactAgentsToastMessage(sourceId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.agents",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId)
        )
    }

    private func showToast(style: ToastStyle, message: String) {
        toast = ToastState(style: style, message: message)
    }

    private func showToast(style: ToastStyle, text: PresentationText) {
        toast = ToastState(style: style, text: text)
    }

    private func showBridgeCommandFailure(_ response: BridgeResponse) {
        let error = BridgeClientError.commandFailed(bridgeCommandFailureMessage(from: response), response: response)
        showToast(style: .error, message: firstErrorLine(from: error))
    }

    private func bridgeCommandFailureMessage(from response: BridgeResponse) -> String {
        if !response.errors.isEmpty {
            return response.errors.map(\.message).joined(separator: "\n")
        }

        return localized("bridge.error.command_failed_default")
    }

    private func localizedText(_ key: String, _ arguments: String...) -> PresentationText {
        .localized(key, arguments)
    }

    private func localized(_ key: String, _ arguments: String...) -> String {
        PresentationText.localized(key, arguments).resolve(locale: Self.presentationLocale)
    }

    private func applyPinnedSourceIds(_ value: Any?) {
        guard
            let data = value as? [String: Any],
            let pinnedSourceIds = data["pinnedSourceIds"] as? [String]
        else {
            return
        }

        self.pinnedSourceIds = normalizedPinnedSourceIds(pinnedSourceIds)
    }

    private func sourceMetadataPresentation(
        from payload: [String: Any],
        sourceSnapshot: SourceSnapshotData?
    ) -> SourceMetadataPresentation {
        guard
            let sourceMetadata = payload["sourceMetadata"] as? [String: Any],
            let status = (sourceMetadata["status"] as? String)?.nonEmpty
        else {
            if let sourceSnapshot {
                return SourceMetadataPresentation(
                    lines: buildSnapshotSourceDetailLines(sourceSnapshot: sourceSnapshot),
                    starCount: sourceSnapshot.repoStars,
                    repositoryURL: sourceSnapshot.repoURL
                )
            }
            let legacySourceStats = payload["sourceStats"] as? [String: Any] ?? [:]
            return SourceMetadataPresentation(
                lines: buildReadySourceDetailLines(sourceStatsPayload: legacySourceStats),
                starCount: legacySourceStats["starCount"] as? Int,
                repositoryURL: (legacySourceStats["repoUrl"] as? String)?.nonEmpty
            )
        }

        if let sourceSnapshot {
            var lines = buildSnapshotSourceDetailLines(sourceSnapshot: sourceSnapshot)
            if status != "ready" {
                lines.append("Refresh: \(sourceMetadataExplanation(status: status, reasonCode: (sourceMetadata["reasonCode"] as? String)?.nonEmpty))")
            }
            return SourceMetadataPresentation(
                lines: lines,
                starCount: sourceSnapshot.repoStars,
                repositoryURL: sourceSnapshot.repoURL
            )
        }

        if status == "ready", let data = sourceMetadata["data"] as? [String: Any] {
            return SourceMetadataPresentation(
                lines: buildReadySourceDetailLines(sourceStatsPayload: data),
                starCount: data["starCount"] as? Int,
                repositoryURL: (data["repoUrl"] as? String)?.nonEmpty
            )
        }

        return SourceMetadataPresentation(
            lines: buildSourceMetadataStatusLines(
                status: status,
                provider: (sourceMetadata["provider"] as? String)?.nonEmpty,
                reasonCode: (sourceMetadata["reasonCode"] as? String)?.nonEmpty
            ),
            starCount: nil,
            repositoryURL: nil
        )
    }

    private func buildSkillDetailLines(
        leafRelativePath: String?,
        skillFilePath: String?,
        linkName: String,
        snapshotSkill: SnapshotSkill?
    ) -> [String] {
        var lines = [
            leafRelativePath,
            skillFilePath,
            "Link name: \(linkName)"
        ].compactMap { $0?.nonEmpty }

        if let installs = snapshotSkill?.installs {
            lines.append("Installs: \(formattedCount(installs))")
        }
        if let weeklyInstalls = snapshotSkill?.weeklyInstalls {
            lines.append("Weekly installs: \(formattedCount(weeklyInstalls))")
        }
        if let firstSeen = snapshotSkill?.firstSeen {
            lines.append("First seen: \(firstSeen)")
        }
        if let snapshotSkill, !snapshotSkill.installedOn.isEmpty {
            let installs = snapshotSkill.installedOn.map { item in
                if let installs = item.installs {
                    return "\(item.agent) \(formattedCount(installs))"
                }
                return item.agent
            }
            lines.append("Installed on: \(installs.joined(separator: ", "))")
        }
        if let audits = snapshotSkill?.audits {
            let auditParts = [
                audits.gen.map { "Gen \($0)" },
                audits.socket.map { "Socket \($0)" },
                audits.snyk.map { "Snyk \($0)" },
                audits.riskLevel.map { "Risk \($0)" }
            ].compactMap { $0 }
            if !auditParts.isEmpty {
                lines.append("Audit: \(auditParts.joined(separator: " · "))")
            }
        }

        return lines
    }

    private func normalizedPinnedSourceIds(_ sourceIds: [String]) -> [String] {
        var seen = Set<String>()
        var normalized: [String] = []

        for sourceId in sourceIds {
            let trimmed = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else {
                continue
            }
            seen.insert(trimmed)
            normalized.append(trimmed)
        }

        return normalized
    }

    private func toggledPinnedSourceIds(from sourceIds: [String], sourceId: String) -> [String] {
        if let index = sourceIds.firstIndex(of: sourceId) {
            var next = sourceIds
            next.remove(at: index)
            return next
        }

        return sourceIds + [sourceId]
    }

    private func migrateLegacyPinnedSourceIdsIfNeeded() async {
        guard !UserDefaults.standard.bool(forKey: pinnedSourceIdsMigrationKey) else {
            return
        }

        let legacyPinnedSourceIds = normalizedPinnedSourceIds(
            UserDefaults.standard.stringArray(forKey: legacyPinnedSourceIdsKey) ?? []
        )

        guard pinnedSourceIds.isEmpty, !legacyPinnedSourceIds.isEmpty else {
            completePinnedSourceIdsMigration()
            return
        }

        let eligiblePinnedSourceIds = legacyPinnedSourceIds.filter { sourceIds.contains($0) }
        guard !eligiblePinnedSourceIds.isEmpty else {
            completePinnedSourceIdsMigration()
            return
        }

        let previousPinnedSourceIds = pinnedSourceIds
        var migratedSourceIds: [String] = []

        do {
            for sourceId in eligiblePinnedSourceIds {
                let response = try await bridgeClient.togglePinnedSource(sourceId: sourceId)
                applyPinnedSourceIds(response.data?.value)
                migratedSourceIds.append(sourceId)
            }
            completePinnedSourceIdsMigration()
        } catch {
            for migratedSourceId in migratedSourceIds.reversed() {
                _ = try? await bridgeClient.togglePinnedSource(sourceId: migratedSourceId)
            }
            pinnedSourceIds = previousPinnedSourceIds
            showToast(style: .error, text: localizedText("toast.pinned_migration.failed", firstErrorLine(from: error)))
        }
    }

    private func completePinnedSourceIdsMigration() {
        UserDefaults.standard.set(true, forKey: pinnedSourceIdsMigrationKey)
        UserDefaults.standard.removeObject(forKey: legacyPinnedSourceIdsKey)
    }

    private func firstErrorLine(from error: Error) -> String {
        error.localizedDescription
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty }) ?? error.localizedDescription
    }

    private func applyProjectScopeStateIfAvailable(from error: Error) {
        guard let bridgeError = error as? BridgeClientError,
              case .commandFailed(_, let response) = bridgeError,
              let data = response?.data?.value as? [String: Any] else {
            return
        }

        applyProjectScopeState(data)
    }

    nonisolated static func localizedWarmup(_ key: String, _ arguments: String...) -> String {
        PresentationText.localized(key, arguments).resolve(locale: presentationLocale)
    }

    nonisolated private static func authorHandle(from locator: String) -> String? {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let patterns = [
            #"github\.com/([^/\s]+)/"#,
            #"git@github\.com:([^/\s]+)/"#,
            #"clawhub/([^/\s]+)/"#,
        ]

        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let nsRange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
                if let match = regex.firstMatch(in: trimmed, range: nsRange),
                   match.numberOfRanges > 1,
                   let range = Range(match.range(at: 1), in: trimmed)
                {
                    return "@\(trimmed[range])"
                }
            }
        }

        let normalized = trimmed
            .replacingOccurrences(of: ".git", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if normalized.contains("/") {
            let components = normalized.split(separator: "/")
            if components.count >= 2 {
                return "@\(components[components.count - 2])"
            }
        }

        return nil
    }

    nonisolated private static func documentPlaceholderTabs(
        for skillFilePath: String,
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?
    ) -> [DocumentTab] {
        var tabs: [DocumentTab] = [
            placeholderDocumentTab(
                id: skillFilePath,
                title: "SKILL.md",
                path: skillFilePath
            )
        ]

        let folderPath = (skillFilePath as NSString).deletingLastPathComponent
        let referencesPath = (folderPath as NSString).appendingPathComponent("references")
        if let entries = try? FileManager.default.contentsOfDirectory(atPath: referencesPath) {
            for entry in entries.sorted() where entry.lowercased().hasSuffix(".md") {
                let fullPath = (referencesPath as NSString).appendingPathComponent(entry)
                tabs.append(
                    placeholderDocumentTab(
                        id: fullPath,
                        title: "references/\(entry)",
                        path: fullPath
                    )
                )
            }
        }

        return enrichDocumentTabs(
            tabs,
            groupPath: groupPath,
            gitHubRepoContext: gitHubRepoContext
        )
    }

    nonisolated private static func placeholderDocumentTab(
        id: String,
        title: String,
        path: String
    ) -> DocumentTab {
        return DocumentTab(
            id: id,
            title: title,
            path: path,
            metadata: [],
            content: "",
            renderCacheKey: documentRenderCacheKey(path: path),
            externalURL: nil,
            isLoaded: false
        )
    }

    nonisolated private static func loadDetailDocumentBody(path: String) -> String? {
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }
        let parsed = parseDetailDocument(raw)
        return parsed.body.isEmpty ? nil : parsed.body
    }

    nonisolated static func parseDetailDocument(_ content: String) -> (metadata: [MetadataEntry], body: String) {
        let parsed = parseDocument(content)
        return (metadata: parsed.metadata, body: parsed.body)
    }

    nonisolated private static func parseDocument(_ content: String) -> ParsedDocument {
        let lines = content.components(separatedBy: .newlines)
        guard lines.first?.trimmingCharacters(in: .whitespacesAndNewlines) == "---" else {
            return ParsedDocument(frontMatter: nil, metadata: [], body: content.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        guard let closingIndex = lines.dropFirst().firstIndex(where: {
            $0.trimmingCharacters(in: .whitespacesAndNewlines) == "---"
        }) else {
            return ParsedDocument(frontMatter: nil, metadata: [], body: content.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        let frontMatterText = Array(lines[1..<closingIndex]).joined(separator: "\n")
        let metadata = parseFrontmatterEntries(frontMatterText)
        let frontMatter = parseFrontMatter(frontMatterText)
        let bodyLines = closingIndex + 1 < lines.count ? Array(lines[(closingIndex + 1)...]) : []
        let body = bodyLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return ParsedDocument(frontMatter: frontMatter, metadata: metadata, body: body)
    }

    nonisolated private static func parseFrontMatter(_ frontMatterText: String) -> SkillFrontMatter? {
        try? YAMLDecoder().decode(SkillFrontMatter.self, from: frontMatterText)
    }

    nonisolated private static func parseFrontmatterEntries(_ frontMatterText: String) -> [MetadataEntry] {
        guard let dictionary = (try? Yams.load(yaml: frontMatterText)) as? [String: Any] else {
            return []
        }

        return dictionary.keys.sorted().compactMap { key in
            guard let value = dictionary[key] else {
                return nil
            }

            let renderedValue = stringifyMetadataValue(value)
            return MetadataEntry(id: "\(key):\(renderedValue)", key: key, value: renderedValue)
        }
    }

    nonisolated private static func stringifyMetadataValue(_ value: Any) -> String {
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        case let values as [Any]:
            return values.map(stringifyMetadataValue).joined(separator: ", ")
        case let dictionary as [String: Any]:
            return dictionary.keys.sorted()
                .map { "\($0): \(stringifyMetadataValue(dictionary[$0] as Any))" }
                .joined(separator: ", ")
        default:
            return String(describing: value)
        }
    }

    nonisolated private static func groupDocumentDescriptors(
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?
    ) -> [DocumentDescriptor] {
        var descriptors: [DocumentDescriptor] = [
            DocumentDescriptor(
                id: "group:filetree",
                title: localizedWarmup("detail.document.file_tree"),
                path: groupPath ?? ".",
                metadata: [],
                renderCacheKey: "group:filetree:\(groupPath ?? ".")",
                externalURL: nil
            )
        ]

        guard let groupPath,
              let entries = try? FileManager.default.contentsOfDirectory(atPath: groupPath)
        else {
            return descriptors
        }

        let markdownFiles = entries
            .filter { $0.lowercased().hasSuffix(".md") }
            .sorted { compareRootDocumentNames($0, $1) }

        for entry in markdownFiles {
            let fullPath = (groupPath as NSString).appendingPathComponent(entry)
            descriptors.append(
                DocumentDescriptor(
                    id: "group:\(fullPath)",
                    title: entry,
                    path: fullPath,
                    metadata: [],
                    renderCacheKey: documentRenderCacheKey(path: fullPath),
                    externalURL: nil
                )
            )
        }

        return enrichDocumentDescriptors(descriptors, groupPath: groupPath, gitHubRepoContext: gitHubRepoContext)
    }

    nonisolated private static func compareRootDocumentNames(_ lhs: String, _ rhs: String) -> Bool {
        let leftRank = rootDocumentRank(lhs)
        let rightRank = rootDocumentRank(rhs)
        if leftRank != rightRank {
            return leftRank < rightRank
        }
        return lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
    }

    nonisolated private static func rootDocumentRank(_ name: String) -> Int {
        let uppercased = name.uppercased()
        if uppercased == "README.MD" {
            return 0
        }
        if uppercased.contains("README") {
            return 1
        }
        if uppercased.contains("CHANGELOG")
            || uppercased.contains("LICENSE")
            || uppercased.contains("PLAN")
            || uppercased.contains("DESIGN")
            || uppercased.contains("RELEASE")
        {
            return 2
        }
        return 3
    }

    nonisolated private static func relativePath(from basePath: String, to targetPath: String) -> String? {
        let standardizedBase = URL(fileURLWithPath: basePath).standardizedFileURL.path
        let standardizedTarget = URL(fileURLWithPath: targetPath).standardizedFileURL.path
        guard standardizedTarget.hasPrefix(standardizedBase) else {
            return nil
        }
        let suffix = String(standardizedTarget.dropFirst(standardizedBase.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return suffix.isEmpty ? "." : suffix
    }

    private func deploymentFact(from deployment: [String: Any]) -> String? {
        guard let target = deployment["target"] as? String,
              let status = deployment["status"] as? String
        else {
            return nil
        }

        if let projectPath = currentProjectPath(),
           let targetPath = (deployment["targetPath"] as? String)?.nonEmpty,
           let relativeTargetPath = Self.relativePath(from: projectPath, to: targetPath)
        {
            return "\(AgentDisplayCatalog.label(for: target, customAgents: routeState?.settings.customAgents ?? [])) · \(status) · \(relativeTargetPath)"
        }

        let leafId = (deployment["leafId"] as? String)?.nonEmpty ?? "unknown"
        return "\(AgentDisplayCatalog.label(for: target, customAgents: routeState?.settings.customAgents ?? [])) · \(status) · \(leafId)"
    }

    private func currentProjectPath() -> String? {
        guard case .project(let projectId) = currentProjectScope() else {
            return nil
        }

        return recentProjectScopes.first(where: { $0.projectId == projectId })?.projectPath
    }

    nonisolated private static func projectedRelativeFolderPath(
        _ relativeFolderPath: String?,
        projectedName: String?,
        fallbackName: String
    ) -> String? {
        guard let relativeFolderPath, let projectedName, projectedName != fallbackName else {
            return relativeFolderPath
        }

        let trimmed = relativeFolderPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty, trimmed != "." else {
            return projectedName
        }

        var components = trimmed.split(separator: "/").map(String.init)
        components[components.count - 1] = projectedName
        return components.joined(separator: "/")
    }

    nonisolated private static func buildFileTreeItems(groupPath: String?, skills: [DetailSkill]) -> [FileTreeItem] {
        let rootName = groupPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty } ?? "."
        let skillReferences = fileTreeSkillReferences(skills: skills, groupPath: groupPath)

        guard let groupPath else {
            return buildSyntheticFileTreeItems(rootName: rootName, skills: skillReferences)
        }

        let standardizedRootPath = URL(fileURLWithPath: groupPath).standardizedFileURL.path
        guard FileManager.default.fileExists(atPath: standardizedRootPath),
              let rootItem = buildFileTreeItem(
                  at: standardizedRootPath,
                  rootDisplayTitle: rootName,
                  skillReferencesByPath: Dictionary(uniqueKeysWithValues: skillReferences.map { ($0.folderPath, $0) })
              )
        else {
            return buildSyntheticFileTreeItems(rootName: rootName, skills: skillReferences)
        }

        return [rootItem]
    }

    nonisolated private static func fileTreeSkillReferences(
        skills: [DetailSkill],
        groupPath: String?
    ) -> [FileTreeSkillReference] {
        skills.compactMap { skill in
            let displayTitle = skill.relativeFolderPath?
                .split(separator: "/")
                .last
                .map(String.init)
                ?? skill.folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
                ?? skill.title.nonEmpty

            guard let displayTitle else {
                return nil
            }

            let folderPath: String?
            if let absoluteFolderPath = skill.folderPath?.nonEmpty {
                folderPath = URL(fileURLWithPath: absoluteFolderPath).standardizedFileURL.path
            } else if let groupPath, let relativeFolderPath = skill.relativeFolderPath?.nonEmpty {
                folderPath = URL(fileURLWithPath: groupPath)
                    .appendingPathComponent(relativeFolderPath)
                    .standardizedFileURL
                    .path
            } else {
                folderPath = nil
            }

            guard let folderPath else {
                return nil
            }

            return FileTreeSkillReference(
                skillId: skill.id,
                folderPath: folderPath,
                displayTitle: displayTitle
            )
        }
    }

    nonisolated private static func buildFileTreeItem(
        at path: String,
        rootDisplayTitle: String? = nil,
        skillReferencesByPath: [String: FileTreeSkillReference]
    ) -> FileTreeItem? {
        let standardizedPath = URL(fileURLWithPath: path).standardizedFileURL.path
        let url = URL(fileURLWithPath: standardizedPath)
        let values = try? url.resourceValues(forKeys: [.isDirectoryKey])
        let isDirectory = values?.isDirectory ?? false
        let skillReference = skillReferencesByPath[standardizedPath]
        let skillRootPaths = Set(skillReferencesByPath.keys)
        let title = rootDisplayTitle
            ?? skillReference?.displayTitle
            ?? url.lastPathComponent.nonEmpty
            ?? standardizedPath

        let children: [FileTreeItem]
        if isDirectory,
           let entries = try? FileManager.default.contentsOfDirectory(
               at: url,
               includingPropertiesForKeys: [.isDirectoryKey],
               options: [.skipsHiddenFiles]
           ) {
            children = entries
                .compactMap { entry in
                    buildFileTreeItem(
                        at: entry.path,
                        skillReferencesByPath: skillReferencesByPath
                    )
                }
                .filter { item in
                    shouldIncludeFileTreeItem(
                        item,
                        parentPath: standardizedPath,
                        currentSkillReference: skillReference,
                        rootPath: rootDisplayTitle == nil ? nil : standardizedPath,
                        skillRootPaths: skillRootPaths
                    )
                }
                .sorted { lhs, rhs in
                    sortFileTreeItems(
                        lhs,
                        rhs,
                        isRootLevel: rootDisplayTitle != nil
                    )
                }
        } else {
            children = []
        }

        let isSkillDocument = !isDirectory
            && url.lastPathComponent.caseInsensitiveCompare("SKILL.md") == .orderedSame
            && skillReferencesByPath[(url.deletingLastPathComponent().path)] != nil

        return FileTreeItem(
            id: standardizedPath,
            title: title,
            path: standardizedPath,
            isDirectory: isDirectory,
            isSkillRoot: skillReference != nil,
            isSkillDocument: isSkillDocument,
            skillId: skillReference?.skillId
                ?? (isSkillDocument ? skillReferencesByPath[url.deletingLastPathComponent().path]?.skillId : nil),
            children: children
        )
    }

    nonisolated private static func shouldIncludeFileTreeItem(
        _ item: FileTreeItem,
        parentPath: String,
        currentSkillReference: FileTreeSkillReference?,
        rootPath: String?,
        skillRootPaths: Set<String>
    ) -> Bool {
        let isRootLevel = rootPath == parentPath

        if item.isDirectory {
            return containsSkillRootDescendant(item.path, skillRootPaths: skillRootPaths)
        }

        if isRootLevel {
            return item.title.lowercased().hasSuffix(".md")
        }

        if currentSkillReference != nil {
            return true
        }

        return false
    }

    nonisolated private static func containsSkillRootDescendant(
        _ path: String,
        skillRootPaths: Set<String>
    ) -> Bool {
        let normalizedPath = URL(fileURLWithPath: path).standardizedFileURL.path
        if skillRootPaths.contains(normalizedPath) {
            return true
        }
        let prefix = normalizedPath.hasSuffix("/") ? normalizedPath : normalizedPath + "/"
        return skillRootPaths.contains(where: { $0.hasPrefix(prefix) })
    }

    nonisolated private static func buildSyntheticFileTreeItems(
        rootName: String,
        skills: [FileTreeSkillReference]
    ) -> [FileTreeItem] {
        var root = FileTreeNode(name: rootName)

        for skill in skills {
            let components = skill.displayTitle.split(separator: "/").map(String.init)
            insertFileTreePath(components, into: &root)
        }

        return [
            fileTreeItems(from: root, parentPath: rootName, skillReferencesByPath: Dictionary(uniqueKeysWithValues: skills.map { ($0.folderPath, $0) }))
        ]
    }

    nonisolated private static func insertFileTreePath(_ components: [String], into node: inout FileTreeNode) {
        guard let head = components.first else {
            return
        }

        var child = node.children[head] ?? FileTreeNode(name: head)
        child.isFile = components.count == 1
        if components.count > 1 {
            insertFileTreePath(Array(components.dropFirst()), into: &child)
        }
        node.children[head] = child
    }

    nonisolated private static func fileTreeItems(
        from node: FileTreeNode,
        parentPath: String,
        skillReferencesByPath _: [String: FileTreeSkillReference]
    ) -> FileTreeItem {
        let itemPath = parentPath
        let children = node.children.values
            .sorted { lhs, rhs in
                if lhs.isFile != rhs.isFile {
                    return !lhs.isFile && rhs.isFile
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            .map { child in
                fileTreeItems(
                    from: child,
                    parentPath: "\(parentPath)/\(child.name)",
                    skillReferencesByPath: [:]
                )
            }
        return FileTreeItem(
            id: itemPath,
            title: node.name,
            path: itemPath,
            isDirectory: !node.isFile,
            isSkillRoot: false,
            isSkillDocument: false,
            skillId: nil,
            children: children
        )
    }

    nonisolated private static func sortFileTreeItems(_ lhs: FileTreeItem, _ rhs: FileTreeItem, isRootLevel: Bool) -> Bool {
        if lhs.isDirectory != rhs.isDirectory {
            return lhs.isDirectory && !rhs.isDirectory
        }
        if isRootLevel, !lhs.isDirectory, !rhs.isDirectory {
            return compareRootDocumentNames(lhs.title, rhs.title)
        }
        return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
    }

    nonisolated private static func renderFileTree(_ items: [FileTreeItem]) -> String {
        renderFileTreeLines(items).map { "\($0.prefix)\($0.title)" }.joined(separator: "\n")
    }

    nonisolated private static func renderFileTreeLines(_ items: [FileTreeItem]) -> [FileTreeLine] {
        var lines: [FileTreeLine] = []
        for (index, item) in items.enumerated() {
            lines.append(
                FileTreeLine(
                    id: item.id,
                    depth: 0,
                    prefix: "",
                    title: item.title,
                    isFile: !item.isDirectory
                )
            )
            appendRenderedFileTreeLines(
                from: item.children,
                depth: 1,
                ancestry: [index == items.count - 1],
                into: &lines
            )
        }
        return lines
    }

    nonisolated private static func appendRenderedFileTreeLines(
        from items: [FileTreeItem],
        depth: Int,
        ancestry: [Bool],
        into lines: inout [FileTreeLine]
    ) {
        for (index, item) in items.enumerated() {
            let isLast = index == items.count - 1
            let branch = ancestry.dropLast().map { $0 ? "    " : "|   " }.joined() + (isLast ? "`-- " : "|-- ")
            lines.append(
                FileTreeLine(
                    id: item.id,
                    depth: depth,
                    prefix: branch,
                    title: item.title,
                    isFile: !item.isDirectory
                )
            )
            appendRenderedFileTreeLines(
                from: item.children,
                depth: depth + 1,
                ancestry: ancestry + [isLast],
                into: &lines
            )
        }
    }

    nonisolated private static func enrichDocumentTabs(
        _ tabs: [DocumentTab],
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?
    ) -> [DocumentTab] {
        tabs.map { document in
            DocumentTab(
                id: document.id,
                title: document.title,
                path: document.path,
                metadata: document.metadata,
                content: document.content,
                renderCacheKey: document.renderCacheKey,
                externalURL: gitHubDocumentURL(
                    path: document.path,
                    groupPath: groupPath,
                    gitHubRepoContext: gitHubRepoContext
                ),
                isLoaded: document.isLoaded
            )
        }
    }

    nonisolated private static func enrichDocumentDescriptors(
        _ descriptors: [DocumentDescriptor],
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?
    ) -> [DocumentDescriptor] {
        descriptors.map { document in
            DocumentDescriptor(
                id: document.id,
                title: document.title,
                path: document.path,
                metadata: document.metadata,
                renderCacheKey: document.renderCacheKey,
                externalURL: gitHubDocumentURL(
                    path: document.path,
                    groupPath: groupPath,
                    gitHubRepoContext: gitHubRepoContext
                )
            )
        }
    }

    nonisolated private static func gitHubDocumentURL(
        path: String,
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?
    ) -> String? {
        guard let groupPath,
              let gitHubRepoContext,
              let relativePath = relativePath(from: groupPath, to: path),
              relativePath != "."
        else {
            return nil
        }

        let normalizedPath = relativePath
            .split(separator: "/")
            .map(String.init)
            .joined(separator: "/")
        return "https://github.com/\(gitHubRepoContext.owner)/\(gitHubRepoContext.repo)/blob/\(gitHubRepoContext.revision)/\(normalizedPath)"
    }

    nonisolated private static func displayOriginLabel(from locator: String) -> String {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return localizedWarmup("detail.meta.unknown_source")
        }

        if let url = URL(string: trimmed), let host = url.host?.nonEmpty {
            return host
        }

        if trimmed.contains("github.com") {
            return "github.com"
        }

        return trimmed
    }

    private func preferredGroupPath(lockPayload: [String: Any], leafPayloads: [[String: Any]]) -> String? {
        if let checkoutPath = (lockPayload["checkoutPath"] as? String)?.nonEmpty {
            return checkoutPath
        }

        let folderPaths = leafPayloads.compactMap {
            (($0["absolutePath"] as? String)?.nonEmpty)
                ?? (($0["skillFilePath"] as? String).flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty })
        }
        return commonDirectoryPath(paths: folderPaths)
    }

    private func commonDirectoryPath(paths: [String]) -> String? {
        guard var components = paths.first?.split(separator: "/").map(String.init), !components.isEmpty else {
            return nil
        }

        for path in paths.dropFirst() {
            let current = path.split(separator: "/").map(String.init)
            var index = 0
            while index < min(components.count, current.count), components[index] == current[index] {
                index += 1
            }
            components = Array(components.prefix(index))
            if components.isEmpty {
                return "/"
            }
        }

        return "/" + components.joined(separator: "/")
    }

    private func gitHubRepoContext(locator: String, lockPayload: [String: Any]) -> GitHubRepoContext? {
        guard let repo = parseGitHubRepo(locator) else {
            return nil
        }
        let revision = (lockPayload["commitSha"] as? String)?.nonEmpty
            ?? (lockPayload["resolvedVersion"] as? String)?.nonEmpty
            ?? "HEAD"
        return GitHubRepoContext(owner: repo.owner, repo: repo.repo, revision: revision)
    }

    private func parseGitHubRepo(_ locator: String) -> (owner: String, repo: String)? {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let patterns = [
            #"^https?://github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?(?:/)?$"#,
            #"^git@github\.com:([^/\s]+)/([^/\s]+?)(?:\.git)?$"#
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
                continue
            }
            let nsRange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
            guard let match = regex.firstMatch(in: trimmed, options: [], range: nsRange),
                  match.numberOfRanges == 3,
                  let ownerRange = Range(match.range(at: 1), in: trimmed),
                  let repoRange = Range(match.range(at: 2), in: trimmed)
            else {
                continue
            }
            return (String(trimmed[ownerRange]), String(trimmed[repoRange]))
        }

        return nil
    }

    nonisolated static func documentDescriptors(_ tabs: [DocumentTab]) -> [DocumentDescriptor] {
        tabs.map { tab in
            DocumentDescriptor(
                id: tab.id,
                title: tab.title,
                path: tab.path,
                metadata: tab.metadata,
                renderCacheKey: tab.renderCacheKey,
                externalURL: tab.externalURL
            )
        }
    }

    nonisolated static func documentDescriptor(for tab: DocumentTab) -> DocumentDescriptor {
        DocumentDescriptor(
            id: tab.id,
            title: tab.title,
            path: tab.path,
            metadata: tab.metadata,
            renderCacheKey: tab.renderCacheKey,
            externalURL: tab.externalURL
        )
    }

    nonisolated static func placeholderDocumentTabs(_ descriptors: [DocumentDescriptor]) -> [DocumentTab] {
        descriptors.map { descriptor in
            DocumentTab(
                id: descriptor.id,
                title: descriptor.title,
                path: descriptor.path,
                metadata: descriptor.metadata,
                content: "",
                renderCacheKey: descriptor.renderCacheKey,
                externalURL: descriptor.externalURL,
                isLoaded: false
            )
        }
    }

    nonisolated private static func documentRenderCacheKey(path: String) -> String {
        if let data = try? Data(contentsOf: URL(fileURLWithPath: path), options: [.mappedIfSafe]) {
            let digest = SHA256.hash(data: data)
            let contentHash = digest.compactMap { String(format: "%02x", $0) }.joined()
            return "\(path):\(contentHash)"
        }

        let url = URL(fileURLWithPath: path)
        let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
        let modifiedAt = values?.contentModificationDate?.timeIntervalSince1970 ?? 0
        let fileSize = values?.fileSize ?? 0
        return "\(path):\(modifiedAt):\(fileSize)"
    }

    nonisolated private static var documentLoadFailureContent: String {
        "Failed to load document."
    }

    nonisolated static func detailRevision(
        sourceId: String,
        title: String,
        originalDisplayName: String = "",
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
        let targetRevision = targets.map { target in
            "\(target.id):\(target.isEnabled)"
        }
        .joined(separator: "\u{1F}")
        let skillRevision = skills.map { skill in
            let documentsRevision = skill.documents.map { document in
                [
                    document.id,
                    document.title,
                    document.path,
                    document.renderCacheKey,
                    document.externalURL ?? "",
                    document.isLoaded ? "1" : "0"
                ]
                .joined(separator: "\u{1E}")
            }
            .joined(separator: "\u{1F}")
            return [
                skill.id,
                skill.title,
                skill.summary,
                skill.version ?? "",
                skill.author,
                skill.originLabel,
                skill.starCount.map(String.init) ?? "",
                skill.folderPath ?? "",
                skill.relativeFolderPath ?? "",
                documentsRevision,
                skill.isEnabled ? "1" : "0",
                String(skill.warningCount)
            ]
            .joined(separator: "\u{1D}")
        }
        .joined(separator: "\u{1F}")
        let fileTreeRevision = recursiveFileTreeRevision(fileTree)
        let groupDocumentRevision = groupDocuments.map { document in
            let metadataRevision = document.metadata.map { entry in
                [entry.id, entry.key, entry.value].joined(separator: "\u{1C}")
            }
            .joined(separator: "\u{1D}")
            return [
                document.id,
                document.title,
                document.path,
                metadataRevision,
                document.renderCacheKey,
                document.externalURL ?? ""
            ]
            .joined(separator: "\u{1E}")
        }
        .joined(separator: "\u{1F}")
        var components: [String] = []
        components.append(sourceId)
        components.append(title)
        components.append(originalDisplayName)
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

    nonisolated private static func recursiveFileTreeRevision(_ items: [FileTreeItem]) -> String {
        items.map { item in
            [
                item.id,
                item.title,
                item.path,
                item.isDirectory ? "1" : "0",
                item.isSkillRoot ? "1" : "0",
                item.isSkillDocument ? "1" : "0",
                item.skillId ?? "",
                recursiveFileTreeRevision(item.children)
            ]
            .joined(separator: "\u{1E}")
        }
        .joined(separator: "\u{1F}")
    }

    private func buildReadySourceDetailLines(sourceStatsPayload: [String: Any]) -> [String] {
        var lines: [String] = []

        if let provider = (sourceStatsPayload["provider"] as? String)?.nonEmpty {
            lines.append(localized("source.metadata.provider", provider))
        }
        if let repoLabel = (sourceStatsPayload["repoLabel"] as? String)?.nonEmpty {
            lines.append(localized("source.metadata.repository", repoLabel))
        }
        if let totalInstalls = sourceStatsPayload["totalInstalls"] as? Int {
            lines.append(localized("source.metadata.total_installs", formattedCount(totalInstalls)))
        }
        if let weeklyInstalls = sourceStatsPayload["weeklyInstalls"] as? Int {
            lines.append(localized("source.metadata.current_installs", formattedCount(weeklyInstalls)))
        }
        if let downloadCount = sourceStatsPayload["downloadCount"] as? Int {
            lines.append(localized("source.metadata.downloads", formattedCount(downloadCount)))
        }
        if let starCount = sourceStatsPayload["starCount"] as? Int {
            lines.append(localized("source.metadata.stars", formattedCount(starCount)))
        }
        if let ownerHandle = (sourceStatsPayload["ownerHandle"] as? String)?.nonEmpty {
            let ownerDisplayName = (sourceStatsPayload["ownerDisplayName"] as? String)?.nonEmpty
            lines.append(
                ownerDisplayName.map { localized("source.metadata.owner_with_name", ownerHandle, $0) }
                    ?? localized("source.metadata.owner", ownerHandle)
            )
        }
        if let repoURL = (sourceStatsPayload["repoUrl"] as? String)?.nonEmpty {
            lines.append(localized("source.metadata.repo_url", repoURL))
        }

        return lines
    }

    private func buildSnapshotSourceDetailLines(sourceSnapshot: SourceSnapshotData) -> [String] {
        var lines: [String] = [
            localized("source.metadata.provider", sourceSnapshot.provider),
            localized("source.metadata.repository", sourceSnapshot.repoLabel)
        ]

        lines.append(localized("source.metadata.owner", sourceSnapshot.owner.slug))
        if let sourceCount = sourceSnapshot.owner.sourceCount {
            lines.append(localized("source.snapshot.owner_sources", formattedCount(sourceCount)))
        }
        if let skillCount = sourceSnapshot.owner.skillCount {
            lines.append(localized("source.snapshot.owner_skills", formattedCount(skillCount)))
        }
        if let totalInstalls = sourceSnapshot.owner.totalInstalls {
            lines.append(localized("source.snapshot.owner_installs", formattedCount(totalInstalls)))
        }

        if let totalInstalls = sourceSnapshot.totalInstalls {
            lines.append(localized("source.metadata.total_installs", formattedCount(totalInstalls)))
        }
        if let skillCount = sourceSnapshot.skillCount {
            lines.append(localized("source.snapshot.skills", formattedCount(skillCount)))
        }
        if let repoStars = sourceSnapshot.repoStars {
            lines.append(localized("source.snapshot.repo_stars", formattedCount(repoStars)))
        }
        if let forkCount = sourceSnapshot.forkCount {
            lines.append(localized("source.snapshot.forks", formattedCount(forkCount)))
        }
        if let language = sourceSnapshot.language {
            lines.append(localized("source.snapshot.language", language))
        }
        if let pushedAt = sourceSnapshot.pushedAt {
            lines.append(localized("source.snapshot.repo_updated", relativeUpdateLabel(pushedAt)))
        }
        if !sourceSnapshot.topics.isEmpty {
            lines.append(localized("source.snapshot.topics", sourceSnapshot.topics.joined(separator: ", ")))
        }
        if let trust = sourceSnapshot.trust, !trust.labels.isEmpty {
            lines.append(localized("source.snapshot.trust", trust.labels.joined(separator: " · ")))
        }

        let topSkills = sourceSnapshot.skills
            .sorted { lhs, rhs in (lhs.installs ?? 0) > (rhs.installs ?? 0) }
            .prefix(3)
            .map { skill -> String in
                if let installs = skill.installs {
                    return "\(skill.title) \(formattedCount(installs))"
                }
                return skill.title
            }
        if !topSkills.isEmpty {
            lines.append(localized("source.snapshot.top_skills", topSkills.joined(separator: ", ")))
        }

        lines.append(localized("source.metadata.repo_url", sourceSnapshot.repoURL))
        return lines
    }

    private func buildSourceMetadataStatusLines(
        status: String,
        provider: String?,
        reasonCode: String?
    ) -> [String] {
        var lines: [String] = []
        if let provider {
            lines.append(localized("source.metadata.provider", provider))
        }

        lines.append(localized("source.metadata.status", localizedSourceMetadataStatus(status)))
        lines.append(sourceMetadataExplanation(status: status, reasonCode: reasonCode))
        return lines
    }

    private func localizedSourceMetadataStatus(_ status: String) -> String {
        switch status {
        case "ready":
            return localized("source.metadata.status_value.ready")
        case "unsupported":
            return localized("source.metadata.status_value.unsupported")
        case "disabled":
            return localized("source.metadata.status_value.disabled")
        case "failed":
            return localized("source.metadata.status_value.failed")
        default:
            return localized("source.metadata.status_value.unknown")
        }
    }

    private func sourceMetadataExplanation(status: String, reasonCode: String?) -> String {
        switch status {
        case "unsupported":
            return localized("common.source_metadata.unavailable")
        case "disabled":
            return localized("source.metadata.explanation.disabled")
        case "failed":
            switch reasonCode {
            case "provider_rate_limited":
                return localized("source.metadata.explanation.failed_rate_limited")
            case "provider_response_invalid":
                return localized("source.metadata.explanation.failed_response_invalid")
            default:
                return localized("source.metadata.explanation.failed_default")
            }
        default:
            return localized("common.source_metadata.unavailable")
        }
    }

    private func formattedCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Self.presentationLocale
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private func relativeUpdateLabel(_ rawValue: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: rawValue) else {
            return localized("detail.updated.unavailable")
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Self.presentationLocale
        formatter.unitsStyle = .full

        let referenceDate = Self.currentDateProvider()
        let effectiveDate = date > referenceDate ? referenceDate : date
        let relativeValue = formatter.localizedString(for: effectiveDate, relativeTo: referenceDate)
        return localized("detail.updated.relative", relativeValue)
    }

    private func pruneStateMaps(allowedSourceIds: Set<String>) {
        workingDrafts = pruneSourceMap(workingDrafts, allowedSourceIds: allowedSourceIds)
        saveStateBySourceId = pruneSourceMap(saveStateBySourceId, allowedSourceIds: allowedSourceIds)
        renamedSourceDisplayNameOverridesBySourceId = renamedSourceDisplayNameOverridesBySourceId.filter {
            allowedSourceIds.contains($0.key)
        }
        renamedSourceOriginalDisplayNameOverridesBySourceId = renamedSourceOriginalDisplayNameOverridesBySourceId.filter {
            allowedSourceIds.contains($0.key)
        }
    }

    private func currentProjectScope() -> ProjectScopeSelection {
        selectedProjectScope
    }

    private func scopedSourceKey(sourceId: String, scope: ProjectScopeSelection? = nil) -> ScopedSourceKey? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        return ScopedSourceKey(scope: scope ?? currentProjectScope(), sourceId: sourceId)
    }

    private func parseProjectScopeSelection(_ value: Any?) -> ProjectScopeSelection? {
        guard let payload = value as? [String: Any] else {
            return nil
        }
        let kind = payload["kind"] as? String ?? "global"
        if kind == "project",
           let projectId = (payload["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !projectId.isEmpty {
            return .project(projectId)
        }
        return .global
    }

    private func parseRecentProjectScopes(_ value: Any?) -> [RecentProjectScopeItem] {
        guard let payload = value as? [[String: Any]] else {
            return []
        }

        return payload.compactMap { item in
            guard let projectId = (item["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !projectId.isEmpty,
                  let title = (item["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty,
                  let lastActivityAt = item["lastActivityAt"] as? String
            else {
                return nil
            }

            return RecentProjectScopeItem(
                projectId: projectId,
                title: title,
                lastActivityAt: lastActivityAt,
                projectPath: (item["projectPath"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
                tools: uniqueSorted(item["tools"] as? [String] ?? [])
            )
        }.prefix(10).map { $0 }
    }

    private func projectScopeTitle(for scope: ProjectScopeSelection) -> String {
        switch scope {
        case .global:
            return localized("project_scope.global")
        case .project(let projectId):
            return recentProjectScopes.first(where: { $0.projectId == projectId })?.title ?? projectId
        }
    }

    private func persistProjectScopeSettingsIfNeeded() {
        var persisted = settingsStore.load()
        persisted.selectedProjectScope = cachedSelectedProjectScope
        persisted.recentProjectScopes = cachedRecentProjectScopes
        if let customAgents = routeState?.settings.customAgents {
            persisted.customAgents = customAgents
        }
        if let preferences = routeState?.settings.agentDisplayPreferences {
            persisted.agentDisplayPreferences = preferences
        }
        settingsStore.save(persisted)
    }

    private func parseCustomAgents(_ value: Any?) -> [CustomAgentDefinition] {
        guard let entries = value as? [[String: Any]] else {
            return []
        }

        return entries.compactMap { entry in
            guard
                let id = entry["id"] as? String,
                let name = entry["name"] as? String,
                let globalPath = entry["globalPath"] as? String,
                let projectPathTemplate = entry["projectPathTemplate"] as? String,
                let strategy = entry["strategy"] as? String,
                let createdAt = entry["createdAt"] as? String,
                let updatedAt = entry["updatedAt"] as? String
            else {
                return nil
            }

            return CustomAgentDefinition(
                id: id,
                name: name,
                globalPath: globalPath,
                projectPathTemplate: projectPathTemplate,
                strategy: strategy,
                createdAt: createdAt,
                updatedAt: updatedAt
            )
        }
    }

    private func projectionSummaries() -> [ProjectionSourceSummary] {
        allSummaries.map { summary in
            ProjectionSourceSummary(
                sourceId: summary.sourceId,
                displayName: summary.sourceDisplayName,
                locator: summary.sourceLocator,
                leafs: summary.leafs.map {
                    ProjectionLeafSummary(
                        id: $0.id,
                        linkName: $0.linkName,
                        name: $0.name,
                        description: $0.description
                    )
                }
            )
        }
    }

    private func projectionDrafts() -> [String: ProjectionDraftState] {
        Dictionary(uniqueKeysWithValues: allSummaries.compactMap { summary in
            guard let draft = draft(for: summary.sourceId) else {
                return nil
            }
            return (
                summary.sourceId,
                ProjectionDraftState(
                    enabledTargets: draft.enabledTargets,
                    selectedLeafIds: draft.selectedLeafIds
                )
            )
        })
    }

    func projectionNameMap(for sourceId: String? = nil) -> [String: String] {
        guard let sourceId = resolveSourceId(sourceId) else {
            return [:]
        }
        return buildProjectionNameMap(
            summaries: projectionSummaries(),
            drafts: projectionDrafts(),
            sourceId: sourceId
        )
    }

    private func uniqueSorted(_ values: [String]) -> [String] {
        Array(Set(values)).sorted()
    }

    private static func sanitizedDetailTitle(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }

        let lowercase = trimmed.lowercased()
        let rejectedFragments = [
            "zsh-compatible:",
            "use find",
            "no such file",
            "command not found",
            "permission denied",
        ]
        if rejectedFragments.contains(where: { lowercase.contains($0) }) {
            return nil
        }

        return trimmed
    }

    nonisolated private static func normalizedSummaryDisplayName(
        kind: String,
        displayName: String?,
        originalDisplayName: String?,
        fallback: String
    ) -> String {
        let normalizedKind = kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedDisplayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedOriginalDisplayName = originalDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalizedKind == "virtual",
           trimmedDisplayName?.lowercased().hasPrefix("virtual:") == true,
           let original = trimmedOriginalDisplayName,
           !original.isEmpty,
           !original.lowercased().hasPrefix("virtual:")
        {
            return original
        }
        return trimmedDisplayName?.nonEmpty ?? trimmedOriginalDisplayName?.nonEmpty ?? fallback
    }

    private static func detailTitleFallback(from locator: String, sourceId: String) -> String {
        let trimmed = locator
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ".git", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        guard !trimmed.isEmpty else {
            return sourceId
        }

        if locator.hasPrefix("clawhub:"),
           let slug = locator.split(separator: ":").last?.split(separator: "@").first {
            return String(slug.split(separator: "/").last ?? Substring(sourceId))
        }

        let components = trimmed.split(separator: "/").map(String.init)
        return components.last ?? sourceId
    }

    private static func isSupportedGitHTTPSLocator(_ candidate: String) -> Bool {
        guard !candidate.containsWhitespace else {
            return false
        }

        guard let components = URLComponents(string: candidate),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(),
              host == "github.com" || host == "gitlab.com"
        else {
            return false
        }

        let pathSegments = components.path
            .split(separator: "/")
            .filter { !$0.isEmpty }
            .map(String.init)

        guard pathSegments.count >= 2 else {
            return false
        }

        switch host {
        case "github.com":
            if pathSegments.count == 2 {
                return true
            }

            return pathSegments.count >= 4 && pathSegments[2].lowercased() == "tree"

        case "gitlab.com":
            let treeMarkerIndex = pathSegments.indices.first { index in
                pathSegments[index] == "-"
                    && pathSegments.indices.contains(index + 1)
                    && pathSegments[index + 1] == "tree"
            }

            if let treeMarkerIndex {
                return treeMarkerIndex >= 2 && pathSegments.count >= treeMarkerIndex + 3
            }

            let hasUnsupportedPagePath = pathSegments.contains("-")
                || pathSegments.contains { segment in
                    ["tree", "blob", "issues", "merge_requests"].contains(segment)
                }

            return pathSegments.count >= 2 && !hasUnsupportedPagePath

        default:
            return false
        }
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private func pruneSourceMap<T>(_ sourceMap: [String: T], allowedSourceIds: Set<String>) -> [String: T] {
        Dictionary(uniqueKeysWithValues: sourceMap.filter { allowedSourceIds.contains($0.key) })
    }

    private func pruneSourceMap<T>(_ sourceMap: [ScopedSourceKey: T], allowedSourceIds: Set<String>) -> [ScopedSourceKey: T] {
        Dictionary(uniqueKeysWithValues: sourceMap.filter { allowedSourceIds.contains($0.key.sourceId) })
    }

}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }

    var containsWhitespace: Bool {
        rangeOfCharacter(from: .whitespacesAndNewlines) != nil
    }

    var capitalizedSentence: String {
        guard let first else {
            return self
        }
        return String(first).uppercased() + dropFirst()
    }
}
